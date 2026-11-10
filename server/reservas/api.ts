/**
 * API de reservas de Navidad.
 *
 * Público (sin sesión):
 *   GET  /api/reservas/form-config           Configuración del formulario (sin datos personales).
 *   POST /api/reservas/preselect             Guardar la elección de menús → referencia.
 *   GET  /api/reservas/link/:token           Abrir un enlace privado (no lo consume).
 *   POST /api/reservas/link/:token           Guardar (consume el enlace de forma atómica).
 *   POST /api/reservas/link/:token/request   Pedir un nuevo enlace.
 *   POST /api/reservas/inbound               Correo entrante (webhook con secreto).
 *   GET  /api/reservas/gmail/callback        Vuelta de la autorización OAuth de Google.
 *
 * Administración (/api/admin/reservas…, rol admin + CSRF): ver handleReservasAdmin.
 */
import { formatIssues, type SiteContent } from '../../shared/schema.ts';
import {
  type Booking,
  buildSelection,
  defaultReservasConfig,
  diffSelections,
  emptyQamarero,
  type Issue,
  normalizePhone,
  Q_STATUSES,
  type QamareroData,
  type ReservasConfig,
  selectionInputSchema,
  selectionProblems,
  selectionToInput,
  SERVICES,
  GASTRO_STATUSES,
  totalPeople,
} from '../../shared/reservas.ts';
import { ApiError, errorResponse, json, noStore, readJson } from '../http.ts';
import type { KV } from '../repo.ts';
import { ingestEmail, mergeBookings, scoreCandidate } from './ingest.ts';
import { type RawEmail } from './parse.ts';
import { ReservasRepo, randomId } from './repo.ts';
import { authUrl, type GmailEnv, type GmailSecret, gmailConfigured, handleCallback, syncGmail } from './gmail.ts';

export const RESERVAS_TAG = 'torero-reservas-config';

export interface ReservasDeps {
  store: KV;
  /** Contenido publicado (menús y URL de reservas). */
  readContent: () => Promise<SiteContent>;
  purge: (tags: string[]) => Promise<void>;
  inboundSecret: string | undefined;
  gmail: GmailEnv;
  now?: () => Date;
}

/* ---------------- utilidades ---------------- */
function madridNowLocal(at: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const deadlinePassed = (cfg: ReservasConfig, at: Date) => !!cfg.whatsapp.deadline && madridNowLocal(at) > cfg.whatsapp.deadline;

function newIssue(type: Issue['type'], message: string, at: string): Issue {
  return { id: randomId('i'), type, message, createdAt: at, resolvedAt: null, resolvedBy: null };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Vista que recibe el cliente con su enlace: solo su propia reserva y sin datos internos. */
function publicView(b: Booking) {
  return {
    ref: b.ref,
    holder: b.holder,
    service: b.selection?.service ?? b.service,
    date: b.qamarero.date,
    time: b.qamarero.time,
    people: b.qamarero.people,
    selection: b.selection ? selectionToInput(b.selection, b.holder) : null,
  };
}

/* ---------------- manejador público ---------------- */
export function createReservasPublicHandler(deps: ReservasDeps) {
  const now = deps.now ?? (() => new Date());
  const repo = new ReservasRepo(deps.store, now);

  const handle = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = req.method.toUpperCase();

    if (path === '/api/reservas/form-config') {
      const { config } = await repo.readConfig();
      const { formEnabled, menuIds, childMenuIds, childCarta, maxGuests, requireEmail, messages } = config;
      return json(
        200,
        { formEnabled, menuIds, childMenuIds, childCarta, maxGuests, requireEmail, messages, deadline: config.whatsapp.deadline, contactPhone: config.whatsapp.contactPhone },
        { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300', 'Netlify-Cache-Tag': RESERVAS_TAG },
      );
    }

    if (path === '/api/reservas/preselect') {
      if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
      const body = await readJson<{ selection?: unknown; consent?: unknown; website?: unknown }>(req, 120_000);
      // Campo trampa para robots: si viene relleno, se responde como si nada y no se guarda.
      if (typeof body.website === 'string' && body.website.trim()) return json(201, { ref: 'TOR-00000', ok: true }, noStore());
      if (body.consent !== true) throw new ApiError(400, 'consent', 'Debes aceptar el tratamiento de los datos para continuar.');
      const { config } = await repo.readConfig();
      if (!config.formEnabled) throw new ApiError(403, 'disabled', 'El formulario de menús no está disponible ahora mismo.');
      const parsed = selectionInputSchema.safeParse(body.selection);
      if (!parsed.success) throw new ApiError(422, 'validation', 'Hay datos no válidos.', formatIssues(parsed.error));
      const content = await deps.readContent();
      const problems = selectionProblems(parsed.data, content, config);
      if (problems.length) throw new ApiError(422, 'incomplete', problems[0].message, problems);
      const at = repo.iso();
      const sel = buildSelection(parsed.data, content, at);
      const b = repo.blank('form', 'cliente') as Booking;
      b.holder = { name: parsed.data.holder.name.trim(), phone: normalizePhone(parsed.data.holder.phone) ?? parsed.data.holder.phone, email: parsed.data.holder.email.trim().toLowerCase() };
      b.service = sel.service;
      b.selection = sel;
      b.gastroStatus = 'complete';
      b.history = [{ at, actor: 'cliente', source: 'form', type: 'form_completed', summary: 'Formulario de menús completado', details: diffSelections(null, sel) }];
      const created = await repo.create(b);
      return json(201, { ok: true, ref: created.ref, bookingUrl: content.booking.url }, noStore());
    }

    const lm = /^\/api\/reservas\/link\/([\w-]{30,100})(\/request)?$/.exec(path);
    if (lm) {
      const tok = await repo.readToken(lm[1]);
      if (!tok) throw new ApiError(404, 'invalid_link', 'Este enlace no es válido.');
      const { config } = await repo.readConfig();
      const t = tok.doc;
      const expired = Date.parse(t.expiresAt) <= now().getTime();
      const late = deadlinePassed(config, now()) && !t.allowLate;
      const state = t.status === 'used' ? 'used' : t.status === 'revoked' ? 'revoked' : expired ? 'expired' : late ? 'deadline' : 'active';

      if (lm[2]) {
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
        const body = await readJson<{ reason?: unknown }>(req, 4_000);
        const b = await repo.get(t.bookingId);
        if (!b) throw new ApiError(404, 'invalid_link', 'Este enlace no es válido.');
        // eslint-disable-next-line no-control-regex -- saneamiento intencionado de caracteres de control
        await repo.addRequest(b.id, typeof body.reason === 'string' ? body.reason.replace(/[\u0000-\u001f]/g, ' ') : '');
        await repo.update(b.id, (x) => {
          x.history.push({ at: repo.iso(), actor: 'cliente', source: 'link', type: 'request', summary: 'El cliente solicita un nuevo enlace de modificación' });
          return x;
        });
        return json(201, { ok: true, contactPhone: config.whatsapp.contactPhone }, noStore());
      }

      if (method === 'GET') {
        const b = await repo.get(t.bookingId);
        if (!b || b.archived) throw new ApiError(404, 'invalid_link', 'Este enlace no es válido.');
        return json(200, { kind: t.kind, state, expiresAt: t.expiresAt, booking: state === 'active' ? publicView(b) : { ref: b.ref }, contactPhone: config.whatsapp.contactPhone }, noStore());
      }

      if (method === 'POST') {
        if (state !== 'active') throw new ApiError(410, state, state === 'used' ? 'Este enlace ya se ha utilizado.' : state === 'deadline' ? 'El plazo para modificar los menús ha terminado. Contacta con el restaurante.' : 'Este enlace ya no está activo.');
        const body = await readJson<{ selection?: unknown }>(req, 120_000);
        const owner = await repo.get(t.bookingId);
        if (!owner) throw new ApiError(404, 'invalid_link', 'Este enlace no es válido.');
        // El titular no se cambia desde el enlace: se usan los datos guardados.
        const parsed = selectionInputSchema.safeParse(body.selection && typeof body.selection === 'object' ? { ...(body.selection as object), holder: { name: owner.holder.name || 'Titular', phone: owner.holder.phone, email: '' } } : body.selection);
        if (!parsed.success) throw new ApiError(422, 'validation', 'Hay datos no válidos.', formatIssues(parsed.error));
        const content = await deps.readContent();
        const problems = selectionProblems(parsed.data, content, config, { skipHolder: true });
        if (problems.length) throw new ApiError(422, 'incomplete', problems[0].message, problems);
        // Consumo atómico: si dos envíos llegan a la vez, solo uno pasa.
        if (!(await repo.consumeToken(tok.hash, t))) throw new ApiError(409, 'used', 'Este enlace ya se ha utilizado.');
        try {
          const at = repo.iso();
          await repo.update(t.bookingId, (b) => {
            const prev = b.selection;
            const sel = buildSelection(parsed.data, content, at);
            const prevTotal = totalPeople(b);
            b.selection = sel;
            b.service = sel.service;
            // El titular y su teléfono no se cambian desde el enlace (solo los datos gastronómicos).
            b.gastroStatus = b.gastroStatus === 'cancelled' ? 'cancelled' : prev ? 'modified' : 'complete';
            const newTotal = sel.adults + sel.children;
            const confirmed = b.qamarero.people ?? prevTotal;
            if (confirmed !== null && newTotal !== confirmed) {
              b.peopleChange = { from: confirmed, to: newTotal, status: 'pending', at };
              b.issues.push(newIssue('people_change', `Cambio de comensales pendiente de confirmar en Qamarero: ${confirmed} → ${newTotal}.`, at));
            } else if (b.peopleChange?.status === 'pending' && newTotal === confirmed) b.peopleChange = null;
            b.history.push({ at, actor: 'cliente', source: 'link', type: t.kind === 'complete' ? 'link_completed' : 'link_modified', summary: t.kind === 'complete' ? 'El cliente completa la elección de menús (enlace privado)' : 'El cliente modifica la elección de menús (enlace privado)', details: diffSelections(prev, sel), before: prev, after: sel });
            return b;
          });
          await repo.resolveRequests(t.bookingId, 'cliente');
        } catch (e) {
          // Si no se pudo guardar la reserva, el enlace vuelve a estar disponible.
          await repo.restoreToken(tok.hash, t);
          throw e;
        }
        return json(200, { ok: true, title: config.messages.modifiedTitle, text: config.messages.modifiedText }, noStore());
      }
      throw new ApiError(405, 'method_not_allowed', 'Método no permitido.');
    }

    if (path === '/api/reservas/inbound') {
      if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
      if (!deps.inboundSecret) throw new ApiError(503, 'not_configured', 'Recepción de correo no configurada (INBOUND_EMAIL_SECRET).');
      const authz = req.headers.get('authorization') ?? '';
      const basic = authz.startsWith('Basic ') ? atob(authz.slice(6)).split(':').slice(1).join(':') : '';
      const given = req.headers.get('x-torero-inbound-token') ?? basic;
      if (!given || !timingSafeEqual(given, deps.inboundSecret)) throw new ApiError(401, 'unauthorized', 'No autorizado.');
      const body = await readJson<Record<string, unknown>>(req, 2_000_000);
      const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
      // Formato de Postmark (MessageID, From, Subject, Date, TextBody, HtmlBody) o genérico.
      const raw: RawEmail = {
        messageId: s('MessageID') || s('messageId') || s('message_id'),
        from: s('From') || s('from'),
        subject: s('Subject') || s('subject'),
        date: (() => {
          const d = s('Date') || s('date');
          const t = Date.parse(d);
          return Number.isNaN(t) ? repo.iso() : new Date(t).toISOString();
        })(),
        text: s('TextBody') || s('text'),
        html: s('HtmlBody') || s('html'),
      };
      const { config } = await repo.readConfig();
      const res = await ingestEmail(repo, config, raw, 'webhook');
      const st = await repo.sync();
      await repo.saveSync({ ...st, provider: st.provider === 'gmail' ? 'gmail' : 'webhook', lastRunAt: repo.iso(), lastOkAt: repo.iso(), processed: st.processed + (res.status === 'processed' ? 1 : 0), errors: st.errors + (res.status === 'error' ? 1 : 0) });
      return json(200, { status: res.status, result: res.result }, noStore());
    }

    if (path === '/api/reservas/gmail/callback') {
      const r = await handleCallback(repo, deps.gmail, url.origin, url);
      const target = `/admin#/reservas/correo?gmail=${r.ok ? 'ok' : 'error'}&msg=${encodeURIComponent(r.message)}`;
      return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
    }

    throw new ApiError(404, 'not_found', 'Recurso no encontrado.');
  };
  return async (req: Request) => {
    try {
      return await handle(req);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Ejecución programada (Netlify Scheduled Function). */
export async function runScheduledSync(deps: ReservasDeps) {
  const repo = new ReservasRepo(deps.store, deps.now);
  const { config } = await repo.readConfig();
  return syncGmail(repo, deps.gmail, config);
}

/* ---------------- administración ---------------- */
const qPatchKeys = ['date', 'time', 'zone', 'people', 'reservationId', 'menu', 'notes'] as const;

export async function handleReservasAdmin(req: Request, path: string, who: string, deps: ReservasDeps): Promise<Response | null> {
  if (!path.startsWith('/reservas')) return null;
  const now = deps.now ?? (() => new Date());
  const repo = new ReservasRepo(deps.store, now);
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const at = () => repo.iso();

  if (path === '/reservas') {
    const [rows, cfg, sync, requests, gmail] = await Promise.all([repo.rows(), repo.readConfig(), repo.sync(), repo.requests(), repo.secret<GmailSecret>('gmail')]);
    return json(
      200,
      {
        rows,
        config: cfg.config,
        configRevision: cfg.revision,
        sync,
        requests,
        email: { gmailAvailable: gmailConfigured(deps.gmail), gmailConnected: !!gmail, gmailAccount: gmail?.email ?? '', webhookConfigured: !!deps.inboundSecret, webhookUrl: `${url.origin}/api/reservas/inbound` },
        serverTime: at(),
      },
      noStore(),
    );
  }

  if (path === '/reservas/config') {
    if (method !== 'PUT') throw new ApiError(405, 'method_not_allowed', 'Usa PUT.');
    const body = await readJson<{ config?: unknown; baseRevision?: unknown }>(req, 60_000);
    if (typeof body.baseRevision !== 'number') throw new ApiError(400, 'bad_request', 'Falta la revisión base.');
    const revision = await repo.saveConfig(body.config, body.baseRevision);
    try {
      await deps.purge([RESERVAS_TAG]);
    } catch {
      /* caduca en 5 min */
    }
    return json(200, { revision }, noStore());
  }

  if (path === '/reservas/full') {
    // Reservas completas de un intervalo (informes y cocina).
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? from;
    const all = (await repo.all()).filter((b) => !b.archived && (!from || (b.qamarero.date >= from && b.qamarero.date <= to) || (url.searchParams.get('undated') === '1' && !b.qamarero.date)));
    return json(200, { bookings: all }, noStore());
  }

  const bm = /^\/reservas\/b\/(r-[a-f0-9]{16})(\/[a-z-]+)?$/.exec(path);
  if (bm) {
    const id = bm[1];
    const sub = bm[2] ?? '';
    if (!sub && method === 'GET') {
      const b = await repo.get(id);
      if (!b) throw new ApiError(404, 'not_found', 'La reserva no existe.');
      const tokens = (await repo.tokensOf(id)).map(({ bookingId: _b, ...t }) => (void _b, t));
      let candidates: unknown[] = [];
      if (b.match.status === 'review' || (b.origin === 'email' && b.match.status !== 'linked' && b.match.status !== 'merged')) {
        const { config } = await repo.readConfig();
        const pool = (await repo.all()).filter((x) => !x.archived && x.id !== id && x.origin === 'form' && x.match.status !== 'linked');
        const p = { name: b.holder.name, phone: b.holder.phone, email: b.holder.email, people: b.qamarero.people, time: b.qamarero.time };
        candidates = pool
          .map((x) => ({ booking: { id: x.id, ref: x.ref, holder: x.holder, createdAt: x.createdAt, people: totalPeople(x), service: x.selection?.service ?? null }, ...scoreCandidate(p, x, b.qamarero.notifiedAt ?? b.createdAt, config.email.lunchUntil) }))
          .filter((c) => c.score >= 20 || b.match.candidates.includes(c.id))
          .sort((a, c) => c.score - a.score)
          .slice(0, 8);
      }
      return json(200, { booking: b, tokens, candidates }, noStore());
    }
    if (!sub && method === 'DELETE') {
      await repo.remove(id);
      return json(200, { deleted: id }, noStore());
    }
    if (!sub && method === 'PATCH') {
      const body = await readJson<{ baseVersion?: unknown; holder?: Record<string, unknown>; qamarero?: Record<string, unknown>; gastroStatus?: unknown; qStatus?: unknown; internalNotes?: unknown; service?: unknown; selection?: unknown }>(req, 120_000);
      if (typeof body.baseVersion !== 'number') throw new ApiError(400, 'bad_request', 'Falta la versión base.');
      const content = body.selection !== undefined ? await deps.readContent() : null;
      const { config } = await repo.readConfig();
      const b = await repo.update(
        id,
        (b) => {
          const changes: string[] = [];
          const before = { holder: { ...b.holder }, qamarero: { ...b.qamarero } };
          if (body.holder) {
            for (const k of ['name', 'phone', 'email'] as const) {
              const v = body.holder[k];
              if (typeof v === 'string' && v.trim() !== b.holder[k]) {
                const val = k === 'phone' ? (normalizePhone(v) ?? v.trim()) : v.trim().slice(0, 120);
                if (k === 'phone' && v.trim() && !normalizePhone(v)) throw new ApiError(422, 'phone', 'Teléfono no válido.');
                changes.push(`${k}: ${b.holder[k] || '—'} → ${val || '—'}`);
                b.holder[k] = val;
              }
            }
          }
          if (body.qamarero) {
            for (const k of qPatchKeys) {
              if (!(k in body.qamarero)) continue;
              const v = body.qamarero[k];
              if (k === 'people') {
                const n = v === null || v === '' ? null : Number(v);
                if (n !== null && (!Number.isInteger(n) || n < 0 || n > 200)) throw new ApiError(422, 'people', 'Número de personas no válido.');
                if (n !== b.qamarero.people) changes.push(`personas: ${b.qamarero.people ?? '—'} → ${n ?? '—'}`);
                b.qamarero.people = n;
              } else if (typeof v === 'string') {
                if (k === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ApiError(422, 'date', 'Fecha no válida.');
                if (k === 'time' && v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new ApiError(422, 'time', 'Hora no válida.');
                const val = v.trim().slice(0, k === 'notes' ? 800 : 120);
                if (val !== b.qamarero[k]) changes.push(`${k}: ${b.qamarero[k] || '—'} → ${val || '—'}`);
                (b.qamarero as unknown as Record<string, string>)[k] = val;
              }
            }
            if (changes.length) b.qamarero.source = b.qamarero.source ?? 'manual';
          }
          if (typeof body.qStatus === 'string') {
            if (!Q_STATUSES.includes(body.qStatus as never)) throw new ApiError(422, 'status', 'Estado no válido.');
            if (body.qStatus !== b.qamarero.status) changes.push(`estado Qamarero: ${b.qamarero.status} → ${body.qStatus}`);
            b.qamarero.status = body.qStatus as QamareroData['status'];
          }
          if (typeof body.gastroStatus === 'string') {
            if (!GASTRO_STATUSES.includes(body.gastroStatus as never)) throw new ApiError(422, 'status', 'Estado no válido.');
            if (body.gastroStatus !== b.gastroStatus) changes.push(`estado gastronómico: ${b.gastroStatus} → ${body.gastroStatus}`);
            b.gastroStatus = body.gastroStatus as Booking['gastroStatus'];
          }
          if (typeof body.service === 'string' && SERVICES.includes(body.service as never)) b.service = body.service as Booking['service'];
          if (typeof body.internalNotes === 'string' && body.internalNotes !== b.internalNotes) {
            b.internalNotes = body.internalNotes.slice(0, 2000);
            changes.push('notas internas');
          }
          if (body.selection !== undefined && content) {
            const parsed = selectionInputSchema.safeParse(body.selection);
            if (!parsed.success) throw new ApiError(422, 'validation', 'Selección no válida.', formatIssues(parsed.error));
            const problems = selectionProblems(parsed.data, content, config, { skipHolder: true });
            if (problems.length) throw new ApiError(422, 'incomplete', problems[0].message, problems);
            const prev = b.selection;
            b.selection = buildSelection(parsed.data, content, at());
            b.service = b.selection.service;
            if (b.gastroStatus === 'pending') b.gastroStatus = 'complete';
            else if (prev && b.gastroStatus !== 'cancelled') b.gastroStatus = 'modified';
            b.history.push({ at: at(), actor: who, source: 'admin', type: 'selection_edited', summary: 'Elección de menús editada por el restaurante', details: diffSelections(prev, b.selection), before: prev, after: b.selection });
          }
          if (changes.length) b.history.push({ at: at(), actor: who, source: 'admin', type: 'edited', summary: 'Datos corregidos por el restaurante', details: changes, before, after: { holder: b.holder, qamarero: b.qamarero } });
          return b;
        },
        body.baseVersion,
      );
      if (body.qamarero?.reservationId && typeof body.qamarero.reservationId === 'string') await repo.mapReservationId(body.qamarero.reservationId, id);
      return json(200, { booking: b }, noStore());
    }
    if (sub === '/action') {
      const body = await readJson<{ action?: unknown; issueId?: unknown; people?: unknown; baseVersion?: unknown }>(req, 8_000);
      const action = body.action;
      const b = await repo.update(id, (b) => {
        const t = at();
        const push = (type: string, summary: string, details?: string[]) => b.history.push({ at: t, actor: who, source: 'admin', type, summary, ...(details ? { details } : {}) });
        switch (action) {
          case 'confirm-review':
            b.qamarero.lastCheckedAt = t;
            b.qamarero.lastCheckedBy = who;
            if (b.qamarero.status === 'to_check') b.qamarero.status = b.match.status === 'linked' && b.match.method === 'manual' ? 'manual_linked' : b.qamarero.notifiedAt ? 'email_confirmed' : 'manual_linked';
            push('reviewed', 'Revisada con Qamarero: la reserva sigue vigente con estos datos');
            break;
          case 'mark-check':
            b.qamarero.status = 'to_check';
            push('to_check', 'Marcada como pendiente de comprobar en Qamarero');
            break;
          case 'cancel':
            b.qamarero.status = 'cancelled_manual';
            b.gastroStatus = 'cancelled';
            push('cancelled', 'Cancelada manualmente');
            break;
          case 'restore':
            b.qamarero.status = b.qamarero.notifiedAt ? 'email_confirmed' : b.qamarero.date ? 'manual_linked' : 'pending_confirmation';
            b.gastroStatus = b.selection ? 'complete' : 'pending';
            push('restored', 'Cancelación anulada (reserva restaurada)');
            break;
          case 'confirm-people': {
            if (!b.peopleChange) throw new ApiError(400, 'no_change', 'No hay cambio de comensales pendiente.');
            const n = typeof body.people === 'number' ? body.people : b.peopleChange.to;
            b.peopleChange = { ...b.peopleChange, status: 'confirmed' };
            b.qamarero.people = n;
            b.qamarero.lastCheckedAt = t;
            b.qamarero.lastCheckedBy = who;
            b.issues = b.issues.map((i) => (i.type === 'people_change' || i.type === 'people_mismatch') && !i.resolvedAt ? { ...i, resolvedAt: t, resolvedBy: who } : i);
            push('people_confirmed', `Cambio de comensales confirmado en Qamarero: ${n} personas`);
            break;
          }
          case 'reject-people':
            if (!b.peopleChange) throw new ApiError(400, 'no_change', 'No hay cambio de comensales pendiente.');
            b.peopleChange = { ...b.peopleChange, status: 'rejected' };
            b.gastroStatus = 'review';
            push('people_rejected', `Cambio de comensales rechazado o no disponible (${b.peopleChange.from ?? '—'} → ${b.peopleChange.to}). Revisar con el cliente.`);
            break;
          case 'resolve-issue': {
            const i = b.issues.find((x) => x.id === body.issueId);
            if (!i) throw new ApiError(404, 'not_found', 'Incidencia no encontrada.');
            i.resolvedAt = t;
            i.resolvedBy = who;
            push('issue_resolved', `Incidencia resuelta: ${i.message}`);
            break;
          }
          case 'flag-review':
            b.gastroStatus = 'review';
            push('flag_review', 'Marcada como «requiere revisión»');
            break;
          case 'unlink':
            b.match = { status: 'none', method: null, candidates: [], mergedInto: null, score: null };
            b.qamarero = { ...emptyQamarero() };
            push('unlinked', 'Vinculación con Qamarero deshecha');
            break;
          default:
            throw new ApiError(400, 'bad_action', 'Acción no reconocida.');
        }
        return b;
      }, typeof body.baseVersion === 'number' ? body.baseVersion : undefined);
      if (action === 'unlink') {
        /* El mapa de identificador externo se mantiene hasta que otra reserva lo reclame. */
      }
      return json(200, { booking: b }, noStore());
    }
    if (sub === '/link') {
      const body = await readJson<{ kind?: unknown; allowLate?: unknown }>(req, 2_000);
      const b = await repo.get(id);
      if (!b) throw new ApiError(404, 'not_found', 'La reserva no existe.');
      const kind = body.kind === 'complete' ? 'complete' : 'modify';
      const { config } = await repo.readConfig();
      const { token, expiresAt } = await repo.createToken(id, kind, who, config.whatsapp.linkHours, body.allowLate === true);
      const link = `${url.origin}/reservar/${kind === 'complete' ? 'completar' : 'modificar'}/${token}`;
      await repo.update(id, (x) => {
        x.history.push({ at: at(), actor: who, source: 'admin', type: 'link_created', summary: `${kind === 'complete' ? 'Enlace para completar la elección' : 'Enlace de modificación'} generado (caduca ${new Date(expiresAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })})${body.allowLate === true ? ' · autorizado fuera de plazo' : ''}. Enlaces anteriores revocados.` });
        return x;
      });
      await repo.resolveRequests(id, who);
      return json(201, { link, expiresAt, kind }, noStore());
    }
    if (sub === '/revoke-links') {
      const n = await repo.revokeTokens(id);
      await repo.update(id, (x) => {
        x.history.push({ at: at(), actor: who, source: 'admin', type: 'links_revoked', summary: `${n} enlace(s) revocado(s)` });
        return x;
      });
      return json(200, { revoked: n }, noStore());
    }
    throw new ApiError(404, 'not_found', 'Recurso no encontrado.');
  }

  if (path === '/reservas/merge') {
    const body = await readJson<{ emailId?: unknown; targetId?: unknown }>(req, 2_000);
    if (typeof body.emailId !== 'string' || typeof body.targetId !== 'string') throw new ApiError(400, 'bad_request', 'Faltan las reservas a vincular.');
    try {
      const b = await mergeBookings(repo, body.emailId, body.targetId, who);
      return json(200, { booking: b }, noStore());
    } catch (e) {
      if ((e as Error).message === 'target_linked') throw new ApiError(409, 'target_linked', 'Esa elección de menús ya está vinculada a otra reserva de Qamarero.');
      if ((e as Error).message === 'not_found') throw new ApiError(404, 'not_found', 'Reserva no encontrada.');
      throw e;
    }
  }

  if (path === '/reservas/manual') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    const body = await readJson<{ holder?: Record<string, string>; qamarero?: Partial<QamareroData> }>(req, 8_000);
    const name = String(body.holder?.name ?? '').trim();
    if (!name) throw new ApiError(422, 'name', 'Escribe el nombre del titular.');
    const b = repo.blank('manual', who) as Booking;
    b.holder = { name: name.slice(0, 100), phone: normalizePhone(String(body.holder?.phone ?? '')) ?? String(body.holder?.phone ?? '').slice(0, 30), email: String(body.holder?.email ?? '').slice(0, 120) };
    const q = body.qamarero ?? {};
    b.qamarero = { ...emptyQamarero(), status: 'manual_linked', reservationId: String(q.reservationId ?? '').slice(0, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(String(q.date)) ? String(q.date) : '', time: /^\d{2}:\d{2}$/.test(String(q.time)) ? String(q.time) : '', zone: String(q.zone ?? '').slice(0, 80), people: typeof q.people === 'number' ? q.people : null, source: 'manual', lastCheckedAt: at(), lastCheckedBy: who };
    b.match = { status: 'linked', method: 'manual', candidates: [], mergedInto: null, score: null };
    const created = await repo.create(b);
    if (b.qamarero.reservationId) await repo.mapReservationId(b.qamarero.reservationId, created.id);
    return json(201, { booking: created }, noStore());
  }

  if (path === '/reservas/emails') {
    return json(200, { emails: await repo.mails() }, noStore());
  }
  if (path === '/reservas/emails/ingest') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    const body = await readJson<Record<string, unknown>>(req, 2_000_000);
    const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
    const { config } = await repo.readConfig();
    const raw: RawEmail = { messageId: s('messageId'), from: s('from') || 'manual', subject: s('subject'), date: s('date') && !Number.isNaN(Date.parse(s('date'))) ? new Date(s('date')).toISOString() : at(), text: s('text'), html: s('html') };
    const res = await ingestEmail(repo, { ...config, email: { ...config.email, allowedSenders: body.skipSenderCheck === true ? [] : config.email.allowedSenders } }, raw, 'manual');
    return json(200, res, noStore());
  }
  if (path === '/reservas/sync') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    const { config } = await repo.readConfig();
    return json(200, await syncGmail(repo, deps.gmail, config), noStore());
  }
  if (path === '/reservas/gmail/auth-url') {
    if (!gmailConfigured(deps.gmail)) throw new ApiError(503, 'not_configured', 'Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en las variables de entorno de Netlify.');
    return json(200, { url: await authUrl(repo, deps.gmail, url.origin, who) }, noStore());
  }
  if (path === '/reservas/gmail/disconnect') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    await repo.deleteSecret('gmail');
    const s = await repo.sync();
    await repo.saveSync({ ...s, provider: 'none' });
    return json(200, { ok: true }, noStore());
  }

  if (path === '/reservas/requests') {
    if (method === 'POST') {
      const body = await readJson<{ id?: unknown; status?: unknown }>(req, 2_000);
      const r = (await repo.requests()).find((x) => x.id === body.id);
      if (!r) throw new ApiError(404, 'not_found', 'Solicitud no encontrada.');
      await repo.resolveRequests(r.bookingId, who, body.status === 'dismissed' ? 'dismissed' : 'done', r.id);
    }
    return json(200, { requests: await repo.requests() }, noStore());
  }

  if (path === '/reservas/prints') {
    const key = `${url.searchParams.get('date') ?? ''}-${url.searchParams.get('service') ?? 'all'}`;
    if (!/^\d{4}-\d{2}-\d{2}(_\d{4}-\d{2}-\d{2})?-(lunch|dinner|all)$/.test(key)) throw new ApiError(400, 'bad_request', 'Fecha o servicio no válidos.');
    if (method === 'POST') {
      const body = await readJson<{ kind?: unknown; versions?: unknown }>(req, 200_000);
      const versions = body.versions && typeof body.versions === 'object' ? (body.versions as Record<string, string>) : {};
      await repo.savePrint(key, { at: at(), by: who, kind: String(body.kind ?? '').slice(0, 40), versions });
    }
    return json(200, { print: await repo.getPrint(key) }, noStore());
  }

  if (path === '/reservas/import/apply') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    const body = await readJson<{ items?: unknown }>(req, 600_000);
    const items = Array.isArray(body.items) ? (body.items as { bookingId: string | null; data: Partial<QamareroData> & { name?: string; phone?: string; cancelled?: boolean } }[]) : [];
    let applied = 0;
    for (const it of items.slice(0, 500)) {
      const d = it.data ?? {};
      const fields: Partial<QamareroData> = {};
      if (typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) fields.date = d.date;
      if (typeof d.time === 'string' && /^\d{2}:\d{2}$/.test(d.time)) fields.time = d.time;
      if (typeof d.zone === 'string') fields.zone = d.zone.slice(0, 80);
      if (typeof d.people === 'number' && d.people >= 0 && d.people < 200) fields.people = d.people;
      if (typeof d.reservationId === 'string') fields.reservationId = d.reservationId.slice(0, 80);
      if (it.bookingId) {
        await repo.update(it.bookingId, (b) => {
          const before = { ...b.qamarero };
          b.qamarero = { ...b.qamarero, ...fields, source: 'import', lastCheckedAt: at(), lastCheckedBy: who };
          if (d.cancelled) {
            b.qamarero.status = 'cancelled_manual';
            b.gastroStatus = 'cancelled';
          } else if (b.qamarero.status === 'pending_confirmation' || b.qamarero.status === 'to_check') b.qamarero.status = 'manual_linked';
          const total = totalPeople(b);
          if (fields.people !== undefined && total !== null && fields.people !== total && !b.issues.some((i) => !i.resolvedAt && i.type === 'people_mismatch')) b.issues.push(newIssue('people_mismatch', `Comensales distintos: ${fields.people} en Qamarero y ${total} en la elección de menús.`, at()));
          b.history.push({ at: at(), actor: who, source: 'import', type: 'imported', summary: d.cancelled ? 'Importación de Qamarero: cancelada' : 'Datos actualizados desde la importación de Qamarero', before, after: b.qamarero });
          return b;
        });
      } else {
        const b = repo.blank('import', who) as Booking;
        b.holder = { name: String(d.name ?? '').slice(0, 100), phone: normalizePhone(String(d.phone ?? '')) ?? String(d.phone ?? '').slice(0, 30), email: '' };
        b.qamarero = { ...emptyQamarero(), ...fields, status: d.cancelled ? 'cancelled_manual' : 'manual_linked', source: 'import', lastCheckedAt: at(), lastCheckedBy: who };
        const created = await repo.create(b);
        if (fields.reservationId) await repo.mapReservationId(fields.reservationId, created.id);
      }
      applied++;
    }
    return json(200, { applied }, noStore());
  }

  if (path === '/reservas/purge') {
    if (method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Usa POST.');
    const { config } = await repo.readConfig();
    const limit = new Date(now().getTime() - config.retentionDays * 86400_000).toISOString().slice(0, 10);
    let n = 0;
    for (const b of await repo.all()) {
      const ref = b.qamarero.date || b.createdAt.slice(0, 10);
      if (ref < limit) {
        await repo.remove(b.id);
        n++;
      }
    }
    return json(200, { deleted: n, before: limit }, noStore());
  }

  throw new ApiError(404, 'not_found', 'Recurso no encontrado.');
}

export { defaultReservasConfig };
