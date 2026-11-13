/** Integración de correo, solicitudes de nuevo enlace y configuración del sistema de reservas. */
import { useEffect, useState } from 'react';
import { produce } from 'immer';
import { type ReservasConfig, reservasConfigSchema } from '../../../shared/reservas.ts';
import { formatIssues } from '../../../shared/schema.ts';
import { Badge, Card, PageHeader, TextArea, TextField, Toggle, useConfirm } from '../ui.tsx';
import { useStore } from '../store.tsx';
import { fmtDT, WhatsAppDialog } from './common.tsx';
import { rapi, useReservas } from './state.tsx';

/* ====================== Correo ====================== */
export function EmailView({ query }: { query: URLSearchParams }) {
  const { data, run, reload } = useReservas();
  const confirm = useConfirm();
  const d = data!;
  const [emails, setEmails] = useState<Awaited<ReturnType<typeof rapi.emails>>['emails'] | null>(null);
  const [paste, setPaste] = useState({ subject: '', from: '', date: '', text: '', skip: false });
  const [res, setRes] = useState<string>('');
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => setEmails((await rapi.emails()).emails);
  useEffect(() => {
    void load();
  }, []);
  const gmailMsg = query.get('gmail');
  return (
    <>
      <PageHeader title="Integración Qamarero — Correo electrónico" intro="Qamarero permite enviar los avisos de reservas online a varias direcciones. Añade un buzón dedicado de GastroBar Torero y conéctalo aquí: la aplicación leerá y procesará las notificaciones en el servidor." />
      {gmailMsg && <div className={`banner ${gmailMsg === 'ok' ? 'banner--info' : 'banner--danger'}`}>{query.get('msg')}</div>}
      <div className="grid-2">
        <Card title="Opción 1 · Buzón de Gmail (OAuth, solo lectura)" description="Revisión automática en el servidor cada 10 minutos (función programada de Netlify). No es tiempo real.">
          {!d.email.gmailAvailable ? (
            <>
              <p>
                <Badge tone="draft">No configurado</Badge>
              </p>
              <p className="field__hint">
                Requiere crear unas credenciales OAuth en Google Cloud (tipo «Aplicación web», URI de redirección <code>{location.origin}/api/reservas/gmail/callback</code>, permiso <code>gmail.readonly</code>) y guardar <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en las variables de entorno de Netlify. Ver <code>docs/RESERVAS.md</code>.
              </p>
            </>
          ) : d.email.gmailConnected ? (
            <>
              <p>
                <Badge tone="ok">Conectado</Badge> {d.email.gmailAccount}
              </p>
              <div className="sscene__actions">
                <button type="button" className="abtn abtn--primary abtn--small" onClick={async () => setRes((await run(() => rapi.sync()))?.message ?? '')}>
                  Sincronizar ahora
                </button>
                <button
                  type="button"
                  className="abtn abtn--danger-ghost abtn--small"
                  onClick={async () => {
                    if (await confirm({ title: '¿Desconectar Gmail?', text: 'Se borra el permiso guardado. Para revocarlo por completo, quítalo también en tu cuenta de Google (Seguridad → Aplicaciones de terceros).', confirmLabel: 'Desconectar', danger: true })) await run(() => rapi.gmailDisconnect(), 'Gmail desconectado');
                  }}
                >
                  Desconectar
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="abtn abtn--primary"
              onClick={async () => {
                const r = await run(() => rapi.gmailAuth());
                if (r) location.href = r.url;
              }}
            >
              Conectar Gmail
            </button>
          )}
        </Card>
        <Card title="Opción 2 · Recepción por webhook" description="Para servicios de correo entrante (por ejemplo Postmark Inbound) que reenvían cada correo a una URL.">
          <p>{d.email.webhookConfigured ? <Badge tone="ok">Secreto configurado</Badge> : <Badge tone="draft">Falta INBOUND_EMAIL_SECRET</Badge>}</p>
          <p className="field__hint">
            URL: <code>{d.email.webhookUrl}</code>. Autenticación: usuario cualquiera y contraseña = valor de <code>INBOUND_EMAIL_SECRET</code> (Basic Auth), o cabecera <code>X-Torero-Inbound-Token</code>.
          </p>
        </Card>
      </div>
      <Card title="Estado de la sincronización">
        <dl className="stv__facts">
          <div>
            <dt>Proveedor</dt>
            <dd>{d.sync.provider === 'gmail' ? 'Gmail' : d.sync.provider === 'webhook' ? 'Webhook' : 'Ninguno'}</dd>
          </div>
          <div>
            <dt>Última lectura</dt>
            <dd>{fmtDT(d.sync.lastRunAt)}</dd>
          </div>
          <div>
            <dt>Última correcta</dt>
            <dd>{fmtDT(d.sync.lastOkAt)}</dd>
          </div>
          <div>
            <dt>Procesados / con errores</dt>
            <dd>
              {d.sync.processed} / {d.sync.errors}
            </dd>
          </div>
        </dl>
        {d.sync.lastError && <p className="field__error">{d.sync.lastError}</p>}
        {res && <p className="muted">{res}</p>}
      </Card>
      <Card title="Procesar un correo manualmente" description="Pega el texto de un correo de Qamarero (por ejemplo, reenviado a tu correo personal). Útil para probar el intérprete con correos reales o si la sincronización falla.">
        <div className="grid-3">
          <TextField label="Asunto" value={paste.subject} onChange={(v) => setPaste({ ...paste, subject: v })} />
          <TextField label="Remitente" value={paste.from} onChange={(v) => setPaste({ ...paste, from: v })} />
          <label className="field">
            <span className="field__label">Fecha de recepción</span>
            <input className="input" type="datetime-local" value={paste.date} onChange={(e) => setPaste({ ...paste, date: e.target.value })} />
          </label>
        </div>
        <TextArea label="Contenido del correo" rows={8} value={paste.text} onChange={(v) => setPaste({ ...paste, text: v })} />
        <Toggle label="No comprobar el remitente (correo reenviado)" checked={paste.skip} onChange={(v) => setPaste({ ...paste, skip: v })} />
        <button
          type="button"
          className="abtn abtn--primary"
          disabled={!paste.text.trim()}
          onClick={async () => {
            const looksHtml = /<\/?(table|div|p|br|td)\b/i.test(paste.text);
            const r = await run(() => rapi.ingest({ subject: paste.subject, from: paste.from, date: paste.date ? new Date(paste.date).toISOString() : '', text: looksHtml ? '' : paste.text, html: looksHtml ? paste.text : '', messageId: '', skipSenderCheck: paste.skip }));
            if (r) {
              setRes(r.result);
              await load();
              await reload();
            }
          }}
        >
          Procesar
        </button>
      </Card>
      <Card title="Registro de correos procesados">
        {!emails ? (
          <p className="muted">Cargando…</p>
        ) : !emails.length ? (
          <p className="muted">Todavía no se ha procesado ningún correo.</p>
        ) : (
          <div className="rtable-wrap">
            <table className="rtable rtable--compact">
              <thead>
                <tr>
                  <th>Recibido</th>
                  <th>Vía</th>
                  <th>Asunto</th>
                  <th>Tipo</th>
                  <th>Resultado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {emails.map((m) => (
                  <>
                    <tr key={m.key}>
                      <td>{fmtDT(m.receivedAt)}</td>
                      <td>{m.via}</td>
                      <td>{m.subject || '—'}</td>
                      <td>{m.type}</td>
                      <td>
                        <Badge tone={m.status === 'processed' ? 'ok' : m.status === 'normal' || m.status === 'ignored' ? 'draft' : 'danger'}>{m.status === 'normal' ? 'Reserva normal' : m.status === 'processed' ? 'Navidad' : m.status === 'ignored' ? 'Ignorado' : 'Error'}</Badge> {m.result} {m.bookingId && <a href={`#/reservas/r/${m.bookingId}`}>Ver reserva</a>}
                        {m.status === 'normal' && (
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={async () => {
                              const r = await run(() => rapi.promote(m.key), 'Convertida en reserva de Navidad');
                              if (r) await load();
                            }}
                          >
                            {' '}
                            Convertir en reserva de Navidad
                          </button>
                        )}
                      </td>
                      <td>
                        <button type="button" className="linkbtn" onClick={() => setOpen(open === m.key ? null : m.key)}>
                          {open === m.key ? 'Ocultar' : 'Interpretación'}
                        </button>
                      </td>
                    </tr>
                    {open === m.key && (
                      <tr key={`${m.key}-d`}>
                        <td colSpan={6}>
                          <p className="field__hint">Campos reconocidos: {Object.entries(m.fields).map(([k, v]) => `${k} = ${v}`).join(' · ') || 'ninguno'}</p>
                          {m.missing.length > 0 && <p className="field__hint">No encontrados (pendientes): {m.missing.join(', ')}</p>}
                          {m.errors.length > 0 && <p className="field__error">{m.errors.join(' · ')}</p>}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ====================== Solicitudes ====================== */
export function RequestsView() {
  const { data, run } = useReservas();
  const d = data!;
  const [wa, setWa] = useState<string | null>(null);
  const [booking, setBooking] = useState<Awaited<ReturnType<typeof rapi.booking>>['booking'] | null>(null);
  const pending = d.requests.filter((r) => r.status === 'pending');
  const row = (id: string) => d.rows.find((r) => r.id === id);
  return (
    <>
      <PageHeader title="Solicitudes de modificación" intro="Clientes que ya usaron su enlace y piden hacer otro cambio. Generar un enlace nuevo revoca los anteriores." />
      {!pending.length && <p className="muted">No hay solicitudes pendientes.</p>}
      {pending.map((r) => {
        const b = row(r.bookingId);
        return (
          <Card key={r.id} title={b?.name ?? 'Reserva'} description={`Solicitado ${fmtDT(r.createdAt)}${b?.date ? ` · reserva ${b.date} ${b.time}` : ''}`}>
            {r.reason && <p>Motivo: {r.reason}</p>}
            <div className="sscene__actions">
              <button
                type="button"
                className="abtn abtn--primary abtn--small"
                onClick={async () => {
                  const full = await run(() => rapi.booking(r.bookingId));
                  if (full) {
                    setBooking(full.booking);
                    setWa(r.id);
                  }
                }}
              >
                Generar nuevo enlace y abrir WhatsApp
              </button>
              <a className="abtn abtn--ghost abtn--small" href={`#/reservas/r/${r.bookingId}`}>
                Ver reserva
              </a>
              <button type="button" className="abtn abtn--text abtn--small" onClick={() => void run(() => rapi.requests({ id: r.id, status: 'dismissed' }), 'Solicitud descartada')}>
                Descartar
              </button>
            </div>
          </Card>
        );
      })}
      {wa && booking && <WhatsAppDialog booking={booking} cfg={d.config} onClose={() => (setWa(null), setBooking(null))} />}
    </>
  );
}

/* ====================== Configuración ====================== */
export function SettingsView() {
  const { data, run, reload } = useReservas();
  const { content } = useStore();
  const confirm = useConfirm();
  const [cfg, setCfg] = useState<ReservasConfig>(data!.config);
  const [rev, setRev] = useState(data!.configRevision);
  const set = (fn: (c: ReservasConfig) => void) => setCfg((c) => produce(c, fn));
  const issues = (() => {
    const r = reservasConfigSchema.safeParse(cfg);
    return r.success ? [] : formatIssues(r.error);
  })();
  const pub = content.menus.filter((m) => m.status === 'published');
  const sharedItems = content.menus.flatMap((m) => m.sections.filter((s) => s.kind === 'shared').flatMap((s) => s.items.map((i) => ({ id: i.id, label: `${i.name} · ${m.name}${i.quantity ? ` (${i.quantity})` : ''}` }))));
  const toggleId = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <>
      <PageHeader
        title="Configuración de reservas"
        actions={
          <button
            type="button"
            className="abtn abtn--primary"
            disabled={issues.length > 0}
            onClick={async () => {
              const r = await run(() => rapi.saveConfig(cfg, rev), 'Configuración guardada');
              if (r) setRev(r.revision);
            }}
          >
            Guardar configuración
          </button>
        }
      />
      {issues.length > 0 && <p className="field__error">{issues[0].path}: {issues[0].message}</p>}
      <Card title="Formulario">
        <Toggle label="Formulario de elección de menús activado" checked={cfg.formEnabled} onChange={(v) => set((c) => void (c.formEnabled = v))} hint="Los botones «Reservar» de la web se configuran en Local → Reservas." />
        <p className="field__label">Menús disponibles (vacío = todos los publicados)</p>
        <div className="chips">
          {pub.map((m) => (
            <button key={m.id} type="button" className={`chip ${cfg.menuIds.includes(m.id) ? 'is-on' : ''}`} aria-pressed={cfg.menuIds.includes(m.id)} onClick={() => set((c) => void (c.menuIds = toggleId(c.menuIds, m.id)))}>
              {m.name}
            </button>
          ))}
        </div>
        <p className="field__label">Menús permitidos para niños (vacío = los mismos)</p>
        <div className="chips">
          {pub.map((m) => (
            <button key={m.id} type="button" className={`chip ${cfg.childMenuIds.includes(m.id) ? 'is-on' : ''}`} aria-pressed={cfg.childMenuIds.includes(m.id)} onClick={() => set((c) => void (c.childMenuIds = toggleId(c.childMenuIds, m.id)))}>
              {m.name}
            </button>
          ))}
        </div>
        <Toggle label="Los niños pueden elegir la carta habitual" checked={cfg.childCarta} onChange={(v) => set((c) => void (c.childCarta = v))} />
        <Toggle label="Correo electrónico obligatorio" checked={cfg.requireEmail} onChange={(v) => set((c) => void (c.requireEmail = v))} />
        <label className="field">
          <span className="field__label">Máximo de comensales por solicitud</span>
          <input className="input" type="number" min={1} max={100} value={cfg.maxGuests} onChange={(e) => set((c) => void (c.maxGuests = Math.max(1, Math.min(100, Number(e.target.value) || 1))))} />
        </label>
        <p className="field__hint">
          URL de Qamarero: la de <a href="#/establecimiento">Local → Reservas</a> ({content.booking.url}).
        </p>
        <TextArea label="Texto de introducción" value={cfg.messages.intro} max={400} onChange={(v) => set((c) => void (c.messages.intro = v))} />
        <TextField label="Título tras guardar la elección" value={cfg.messages.continueTitle} max={160} onChange={(v) => set((c) => void (c.messages.continueTitle = v))} />
        <TextArea label="Texto antes de continuar a Qamarero" value={cfg.messages.continueText} max={600} onChange={(v) => set((c) => void (c.messages.continueText = v))} />
        <TextArea label="Aviso de alergias" value={cfg.messages.allergyNotice} max={400} onChange={(v) => set((c) => void (c.messages.allergyNotice = v))} />
        <TextArea label="Información de privacidad (consentimiento)" value={cfg.messages.privacy} max={800} rows={4} onChange={(v) => set((c) => void (c.messages.privacy = v))} />
      </Card>
      <Card title="WhatsApp y enlaces privados">
        <TextArea label="Plantilla: enlace de modificación" value={cfg.whatsapp.template} max={1500} rows={10} onChange={(v) => set((c) => void (c.whatsapp.template = v))} hint="Marcadores: {nombre} (nombre de pila del titular) y {enlace}. No incluyas alergias ni otros datos personales." />
        <TextArea label="Plantilla: completar la elección (reserva ya hecha)" value={cfg.whatsapp.completeTemplate} max={1500} rows={7} onChange={(v) => set((c) => void (c.whatsapp.completeTemplate = v))} />
        <div className="grid-3">
          <label className="field">
            <span className="field__label">Caducidad de los enlaces (horas)</span>
            <input className="input" type="number" min={1} max={1440} value={cfg.whatsapp.linkHours} onChange={(e) => set((c) => void (c.whatsapp.linkHours = Math.max(1, Math.min(1440, Number(e.target.value) || 1))))} />
          </label>
          <label className="field">
            <span className="field__label">Plazo límite para modificar menús</span>
            <input className="input" type="datetime-local" value={cfg.whatsapp.deadline} onChange={(e) => set((c) => void (c.whatsapp.deadline = e.target.value))} />
            <span className="field__hint">Hora de Madrid. Vacío = sin plazo. Puedes autorizar excepciones al generar un enlace.</span>
          </label>
          <TextField label="Teléfono de contacto del restaurante" value={cfg.whatsapp.contactPhone} max={30} onChange={(v) => set((c) => void (c.whatsapp.contactPhone = v))} />
        </div>
        <TextField label="Título tras guardar una modificación" value={cfg.messages.modifiedTitle} max={160} onChange={(v) => set((c) => void (c.messages.modifiedTitle = v))} />
        <TextArea label="Texto tras guardar una modificación" value={cfg.messages.modifiedText} max={400} onChange={(v) => set((c) => void (c.messages.modifiedText = v))} />
      </Card>
      <Card title="Sincronización de correo y conciliación">
        <TextField label="Remitentes autorizados (separados por comas; fragmentos)" value={cfg.email.allowedSenders.join(', ')} onChange={(v) => set((c) => void (c.email.allowedSenders = v.split(',').map((x) => x.trim()).filter(Boolean)))} hint="Solo se procesan correos cuyo remitente contenga alguno de estos textos (p. ej. «qamarero»)." />
        <TextField
          label="Palabras que identifican una reserva de Navidad (separadas por comas)"
          value={cfg.email.christmasKeywords.join(', ')}
          onChange={(v) => set((c) => void (c.email.christmasKeywords = v.split(',').map((x) => x.trim()).filter(Boolean)))}
          hint="Se buscan en el menú, las observaciones y el asunto del correo, además de los nombres de los menús publicados. Un correo con nuestra referencia TOR-… o que coincide con una elección de menús siempre es de Navidad. El resto se registra como reserva normal y no se añade."
        />
        <TextField label="Búsqueda en Gmail" value={cfg.email.gmailQuery} max={300} onChange={(v) => set((c) => void (c.email.gmailQuery = v))} />
        <div className="grid-3">
          <label className="field">
            <span className="field__label">Las comidas son hasta las</span>
            <input className="input" type="time" value={cfg.email.lunchUntil} onChange={(e) => set((c) => void (c.email.lunchUntil = e.target.value || '17:00'))} />
          </label>
          <label className="field">
            <span className="field__label">Correo sin señales de Navidad con fecha dentro del periodo de menús</span>
            <select className="input input--select" value={cfg.email.unknownInPeriod} onChange={(e) => set((c) => void (c.email.unknownInPeriod = e.target.value as 'review' | 'normal'))}>
              <option value="review">Añadir como «por clasificar» (decido yo)</option>
              <option value="normal">Tratar como reserva normal</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Puntuación mínima de vinculación automática</span>
            <input className="input" type="number" min={40} max={100} value={cfg.email.autoLinkMinScore} onChange={(e) => set((c) => void (c.email.autoLinkMinScore = Math.max(40, Math.min(100, Number(e.target.value) || 70))))} />
            <span className="field__hint">Teléfono = 50, correo = 30, nombre = 15, comensales = 10. Por defecto 70.</span>
          </label>
          <label className="field">
            <span className="field__label">Días sin comprobar → «pendiente de revisión»</span>
            <input className="input" type="number" min={1} max={60} value={cfg.staleDays} onChange={(e) => set((c) => void (c.staleDays = Math.max(1, Math.min(60, Number(e.target.value) || 3))))} />
          </label>
        </div>
      </Card>
      <Card title="Cocina e informes">
        <Toggle label="Incluir en producción las reservas vinculadas aunque no estén verificadas recientemente (se marcan en los informes)" checked={cfg.kitchen.includeUnverified} onChange={(v) => set((c) => void (c.kitchen.includeUnverified = v))} />
        <p className="field__label">Reglas de entrantes compartidos (1 ración cada N comensales)</p>
        <p className="field__hint">Sin regla, el informe indica cuántos comensales corresponden y deja la producción pendiente de definir. Si el menú indica «N por persona», se calcula con ese dato.</p>
        <div className="rrules">
          {sharedItems.map((it) => (
            <label key={it.id} className="rrule">
              <span>{it.label}</span>
              <input
                className="input"
                type="number"
                min={1}
                max={50}
                placeholder="—"
                value={cfg.kitchen.sharedRules[it.id] ?? ''}
                onChange={(e) =>
                  set((c) => {
                    const n = Number(e.target.value);
                    if (!e.target.value || !n) delete c.kitchen.sharedRules[it.id];
                    else c.kitchen.sharedRules[it.id] = Math.max(1, Math.min(50, Math.round(n)));
                  })
                }
              />
            </label>
          ))}
        </div>
      </Card>
      <Card title="Privacidad y conservación" tone="warn">
        <label className="field">
          <span className="field__label">Conservar los datos (días tras la fecha de la reserva)</span>
          <input className="input" type="number" min={30} max={1095} value={cfg.retentionDays} onChange={(e) => set((c) => void (c.retentionDays = Math.max(30, Math.min(1095, Number(e.target.value) || 90))))} />
        </label>
        <button
          type="button"
          className="abtn abtn--danger-ghost"
          onClick={async () => {
            if (await confirm({ title: '¿Eliminar reservas antiguas?', text: `Se borran definitivamente las reservas con fecha anterior a hace ${data!.config.retentionDays} días (configuración guardada).`, confirmLabel: 'Eliminar', danger: true })) {
              const r = await run(() => rapi.purge());
              if (r) {
                await reload();
                window.alert(`${r.deleted} reserva(s) eliminadas (anteriores al ${r.before}).`);
              }
            }
          }}
        >
          Eliminar ahora los datos caducados
        </button>
      </Card>
    </>
  );
}
