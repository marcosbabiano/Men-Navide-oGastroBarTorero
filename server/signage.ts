/**
 * Cartelería digital: almacenamiento y API (reutiliza el store «torero-content» de Netlify Blobs).
 *
 * Claves:
 *   signage/config            Escenas, eventos, programaciones, horarios y ajustes (con revisión).
 *   signage/screens/<id>      Televisión vinculada (lo que controla el administrador).
 *   signage/status/<id>       Último latido del reproductor (lo que informa la televisión).
 *   signage/tokens/<sha256>   Token del dispositivo (solo se guarda su huella) → id de la televisión.
 *   signage/pair/<código>     Solicitud de vinculación temporal (caduca a los 10 minutos).
 *
 * Reproductores (sin sesión de administrador):
 *   GET  /api/screen/config               Programación publicada (CDN, purgada al guardar).
 *   GET  /api/screen/d/<huella>           Órdenes de una televisión (CDN, purgada al cambiar).
 *   POST /api/screen/heartbeat            Latido con token del dispositivo (Authorization: Bearer).
 *   POST /api/screen/pair/start           Pide un código de vinculación.
 *   POST /api/screen/pair/poll            Recoge el token cuando el administrador acepta el código.
 *
 * Administración (rol «admin» + CSRF, dentro de /api/admin):
 *   GET    /signage                        Configuración + televisiones + estado.
 *   PUT    /signage/config                 Guardar { config, baseRevision }.
 *   POST   /signage/pair                   Vincular { code, name }.
 *   PATCH  /signage/screens/<id>           Cambiar nombre, programación fija o calidad.
 *   DELETE /signage/screens/<id>           Revocar (el token deja de valer al instante).
 *   POST   /signage/command                Control remoto { screenIds | 'all', action, ... }.
 */
import { formatIssues } from '../shared/schema.ts';
import {
  type Override,
  type ScreenDirectives,
  type ScreenRecord,
  type ScreenStatus,
  type SignageConfig,
  defaultSignage,
  overrideSchema,
  partySchema,
  publicSignage,
  QUALITIES,
  signageConfigSchema,
  statusReportSchema,
} from '../shared/signage.ts';
import { buildMediaMap, mediaMapForRefs } from '../shared/public.ts';
import type { ImageRef, MediaAsset, SiteContent } from '../shared/schema.ts';
import { ApiError, errorResponse, json, noStore, readJson } from './http.ts';
import type { KV } from './repo.ts';

export const SIGNAGE_TAG = 'torero-signage';
export const screenTag = (id: string) => `torero-screen-${id}`;

const STRONG = { type: 'json' as const, consistency: 'strong' as const };
const K = {
  config: 'signage/config',
  screen: (id: string) => `signage/screens/${id}`,
  status: (id: string) => `signage/status/${id}`,
  token: (hash: string) => `signage/tokens/${hash}`,
  pair: (code: string) => `signage/pair/${code}`,
};

export const PAIR_TTL_MS = 10 * 60 * 1000;
/** Sin ambigüedades (sin 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface ConfigDoc {
  config: SignageConfig;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

interface PairDoc {
  secretHash: string;
  expiresAt: string;
  createdAt: string;
  /** Rellenado al aceptar el código desde el panel; se entrega una sola vez. */
  token: string | null;
  screenId: string | null;
}

/* ---------------- utilidades criptográficas ---------------- */
export async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
function newScreenId(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `tv-${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
export function normalizeCode(code: unknown): string {
  return typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';
}

function wasModified(res: { modified: boolean } | void): boolean {
  return res === undefined ? true : res.modified;
}

/* ---------------- repositorio ---------------- */
export class SignageRepo {
  constructor(
    private kv: KV,
    private now: () => Date = () => new Date(),
  ) {}

  async readConfig(): Promise<ConfigDoc> {
    const doc = (await this.kv.get(K.config, STRONG)) as ConfigDoc | null;
    if (doc) {
      const parsed = signageConfigSchema.safeParse(doc.config);
      if (parsed.success) return { ...doc, config: parsed.data };
      console.warn('[signage] Configuración guardada no válida; se usa la inicial.');
    }
    return { config: defaultSignage(), revision: 0, updatedAt: '', updatedBy: '' };
  }

  async saveConfig(value: unknown, baseRevision: number, who: string): Promise<ConfigDoc> {
    const parsed = signageConfigSchema.safeParse(value);
    if (!parsed.success) throw new ApiError(422, 'validation', 'Hay datos no válidos en las pantallas.', formatIssues(parsed.error));
    const current = await this.kv.getWithMetadata(K.config, STRONG);
    const rev = (current?.data as ConfigDoc | null)?.revision ?? 0;
    if (rev !== baseRevision) throw new ApiError(409, 'conflict', 'Otra persona ha cambiado las pantallas. Recarga para ver la última versión.');
    const doc: ConfigDoc = { config: parsed.data, revision: rev + 1, updatedAt: this.now().toISOString(), updatedBy: who };
    const opts = current ? (current.etag ? { onlyIfMatch: current.etag } : undefined) : { onlyIfNew: true };
    if (!wasModified(await this.kv.setJSON(K.config, doc, opts))) {
      throw new ApiError(409, 'conflict', 'Otra persona ha cambiado las pantallas. Recarga para ver la última versión.');
    }
    return doc;
  }

  async listScreens(): Promise<ScreenRecord[]> {
    const { blobs } = await this.kv.list({ prefix: 'signage/screens/' });
    const out = await Promise.all(blobs.map((b) => this.kv.get(b.key, STRONG) as Promise<ScreenRecord | null>));
    return out.filter((s): s is ScreenRecord => !!s).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getScreen(id: string): Promise<ScreenRecord | null> {
    if (!/^tv-[a-f0-9]{12}$/.test(id)) return null;
    return (await this.kv.get(K.screen(id), STRONG)) as ScreenRecord | null;
  }

  async getStatus(id: string): Promise<ScreenStatus | null> {
    return (await this.kv.get(K.status(id), STRONG)) as ScreenStatus | null;
  }

  /** Modifica una televisión con escritura condicional (reintenta si hay carrera). */
  async updateScreen(id: string, mutate: (s: ScreenRecord) => ScreenRecord): Promise<ScreenRecord> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await this.kv.getWithMetadata(K.screen(id), STRONG);
      const cur = res?.data as ScreenRecord | null;
      if (!cur) throw new ApiError(404, 'not_found', 'Esa televisión ya no existe.');
      const next = { ...mutate(structuredClone(cur)), id: cur.id, tokenHash: cur.tokenHash, updatedAt: this.now().toISOString() };
      if (wasModified(await this.kv.setJSON(K.screen(id), next, res?.etag ? { onlyIfMatch: res.etag } : undefined))) return next;
    }
    throw new ApiError(409, 'conflict', 'No se pudo actualizar la televisión. Inténtalo de nuevo.');
  }

  /** Reproductor: crea una solicitud de vinculación. */
  async startPairing(): Promise<{ code: string; secret: string; expiresAt: string }> {
    const secret = randomToken(24);
    const now = this.now();
    for (let i = 0; i < 6; i++) {
      const code = randomCode();
      const doc: PairDoc = {
        secretHash: await sha256(secret),
        expiresAt: new Date(now.getTime() + PAIR_TTL_MS).toISOString(),
        createdAt: now.toISOString(),
        token: null,
        screenId: null,
      };
      const existing = (await this.kv.get(K.pair(code), STRONG)) as PairDoc | null;
      if (existing && Date.parse(existing.expiresAt) > now.getTime()) continue;
      await this.kv.setJSON(K.pair(code), doc);
      return { code, secret, expiresAt: doc.expiresAt };
    }
    throw new ApiError(503, 'busy', 'No se pudo generar un código. Inténtalo de nuevo.');
  }

  /** Reproductor: ¿ya ha aceptado el administrador el código? El token se entrega una única vez. */
  async pollPairing(codeRaw: unknown, secret: unknown): Promise<{ status: 'pending' | 'expired' } | { status: 'paired'; token: string; screenId: string }> {
    const code = normalizeCode(codeRaw);
    if (code.length !== 6 || typeof secret !== 'string' || secret.length < 20 || secret.length > 200) {
      throw new ApiError(400, 'bad_request', 'Solicitud de vinculación no válida.');
    }
    const doc = (await this.kv.get(K.pair(code), STRONG)) as PairDoc | null;
    if (!doc || doc.secretHash !== (await sha256(secret))) return { status: 'expired' };
    if (doc.token && doc.screenId) {
      await this.kv.delete(K.pair(code));
      return { status: 'paired', token: doc.token, screenId: doc.screenId };
    }
    if (Date.parse(doc.expiresAt) <= this.now().getTime()) {
      await this.kv.delete(K.pair(code));
      return { status: 'expired' };
    }
    return { status: 'pending' };
  }

  /** Administrador: acepta un código y crea la televisión con un token propio y revocable. */
  async claimPairing(codeRaw: unknown, nameRaw: unknown): Promise<ScreenRecord> {
    const code = normalizeCode(codeRaw);
    if (code.length !== 6) throw new ApiError(400, 'invalid_code', 'El código tiene 6 caracteres (letras y números).');
    const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, 60) : '';
    if (!name) throw new ApiError(400, 'invalid_name', 'Escribe un nombre para la televisión (p. ej. «TV barra»).');
    const res = await this.kv.getWithMetadata(K.pair(code), STRONG);
    const doc = res?.data as PairDoc | null;
    if (!doc || Date.parse(doc.expiresAt) <= this.now().getTime()) {
      throw new ApiError(404, 'code_not_found', 'Código no encontrado o caducado. Recarga la pantalla de la televisión para obtener uno nuevo.');
    }
    if (doc.token) throw new ApiError(409, 'code_used', 'Ese código ya se ha usado.');
    const token = randomToken(32);
    const tokenHash = await sha256(token);
    const now = this.now().toISOString();
    const screen: ScreenRecord = {
      id: newScreenId(),
      name,
      playlistId: null,
      quality: null,
      override: null,
      paused: false,
      version: 1,
      command: { seq: 0, action: 'none' },
      tokenHash,
      createdAt: now,
      updatedAt: now,
    };
    const claimed = await this.kv.setJSON(K.pair(code), { ...doc, token, screenId: screen.id }, res?.etag ? { onlyIfMatch: res.etag } : undefined);
    if (!wasModified(claimed)) throw new ApiError(409, 'code_used', 'Ese código ya se ha usado.');
    await this.kv.setJSON(K.screen(screen.id), screen);
    await this.kv.setJSON(K.token(tokenHash), { screenId: screen.id });
    return screen;
  }

  async revoke(id: string): Promise<void> {
    const s = await this.getScreen(id);
    if (!s) throw new ApiError(404, 'not_found', 'Esa televisión ya no existe.');
    await this.kv.delete(K.screen(id));
    await this.kv.delete(K.token(s.tokenHash));
    await this.kv.delete(K.status(id));
  }

  /** Comprueba un token de dispositivo. Una televisión revocada no se autentica aunque quede la huella. */
  async screenForToken(token: string): Promise<ScreenRecord | null> {
    if (!token || token.length < 20 || token.length > 200) return null;
    const hash = await sha256(token);
    return this.screenForHash(hash);
  }

  async screenForHash(hash: string): Promise<ScreenRecord | null> {
    if (!/^[a-f0-9]{64}$/.test(hash)) return null;
    const map = (await this.kv.get(K.token(hash), STRONG)) as { screenId: string } | null;
    if (!map) return null;
    const s = await this.getScreen(map.screenId);
    return s && s.tokenHash === hash ? s : null;
  }

  async writeStatus(id: string, report: unknown): Promise<ScreenStatus> {
    const parsed = statusReportSchema.safeParse(report);
    if (!parsed.success) throw new ApiError(422, 'validation', 'Estado de la pantalla no válido.', formatIssues(parsed.error));
    const status: ScreenStatus = { ...parsed.data, lastSeen: this.now().toISOString() };
    await this.kv.setJSON(K.status(id), status);
    return status;
  }
}

export function directivesOf(s: ScreenRecord): ScreenDirectives {
  return { id: s.id, name: s.name, playlistId: s.playlistId, quality: s.quality, override: s.override, paused: s.paused, version: s.version, command: s.command };
}

/** Imágenes que necesita la cartelería (escenas, eventos y las del contenido publicado). */
export function signageMedia(cfg: SignageConfig, content: SiteContent | null, uploads: MediaAsset[]): Record<string, MediaAsset> {
  const refs = [
    ...cfg.scenes.flatMap((s) => (s.type === 'photos' ? s.images : s.type === 'message' && s.background ? [s.background] : [])),
    ...cfg.events.flatMap((e) => [e.artistImage, e.backgroundImage]),
  ].filter((r): r is ImageRef => !!r);
  return { ...(content ? buildMediaMap(content, uploads) : {}), ...mediaMapForRefs(refs, uploads) };
}

/* ---------------- control remoto ---------------- */
export const COMMANDS = ['playlist', 'scene', 'party', 'auto', 'pause', 'resume', 'next', 'reload'] as const;
export type CommandAction = (typeof COMMANDS)[number];

export interface CommandBody {
  screenIds?: unknown;
  action?: unknown;
  ref?: unknown;
  party?: unknown;
  /** Minutos; null/0 = indefinido. */
  minutes?: unknown;
}

export function applyCommand(s: ScreenRecord, body: CommandBody, cfg: SignageConfig, now: Date): ScreenRecord {
  const action = body.action as CommandAction;
  if (!COMMANDS.includes(action)) throw new ApiError(400, 'bad_command', 'Acción no reconocida.');
  const minutes = typeof body.minutes === 'number' && body.minutes > 0 ? Math.min(body.minutes, 7 * 24 * 60) : null;
  const until = minutes ? new Date(now.getTime() + minutes * 60000).toISOString() : null;
  const ref = typeof body.ref === 'string' ? body.ref.slice(0, 80) : '';
  let override: Override = s.override;
  let paused = s.paused;
  let command = s.command;
  switch (action) {
    case 'playlist':
      if (!cfg.playlists.some((p) => p.id === ref)) throw new ApiError(400, 'bad_ref', 'Esa programación no existe.');
      override = { kind: 'playlist', ref, party: null, until };
      paused = false;
      break;
    case 'scene': {
      const sc = cfg.scenes.find((x) => x.id === ref);
      if (!sc || sc.status !== 'published') throw new ApiError(400, 'bad_ref', 'Esa escena no existe o no está publicada.');
      override = { kind: 'scene', ref, party: null, until };
      paused = false;
      break;
    }
    case 'party': {
      let party = null;
      if (body.party !== undefined && body.party !== null) {
        const p = partySchema.safeParse(body.party);
        if (!p.success) throw new ApiError(422, 'validation', 'Ajustes del modo fiesta no válidos.', formatIssues(p.error));
        party = p.data;
      }
      if (ref) {
        const sc = cfg.scenes.find((x) => x.id === ref);
        if (!sc || sc.type !== 'party' || sc.status !== 'published') throw new ApiError(400, 'bad_ref', 'Esa escena de fiesta no existe o no está publicada.');
      }
      if (!ref && !party) throw new ApiError(400, 'bad_ref', 'Indica una escena de fiesta o unos ajustes.');
      override = { kind: 'party', ref, party, until };
      paused = false;
      break;
    }
    case 'auto':
      override = null;
      paused = false;
      break;
    case 'pause':
      paused = true;
      break;
    case 'resume':
      paused = false;
      break;
    case 'next':
    case 'reload':
      command = { seq: s.command.seq + 1, action };
      break;
  }
  const checked = overrideSchema.safeParse(override);
  if (!checked.success) throw new ApiError(422, 'validation', 'Orden no válida.');
  return { ...s, override: checked.data, paused, command, version: s.version + 1 };
}

/* ---------------- manejadores HTTP ---------------- */
export interface SignageDeps {
  content: KV;
  purge: (tags: string[]) => Promise<void>;
  now?: () => Date;
  readPublished: () => Promise<{ content: SiteContent; publishedAt: string | null } | null>;
  readUploads: () => Promise<MediaAsset[]>;
}

const cdn = (tags: string[], sMaxAge = 300): Record<string, string> => ({
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${sMaxAge}, stale-while-revalidate=30`,
  'Netlify-Cache-Tag': tags.join(','),
});

async function tryPurge(deps: SignageDeps, tags: string[]): Promise<boolean> {
  try {
    await deps.purge(tags);
    return true;
  } catch (e) {
    console.warn('[signage] No se pudo purgar la caché', e);
    return false;
  }
}

/** Endpoints de los reproductores (sin sesión de administrador). */
export function createScreenHandler(deps: SignageDeps) {
  const now = deps.now ?? (() => new Date());
  const repo = new SignageRepo(deps.content, now);
  const handle = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = req.method.toUpperCase();

    if (path === '/api/screen/config') {
      if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Usa GET.');
      const [doc, pub, uploads] = await Promise.all([repo.readConfig(), deps.readPublished(), deps.readUploads()]);
      const config = publicSignage(doc.config);
      return json(200, { config, revision: doc.revision, media: signageMedia(config, pub?.content ?? null, uploads) }, cdn([SIGNAGE_TAG]));
    }

    const dm = /^\/api\/screen\/d\/([a-f0-9]{64})$/.exec(path);
    if (dm) {
      if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Usa GET.');
      const screen = await repo.screenForHash(dm[1]);
      if (!screen) return json(401, { error: { code: 'revoked', message: 'Esta pantalla ya no está vinculada.' } }, noStore());
      const [doc, pub] = await Promise.all([repo.readConfig(), deps.readPublished()]);
      return json(
        200,
        { directives: directivesOf(screen), configRevision: doc.revision, contentPublishedAt: pub?.publishedAt ?? null },
        cdn([screenTag(screen.id), SIGNAGE_TAG, 'torero-content']),
      );
    }

    if (path === '/api/screen/heartbeat') {
      if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
      const auth = req.headers.get('authorization') ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const screen = await repo.screenForToken(token);
      if (!screen) return json(401, { error: { code: 'revoked', message: 'Esta pantalla ya no está vinculada.' } }, noStore());
      const body = await readJson(req, 8_000);
      const status = await repo.writeStatus(screen.id, body);
      return json(200, { ok: true, serverTime: now().toISOString(), lastSeen: status.lastSeen, version: screen.version }, noStore());
    }

    if (path === '/api/screen/pair/start') {
      if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
      return json(201, await repo.startPairing(), noStore());
    }

    if (path === '/api/screen/pair/poll') {
      if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
      const body = await readJson<{ code?: unknown; secret?: unknown }>(req, 2_000);
      const res = await repo.pollPairing(body.code, body.secret);
      return json(200, res, noStore());
    }

    throw new ApiError(404, 'not_found', 'Recurso no encontrado.');
  };
  return async (req: Request): Promise<Response> => {
    try {
      return await handle(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Rutas de administración (la autenticación y CSRF ya se han comprobado en el manejador del panel). */
export async function handleSignageAdmin(req: Request, path: string, who: string, deps: SignageDeps): Promise<Response | null> {
  if (!path.startsWith('/signage')) return null;
  const now = deps.now ?? (() => new Date());
  const repo = new SignageRepo(deps.content, now);
  const method = req.method.toUpperCase();

  if (path === '/signage') {
    if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Usa GET.');
    const [doc, screens] = await Promise.all([repo.readConfig(), repo.listScreens()]);
    const withStatus = await Promise.all(
      screens.map(async (s) => {
        const { tokenHash: _omit, ...rest } = s;
        void _omit;
        return { ...rest, status: await repo.getStatus(s.id) };
      }),
    );
    return json(200, { ...doc, screens: withStatus, serverTime: now().toISOString() }, noStore());
  }

  if (path === '/signage/config') {
    if (method !== 'PUT') throw new ApiError(405, 'method_not_allowed', 'Usa PUT.');
    const body = await readJson<{ config?: unknown; baseRevision?: unknown }>(req, 900_000);
    if (typeof body.baseRevision !== 'number') throw new ApiError(400, 'bad_request', 'Falta la revisión base.');
    const doc = await repo.saveConfig(body.config, body.baseRevision, who);
    const cachePurged = await tryPurge(deps, [SIGNAGE_TAG]);
    return json(200, { revision: doc.revision, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy, cachePurged }, noStore());
  }

  if (path === '/signage/pair') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    const body = await readJson<{ code?: unknown; name?: unknown }>(req, 2_000);
    const s = await repo.claimPairing(body.code, body.name);
    const { tokenHash: _omit, ...rest } = s;
    void _omit;
    return json(201, { screen: { ...rest, status: null } }, noStore());
  }

  const sm = /^\/signage\/screens\/(tv-[a-f0-9]{12})$/.exec(path);
  if (sm) {
    const id = sm[1];
    if (method === 'DELETE') {
      await repo.revoke(id);
      await tryPurge(deps, [screenTag(id)]);
      return json(200, { deleted: id }, noStore());
    }
    if (method === 'PATCH') {
      const body = await readJson<{ name?: unknown; playlistId?: unknown; quality?: unknown }>(req, 4_000);
      const { config } = await repo.readConfig();
      const s = await repo.updateScreen(id, (cur) => {
        const next = { ...cur };
        if (body.name !== undefined) {
          const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
          if (!name) throw new ApiError(400, 'invalid_name', 'El nombre no puede estar vacío.');
          next.name = name;
        }
        if (body.playlistId !== undefined) {
          if (body.playlistId !== null && !config.playlists.some((p) => p.id === body.playlistId)) throw new ApiError(400, 'bad_ref', 'Esa programación no existe.');
          next.playlistId = body.playlistId as string | null;
        }
        if (body.quality !== undefined) {
          if (body.quality !== null && !QUALITIES.includes(body.quality as never)) throw new ApiError(400, 'bad_quality', 'Calidad no válida.');
          next.quality = body.quality as ScreenRecord['quality'];
        }
        next.version = cur.version + 1;
        return next;
      });
      const cachePurged = await tryPurge(deps, [screenTag(id)]);
      const { tokenHash: _omit, ...rest } = s;
      void _omit;
      return json(200, { screen: rest, cachePurged }, noStore());
    }
    throw new ApiError(405, 'method_not_allowed', 'Usa PATCH o DELETE.');
  }

  if (path === '/signage/command') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    const body = await readJson<CommandBody>(req, 8_000);
    const { config } = await repo.readConfig();
    const all = await repo.listScreens();
    const ids = body.screenIds === 'all' ? all.map((s) => s.id) : Array.isArray(body.screenIds) ? body.screenIds.filter((x): x is string => typeof x === 'string') : [];
    const targets = ids.filter((id) => all.some((s) => s.id === id));
    if (!targets.length) throw new ApiError(400, 'no_screens', 'Selecciona al menos una televisión vinculada.');
    const updated: { id: string; version: number }[] = [];
    for (const id of targets) {
      const s = await repo.updateScreen(id, (cur) => applyCommand(cur, body, config, now()));
      updated.push({ id, version: s.version });
    }
    const cachePurged = await tryPurge(deps, targets.map(screenTag));
    return json(200, { updated, cachePurged }, noStore());
  }

  throw new ApiError(404, 'not_found', 'Recurso no encontrado.');
}
