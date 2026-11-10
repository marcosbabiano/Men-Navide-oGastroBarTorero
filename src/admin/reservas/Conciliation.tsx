/**
 * Revisar reservas con Qamarero: Qamarero puede modificar o cancelar sin enviar correo.
 * Aquí se comprueba cada reserva con la agenda oficial y se importa una exportación (CSV/Excel guardado
 * como CSV) si la tienes: se proponen los cambios, nunca se aplican en silencio ni tocan los platos.
 */
import { useMemo, useState } from 'react';
import { type BookingRow, normalizePhone, parseCsv } from '../../../shared/reservas.ts';
import { Badge, Card, PageHeader } from '../ui.tsx';
import { fmtDay, fmtDT, QBadge, rowVerification, VBadge } from './common.tsx';
import { rapi, useReservas } from './state.tsx';
import { parseDate, parseTime } from './dates.ts';

const FIELDS = [
  ['reservationId', 'Localizador'],
  ['name', 'Nombre'],
  ['phone', 'Teléfono'],
  ['date', 'Fecha'],
  ['time', 'Hora'],
  ['people', 'Personas'],
  ['zone', 'Zona'],
  ['status', 'Estado'],
] as const;
type Field = (typeof FIELDS)[number][0];
const GUESS: Record<Field, RegExp> = {
  reservationId: /localizador|c[oó]digo|^id$|reserva\s*(id|n)|referencia/i,
  name: /nombre|cliente|titular/i,
  phone: /tel[eé]fono|m[oó]vil|phone/i,
  date: /fecha|d[ií]a|date/i,
  time: /hora|time/i,
  people: /personas|comensales|pax|invitados/i,
  zone: /zona|sala|espacio|mesa/i,
  status: /estado|status/i,
};

interface Proposal {
  row: number;
  data: { reservationId: string; name: string; phone: string; date: string; time: string; people: number | null; zone: string; cancelled: boolean };
  target: BookingRow | null;
  changes: string[];
  apply: boolean;
}

export function Conciliation() {
  const { data, run } = useReservas();
  const d = data!;
  const stale = d.config.staleDays;
  const live = useMemo(() => d.rows.filter((r) => !r.archived), [d.rows]);
  const toReview = live
    .filter((r) => ['email_only', 'incident'].includes(rowVerification(r, stale)) || r.qStatus === 'to_check')
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

  /* ---------- importación ---------- */
  const [table, setTable] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<Record<Field, number>>>({});
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const onFile = async (f: File) => {
    const rows = parseCsv(await f.text());
    setTable(rows);
    const head = rows[0] ?? [];
    const m: Partial<Record<Field, number>> = {};
    for (const [k] of FIELDS) {
      const i = head.findIndex((h) => GUESS[k].test(h.trim()));
      if (i >= 0) m[k] = i;
    }
    setMap(m);
    setProposals(null);
  };
  const analyse = () => {
    if (!table) return;
    const get = (r: string[], k: Field) => (map[k] !== undefined ? (r[map[k]!] ?? '').trim() : '');
    const out: Proposal[] = table.slice(1).map((r, i) => {
      const dataRow = {
        reservationId: get(r, 'reservationId'),
        name: get(r, 'name'),
        phone: get(r, 'phone'),
        date: parseDate(get(r, 'date')),
        time: parseTime(get(r, 'time')),
        people: /\d+/.test(get(r, 'people')) ? Number(/\d+/.exec(get(r, 'people'))![0]) : null,
        zone: get(r, 'zone'),
        cancelled: /cancel|anulad/i.test(get(r, 'status')),
      };
      const p = normalizePhone(dataRow.phone);
      const target =
        (dataRow.reservationId && live.find((x) => x.reservationId && x.reservationId.toLowerCase() === dataRow.reservationId.toLowerCase())) ||
        (p && dataRow.date && live.find((x) => normalizePhone(x.phone) === p && x.date === dataRow.date)) ||
        (p && live.find((x) => normalizePhone(x.phone) === p && !x.date && x.qStatus === 'pending_confirmation')) ||
        null;
      const changes: string[] = [];
      if (target) {
        if (dataRow.date && dataRow.date !== target.date) changes.push(`fecha ${target.date || '—'} → ${dataRow.date}`);
        if (dataRow.time && dataRow.time !== target.time) changes.push(`hora ${target.time || '—'} → ${dataRow.time}`);
        if (dataRow.people !== null && dataRow.people !== target.confirmed) changes.push(`personas ${target.confirmed ?? '—'} → ${dataRow.people}`);
        if (dataRow.zone && dataRow.zone !== target.zone) changes.push(`zona ${target.zone || '—'} → ${dataRow.zone}`);
        if (dataRow.reservationId && dataRow.reservationId !== target.reservationId) changes.push(`localizador → ${dataRow.reservationId}`);
        if (dataRow.cancelled && rowVerification(target, stale) !== 'cancelled') changes.push('CANCELADA en Qamarero');
      } else changes.push(dataRow.cancelled ? 'Cancelada (no existe aquí)' : 'Reserva no registrada aquí: se creará');
      return { row: i + 2, data: dataRow, target, changes, apply: !!target && changes.length > 0 };
    });
    setProposals(out);
  };
  const missing = useMemo(() => {
    if (!proposals) return [];
    const dates = proposals.map((p) => p.data.date).filter(Boolean).sort();
    if (!dates.length) return [];
    const [min, max] = [dates[0], dates[dates.length - 1]];
    const seen = new Set(proposals.map((p) => p.target?.id).filter(Boolean));
    return live.filter((r) => r.date >= min && r.date <= max && !seen.has(r.id) && rowVerification(r, stale) !== 'cancelled');
  }, [proposals, live, stale]);

  return (
    <>
      <PageHeader title="Revisar reservas con Qamarero" intro="Qamarero puede modificar o cancelar reservas sin enviar correo. Compara aquí con la agenda oficial y registra la revisión. Ningún cambio toca las elecciones de platos." />
      <Card title={`Pendientes de comprobar (${toReview.length})`} description={`Reservas con confirmación por email sin revisión en los últimos ${stale} días, marcadas «pendiente de comprobar» o con incidencias.`}>
        {!toReview.length ? (
          <p className="muted">Todo revisado.</p>
        ) : (
          <div className="rtable-wrap">
            <table className="rtable">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Titular</th>
                  <th className="r">Pers.</th>
                  <th>Estado</th>
                  <th>Última notificación</th>
                  <th>Última comprobación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {toReview.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDay(r.date)}</td>
                    <td>{r.time || '—'}</td>
                    <td>
                      <a href={`#/reservas/r/${r.id}`}>{r.name}</a>
                    </td>
                    <td className="r">{r.confirmed ?? '—'}</td>
                    <td>
                      <QBadge s={r.qStatus} /> <VBadge v={rowVerification(r, stale)} />
                    </td>
                    <td>{fmtDT(r.notifiedAt)}</td>
                    <td>{fmtDT(r.lastCheckedAt)}</td>
                    <td className="ractions">
                      <button type="button" className="abtn abtn--primary abtn--small" onClick={() => void run(() => rapi.action(r.id, { action: 'confirm-review' }), 'Revisada: sigue vigente')}>
                        Sigue vigente
                      </button>
                      <button type="button" className="abtn abtn--danger-ghost abtn--small" onClick={() => void run(() => rapi.action(r.id, { action: 'cancel' }), 'Marcada como cancelada')}>
                        Cancelada
                      </button>
                      <a className="abtn abtn--ghost abtn--small" href={`#/reservas/r/${r.id}`}>
                        Corregir datos
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Importar una exportación de Qamarero" description="Si puedes exportar las reservas desde Qamarero (o copiarlas a una hoja de cálculo), guárdalas como CSV y súbelas. No se ha encontrado documentación pública de una exportación oficial: por eso las columnas se asignan aquí.">
        <input type="file" accept=".csv,text/csv,text/plain" aria-label="Archivo CSV" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        {table && (
          <>
            <p className="field__hint">{table.length - 1} filas. Asigna cada dato a su columna:</p>
            <div className="grid-3">
              {FIELDS.map(([k, label]) => (
                <label key={k} className="field">
                  <span className="field__label">{label}</span>
                  <select className="input input--select" value={map[k] ?? ''} onChange={(e) => setMap({ ...map, [k]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">— No disponible —</option>
                    {(table[0] ?? []).map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Columna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button type="button" className="abtn abtn--primary" onClick={analyse} disabled={map.date === undefined}>
              Comparar con las reservas
            </button>
          </>
        )}
        {proposals && (
          <>
            <div className="rtable-wrap">
              <table className="rtable rtable--compact">
                <thead>
                  <tr>
                    <th>Aplicar</th>
                    <th>Fila</th>
                    <th>Qamarero</th>
                    <th>Reserva aquí</th>
                    <th>Cambios propuestos</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <input type="checkbox" aria-label={`Aplicar fila ${p.row}`} checked={p.apply} onChange={(e) => setProposals(proposals.map((x, k) => (k === i ? { ...x, apply: e.target.checked } : x)))} />
                      </td>
                      <td>{p.row}</td>
                      <td>
                        {p.data.name} · {p.data.date} {p.data.time} · {p.data.people ?? '—'} pers.
                      </td>
                      <td>{p.target ? <a href={`#/reservas/r/${p.target.id}`}>{p.target.name}</a> : <Badge tone="draft">Nueva</Badge>}</td>
                      <td>{p.changes.length ? p.changes.join(' · ') : <span className="muted">Sin cambios</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missing.length > 0 && (
              <p className="field__error">
                No aparecen en la exportación (¿canceladas o movidas?): {missing.map((m) => `${m.name} (${fmtDay(m.date)} ${m.time})`).join(' · ')}. Revísalas una a una.
              </p>
            )}
            <button
              type="button"
              className="abtn abtn--primary"
              disabled={!proposals.some((p) => p.apply)}
              onClick={async () => {
                const items = proposals.filter((p) => p.apply).map((p) => ({ bookingId: p.target?.id ?? null, data: p.data }));
                if (await run(() => rapi.importApply(items), `${items.length} cambio(s) aplicados`)) setProposals(null);
              }}
            >
              Aplicar los cambios seleccionados
            </button>
            <p className="field__hint">Las reservas actualizadas desde la exportación se marcan como comprobadas ahora. Las elecciones de platos no se modifican; si cambian los comensales, se genera una incidencia.</p>
          </>
        )}
      </Card>
    </>
  );
}
