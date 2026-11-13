/** Organización por día y servicio, preparación de cocina e informes imprimibles. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Booking, isCancelled, kitchenReport, openIssues, SERVICE_LABEL, serviceOf, type Service, totalPeople, verification } from '../../../shared/reservas.ts';
import { Badge, Card, PageHeader } from '../ui.tsx';
import { useStore } from '../store.tsx';
import { fmtDT, GBadge, QBadge, rowVerification, todayMadrid, VBadge } from './common.tsx';
import { rapi, useReservas } from './state.tsx';
import { csvBookings, csvDiners, download, inScope, printReport, reportBreakdown, reportKitchen, reportPdf, reportPending, reportService, type ReportDoc, type Scope, type ServiceFilter } from './reports.ts';
import { toCsv } from '../../../shared/reservas.ts';

function useBookings(from: string, to: string) {
  const [list, setList] = useState<Booking[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      setList((await rapi.full(from, to)).bookings);
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [from, to]);
  useEffect(() => {
    void load();
  }, [load]);
  return { list, err, load };
}

/** Primera fecha con reservas a partir de hoy (o hoy). */
function useDefaultDate() {
  const { data } = useReservas();
  return useMemo(() => {
    const today = todayMadrid();
    const next = data?.rows.filter((r) => !r.archived && r.date >= today).map((r) => r.date).sort()[0];
    return next ?? today;
  }, [data]);
}

/* ====================== Por día ====================== */
export function DayView() {
  const { data } = useReservas();
  const def = useDefaultDate();
  const [date, setDate] = useState(def);
  const [byZone, setByZone] = useState(false);
  const { list, err } = useBookings(date, date);
  const cfg = data!.config;
  return (
    <>
      <PageHeader title="Calendario de reservas" intro="Elige un día en el calendario para ver sus comidas y cenas, ordenadas por hora. Las canceladas no se suman." />
      <MonthCalendar selected={date} onSelect={setDate} />
      <h2 className="rday__date">{new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
      <div className="rfilters">
        <label>
          Fecha <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="chip">
          <input type="checkbox" checked={byZone} onChange={(e) => setByZone(e.target.checked)} /> Agrupar por zona
        </label>
      </div>
      {err && <p className="field__error">{err}</p>}
      {!list ? (
        <p className="muted">Cargando…</p>
      ) : (
        (['lunch', 'dinner'] as Service[]).map((svc) => <ServiceBlock key={svc} svc={svc} list={list.filter((b) => serviceOf(b, cfg.email.lunchUntil) === svc)} byZone={byZone} />)
      )}
    </>
  );
}

function ServiceBlock({ svc, list, byZone }: { svc: Service; list: Booking[]; byZone: boolean }) {
  const { data } = useReservas();
  const cfg = data!.config;
  const active = list.filter((b) => !isCancelled(b.qamarero.status, b.gastroStatus)).sort((a, b) => a.qamarero.time.localeCompare(b.qamarero.time));
  const cancelled = list.filter((b) => isCancelled(b.qamarero.status, b.gastroStatus));
  const k = kitchenReport(active, cfg);
  const confirmed = active.reduce((n, b) => n + (b.qamarero.people ?? 0), 0);
  const pendingChanges = active.filter((b) => b.peopleChange?.status === 'pending');
  const alerts = active.filter((b) => verification(b, cfg.staleDays) === 'incident' || openIssues(b).length);
  const groups = byZone ? [...new Set(active.map((b) => b.qamarero.zone || 'Sin zona'))].map((z) => [z, active.filter((b) => (b.qamarero.zone || 'Sin zona') === z)] as const) : [['', active] as const];
  return (
    <section className="rday" aria-labelledby={`svc-${svc}`}>
      <h2 className="rday__title" id={`svc-${svc}`}>
        {svc === 'lunch' ? 'COMIDAS' : 'CENAS'}
      </h2>
      <div className="rstats rstats--small">
        <div className="sstat">
          <span className="sstat__n">{active.length}</span>reservas
        </div>
        <div className="sstat">
          <span className="sstat__n">{confirmed}</span>personas confirmadas
        </div>
        <div className="sstat">
          <span className="sstat__n">{k.people}</span>personas con elección
        </div>
        <div className="sstat">
          <span className="sstat__n">
            {k.adults} / {k.children}
          </span>
          adultos / niños
        </div>
        {(k.groups.find((g) => g.kind === 'menus')?.lines ?? []).map((l) => (
          <div className="sstat" key={l.name}>
            <span className="sstat__n">{l.count}</span>
            {l.name}
          </div>
        ))}
        <div className="sstat">
          <span className="sstat__n">{k.carta}</span>niños con carta
        </div>
        <div className={`sstat ${alerts.length ? 'is-danger' : ''}`}>
          <span className="sstat__n">{alerts.length}</span>con alertas
        </div>
        <div className={`sstat ${pendingChanges.length ? 'is-warn' : ''}`}>
          <span className="sstat__n">{pendingChanges.length}</span>cambios de comensales sin confirmar
        </div>
      </div>
      {!active.length && <p className="muted">Sin reservas.</p>}
      {active.length > 0 && groups.map(([zone, rows]) => (
        <div key={zone}>
          {zone && <h3 className="rday__zone">{zone}</h3>}
          <div className="rtable-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Titular</th>
                <th className="r">Confirm.</th>
                <th className="r">Solicit.</th>
                <th>Zona</th>
                <th>Menús</th>
                <th>Estado</th>
                <th>Alertas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.qamarero.time || '—'}</td>
                  <td>
                    <a href={`#/reservas/r/${b.id}`}>{b.holder.name}</a>
                  </td>
                  <td className="r">{b.qamarero.people ?? '—'}</td>
                  <td className="r">
                    {totalPeople(b) ?? '—'}
                    {b.peopleChange?.status === 'pending' && <Badge tone="warn">sin confirmar</Badge>}
                  </td>
                  <td>{b.qamarero.zone || '—'}</td>
                  <td>{b.selection ? [...new Set(b.selection.diners.map((d) => (d.mode === 'carta' ? 'Carta' : d.menuName)))].join(', ') : <Badge tone="draft">Sin elección</Badge>}</td>
                  <td>
                    <QBadge s={b.qamarero.status} /> <GBadge s={b.gastroStatus} />
                  </td>
                  <td>
                    {verification(b, cfg.staleDays) !== 'verified' && <VBadge v={verification(b, cfg.staleDays)} />}
                    {b.selection && (b.selection.notes.allergies || b.selection.diners.some((d) => d.allergy)) && <Badge tone="danger">Alergias</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ))}
      {cancelled.length > 0 && <p className="muted">Canceladas (no se cuentan): {cancelled.map((b) => `${b.qamarero.time} ${b.holder.name}`).join(' · ')}</p>}
    </section>
  );
}

/* ====================== Cocina e informes ====================== */
export function KitchenView() {
  const { data } = useReservas();
  const def = useDefaultDate();
  const [from, setFrom] = useState(def);
  const [to, setTo] = useState(def);
  const [service, setService] = useState<ServiceFilter>('all');
  const { list, err, load } = useBookings(from, to);
  const [lastPrint, setLastPrint] = useState<{ at: string; by: string; kind: string; versions: Record<string, string> } | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const cfg = data!.config;
  const scope: Scope = { from, to: to < from ? from : to, service };
  const printKey = `${scope.from}${scope.to !== scope.from ? `_${scope.to}` : ''}`;
  const loadPrint = useCallback(async () => {
    try {
      setLastPrint((await rapi.print(printKey, service)).print);
    } catch {
      setLastPrint(null);
    }
  }, [printKey, service]);
  useEffect(() => {
    void loadPrint();
  }, [loadPrint]);

  const sc = list ? inScope(list, scope, cfg) : null;
  const k = sc ? kitchenReport(sc.production, cfg) : null;
  // Cambios posteriores a la última impresión: reservas nuevas, modificadas o que salen del servicio.
  const changes = useMemo(() => {
    if (!lastPrint || !sc) return [];
    const now = [...sc.active, ...sc.cancelled];
    const out: { b: Booking | null; text: string }[] = [];
    for (const b of now) {
      const prev = lastPrint.versions[b.id];
      if (!prev) out.push({ b, text: 'Reserva nueva desde la impresión' });
      else if (prev !== b.updatedAt) {
        const evs = b.history.filter((h) => h.at > lastPrint.at).map((h) => h.summary);
        out.push({ b, text: evs.join(' · ') || 'Datos actualizados' });
      }
    }
    for (const id of Object.keys(lastPrint.versions)) if (!now.some((b) => b.id === id)) out.push({ b: null, text: 'Una reserva impresa ya no está en este servicio (cambio de fecha/hora o eliminada)' });
    return out;
  }, [lastPrint, sc]);

  const brand = 'GastroBar Torero';
  const docs: [string, string, () => ReportDoc][] = list
    ? [
        ['A', 'Resumen del servicio', () => reportService(list, scope, cfg)],
        ['B', 'Producción de cocina', () => reportKitchen(list, scope, cfg)],
        ['C', 'Desglose por reserva', () => reportBreakdown(list, scope, cfg)],
        ['D', 'Cambios pendientes', () => reportPending(list, scope, cfg)],
      ]
    : [];
  const markPrinted = async (kind: string) => {
    if (!sc) return;
    const versions = Object.fromEntries([...sc.active, ...sc.cancelled].map((b) => [b.id, b.updatedAt]));
    await rapi.print(printKey, service, { kind, versions }).catch(() => undefined);
    await loadPrint();
  };
  const fileBase = `torero-${scope.from}${scope.to !== scope.from ? `_${scope.to}` : ''}-${service === 'all' ? 'comida-cena' : service === 'lunch' ? 'comida' : 'cena'}`;

  return (
    <>
      <PageHeader title="Preparación de cocina e informes" intro="Cantidades calculadas con las elecciones registradas. Las reservas canceladas no cuentan. Los entrantes compartidos usan las reglas del menú o de Configuración; sin regla, la cantidad queda pendiente de definir." />
      <div className="rfilters">
        <label>
          Desde <input className="input" type="date" value={from} onChange={(e) => e.target.value && (setFrom(e.target.value), to < e.target.value && setTo(e.target.value))} />
        </label>
        <label>
          Hasta <input className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <select className="input input--select" value={service} onChange={(e) => setService(e.target.value as ServiceFilter)} aria-label="Servicio">
          <option value="all">Comida y cena</option>
          <option value="lunch">Solo comida</option>
          <option value="dinner">Solo cena</option>
        </select>
        <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      {err && <p className="field__error">{err}</p>}
      {lastPrint && changes.length > 0 && (
        <div className="banner banner--danger" role="alert">
          <span>
            Hay modificaciones posteriores a la última impresión ({fmtDT(lastPrint.at)}, {lastPrint.kind}).
          </span>
          <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => setShowChanges((v) => !v)}>
            {showChanges ? 'Ocultar' : 'Ver qué cambió'}
          </button>
        </div>
      )}
      {showChanges && (
        <Card title="Cambios desde la última impresión">
          <ul className="slist">
            {changes.map((c, i) => (
              <li key={i}>
                {c.b ? <a href={`#/reservas/r/${c.b.id}`}>{c.b.holder.name}</a> : '—'}: {c.text}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {lastPrint && !changes.length && <p className="muted">Última impresión: {fmtDT(lastPrint.at)} ({lastPrint.kind}) · sin cambios posteriores.</p>}

      <Card title="Informes A4">
        <div className="rreports">
          {docs.map(([code, label, make]) => (
            <div key={code} className="rreport">
              <strong>
                {code} · {label}
              </strong>
              <div className="sscene__actions">
                <button
                  type="button"
                  className="abtn abtn--primary abtn--small"
                  onClick={() => {
                    if (printReport(make(), brand)) void markPrinted(`${code} impreso`);
                  }}
                >
                  Imprimir
                </button>
                <button
                  type="button"
                  className="abtn abtn--ghost abtn--small"
                  onClick={async () => {
                    download(await reportPdf(make(), brand), `${fileBase}-${code}.pdf`);
                    void markPrinted(`${code} PDF`);
                  }}
                >
                  PDF
                </button>
              </div>
            </div>
          ))}
          {list && sc && (
            <div className="rreport">
              <strong>Exportación (CSV para Excel)</strong>
              <div className="sscene__actions">
                <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => download(new Blob([csvBookings([...sc.active, ...sc.cancelled], cfg)], { type: 'text/csv;charset=utf-8' }), `${fileBase}-reservas.csv`)}>
                  Reservas
                </button>
                <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => download(new Blob([csvDiners(sc.active)], { type: 'text/csv;charset=utf-8' }), `${fileBase}-comensales.csv`)}>
                  Comensales
                </button>
                {k && (
                  <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => download(new Blob([toCsv([['Grupo', 'Plato', 'Cantidad', 'Detalle'], ...k.groups.flatMap((g) => g.lines.map((l) => [g.title, l.name, l.count, l.detail ?? '']))])], { type: 'text/csv;charset=utf-8' }), `${fileBase}-produccion.csv`)}>
                    Producción
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {!k || !sc ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <div className="rstats rstats--small">
            <div className="sstat">
              <span className="sstat__n">{sc.production.length}</span>reservas en producción
            </div>
            <div className="sstat">
              <span className="sstat__n">{k.people}</span>comensales
            </div>
            <div className="sstat">
              <span className="sstat__n">{k.carta}</span>niños con carta habitual
            </div>
            <div className={`sstat ${sc.active.filter((b) => verification(b, cfg.staleDays) !== 'verified').length ? 'is-warn' : ''}`}>
              <span className="sstat__n">{sc.active.filter((b) => verification(b, cfg.staleDays) !== 'verified').length}</span>sin verificar o con incidencias
            </div>
          </div>
          <div className="rkitchen">
            {k.groups
              .filter((g) => g.lines.length)
              .map((g) => (
                <Card key={g.title} title={g.title}>
                  <div className="rtable-wrap">
                  <table className="rtable rtable--compact">
                    <tbody>
                      {g.lines.map((l) => (
                        <tr key={l.name}>
                          <td>{l.name}</td>
                          <td className="r">
                            <strong>{l.count}</strong>
                          </td>
                          {l.detail && <td className="muted">{l.detail}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </Card>
              ))}
            <Card title="Alergias e intolerancias" tone={k.allergies.length ? 'danger' : undefined}>
              {!k.allergies.length ? (
                <p className="muted">Sin alergias registradas.</p>
              ) : (
                <ul className="slist">
                  {k.allergies.map((a, i) => (
                    <li key={i} className="rallergy">
                      {a.booking} · {a.who}: {a.text}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {k.withoutSelection.length > 0 && (
              <Card title="Reservas sin elección de platos" tone="warn">
                <p>{k.withoutSelection.join(' · ')}</p>
              </Card>
            )}
          </div>
          <p className="muted">
            Servicio: {service === 'all' ? 'comida y cena' : SERVICE_LABEL[service]} · {cfg.kitchen.includeUnverified ? 'Incluye reservas vinculadas no canceladas aunque no estén verificadas (marcadas en los informes).' : 'Solo reservas verificadas.'} Las preselecciones sin reserva confirmada no se incluyen.
          </p>
        </>
      )}
    </>
  );
}

/* ====================== Calendario mensual ====================== */
const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Mes con el número de reservas y personas de cada día; al pulsar un día se muestra su listado. */
export function MonthCalendar({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
  const { data } = useReservas();
  const { content } = useStore();
  const [month, setMonth] = useState(selected.slice(0, 7));
  useEffect(() => setMonth(selected.slice(0, 7)), [selected]);
  const cfg = data!.config;
  const period = content.calendar?.period ?? { start: '', end: '' };
  const today = todayMadrid();
  const byDay = useMemo(() => {
    const m = new Map<string, { n: number; people: number; lunch: number; dinner: number; alerts: number; cancelled: number }>();
    for (const r of data!.rows) {
      if (r.archived || !r.date || r.category === 'normal') continue;
      const cur = m.get(r.date) ?? { n: 0, people: 0, lunch: 0, dinner: 0, alerts: 0, cancelled: 0 };
      const v = rowVerification(r, cfg.staleDays);
      if (v === 'cancelled') cur.cancelled++;
      else {
        cur.n++;
        cur.people += r.confirmed ?? r.requested ?? 0;
        if (r.service === 'lunch') cur.lunch++;
        if (r.service === 'dinner') cur.dinner++;
        if (v === 'incident' || r.allergies || r.category === 'unclassified') cur.alerts++;
      }
      m.set(r.date, cur);
    }
    return m;
  }, [data, cfg.staleDays]);
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days: string[] = [];
  for (const d = new Date(first); iso(d).slice(0, 7) === month; d.setUTCDate(d.getUTCDate() + 1)) days.push(iso(d));
  const shift = (k: number) => {
    const d = new Date(first);
    d.setUTCMonth(d.getUTCMonth() + k);
    setMonth(iso(d).slice(0, 7));
  };
  const label = first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthTotal = days.reduce((n, d) => n + (byDay.get(d)?.n ?? 0), 0);
  return (
    <div className="rcal" aria-label="Calendario de reservas">
      <div className="rcal__head">
        <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => shift(-1)} aria-label="Mes anterior">
          ←
        </button>
        <strong className="rcal__month">{label.charAt(0).toUpperCase() + label.slice(1)}</strong>
        <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => shift(1)} aria-label="Mes siguiente">
          →
        </button>
        <span className="muted rcal__sum">{monthTotal} reservas este mes</span>
        <button type="button" className="abtn abtn--text abtn--small" onClick={() => onSelect(today)}>
          Hoy
        </button>
      </div>
      <div className="rcal__grid">
        {WEEK.map((w) => (
          <span key={w} className="rcal__dow" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {days.map((d) => {
          const c = byDay.get(d);
          const inPeriod = !!period.start && !!period.end && d >= period.start && d <= period.end;
          const cls = ['rcal__day', d === selected ? 'is-selected' : '', d === today ? 'is-today' : '', inPeriod ? 'is-period' : '', c?.n ? 'has-res' : '', d < today ? 'is-past' : ''].join(' ');
          const aria = `${Number(d.slice(8))}: ${c?.n ? `${c.n} reservas, ${c.people} personas` : 'sin reservas'}${c?.alerts ? `, ${c.alerts} con alertas` : ''}`;
          return (
            <button key={d} type="button" className={cls} aria-pressed={d === selected} aria-label={aria} onClick={() => onSelect(d)}>
              <span className="rcal__n">{Number(d.slice(8))}</span>
              {c?.n ? (
                <span className="rcal__info">
                  <strong>{c.n}</strong> res. · {c.people} pers.
                  <span className="rcal__svc">
                    {c.lunch > 0 && <span title="Comidas">☀ {c.lunch}</span>}
                    {c.dinner > 0 && <span title="Cenas">☾ {c.dinner}</span>}
                  </span>
                </span>
              ) : null}
              {c?.alerts ? <span className="rcal__alert" title="Con alertas o alergias" aria-hidden="true">!</span> : null}
            </button>
          );
        })}
      </div>
      <p className="rcal__legend muted">
        <span className="rcal__key is-period" /> Periodo de menús de Navidad · <span className="rcal__key has-res" /> Con reservas · <strong>!</strong> Alertas, alergias o por clasificar
      </p>
    </div>
  );
}
