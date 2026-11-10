/** Ficha completa de una reserva: datos, elecciones, alertas, vinculación, enlaces, historial y acciones. */
import { useCallback, useEffect, useState } from 'react';
import { type Booking, GASTRO_LABEL, GASTRO_STATUSES, openIssues, Q_LABEL, Q_STATUSES, SERVICE_LABEL, totalPeople, verification } from '../../../shared/reservas.ts';
import { Badge, Card, PageHeader, useConfirm } from '../ui.tsx';
import { navigate } from '../router.ts';
import { fmtDT, GBadge, QBadge, VBadge, WhatsAppDialog } from './common.tsx';
import { rapi, useReservas } from './state.tsx';
import { bookingBlocks, download, printReport, reportPdf, type ReportDoc } from './reports.ts';

type Detail = Awaited<ReturnType<typeof rapi.booking>>;
const SOURCE: Record<string, string> = { form: 'Formulario', email: 'Correo', link: 'Enlace privado', admin: 'Restaurante', import: 'Importación', system: 'Sistema' };

export function BookingDetail({ id }: { id: string }) {
  const { data, run } = useReservas();
  const confirm = useConfirm();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [wa, setWa] = useState(false);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [nowMs] = useState(() => Date.now());
  const load = useCallback(async () => {
    try {
      setD(await rapi.booking(id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return <Card title="Reserva no disponible">{err}</Card>;
  if (!d || !data) return <p className="muted">Cargando ficha…</p>;
  const b = d.booking;
  const cfg = data.config;
  const v = verification(b, cfg.staleDays);
  const act = async (action: string, ok: string, extra: Record<string, unknown> = {}) => {
    if (await run(() => rapi.action(id, { action, ...extra }), ok)) await load();
  };
  const sel = b.selection;
  const issues = openIssues(b);
  const total = totalPeople(b);
  const doc = (): ReportDoc => ({ title: 'Reserva de Navidad', subtitle: `${b.holder.name} · ${b.ref}`, generatedAt: new Date().toISOString(), blocks: [bookingBlocks(b, cfg)] });

  const startEdit = () =>
    setEdit({
      name: b.holder.name,
      phone: b.holder.phone,
      email: b.holder.email,
      reservationId: b.qamarero.reservationId,
      date: b.qamarero.date,
      time: b.qamarero.time,
      zone: b.qamarero.zone,
      people: b.qamarero.people === null ? '' : String(b.qamarero.people),
      qStatus: b.qamarero.status,
      gastroStatus: b.gastroStatus,
      internalNotes: b.internalNotes,
    });
  const saveEdit = async () => {
    if (!edit) return;
    const r = await run(
      () =>
        rapi.patch(id, {
          baseVersion: b.version,
          holder: { name: edit.name, phone: edit.phone, email: edit.email },
          qamarero: { reservationId: edit.reservationId, date: edit.date, time: edit.time, zone: edit.zone, people: edit.people === '' ? null : Number(edit.people) },
          qStatus: edit.qStatus,
          gastroStatus: edit.gastroStatus,
          internalNotes: edit.internalNotes,
        }),
      'Reserva actualizada',
    );
    if (r) {
      setEdit(null);
      await load();
    }
  };

  return (
    <>
      <PageHeader
        title={b.holder.name || 'Reserva sin nombre'}
        intro={
          <>
            <a href="#/reservas/lista">← Reservas</a> · Referencia <strong>{b.ref}</strong>
            {b.qamarero.reservationId && ` · Qamarero ${b.qamarero.reservationId}`} · Origen: {SOURCE[b.origin] ?? b.origin}
          </>
        }
        actions={
          <>
            <button type="button" className="abtn abtn--primary" onClick={() => setWa(true)} disabled={b.archived}>
              {sel ? 'Enviar enlace de modificación por WhatsApp' : 'Solicitar elección de menús por WhatsApp'}
            </button>
          </>
        }
      />
      <div className="rbadges">
        <QBadge s={b.qamarero.status} /> <GBadge s={b.gastroStatus} /> <VBadge v={v} />
        {b.archived && <Badge tone="draft">Fusionada en otra reserva</Badge>}
      </div>

      {(issues.length > 0 || b.peopleChange?.status === 'pending' || b.match.status === 'review') && (
        <Card title="Requiere atención" tone="danger">
          {b.peopleChange?.status === 'pending' && (
            <div className="ralert">
              <p>
                <strong>Cambio de comensales pendiente de confirmar en Qamarero:</strong> confirmados {b.peopleChange.from ?? '—'} → solicitados {b.peopleChange.to}. La reserva oficial no ha cambiado.
              </p>
              <div className="sscene__actions">
                <button type="button" className="abtn abtn--primary abtn--small" onClick={() => void act('confirm-people', 'Cambio confirmado')}>
                  Ya está actualizado en Qamarero ({b.peopleChange.to} personas)
                </button>
                <button
                  type="button"
                  className="abtn abtn--ghost abtn--small"
                  onClick={async () => {
                    const n = window.prompt('Personas confirmadas en Qamarero:', String(b.peopleChange?.to ?? ''));
                    if (n && /^\d+$/.test(n)) await act('confirm-people', 'Cantidad corregida', { people: Number(n) });
                  }}
                >
                  Corregir cantidad
                </button>
                <button type="button" className="abtn abtn--danger-ghost abtn--small" onClick={() => void act('reject-people', 'Cambio marcado como rechazado')}>
                  No es posible / rechazado
                </button>
              </div>
            </div>
          )}
          {b.match.status === 'review' && <MatchReview d={d} onDone={load} />}
          {issues
            .filter((i) => i.type !== 'people_change' && i.type !== 'match_review')
            .map((i) => (
              <div key={i.id} className="ralert">
                <p>{i.message}</p>
                <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void act('resolve-issue', 'Incidencia resuelta', { issueId: i.id })}>
                  Marcar como resuelta
                </button>
              </div>
            ))}
        </Card>
      )}

      <div className="rdetail">
        <Card
          title="Datos generales"
          actions={
            !edit && (
              <button type="button" className="abtn abtn--ghost abtn--small" onClick={startEdit}>
                Editar
              </button>
            )
          }
        >
          {!edit ? (
            <dl className="stv__facts">
              {(
                [
                  ['Titular', b.holder.name],
                  ['Teléfono', b.holder.phone],
                  ['Correo', b.holder.email],
                  ['Fecha', b.qamarero.date ? new Date(`${b.qamarero.date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : 'Pendiente (sin reserva en Qamarero)'],
                  ['Hora', b.qamarero.time],
                  ['Zona', b.qamarero.zone],
                  ['Servicio', (sel?.service ?? b.service) ? SERVICE_LABEL[(sel?.service ?? b.service)!] : '—'],
                  ['Personas confirmadas (Qamarero)', b.qamarero.people ?? '—'],
                  ['Personas solicitadas (formulario)', total ?? '—'],
                  ['Adultos / niños', sel ? `${sel.adults} / ${sel.children}` : '—'],
                  ['Estado Qamarero', Q_LABEL[b.qamarero.status]],
                  ['Estado gastronómico', GASTRO_LABEL[b.gastroStatus]],
                  ['Última notificación', `${fmtDT(b.qamarero.notifiedAt)}${b.qamarero.lastNotificationType ? ` (${b.qamarero.lastNotificationType})` : ''}`],
                  ['Origen de los datos', b.qamarero.source ? SOURCE[b.qamarero.source] ?? b.qamarero.source : '—'],
                  ['Última comprobación manual', `${fmtDT(b.qamarero.lastCheckedAt)}${b.qamarero.lastCheckedBy ? ` · ${b.qamarero.lastCheckedBy}` : ''}`],
                  ['Vinculación', b.match.status === 'linked' ? `Vinculada (${b.match.method === 'ref' ? 'referencia' : b.match.method === 'external' ? 'localizador' : b.match.method === 'data' ? 'coincidencia de datos' : 'manual'})` : b.match.status === 'review' ? 'Pendiente de revisar coincidencia' : b.match.status === 'merged' ? 'Fusionada' : 'Sin vincular'],
                ] as [string, string | number][]
              ).map(([k, val]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{val || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="redit">
              <div className="grid-3">
                {(
                  [
                    ['name', 'Titular', 'text'],
                    ['phone', 'Teléfono', 'tel'],
                    ['email', 'Correo', 'email'],
                    ['reservationId', 'Localizador Qamarero', 'text'],
                    ['date', 'Fecha', 'date'],
                    ['time', 'Hora', 'time'],
                    ['zone', 'Zona', 'text'],
                    ['people', 'Personas confirmadas en Qamarero', 'number'],
                  ] as const
                ).map(([k, l, t]) => (
                  <label key={k} className="field">
                    <span className="field__label">{l}</span>
                    <input className="input" type={t} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                  </label>
                ))}
                <label className="field">
                  <span className="field__label">Estado Qamarero</span>
                  <select className="input input--select" value={edit.qStatus} onChange={(e) => setEdit({ ...edit, qStatus: e.target.value })}>
                    {Q_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {Q_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Estado gastronómico</span>
                  <select className="input input--select" value={edit.gastroStatus} onChange={(e) => setEdit({ ...edit, gastroStatus: e.target.value })}>
                    {GASTRO_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {GASTRO_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="field__label">Notas internas (no las ve el cliente)</span>
                <textarea className="input input--area" rows={3} value={edit.internalNotes} onChange={(e) => setEdit({ ...edit, internalNotes: e.target.value })} />
              </label>
              <p className="field__hint">Los cambios quedan en el historial. Corregir aquí los datos de Qamarero no cambia la reserva oficial: hazlo también en Qamarero.</p>
              <div className="sscene__actions">
                <button type="button" className="abtn abtn--primary" onClick={() => void saveEdit()}>
                  Guardar
                </button>
                <button type="button" className="abtn abtn--ghost" onClick={() => setEdit(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {b.internalNotes && !edit && <p className="rinternal">Notas internas: {b.internalNotes}</p>}
          <div className="sscene__actions rdetail__actions">
            <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void act('confirm-review', 'Revisión registrada')}>
              Confirmar revisión con Qamarero
            </button>
            <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void act('mark-check', 'Marcada para comprobar')}>
              Marcar «pendiente de comprobar»
            </button>
            <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void act('flag-review', 'Marcada para revisión')}>
              Requiere revisión
            </button>
            {v !== 'cancelled' ? (
              <button
                type="button"
                className="abtn abtn--danger-ghost abtn--small"
                onClick={async () => {
                  if (await confirm({ title: '¿Marcar como cancelada?', text: 'Deja de contarse en cocina e informes. Recuerda cancelarla también en Qamarero si procede.', confirmLabel: 'Cancelar reserva', danger: true })) await act('cancel', 'Reserva cancelada');
                }}
              >
                Cancelar
              </button>
            ) : (
              <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void act('restore', 'Reserva restaurada')}>
                Restaurar
              </button>
            )}
          </div>
        </Card>

        <Card
          title="Elecciones de menús"
          actions={
            <>
              <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => printReport(doc(), data.config ? 'GastroBar Torero' : '')}>
                Imprimir
              </button>
              <button type="button" className="abtn abtn--ghost abtn--small" onClick={async () => download(await reportPdf(doc(), 'GastroBar Torero'), `reserva-${b.ref}.pdf`)}>
                Descargar PDF
              </button>
            </>
          }
        >
          {!sel ? (
            <p className="muted">Todavía no hay elección de menús. Usa «Solicitar elección de menús por WhatsApp» para enviar el formulario al cliente.</p>
          ) : (
            <>
              {sel.adultMenuId && (
                <p>
                  Menú común de los adultos: <strong>{sel.menus[sel.adultMenuId]?.name}</strong> · Importe orientativo: {sel.estimate.amount.toLocaleString('es-ES')} €
                </p>
              )}
              <div className="rtable-wrap">
              <table className="rtable rtable--compact">
                <thead>
                  <tr>
                    <th>Comensal</th>
                    <th>Menú</th>
                    <th>Platos</th>
                    <th>Alergias</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.diners.map((dn) => (
                    <tr key={dn.id}>
                      <td>{dn.label}</td>
                      <td>{dn.mode === 'carta' ? 'Carta habitual — elección en el restaurante' : dn.menuName}</td>
                      <td>{dn.picks.map((p) => `${p.sectionTitle}: ${p.items.map((i) => i.name).join(', ')}`).join(' · ') || '—'}</td>
                      <td className={dn.allergy ? 'rallergy' : ''}>{dn.allergy || '—'}</td>
                      <td>{dn.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {sel.notes.allergies && <p className="rallergy rallergy--box">Alergias e intolerancias del grupo: {sel.notes.allergies}</p>}
              {sel.notes.special && <p>Necesidades del servicio: {sel.notes.special}</p>}
              {sel.notes.general && <p>Notas del cliente: {sel.notes.general}</p>}
              <p className="field__hint">Las necesidades alimentarias especiales deben revisarse y confirmarse por el establecimiento.</p>
            </>
          )}
        </Card>

        <Card
          title="Enlaces privados"
          actions={
            d.tokens.some((t) => t.status === 'active') && (
              <button type="button" className="abtn abtn--ghost abtn--small" onClick={async () => (await run(() => rapi.revokeLinks(id), 'Enlaces revocados')) && load()}>
                Revocar enlaces activos
              </button>
            )
          }
        >
          {!d.tokens.length ? (
            <p className="muted">No se ha generado ningún enlace.</p>
          ) : (
            <div className="rtable-wrap">
            <table className="rtable rtable--compact">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Generado</th>
                  <th>Caduca</th>
                  <th>Usado</th>
                </tr>
              </thead>
              <tbody>
                {d.tokens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.kind === 'complete' ? 'Completar elección' : 'Modificación'}</td>
                    <td>
                      <Badge tone={t.status === 'active' ? (Date.parse(t.expiresAt) > nowMs ? 'ok' : 'draft') : t.status === 'used' ? 'info' : 'draft'}>
                        {t.status === 'active' ? (Date.parse(t.expiresAt) > nowMs ? 'Activo' : 'Caducado') : t.status === 'used' ? 'Utilizado' : 'Revocado'}
                      </Badge>
                      {t.allowLate && <small> · fuera de plazo autorizado</small>}
                    </td>
                    <td>
                      {fmtDT(t.createdAt)} · {t.createdBy}
                    </td>
                    <td>{fmtDT(t.expiresAt)}</td>
                    <td>{fmtDT(t.usedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>

        <Card title="Historial">
          <ol className="rtimeline">
            {[...b.history].reverse().map((h, i) => (
              <li key={i}>
                <span className="rtimeline__at">{fmtDT(h.at)}</span>
                <span className="rtimeline__src">{SOURCE[h.source] ?? h.source}</span>
                <strong>{h.summary}</strong>
                {h.actor && <small> · {h.actor}</small>}
                {h.details && h.details.length > 0 && (
                  <ul>
                    {h.details.slice(0, 20).map((x, k) => (
                      <li key={k}>{x}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Privacidad" tone="warn">
          <p className="muted">Eliminar borra definitivamente los datos personales y las elecciones de esta reserva (por ejemplo, si el cliente lo solicita).</p>
          <button
            type="button"
            className="abtn abtn--danger-ghost abtn--small"
            onClick={async () => {
              if (await confirm({ title: '¿Eliminar definitivamente esta reserva?', text: 'No se puede deshacer.', confirmLabel: 'Eliminar', danger: true })) {
                if (await run(() => rapi.remove(id), 'Reserva eliminada')) navigate('#/reservas/lista');
              }
            }}
          >
            Eliminar datos de esta reserva
          </button>
        </Card>
      </div>
      {wa && <WhatsAppDialog booking={b} cfg={cfg} onClose={() => setWa(false)} onDone={() => void load()} />}
    </>
  );
}

function MatchReview({ d, onDone }: { d: Detail; onDone: () => Promise<void> }) {
  const { run } = useReservas();
  const b: Booking = d.booking;
  return (
    <div className="ralert">
      <p>
        <strong>Pendiente de revisar coincidencia.</strong> Este correo de Qamarero ({b.holder.name}, {b.qamarero.people ?? '—'} personas, {b.qamarero.time || 'sin hora'}) puede corresponder a una de estas elecciones de menús. Confirma cuál; no se mezclan datos hasta que lo hagas.
      </p>
      {d.candidates.length === 0 && <p className="muted">No hay preselecciones candidatas.</p>}
      <div className="rtable-wrap">
      <table className="rtable rtable--compact">
        <thead>
          <tr>
            <th>Elección de menús</th>
            <th>Coincide</th>
            <th>No coincide</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {d.candidates.map((c) => (
            <tr key={c.id}>
              <td>
                <a href={`#/reservas/r/${c.id}`}>{c.booking.holder.name}</a> · {c.booking.holder.phone} · {c.booking.people ?? '—'} pers. · {c.booking.ref}
                <br />
                <small className="muted">Formulario: {fmtDT(c.booking.createdAt)}</small>
              </td>
              <td>{c.reasons.join(', ') || '—'}</td>
              <td className={c.contradictions.length ? 'rallergy' : ''}>{c.contradictions.join(', ') || '—'}</td>
              <td>
                <button
                  type="button"
                  className="abtn abtn--primary abtn--small"
                  onClick={async () => {
                    const r = await run(() => rapi.merge(b.id, c.id), 'Reserva vinculada');
                    if (r) navigate(`#/reservas/r/${c.id}`);
                    else await onDone();
                  }}
                >
                  Es esta
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
