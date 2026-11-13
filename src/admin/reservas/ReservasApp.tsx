/**
 * Reservas de Navidad (/admin#/reservas): elecciones de menús vinculadas a las reservas oficiales de Qamarero.
 *  - Una selección gastronómica no equivale a una reserva confirmada.
 *  - Una modificación en nuestra web no equivale a una modificación aceptada por Qamarero.
 *  - Una confirmación antigua por email no garantiza que la reserva siga vigente.
 */
import { useMemo, useState } from 'react';
import { type BookingRow, GASTRO_LABEL, GASTRO_STATUSES, Q_LABEL, Q_STATUSES, SERVICE_LABEL, type Service } from '../../../shared/reservas.ts';
import { Badge, Card, PageHeader } from '../ui.tsx';
import { navigate } from '../router.ts';
import { fmtDay, fmtDT, GBadge, QBadge, rowVerification, VBadge } from './common.tsx';
import { ReservasProvider, useReservas, rapi } from './state.tsx';
import { BookingDetail } from './Detail.tsx';
import { DayView, KitchenView } from './DayKitchen.tsx';
import { Conciliation } from './Conciliation.tsx';
import { EmailView, RequestsView, SettingsView } from './Settings.tsx';

const TABS = [
  ['resumen', 'Resumen'],
  ['lista', 'Reservas'],
  ['dia', 'Calendario'],
  ['cocina', 'Cocina e informes'],
  ['revisar', 'Revisar con Qamarero'],
  ['correo', 'Correo'],
  ['solicitudes', 'Solicitudes'],
  ['ajustes', 'Configuración'],
] as const;

export default function ReservasRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  return (
    <ReservasProvider>
      <Shell path={path} query={query} />
    </ReservasProvider>
  );
}

function Shell({ path, query }: { path: string[]; query: URLSearchParams }) {
  const { data, error, reload } = useReservas();
  const tab = path[1] ?? 'resumen';
  if (error && !data)
    return (
      <Card title="No se pudieron cargar las reservas" tone="danger">
        <p>{error}</p>
        <button type="button" className="abtn abtn--primary" onClick={() => void reload()}>
          Reintentar
        </button>
      </Card>
    );
  if (!data) return <p className="muted">Cargando reservas…</p>;
  const pendingReq = data.requests.filter((r) => r.status === 'pending').length;
  let view;
  if (tab === 'r' && path[2]) view = <BookingDetail id={path[2]} />;
  else if (tab === 'lista') view = <ListView query={query} />;
  else if (tab === 'dia') view = <DayView />;
  else if (tab === 'cocina') view = <KitchenView />;
  else if (tab === 'revisar') view = <Conciliation />;
  else if (tab === 'correo') view = <EmailView query={query} />;
  else if (tab === 'solicitudes') view = <RequestsView />;
  else if (tab === 'ajustes') view = <SettingsView />;
  else view = <OverviewView />;
  return (
    <div className="screens rv">
      <nav className="stabs" aria-label="Reservas de Navidad">
        {TABS.map(([k, label]) => (
          <a key={k} href={`#/reservas/${k}`} className={`stabs__link ${tab === k || (tab === 'r' && k === 'lista') ? 'is-active' : ''}`} aria-current={tab === k ? 'page' : undefined}>
            {label}
            {k === 'solicitudes' && pendingReq > 0 && <span className="side__count">{pendingReq}</span>}
          </a>
        ))}
      </nav>
      {view}
    </div>
  );
}

/* ====================== Resumen ====================== */
function OverviewView() {
  const { data } = useReservas();
  const d = data!;
  const live = d.rows.filter((r) => !r.archived);
  const stale = d.config.staleDays;
  const v = (r: BookingRow) => rowVerification(r, stale);
  const notCancelled = live.filter((r) => v(r) !== 'cancelled');
  const sum = (rs: BookingRow[], f: (r: BookingRow) => number | null) => rs.reduce((n, r) => n + (f(r) ?? 0), 0);
  const menuCounts = new Map<string, number>();
  for (const r of notCancelled) for (const m of r.menus) menuCounts.set(m, (menuCounts.get(m) ?? 0) + 1);
  const stat = (n: number | string, label: string, href?: string, tone?: string) => (
    <a className={`sstat rstat ${tone ?? ''}`} href={href ?? '#/reservas/lista'}>
      <span className="sstat__n">{n}</span>
      <span>{label}</span>
    </a>
  );
  return (
    <>
      <PageHeader
        title="Reservas de Navidad"
        intro="Elecciones de menús y platos vinculadas a las reservas oficiales de Qamarero. Qamarero sigue siendo la agenda oficial: aquí se gestiona lo gastronómico, el seguimiento y la preparación."
        actions={
          <a className="abtn abtn--primary" href="/reservar" target="_blank" rel="noopener">
            Abrir el formulario público
          </a>
        }
      />
      <div className="rprinciples" role="note">
        <span>Una elección de menús no es una reserva confirmada.</span>
        <span>Un cambio en nuestra web no es un cambio aceptado por Qamarero.</span>
        <span>Una confirmación antigua por email no garantiza que la reserva siga vigente.</span>
      </div>
      <div className="rstats">
        {stat(live.filter((r) => r.notifiedAt).length, 'recibidas por email', '#/reservas/lista?f=email')}
        {stat(live.filter((r) => r.matchStatus === 'linked' && r.requested !== null).length, 'vinculadas a una elección', '#/reservas/lista?f=linked')}
        {stat(live.filter((r) => v(r) === 'no_booking').length, 'preselecciones sin reserva', '#/reservas/lista?f=nobooking', 'is-draft')}
        {stat(live.filter((r) => v(r) === 'verified').length, 'verificadas', '#/reservas/lista?f=verified', 'is-ok')}
        {stat(live.filter((r) => v(r) === 'incident').length, 'con discrepancias o incidencias', '#/reservas/lista?f=incident', 'is-danger')}
        {stat(live.filter((r) => v(r) === 'cancelled').length, 'cancelaciones conocidas', '#/reservas/lista?f=cancelled')}
        {stat(d.requests.filter((r) => r.status === 'pending').length, 'solicitudes de modificación', '#/reservas/solicitudes', 'is-warn')}
        {stat(live.filter((r) => r.gStatus === 'pending' && v(r) !== 'cancelled').length, 'con platos pendientes', '#/reservas/lista?f=pending', 'is-warn')}
        {stat(live.filter((r) => r.allergies && v(r) !== 'cancelled').length, 'con alergias', '#/reservas/lista?f=allergies', 'is-danger')}
        {stat(live.filter((r) => r.category === 'unclassified').length, 'por clasificar (¿Navidad o normal?)', '#/reservas/lista?f=unclassified', 'is-warn')}
      </div>
      <div className="grid-2">
        <Card title="Comensales (reservas no canceladas)">
          <dl className="stv__facts">
            <div>
              <dt>Confirmados en Qamarero</dt>
              <dd>{sum(notCancelled, (r) => r.confirmed)}</dd>
            </div>
            <div>
              <dt>Solicitados en formularios</dt>
              <dd>{sum(notCancelled, (r) => r.requested)}</dd>
            </div>
            <div>
              <dt>Adultos</dt>
              <dd>{sum(notCancelled, (r) => r.adults)}</dd>
            </div>
            <div>
              <dt>Niños</dt>
              <dd>{sum(notCancelled, (r) => r.children)}</dd>
            </div>
          </dl>
          <p className="field__hint">Reservas por tipo de menú: {[...menuCounts].map(([k, n]) => `${k}: ${n}`).join(' · ') || '—'}</p>
        </Card>
        <Card title="Sincronización del correo">
          <p>
            {d.email.gmailConnected ? `Gmail conectado (${d.email.gmailAccount}) · revisión automática cada 10 minutos.` : d.email.webhookConfigured ? 'Recepción por webhook configurada.' : 'Sin buzón conectado: configúralo en «Correo».'}
          </p>
          <p className="muted">
            Última lectura: {fmtDT(d.sync.lastRunAt)} · correctas: {fmtDT(d.sync.lastOkAt)} · procesados: {d.sync.processed} · con errores: {d.sync.errors}
          </p>
          {d.sync.lastError && <p className="field__error">{d.sync.lastError}</p>}
          <a href="#/reservas/correo">Ver integración y registro de correos</a>
        </Card>
      </div>
    </>
  );
}

/* ====================== Listado ====================== */
function ListView({ query }: { query: URLSearchParams }) {
  const { data, run } = useReservas();
  const d = data!;
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [service, setService] = useState<'' | Service>('');
  const [menu, setMenu] = useState('');
  const [qs, setQs] = useState('');
  const [gs, setGs] = useState('');
  const [zone, setZone] = useState('');
  const [flag, setFlag] = useState(query.get('f') ?? '');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<'date' | 'created' | 'name'>('date');
  const [page, setPage] = useState(0);
  const [manual, setManual] = useState(false);
  const PER = 50;
  const stale = d.config.staleDays;
  const menus = useMemo(() => [...new Set(d.rows.flatMap((r) => r.menus))], [d.rows]);
  const zones = useMemo(() => [...new Set(d.rows.map((r) => r.zone).filter(Boolean))], [d.rows]);
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const rows = useMemo(() => {
    const t = norm(q.trim());
    const digits = q.replace(/\D/g, '');
    return d.rows
      .filter((r) => archived || !r.archived)
      .filter((r) => !t || norm(r.name).includes(t) || r.ref.toLowerCase().includes(t) || (digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits)) || r.reservationId.toLowerCase().includes(t) || r.email.toLowerCase().includes(t))
      .filter((r) => !from || (r.date && r.date >= from))
      .filter((r) => !to || (r.date && r.date <= to))
      .filter((r) => !service || r.service === service)
      .filter((r) => !menu || r.menus.includes(menu))
      .filter((r) => !qs || r.qStatus === qs)
      .filter((r) => !gs || r.gStatus === gs)
      .filter((r) => !zone || r.zone === zone)
      .filter((r) => {
        const v = rowVerification(r, stale);
        switch (flag) {
          case 'email':
            return !!r.notifiedAt;
          case 'linked':
            return r.matchStatus === 'linked' && r.requested !== null;
          case 'nobooking':
            return v === 'no_booking';
          case 'verified':
            return v === 'verified';
          case 'incident':
            return v === 'incident';
          case 'cancelled':
            return v === 'cancelled';
          case 'unlinked':
            return r.matchStatus === 'review' || (r.notifiedAt !== null && r.requested === null && v !== 'cancelled');
          case 'modified':
            return r.gStatus === 'modified' || r.peopleChangePending;
          case 'children':
            return (r.children ?? 0) > 0;
          case 'allergies':
            return r.allergies;
          case 'unclassified':
            return r.category === 'unclassified';
          case 'pending':
            return r.gStatus === 'pending' && v !== 'cancelled';
          default:
            return true;
        }
      })
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time)));
  }, [d.rows, q, from, to, service, menu, qs, gs, zone, flag, archived, sort, stale]);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const shown = rows.slice(page * PER, page * PER + PER);
  return (
    <>
      <PageHeader
        title="Reservas"
        intro={`${rows.length} de ${d.rows.filter((r) => !r.archived).length} registros`}
        actions={
          <button type="button" className="abtn abtn--ghost" onClick={() => setManual(true)}>
            + Reserva manual
          </button>
        }
      />
      <div className="rfilters">
        <input className="input" type="search" placeholder="Buscar nombre, teléfono, referencia o localizador" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} aria-label="Búsqueda rápida" />
        <label>
          Desde <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select className="input input--select" value={service} onChange={(e) => setService(e.target.value as Service | '')} aria-label="Servicio">
          <option value="">Comida y cena</option>
          <option value="lunch">Comida</option>
          <option value="dinner">Cena</option>
        </select>
        <select className="input input--select" value={menu} onChange={(e) => setMenu(e.target.value)} aria-label="Menú">
          <option value="">Todos los menús</option>
          {menus.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select className="input input--select" value={qs} onChange={(e) => setQs(e.target.value)} aria-label="Estado Qamarero">
          <option value="">Estado Qamarero</option>
          {Q_STATUSES.map((s) => (
            <option key={s} value={s}>
              {Q_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="input input--select" value={gs} onChange={(e) => setGs(e.target.value)} aria-label="Estado gastronómico">
          <option value="">Estado gastronómico</option>
          {GASTRO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {GASTRO_LABEL[s]}
            </option>
          ))}
        </select>
        {zones.length > 0 && (
          <select className="input input--select" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zona">
            <option value="">Todas las zonas</option>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        )}
        <select className="input input--select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar">
          <option value="date">Ordenar por fecha y hora</option>
          <option value="created">Más recientes primero</option>
          <option value="name">Por titular</option>
        </select>
      </div>
      <div className="chips" role="group" aria-label="Filtros rápidos">
        {[
          ['', 'Todas'],
          ['unlinked', 'Pendientes de vinculación'],
          ['modified', 'Modificaciones pendientes'],
          ['incident', 'Con incidencias'],
          ['nobooking', 'Preselecciones sin reserva'],
          ['cancelled', 'Canceladas'],
          ['children', 'Con niños'],
          ['allergies', 'Con alergias'],
          ['unclassified', 'Por clasificar'],
        ].map(([k, l]) => (
          <button key={k} type="button" className={`chip ${flag === k ? 'is-on' : ''}`} aria-pressed={flag === k} onClick={() => (setFlag(k), setPage(0))}>
            {l}
          </button>
        ))}
        <label className="chip">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Incluir fusionadas
        </label>
      </div>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Serv.</th>
              <th>Titular</th>
              <th>Teléfono</th>
              <th className="r">Total</th>
              <th className="r">Ad.</th>
              <th className="r">Niñ.</th>
              <th>Menú</th>
              <th>Qamarero</th>
              <th>Gastronómico</th>
              <th>Incidencias</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const v = rowVerification(r, stale);
              return (
                <tr key={r.id} className={v === 'cancelled' ? 'is-cancelled' : ''}>
                  <td>{fmtDay(r.date)}</td>
                  <td>{r.time || '—'}</td>
                  <td>{r.service ? SERVICE_LABEL[r.service] : '—'}</td>
                  <td>
                    <a href={`#/reservas/r/${r.id}`}>{r.name || '(sin nombre)'}</a>
                    <small className="muted"> {r.ref}</small>
                  </td>
                  <td>{r.phone}</td>
                  <td className="r">
                    {r.confirmed ?? r.requested ?? '—'}
                    {r.confirmed !== null && r.requested !== null && r.confirmed !== r.requested && <span className="rwarn" title="Discrepancia entre Qamarero y la elección de menús"> ≠{r.requested}</span>}
                  </td>
                  <td className="r">{r.adults ?? '—'}</td>
                  <td className="r">{r.children ?? '—'}</td>
                  <td>{r.menus.join(', ') || '—'}</td>
                  <td>
                    <QBadge s={r.qStatus} />
                  </td>
                  <td>
                    <GBadge s={r.gStatus} />
                  </td>
                  <td>
                    {v !== 'verified' && v !== 'cancelled' && <VBadge v={v} />} {r.category === 'unclassified' && <Badge tone="warn">¿Navidad o normal?</Badge>} {r.allergies && <Badge tone="danger">Alergias</Badge>} {r.peopleChangePending && <Badge tone="warn">Cambio de comensales</Badge>}
                  </td>
                  <td>
                    <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => navigate(`#/reservas/r/${r.id}`)}>
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={13} className="muted">
                  No hay reservas con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="rpager">
          <button type="button" className="abtn abtn--ghost abtn--small" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            Página {page + 1} de {pages}
          </span>
          <button type="button" className="abtn abtn--ghost abtn--small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Siguiente
          </button>
        </div>
      )}
      {manual && (
        <ManualDialog
          onClose={() => setManual(false)}
          onSave={async (body) => {
            const r = await run(() => rapi.manual(body), 'Reserva creada');
            if (r) navigate(`#/reservas/r/${r.booking.id}`);
          }}
        />
      )}
    </>
  );
}

function ManualDialog({ onClose, onSave }: { onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', reservationId: '', date: '', time: '', zone: '', people: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <dialog open className="dialog rdlg" aria-labelledby="man-title">
      <div className="dialog__body">
        <h2 className="dialog__title" id="man-title">
          Reserva hecha directamente en Qamarero
        </h2>
        <p className="muted">Para clientes que reservaron sin pasar por la web. Después podrás enviarles el enlace para elegir menús.</p>
        <div className="grid-2">
          {(
            [
              ['name', 'Titular', 'text'],
              ['phone', 'Teléfono', 'tel'],
              ['email', 'Correo', 'email'],
              ['reservationId', 'Localizador de Qamarero', 'text'],
              ['date', 'Fecha', 'date'],
              ['time', 'Hora', 'time'],
              ['zone', 'Zona', 'text'],
              ['people', 'Personas', 'number'],
            ] as const
          ).map(([k, l, t]) => (
            <label key={k} className="field">
              <span className="field__label">{l}</span>
              <input className="input" type={t} value={f[k]} onChange={set(k)} />
            </label>
          ))}
        </div>
        <div className="dialog__actions">
          <button type="button" className="abtn abtn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="abtn abtn--primary"
            disabled={!f.name.trim()}
            onClick={async () => {
              await onSave({ holder: { name: f.name, phone: f.phone, email: f.email }, qamarero: { reservationId: f.reservationId, date: f.date, time: f.time, zone: f.zone, people: f.people ? Number(f.people) : null } });
              onClose();
            }}
          >
            Crear
          </button>
        </div>
      </div>
    </dialog>
  );
}
