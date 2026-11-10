import { useMemo, useState } from 'react';
import type { Draft } from 'immer';
import type { SiteContent } from '../../../shared/schema.ts';
import { calendarMonths, DAY_STATUS_LABEL, type DayStatus, dayStatus, formatPeriod } from '../../../shared/calendar.ts';
import { useStore } from '../store.tsx';
import { Card, PageHeader, TextArea, TextField, Toggle } from '../ui.tsx';

type Cal = SiteContent['calendar'];
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NEXT: Record<DayStatus, DayStatus | null> = { menus: 'open', open: 'closed', closed: null };

/** Calendario de Navidad: periodo de los menús, días abiertos/cerrados y textos (solo informativo). */
export function CalendarView() {
  const { content, update } = useStore();
  const cal = content.calendar;
  const set = (fn: (c: Draft<Cal>) => void) => update((d) => fn(d.calendar));
  const { start, end } = cal.period;
  const periodErr = !!start !== !!end ? 'Indica la fecha de inicio y la de fin de los menús.' : start && end && start > end ? 'La fecha de fin no puede ser anterior a la de inicio.' : undefined;
  const months = useMemo(() => calendarMonths(cal), [cal]);
  const [newDate, setNewDate] = useState('');
  const section = content.layout.sections.find((s) => s.type === 'calendar');

  /** Clic en un día de la vista previa: rota su estado (automático → menús → abierto → cerrado → automático). */
  const cycle = (date: string) =>
    set((c) => {
      const i = c.days.findIndex((d) => d.date === date);
      if (i < 0) c.days.push({ date, status: 'menus', note: '' });
      else {
        const next = NEXT[c.days[i].status];
        if (next) c.days[i].status = next;
        else c.days.splice(i, 1);
      }
      c.days.sort((a, b) => a.date.localeCompare(b.date));
    });

  return (
    <>
      <PageHeader
        title="Calendario de Navidad"
        intro="Muestra en la web qué días se pueden pedir los menús de Navidad y qué días abrís. Es solo informativo: no indica plazas ni disponibilidad de reserva."
      />
      {section && !section.visible && (
        <div className="banner banner--info">
          La sección está oculta en la web. Actívala en <a href="#/secciones">Secciones</a>.
        </div>
      )}
      <Card title="Fechas de los menús de Navidad" description="Inicio y fin del periodo en el que se sirven los menús. Se destaca en la portada, en la sección de menús y en el calendario.">
        <div className="grid-2">
          <label className="field">
            <span className="field__label">Fecha de inicio</span>
            <input className="input" type="date" value={cal.period.start} onChange={(e) => set((c) => void (c.period.start = e.target.value))} />
          </label>
          <label className="field">
            <span className="field__label">Fecha de fin</span>
            <input className="input" type="date" value={cal.period.end} min={cal.period.start || undefined} onChange={(e) => set((c) => void (c.period.end = e.target.value))} />
          </label>
        </div>
        {periodErr && (
          <p className="field__error" role="alert">
            {periodErr}
          </p>
        )}
        {formatPeriod(cal) && <p className="cal-admin__period">Se mostrará: «{cal.highlight.label || DAY_STATUS_LABEL.menus} {formatPeriod(cal)}»</p>}
        <Toggle label="Destacar el periodo en la portada y en los menús" checked={cal.highlight.enabled} onChange={(v) => set((c) => void (c.highlight.enabled = v))} />
        <TextField label="Texto del distintivo" value={cal.highlight.label} max={60} onChange={(v) => set((c) => void (c.highlight.label = v))} hint="Por ejemplo: «Menús de Navidad»." />
      </Card>

      <Card title="Días de cierre" description="Días de la semana que el local cierra. Los festivos marcados como «Cerrado» en Local → Horarios especiales (con el horario verificado) también se muestran cerrados.">
        <div className="chips" role="group" aria-label="Días de cierre semanal">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              className={`chip ${cal.closedWeekdays.includes(i) ? 'is-on' : ''}`}
              aria-pressed={cal.closedWeekdays.includes(i)}
              onClick={() => set((c) => void (c.closedWeekdays = c.closedWeekdays.includes(i) ? c.closedWeekdays.filter((x) => x !== i) : [...c.closedWeekdays, i].sort()))}
            >
              {d}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Días concretos" description="Para excepciones: un día sin menús aunque esté dentro del periodo, un cierre puntual o un día abierto aunque normalmente cerréis. También puedes pulsar los días en la vista previa.">
        {cal.days.length === 0 && <p className="muted">Sin excepciones.</p>}
        <ul className="cal-admin__days" role="list">
          {cal.days.map((d, i) => (
            <li key={d.date} className="cal-admin__row">
              <strong>{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong>
              <select className="input input--select" aria-label={`Estado del ${d.date}`} value={d.status} onChange={(e) => set((c) => void (c.days[i].status = e.target.value as DayStatus))}>
                {(['menus', 'open', 'closed'] as DayStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {DAY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <input className="input" aria-label={`Nota del ${d.date}`} placeholder="Nota (opcional), p. ej. «Nochebuena: solo comidas»" maxLength={80} value={d.note} onChange={(e) => set((c) => void (c.days[i].note = e.target.value))} />
              <button type="button" className="abtn abtn--text abtn--small danger" onClick={() => set((c) => void c.days.splice(i, 1))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <div className="cal-admin__add">
          <input className="input" type="date" aria-label="Día para añadir" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button
            type="button"
            className="abtn abtn--ghost"
            disabled={!newDate || cal.days.some((d) => d.date === newDate)}
            onClick={() => {
              set((c) => {
                c.days.push({ date: newDate, status: 'closed', note: '' });
                c.days.sort((a, b) => a.date.localeCompare(b.date));
              });
              setNewDate('');
            }}
          >
            + Añadir día
          </button>
        </div>
      </Card>

      <Card title="Vista previa" description="Pulsa un día para cambiarlo: automático → menús → abierto → cerrado → automático. Los días con borde son excepciones.">
        {months.length === 0 ? (
          <p className="muted">Indica las fechas de inicio y fin para ver el calendario. Mientras tanto, la sección no aparece en la web.</p>
        ) : (
          <div className="cal-admin__months">
            {months.map((m) => (
              <div key={m.key}>
                <p className="cal-admin__mname">{m.label}</p>
                <div className="cal-admin__grid">
                  {WEEK.map((w) => (
                    <span key={w} className="cal-admin__dow">
                      {w}
                    </span>
                  ))}
                  {Array.from({ length: m.offset }, (_, i) => (
                    <span key={`e${i}`} />
                  ))}
                  {m.days.map((d) => {
                    const s = dayStatus(content, d);
                    const manual = cal.days.some((x) => x.date === d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`cal-admin__day is-${s.status} ${manual ? 'is-manual' : ''}`}
                        title={`${d}: ${DAY_STATUS_LABEL[s.status]}${s.note ? ` · ${s.note}` : ''}`}
                        aria-label={`${Number(d.slice(8))} de ${m.label}: ${DAY_STATUS_LABEL[s.status]}${manual ? ' (excepción)' : ''}`}
                        onClick={() => cycle(d)}
                      >
                        {Number(d.slice(8))}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="cal-admin__legend">
          <span className="is-menus">Menús de Navidad</span> <span className="is-open">Abierto</span> <span className="is-closed">Cerrado</span>
        </p>
      </Card>

      <Card title="Textos de la sección">
        <TextField label="Antetítulo" value={cal.eyebrow} max={60} onChange={(v) => set((c) => void (c.eyebrow = v))} />
        <TextField label="Título" value={cal.title} max={140} onChange={(v) => set((c) => void (c.title = v))} />
        <TextArea label="Introducción" value={cal.intro} max={300} rows={2} onChange={(v) => set((c) => void (c.intro = v))} />
        <TextArea label="Nota al pie" value={cal.note} max={300} rows={2} onChange={(v) => set((c) => void (c.note = v))} hint="Recuerda que es informativo (sin disponibilidad de reservas)." />
      </Card>
    </>
  );
}
