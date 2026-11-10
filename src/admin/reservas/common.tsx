import { useEffect, useRef, useState } from 'react';
import {
  type Booking,
  type BookingRow,
  fillTemplate,
  GASTRO_LABEL,
  type GastroStatus,
  normalizePhone,
  Q_LABEL,
  type QStatus,
  type ReservasConfig,
  type Verification,
  VERIFICATION_LABEL,
  whatsappUrl,
} from '../../../shared/reservas.ts';
import { Badge } from '../ui.tsx';
import { rapi } from './state.tsx';

export const fmtDay = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
export const fmtDT = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const todayMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

const Q_TONE: Record<QStatus, 'neutral' | 'ok' | 'warn' | 'danger' | 'draft' | 'info'> = {
  pending_confirmation: 'draft',
  email_confirmed: 'info',
  manual_linked: 'ok',
  modification_notified: 'warn',
  cancellation_notified: 'danger',
  cancelled_manual: 'danger',
  to_check: 'warn',
  incident: 'danger',
};
const G_TONE: Record<GastroStatus, 'neutral' | 'ok' | 'warn' | 'danger' | 'draft' | 'info'> = { pending: 'draft', complete: 'ok', modified: 'warn', review: 'danger', cancelled: 'danger' };
const V_TONE: Record<Verification, 'neutral' | 'ok' | 'warn' | 'danger' | 'draft' | 'info'> = { verified: 'ok', email_only: 'warn', incident: 'danger', no_booking: 'draft', cancelled: 'danger' };

export const QBadge = ({ s }: { s: QStatus }) => <Badge tone={Q_TONE[s]}>{Q_LABEL[s]}</Badge>;
export const GBadge = ({ s }: { s: GastroStatus }) => <Badge tone={G_TONE[s]}>{GASTRO_LABEL[s]}</Badge>;
export const VBadge = ({ v }: { v: Verification }) => <Badge tone={V_TONE[v]}>{VERIFICATION_LABEL[v]}</Badge>;

/** Verificación a partir de una fila del índice (misma regla que el servidor). */
export function rowVerification(r: BookingRow, staleDays: number, now = Date.now()): Verification {
  if (r.qStatus === 'cancellation_notified' || r.qStatus === 'cancelled_manual' || r.gStatus === 'cancelled') return 'cancelled';
  if (r.qStatus === 'pending_confirmation' || !r.date) return 'no_booking';
  if (r.issues || r.qStatus === 'incident' || r.peopleChangePending || r.matchStatus === 'review') return 'incident';
  if (r.lastCheckedAt && now - Date.parse(r.lastCheckedAt) < staleDays * 86400_000) return 'verified';
  return 'email_only';
}

/** Diálogo para enviar un enlace privado por WhatsApp: revisa el número y el mensaje antes de abrir. */
export function WhatsAppDialog({ booking, cfg, onClose, onDone }: { booking: Pick<Booking, 'id' | 'holder' | 'selection'>; cfg: ReservasConfig; onClose: () => void; onDone?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const kind: 'modify' | 'complete' = booking.selection ? 'modify' : 'complete';
  const [phone, setPhone] = useState(booking.holder.phone);
  const [link, setLink] = useState<{ link: string; expiresAt: string } | null>(null);
  const [text, setText] = useState('');
  const [allowLate, setAllowLate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const generate = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await rapi.link(booking.id, kind, allowLate);
      setLink(r);
      setText(fillTemplate(kind === 'modify' ? cfg.whatsapp.template : cfg.whatsapp.completeTemplate, { nombre: booking.holder.name, enlace: r.link }));
      onDone?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const normalized = normalizePhone(phone);
  const wa = link && normalized ? whatsappUrl(normalized, text) : null;
  const late = !!cfg.whatsapp.deadline && new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T').slice(0, 16) > cfg.whatsapp.deadline;
  return (
    <dialog ref={ref} className="dialog rdlg" onClose={onClose} aria-labelledby="wa-title">
      <div className="dialog__body">
        <h2 className="dialog__title" id="wa-title">
          {kind === 'modify' ? 'Enviar enlace de modificación por WhatsApp' : 'Solicitar elección de menús por WhatsApp'}
        </h2>
        <p className="muted">Se genera un enlace privado de un solo uso. Los enlaces anteriores de esta reserva se revocan. El mensaje no se envía solo: lo revisas y pulsas enviar en WhatsApp.</p>
        <label className="field">
          <span className="field__label">Teléfono del cliente</span>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <span className={normalized ? 'field__hint' : 'field__error'}>{normalized ? `Se abrirá WhatsApp con ${normalized}` : 'Número no válido: corrígelo (con prefijo si no es español).'}</span>
        </label>
        {late && (
          <label className="rdlg__late">
            <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} /> El plazo de modificación ha terminado: autorizar excepcionalmente este enlace
          </label>
        )}
        {!link ? (
          <button type="button" className="abtn abtn--primary" disabled={busy || (late && !allowLate)} onClick={() => void generate()}>
            {busy ? 'Generando…' : 'Generar enlace privado'}
          </button>
        ) : (
          <>
            <label className="field">
              <span className="field__label">Mensaje (puedes editarlo)</span>
              <textarea className="input input--area" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <p className="field__hint">
              Caduca: {fmtDT(link.expiresAt)} ·{' '}
              <button type="button" className="linkbtn" onClick={() => void navigator.clipboard?.writeText(link.link)}>
                Copiar solo el enlace
              </button>
            </p>
          </>
        )}
        {err && (
          <p className="field__error" role="alert">
            {err}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="abtn abtn--ghost" onClick={() => ref.current?.close()}>
            Cerrar
          </button>
          {wa && (
            <a className="abtn abtn--primary" href={wa} target="_blank" rel="noopener noreferrer" data-testid="wa-link">
              Abrir WhatsApp
            </a>
          )}
        </div>
      </div>
    </dialog>
  );
}
