/**
 * Procesamiento de notificaciones de reservas y vinculación con las preselecciones.
 *
 * Idempotente: cada correo tiene una clave estable (Message-ID o huella del contenido) y se
 * registra con «onlyIfNew» antes de procesarlo; si llega otra vez, se ignora.
 *
 * Vinculación por prioridad:
 *   1. Referencia de nuestra web (TOR-XXXXX) en el correo — si no hay contradicción de identidad.
 *   2. Identificador de Qamarero ya vinculado antes.
 *   3. Coincidencia de datos (teléfono, correo, nombre, comensales, servicio y cercanía temporal):
 *      solo automática si es fiable, única y sin contradicciones; si no, «pendiente de revisar».
 */
import {
  type Booking,
  type HistoryEvent,
  type Issue,
  nameSimilarity,
  normalizePhone,
  type QStatus,
  type ReservasConfig,
  totalPeople,
} from '../../shared/reservas.ts';
import { parseEmail, type ParsedEmail, type RawEmail, senderAllowed } from './parse.ts';
import { type MailRecord, randomId, ReservasRepo, sha256 } from './repo.ts';

export interface Candidate {
  id: string;
  score: number;
  reasons: string[];
  contradictions: string[];
}

/** Puntuación de una preselección frente a los datos de una notificación. */
export function scoreCandidate(p: Pick<ParsedEmail, 'name' | 'phone' | 'email' | 'people' | 'time'>, b: Booking, receivedAt: string, lunchUntil: string): Candidate {
  const reasons: string[] = [];
  const contradictions: string[] = [];
  let score = 0;
  const pp = normalizePhone(p.phone);
  const bp = normalizePhone(b.holder.phone);
  if (pp && bp) {
    if (pp === bp) {
      score += 50;
      reasons.push('mismo teléfono');
    } else contradictions.push('teléfono distinto');
  }
  if (p.email && b.holder.email) {
    if (p.email.toLowerCase() === b.holder.email.toLowerCase()) {
      score += 30;
      reasons.push('mismo correo');
    } else score -= 5;
  }
  if (p.name && b.holder.name) {
    const sim = nameSimilarity(p.name, b.holder.name);
    if (sim >= 0.99) {
      score += 15;
      reasons.push('mismo nombre');
    } else if (sim >= 0.5) {
      score += 8;
      reasons.push('nombre parecido');
    } else contradictions.push('nombre distinto');
  }
  const total = totalPeople(b);
  if (p.people !== null && total !== null) {
    if (p.people === total) {
      score += 10;
      reasons.push('mismos comensales');
    } else contradictions.push(`comensales distintos (${p.people} en Qamarero, ${total} en el formulario)`);
  }
  if (p.time && b.selection) {
    const svc = p.time < lunchUntil ? 'lunch' : 'dinner';
    if (svc === b.selection.service) {
      score += 5;
      reasons.push('mismo servicio');
    } else contradictions.push('servicio distinto (comida/cena)');
  }
  const gapH = (Date.parse(receivedAt) - Date.parse(b.createdAt)) / 3600_000;
  if (gapH >= -1 && gapH <= 72) {
    score += 5;
    reasons.push('formulario reciente');
  }
  return { id: b.id, score, reasons, contradictions };
}

const ev = (at: string, type: string, summary: string, details?: string[], extra?: Partial<HistoryEvent>): HistoryEvent => ({ at, actor: 'correo', source: 'email', type, summary, ...(details ? { details } : {}), ...extra });

function issue(type: Issue['type'], message: string, at: string): Issue {
  return { id: randomId('i'), type, message, createdAt: at, resolvedAt: null, resolvedBy: null };
}

/** Aplica los datos de una notificación a una reserva (sin tocar nunca las elecciones de platos). */
export function applyNotification(b: Booking, p: ParsedEmail, receivedAt: string, method: Booking['match']['method'], summaryPrefix: string): Booking {
  const before = { ...b.qamarero };
  const status: QStatus = p.type === 'cancelled' ? 'cancellation_notified' : p.type === 'modified' ? 'modification_notified' : b.qamarero.status === 'manual_linked' ? 'manual_linked' : 'email_confirmed';
  const q = b.qamarero;
  b.qamarero = {
    ...q,
    status,
    reservationId: p.reservationId || q.reservationId,
    date: p.date || q.date,
    time: p.time || q.time,
    zone: p.zone || q.zone,
    people: p.people ?? q.people,
    menu: p.menu || q.menu,
    notes: p.notes || q.notes,
    source: 'email',
    notifiedAt: receivedAt,
    lastNotificationType: p.type,
  };
  if (!b.holder.name && p.name) b.holder.name = p.name;
  if (!b.holder.phone && p.phone) b.holder.phone = normalizePhone(p.phone) ?? p.phone;
  if (!b.holder.email && p.email) b.holder.email = p.email;
  if (p.type === 'cancelled') b.gastroStatus = 'cancelled';
  if (method && b.match.status !== 'linked') b.match = { ...b.match, status: 'linked', method, candidates: [] };
  const changes = (['date', 'time', 'zone', 'people', 'reservationId'] as const)
    .filter((k) => before[k] !== b.qamarero[k] && before[k] !== '' && before[k] !== null)
    .map((k) => `${k}: ${before[k]} → ${b.qamarero[k]}`);
  b.history.push(ev(receivedAt, `email_${p.type}`, `${summaryPrefix}${p.type === 'cancelled' ? 'Cancelación notificada por email' : p.type === 'modified' ? 'Modificación notificada por email' : 'Confirmación recibida por email'}`, changes.length ? changes : undefined, { before, after: b.qamarero }));
  // Discrepancia de comensales: se avisa, nunca se corrige sola.
  const total = totalPeople(b);
  if (p.people !== null && total !== null && p.people !== total && !b.issues.some((i) => !i.resolvedAt && i.type === 'people_mismatch' && i.message.includes(`${p.people} en Qamarero`))) {
    b.issues.push(issue('people_mismatch', `Comensales distintos: ${p.people} en Qamarero y ${total} en la elección de menús.`, receivedAt));
  }
  if (b.peopleChange?.status === 'pending' && p.people === b.peopleChange.to) {
    b.history.push(ev(receivedAt, 'people_change_seen', `Qamarero notifica ${p.people} comensales (coincide con el cambio solicitado; confírmalo en la ficha).`));
  }
  return b;
}

export interface IngestResult {
  status: MailRecord['status'] | 'duplicate';
  bookingId: string | null;
  result: string;
}

export async function ingestEmail(repo: ReservasRepo, cfg: ReservasConfig, raw: RawEmail, via: MailRecord['via']): Promise<IngestResult> {
  const key = await sha256(raw.messageId?.trim() ? `id:${raw.messageId.trim()}` : `c:${raw.from}|${raw.date}|${raw.subject}|${await sha256(raw.text + raw.html)}`);
  const now = repo.iso();
  const base: MailRecord = { key, messageId: raw.messageId, from: raw.from.slice(0, 200), subject: raw.subject.slice(0, 300), receivedAt: raw.date || now, processedAt: now, via, type: 'unknown', status: 'processing', result: '', bookingId: null, fields: {}, missing: [], errors: [] };
  if (!(await repo.claimMail(key, base))) {
    const prev = await repo.getMail(key);
    return { status: 'duplicate', bookingId: prev?.bookingId ?? null, result: 'Correo ya procesado anteriormente (no se duplica).' };
  }
  const rec: MailRecord = { ...base };
  try {
    if (cfg.email.allowedSenders.length && !senderAllowed(raw.from, cfg.email.allowedSenders)) {
      Object.assign(rec, { status: 'ignored', result: 'Remitente no autorizado.' });
      await repo.saveMail(rec);
      return { status: 'ignored', bookingId: null, result: rec.result };
    }
    const p = parseEmail(raw);
    Object.assign(rec, { type: p.type, fields: p.fields, missing: p.missing });
    if (!p.date && !p.reservationId && !p.ref) {
      Object.assign(rec, { status: 'error', result: 'No se reconocieron datos de reserva (fecha, localizador o referencia).', errors: ['sin datos de reserva'] });
      await repo.saveMail(rec);
      return { status: 'error', bookingId: null, result: rec.result };
    }
    const receivedAt = raw.date || now;
    let target: Booking | null = null;
    let method: Booking['match']['method'] = null;
    let note = '';

    // Prioridad 2 antes que 3, y también para modificaciones y cancelaciones de reservas ya vinculadas.
    const byQid = await repo.byReservationId(p.reservationId);
    if (p.ref) {
      const byRef = await repo.byRef(p.ref);
      if (byRef) {
        const c = scoreCandidate(p, byRef, receivedAt, cfg.email.lunchUntil);
        const identityConflict = c.contradictions.includes('teléfono distinto') && c.contradictions.includes('nombre distinto');
        if (!identityConflict) {
          target = byRef;
          method = 'ref';
        } else note = `La referencia ${p.ref} apunta a otra persona (${c.contradictions.join(', ')}).`;
      }
    }
    if (!target && byQid) {
      target = byQid;
      method = 'external';
    }

    let candidates: { id: string; score: number }[] = [];
    if (!target) {
      const pending = (await repo.all()).filter((b) => !b.archived && b.match.status !== 'linked' && b.origin === 'form' && !b.qamarero.reservationId);
      const scored = pending.map((b) => scoreCandidate(p, b, receivedAt, cfg.email.lunchUntil)).filter((c) => c.score >= 30).sort((a, b) => b.score - a.score);
      const [best, second] = scored;
      if (best && best.score >= cfg.email.autoLinkMinScore && best.contradictions.length === 0 && (!second || best.score - second.score >= 25)) {
        target = pending.find((b) => b.id === best.id) ?? null;
        method = 'data';
      } else candidates = scored.slice(0, 5).map((c) => ({ id: c.id, score: c.score }));
    }

    let booking: Booking;
    if (target) {
      booking = await repo.update(target.id, (b) => {
        const out = applyNotification(b, p, receivedAt, method, method === 'ref' ? 'Vinculada por referencia · ' : method === 'data' ? 'Vinculada por coincidencia de datos · ' : '');
        out.match.score = out.match.score ?? null;
        return out;
      });
    } else {
      const b = repo.blank('email', 'correo') as Booking;
      b.holder = { name: p.name, phone: normalizePhone(p.phone) ?? p.phone, email: p.email };
      const created = await repo.create(b);
      booking = await repo.update(created.id, (x) => {
        const out = applyNotification(x, p, receivedAt, null, '');
        if (candidates.length) {
          out.match = { status: 'review', method: null, candidates: candidates.map((c) => c.id), mergedInto: null, score: candidates[0].score };
          out.issues.push(issue('match_review', `Pendiente de revisar coincidencia: ${candidates.length} posible(s) elección(es) de menús.`, receivedAt));
        }
        if (note) out.issues.push(issue('identity_conflict', note, receivedAt));
        return out;
      });
    }
    if (p.reservationId) await repo.mapReservationId(p.reservationId, booking.id);
    const result = target
      ? `${p.type === 'cancelled' ? 'Cancelación' : p.type === 'modified' ? 'Modificación' : 'Confirmación'} aplicada a ${booking.ref} (${method === 'ref' ? 'referencia' : method === 'external' ? 'identificador de Qamarero' : 'coincidencia de datos'}).`
      : candidates.length
        ? `Reserva ${booking.ref} creada: pendiente de revisar coincidencia (${candidates.length} posibles).`
        : `Reserva ${booking.ref} creada sin elección de menús vinculada.`;
    Object.assign(rec, { status: 'processed', result, bookingId: booking.id, errors: note ? [note] : [] });
    await repo.saveMail(rec);
    return { status: 'processed', bookingId: booking.id, result };
  } catch (e) {
    Object.assign(rec, { status: 'error', result: 'Error al procesar el correo.', errors: [(e as Error).message?.slice(0, 300) ?? 'error'] });
    await repo.saveMail(rec);
    return { status: 'error', bookingId: null, result: rec.result };
  }
}

/** Vinculación confirmada por el administrador: el registro del correo se fusiona en la preselección. */
export async function mergeBookings(repo: ReservasRepo, emailId: string, targetId: string, who: string): Promise<Booking> {
  const src = await repo.get(emailId);
  const dst = await repo.get(targetId);
  if (!src || !dst) throw new Error('not_found');
  if (dst.match.status === 'linked' && dst.qamarero.reservationId && src.qamarero.reservationId && dst.qamarero.reservationId !== src.qamarero.reservationId) {
    throw new Error('target_linked');
  }
  const at = repo.iso();
  const merged = await repo.update(targetId, (b) => {
    const before = { ...b.qamarero };
    b.qamarero = { ...src.qamarero, status: src.qamarero.status === 'cancellation_notified' ? 'cancellation_notified' : 'manual_linked', lastCheckedAt: b.qamarero.lastCheckedAt };
    b.match = { status: 'linked', method: 'manual', candidates: [], mergedInto: null, score: null };
    if (!b.holder.phone) b.holder.phone = src.holder.phone;
    if (!b.holder.email) b.holder.email = src.holder.email;
    b.history.push({ at, actor: who, source: 'admin', type: 'linked', summary: `Vinculada manualmente con la reserva recibida por email (${src.ref})`, before, after: b.qamarero });
    b.history.push(...src.history.filter((h) => h.source === 'email'));
    const total = totalPeople(b);
    if (src.qamarero.people !== null && total !== null && src.qamarero.people !== total) {
      b.issues.push(issue('people_mismatch', `Comensales distintos: ${src.qamarero.people} en Qamarero y ${total} en la elección de menús.`, at));
    }
    return b;
  });
  await repo.update(emailId, (b) => {
    b.archived = true;
    b.match = { ...b.match, status: 'merged', mergedInto: targetId, candidates: [] };
    b.issues = b.issues.map((i) => (i.resolvedAt ? i : { ...i, resolvedAt: at, resolvedBy: who }));
    b.history.push({ at, actor: who, source: 'admin', type: 'merged', summary: `Fusionada en ${merged.ref}` });
    return b;
  });
  if (src.qamarero.reservationId) await repo.mapReservationId(src.qamarero.reservationId, targetId);
  return merged;
}
