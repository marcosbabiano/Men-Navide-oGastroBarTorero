/**
 * Almacenamiento de las reservas de Navidad en Netlify Blobs (store «torero-reservas»).
 * Store separado del contenido de la web: contiene datos personales y de salud (alergias).
 *
 *   config                 Configuración (con revisión).
 *   b/<id>                 Reserva completa (titular, selección, datos de Qamarero, historial).
 *   index                  Filas resumidas para el listado.
 *   ref/<REF>              Referencia corta → id (única).
 *   qid/<sha256>           Identificador de Qamarero → id (vinculación previa validada).
 *   t/<sha256>             Enlace privado (solo la huella del token) → reserva, tipo y estado.
 *   mail/<clave>           Correo procesado (idempotencia y auditoría). mail-index: últimos correos.
 *   req/<id>               Solicitud de nuevo enlace de modificación.
 *   print/<fecha>-<serv>   Última impresión de un servicio (para avisar de cambios posteriores).
 *   sync                   Estado de la sincronización del correo.
 *   secret/gmail           Token de actualización OAuth de Gmail (nunca se envía al navegador).
 *   oauth/<state>          Estado temporal del flujo OAuth.
 *
 * Todas las escrituras de documentos compartidos son condicionales (ETag) con reintentos.
 */
import { formatIssues } from '../../shared/schema.ts';
import {
  type Booking,
  type BookingRow,
  bookingRow,
  defaultReservasConfig,
  emptyQamarero,
  type ReservasConfig,
  reservasConfigSchema,
} from '../../shared/reservas.ts';
import { ApiError } from '../http.ts';
import type { KV } from '../repo.ts';

const STRONG = { type: 'json' as const, consistency: 'strong' as const };
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randomId(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}-${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
const modified = (r: { modified: boolean } | void) => (r === undefined ? true : r.modified);

/**
 * Exclusión mutua dentro del mismo proceso. En Netlify, «onlyIfNew» ya es atómico entre instancias;
 * esto cubre además el emulador local (que no garantiza atomicidad en peticiones simultáneas).
 */
const localLocks = new Map<string, Promise<unknown>>();
async function withLocalLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = localLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chain = prev.then(() => mine);
  localLocks.set(key, chain);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (localLocks.get(key) === chain) localLocks.delete(key);
  }
}

export interface TokenDoc {
  bookingId: string;
  kind: 'complete' | 'modify';
  status: 'active' | 'used' | 'revoked';
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  allowLate: boolean;
}

export interface MailRecord {
  key: string;
  messageId: string;
  from: string;
  subject: string;
  receivedAt: string;
  processedAt: string;
  via: 'gmail' | 'webhook' | 'manual';
  type: string;
  status: 'processing' | 'processed' | 'ignored' | 'error';
  result: string;
  bookingId: string | null;
  fields: Record<string, string>;
  missing: string[];
  errors: string[];
}

export interface ModRequest {
  id: string;
  bookingId: string;
  createdAt: string;
  reason: string;
  status: 'pending' | 'done' | 'dismissed';
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface SyncState {
  provider: 'gmail' | 'webhook' | 'none';
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  processed: number;
  errors: number;
  lastBatch: number;
}

export interface PrintRecord {
  at: string;
  by: string;
  kind: string;
  versions: Record<string, string>;
}

export class ReservasRepo {
  constructor(
    public kv: KV,
    private now: () => Date = () => new Date(),
  ) {}

  iso() {
    return this.now().toISOString();
  }

  /* ---------- configuración ---------- */
  async readConfig(): Promise<{ config: ReservasConfig; revision: number }> {
    const doc = (await this.kv.get('config', STRONG)) as { config: ReservasConfig; revision: number } | null;
    if (doc) {
      const merged = { ...defaultReservasConfig(), ...doc.config };
      const parsed = reservasConfigSchema.safeParse(merged);
      if (parsed.success) return { config: parsed.data, revision: doc.revision };
    }
    return { config: defaultReservasConfig(), revision: 0 };
  }

  async saveConfig(value: unknown, baseRevision: number): Promise<number> {
    const parsed = reservasConfigSchema.safeParse(value);
    if (!parsed.success) throw new ApiError(422, 'validation', 'Hay datos no válidos en la configuración.', formatIssues(parsed.error));
    const cur = await this.kv.getWithMetadata('config', STRONG);
    const rev = (cur?.data as { revision: number } | null)?.revision ?? 0;
    if (rev !== baseRevision) throw new ApiError(409, 'conflict', 'Otra persona ha cambiado la configuración. Recarga.');
    const w = await this.kv.setJSON('config', { config: parsed.data, revision: rev + 1 }, cur ? (cur.etag ? { onlyIfMatch: cur.etag } : undefined) : { onlyIfNew: true });
    if (!modified(w)) throw new ApiError(409, 'conflict', 'Otra persona ha cambiado la configuración. Recarga.');
    return rev + 1;
  }

  /* ---------- reservas ---------- */
  async newRef(id: string): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const b = crypto.getRandomValues(new Uint8Array(5));
      const ref = `TOR-${[...b].map((x) => ALPHA[x % ALPHA.length]).join('')}`;
      if (modified(await this.kv.setJSON(`ref/${ref}`, { id }, { onlyIfNew: true }))) return ref;
    }
    throw new ApiError(503, 'busy', 'No se pudo generar la referencia. Inténtalo de nuevo.');
  }

  blank(origin: Booking['origin'], who: string): Omit<Booking, 'id' | 'ref'> {
    const now = this.iso();
    return {
      createdAt: now,
      updatedAt: now,
      version: 1,
      origin,
      holder: { name: '', phone: '', email: '' },
      service: null,
      selection: null,
      gastroStatus: 'pending',
      qamarero: emptyQamarero(),
      peopleChange: null,
      match: { status: 'none', method: null, candidates: [], mergedInto: null, score: null },
      issues: [],
      internalNotes: '',
      history: [{ at: now, actor: who, source: origin === 'form' ? 'form' : origin === 'email' ? 'email' : origin === 'import' ? 'import' : 'admin', type: 'created', summary: 'Registro creado' }],
      archived: false,
    };
  }

  async create(b: Omit<Booking, 'id' | 'ref'>): Promise<Booking> {
    const id = randomId('r');
    const ref = await this.newRef(id);
    const doc: Booking = { ...b, id, ref };
    await this.kv.setJSON(`b/${id}`, doc, { onlyIfNew: true });
    await this.updateIndex((rows) => [...rows.filter((r) => r.id !== id), bookingRow(doc)]);
    return doc;
  }

  async get(id: string): Promise<Booking | null> {
    if (!/^r-[a-f0-9]{16}$/.test(id)) return null;
    return (await this.kv.get(`b/${id}`, STRONG)) as Booking | null;
  }

  async byRef(ref: string): Promise<Booking | null> {
    const m = (await this.kv.get(`ref/${ref.toUpperCase()}`, STRONG)) as { id: string } | null;
    return m ? this.get(m.id) : null;
  }

  async byReservationId(qid: string): Promise<Booking | null> {
    if (!qid) return null;
    const m = (await this.kv.get(`qid/${await sha256(qid.trim().toLowerCase())}`, STRONG)) as { id: string } | null;
    return m ? this.get(m.id) : null;
  }

  async mapReservationId(qid: string, id: string) {
    if (qid) await this.kv.setJSON(`qid/${await sha256(qid.trim().toLowerCase())}`, { id });
  }

  /**
   * Modifica una reserva con escritura condicional. «mutate» recibe una copia; si devuelve null no se guarda.
   * baseVersion (opcional) detecta ediciones simultáneas desde el panel.
   */
  async update(id: string, mutate: (b: Booking) => Booking | null, baseVersion?: number): Promise<Booking> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const cur = (await this.kv.get(`b/${id}`, STRONG)) as Booking | null;
      if (!cur) throw new ApiError(404, 'not_found', 'La reserva no existe.');
      if (baseVersion !== undefined && cur.version !== baseVersion) throw new ApiError(409, 'conflict', 'La reserva ha cambiado mientras la editabas (otra persona, un correo o el cliente). Recarga para ver la última versión.');
      const next = mutate(structuredClone(cur));
      if (!next) return cur;
      // Compare-and-set: solo quien reclame la versión actual puede escribir la siguiente.
      if (!(await this.claim(`lk/b/${id}/${cur.version}`))) {
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
        continue;
      }
      const doc: Booking = { ...next, id: cur.id, ref: cur.ref, version: cur.version + 1, updatedAt: this.iso(), history: next.history.slice(-400) };
      await this.kv.setJSON(`b/${id}`, doc);
      void this.kv.delete(`lk/b/${id}/${cur.version - 1}`).catch(() => undefined);
      await this.updateIndex((rows) => [...rows.filter((r) => r.id !== id), bookingRow(doc)]);
      return doc;
    }
    throw new ApiError(409, 'conflict', 'No se pudo guardar por cambios simultáneos. Inténtalo de nuevo.');
  }

  /**
   * Reclama una clave de bloqueo de forma atómica (onlyIfNew). Si un bloqueo quedó huérfano
   * (proceso interrumpido) durante más de 20 s, se libera y se vuelve a intentar.
   */
  async claim(key: string): Promise<boolean> {
    return withLocalLock(key, () => this.claimInner(key));
  }

  private async claimInner(key: string): Promise<boolean> {
    if (modified(await this.kv.setJSON(key, { at: this.iso() }, { onlyIfNew: true }))) return true;
    const lock = (await this.kv.get(key, STRONG)) as { at: string } | null;
    if (lock && this.now().getTime() - Date.parse(lock.at) > 20_000) {
      await this.kv.delete(key);
      return modified(await this.kv.setJSON(key, { at: this.iso() }, { onlyIfNew: true }));
    }
    return false;
  }

  async remove(id: string) {
    const b = await this.get(id);
    if (!b) return;
    await this.kv.delete(`b/${id}`);
    await this.kv.delete(`ref/${b.ref}`);
    if (b.qamarero.reservationId) await this.kv.delete(`qid/${await sha256(b.qamarero.reservationId.trim().toLowerCase())}`);
    await this.updateIndex((rows) => rows.filter((r) => r.id !== id));
  }

  async rows(): Promise<BookingRow[]> {
    const idx = (await this.kv.get('index', STRONG)) as { rows: BookingRow[] } | null;
    if (idx) return idx.rows;
    return this.rebuildIndex();
  }

  async all(): Promise<Booking[]> {
    const { blobs } = await this.kv.list({ prefix: 'b/' });
    const docs = await Promise.all(blobs.map((x) => this.kv.get(x.key, STRONG) as Promise<Booking | null>));
    return docs.filter((d): d is Booking => !!d);
  }

  async rebuildIndex(): Promise<BookingRow[]> {
    const rows = (await this.all()).map((b) => bookingRow(b));
    const cur = (await this.kv.get('index', STRONG)) as { v?: number } | null;
    await this.kv.setJSON('index', { v: (cur?.v ?? 0) + 1000, rows });
    return rows;
  }

  private async updateIndex(mutate: (rows: BookingRow[]) => BookingRow[]) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const cur = (await this.kv.get('index', STRONG)) as { v?: number; rows: BookingRow[] } | null;
      const v = cur?.v ?? 0;
      if (!(await this.claim(`lk/index/${v}`))) {
        await new Promise((r) => setTimeout(r, 30 + Math.random() * 100));
        continue;
      }
      await this.kv.setJSON('index', { v: v + 1, rows: mutate(cur?.rows ?? []) });
      void this.kv.delete(`lk/index/${v - 1}`).catch(() => undefined);
      return;
    }
    // Si el índice no pudo actualizarse, se reconstruye desde las reservas (nunca se pierden datos).
    await this.rebuildIndex();
  }

  /* ---------- enlaces privados ---------- */
  async createToken(bookingId: string, kind: TokenDoc['kind'], who: string, hours: number, allowLate: boolean): Promise<{ token: string; expiresAt: string }> {
    // Al generar uno nuevo, se revocan los anteriores de esa reserva (evita modificaciones simultáneas).
    await this.revokeTokens(bookingId);
    const token = randomToken(32);
    const hash = await sha256(token);
    const now = this.now();
    const doc: TokenDoc = { bookingId, kind, status: 'active', createdAt: now.toISOString(), createdBy: who, expiresAt: new Date(now.getTime() + hours * 3600_000).toISOString(), usedAt: null, allowLate };
    await this.kv.setJSON(`t/${hash}`, doc, { onlyIfNew: true });
    await this.kv.setJSON(`tb/${bookingId}/${hash.slice(0, 16)}`, { hash });
    return { token, expiresAt: doc.expiresAt };
  }

  async tokensOf(bookingId: string): Promise<(TokenDoc & { id: string })[]> {
    const { blobs } = await this.kv.list({ prefix: `tb/${bookingId}/` });
    const out: (TokenDoc & { id: string })[] = [];
    for (const b of blobs) {
      const ref = (await this.kv.get(b.key, STRONG)) as { hash: string } | null;
      const t = ref ? ((await this.kv.get(`t/${ref.hash}`, STRONG)) as TokenDoc | null) : null;
      if (t) out.push({ ...t, id: ref!.hash.slice(0, 8) });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeTokens(bookingId: string): Promise<number> {
    const { blobs } = await this.kv.list({ prefix: `tb/${bookingId}/` });
    let n = 0;
    for (const b of blobs) {
      const ref = (await this.kv.get(b.key, STRONG)) as { hash: string } | null;
      if (!ref) continue;
      const t = (await this.kv.get(`t/${ref.hash}`, STRONG)) as TokenDoc | null;
      if (!t || t.status !== 'active') continue;
      await this.kv.setJSON(`t/${ref.hash}`, { ...t, status: 'revoked' });
      n++;
    }
    return n;
  }

  async readToken(token: string): Promise<{ hash: string; doc: TokenDoc } | null> {
    if (typeof token !== 'string' || token.length < 30 || token.length > 100 || !/^[\w-]+$/.test(token)) return null;
    const hash = await sha256(token);
    const doc = (await this.kv.get(`t/${hash}`, STRONG)) as TokenDoc | null;
    return doc ? { hash, doc } : null;
  }

  /** Consume el enlace de forma atómica: solo una petición puede reclamar su uso (onlyIfNew). */
  async consumeToken(hash: string, doc: TokenDoc): Promise<boolean> {
    if (!(await withLocalLock(`tuse/${hash}`, async () => modified(await this.kv.setJSON(`tuse/${hash}`, { at: this.iso() }, { onlyIfNew: true }))))) return false;
    const fresh = (await this.kv.get(`t/${hash}`, STRONG)) as TokenDoc | null;
    if (!fresh || fresh.status !== 'active') {
      await this.kv.delete(`tuse/${hash}`);
      return false;
    }
    await this.kv.setJSON(`t/${hash}`, { ...doc, status: 'used', usedAt: this.iso() });
    return true;
  }

  /** Si no se pudo guardar la modificación, el enlace vuelve a estar disponible. */
  async restoreToken(hash: string, doc: TokenDoc) {
    await this.kv.setJSON(`t/${hash}`, { ...doc, status: 'active', usedAt: null });
    await this.kv.delete(`tuse/${hash}`);
  }

  /* ---------- correos ---------- */
  async claimMail(key: string, base: MailRecord): Promise<boolean> {
    return modified(await this.kv.setJSON(`mail/${key}`, base, { onlyIfNew: true }));
  }
  async saveMail(rec: MailRecord) {
    await this.kv.setJSON(`mail/${rec.key}`, rec);
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.kv.getWithMetadata('mail-index', STRONG);
      const items = ((res?.data as { items: MailRecord[] } | null)?.items ?? []).filter((m) => m.key !== rec.key);
      const w = await this.kv.setJSON('mail-index', { items: [rec, ...items].slice(0, 300) }, res ? (res.etag ? { onlyIfMatch: res.etag } : undefined) : { onlyIfNew: true });
      if (modified(w)) return;
    }
  }
  async mails(): Promise<MailRecord[]> {
    return (((await this.kv.get('mail-index', STRONG)) as { items: MailRecord[] } | null)?.items ?? []) as MailRecord[];
  }
  async getMail(key: string): Promise<MailRecord | null> {
    return (await this.kv.get(`mail/${key}`, STRONG)) as MailRecord | null;
  }

  /* ---------- solicitudes ---------- */
  async addRequest(bookingId: string, reason: string): Promise<ModRequest> {
    const existing = (await this.requests()).find((r) => r.bookingId === bookingId && r.status === 'pending');
    if (existing) return existing;
    const r: ModRequest = { id: randomId('q'), bookingId, createdAt: this.iso(), reason: reason.slice(0, 400), status: 'pending', resolvedAt: null, resolvedBy: null };
    await this.kv.setJSON(`req/${r.id}`, r);
    return r;
  }
  async requests(): Promise<ModRequest[]> {
    const { blobs } = await this.kv.list({ prefix: 'req/' });
    const out = await Promise.all(blobs.map((b) => this.kv.get(b.key, STRONG) as Promise<ModRequest | null>));
    return out.filter((x): x is ModRequest => !!x).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async resolveRequests(bookingId: string, who: string, status: 'done' | 'dismissed' = 'done', id?: string) {
    for (const r of await this.requests()) {
      if (r.status !== 'pending' || (id ? r.id !== id : r.bookingId !== bookingId)) continue;
      await this.kv.setJSON(`req/${r.id}`, { ...r, status, resolvedAt: this.iso(), resolvedBy: who });
    }
  }

  /* ---------- impresiones, sincronización y secretos ---------- */
  async getPrint(key: string): Promise<PrintRecord | null> {
    return (await this.kv.get(`print/${key}`, STRONG)) as PrintRecord | null;
  }
  async savePrint(key: string, rec: PrintRecord) {
    await this.kv.setJSON(`print/${key}`, rec);
  }
  async sync(): Promise<SyncState> {
    return ((await this.kv.get('sync', STRONG)) as SyncState | null) ?? { provider: 'none', lastRunAt: null, lastOkAt: null, lastError: null, processed: 0, errors: 0, lastBatch: 0 };
  }
  async saveSync(s: SyncState) {
    await this.kv.setJSON('sync', s);
  }
  async secret<T>(name: string): Promise<T | null> {
    return (await this.kv.get(`secret/${name}`, STRONG)) as T | null;
  }
  async setSecret(name: string, value: unknown) {
    await this.kv.setJSON(`secret/${name}`, value);
  }
  async deleteSecret(name: string) {
    await this.kv.delete(`secret/${name}`);
  }
}
