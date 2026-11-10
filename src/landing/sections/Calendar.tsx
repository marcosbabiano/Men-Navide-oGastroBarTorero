import { useMemo } from 'react';
import { calendarMonths, DAY_STATUS_LABEL, type DayStatus, dayStatus, formatPeriod, hasCalendar } from '../../../shared/calendar.ts';
import { useContent } from '../ContentContext.tsx';
import { Star } from '../components/Ornament.tsx';

const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const WEEK_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Calendario informativo: menús de Navidad, abierto y cerrado. No muestra disponibilidad de reservas. */
export function Calendar() {
  const { content, t } = useContent();
  const cal = content.calendar;
  const months = useMemo(() => calendarMonths(cal), [cal]);
  const today = useMemo(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }), []);
  if (!hasCalendar(cal)) return null;
  const period = formatPeriod(cal);
  const used = new Set<DayStatus>();
  const rendered = months.map((m) => ({
    ...m,
    cells: m.days.map((d) => {
      const s = dayStatus(content, d);
      used.add(s.status);
      return { date: d, ...s };
    }),
  }));

  return (
    <section className="cal" id="calendario" aria-labelledby="cal-title">
      <div className="container">
        <header className="cal__head">
          <p className="eyebrow" data-anim="fade-up">
            <Star size={10} /> {t(cal.eyebrow)}
          </p>
          <h2 className="cal__title" id="cal-title" data-anim="lines">
            {t(cal.title)}
          </h2>
          {cal.intro && (
            <p className="cal__intro" data-anim="fade-up">
              {t(cal.intro)}
            </p>
          )}
          {period && (
            <p className="cal__period" data-anim="fade-up">
              <span className="cal__period-label">{cal.highlight.label || DAY_STATUS_LABEL.menus}</span>
              <strong>{period}</strong>
            </p>
          )}
        </header>

        <ul className="cal__legend" role="list" aria-label="Leyenda">
          {(['menus', 'open', 'closed'] as DayStatus[])
            .filter((s) => used.has(s))
            .map((s) => (
              <li key={s} className={`cal__key cal__key--${s}`}>
                <span aria-hidden="true" /> {s === 'menus' ? cal.highlight.label || DAY_STATUS_LABEL.menus : DAY_STATUS_LABEL[s]}
              </li>
            ))}
        </ul>

        <div className={`cal__months n-${rendered.length}`}>
          {rendered.map((m) => (
            <div className="cal__month" key={m.key} data-anim="fade-up">
              <h3 className="cal__mname">{cap(m.label)}</h3>
              <ol className="cal__grid" role="list" aria-label={m.label}>
                {WEEK.map((w, i) => (
                  <li key={w} className="cal__dow" aria-hidden="true" title={WEEK_LONG[i]}>
                    {w}
                  </li>
                ))}
                {Array.from({ length: m.offset }, (_, i) => (
                  <li key={`e${i}`} className="cal__empty" aria-hidden="true" />
                ))}
                {m.cells.map((c) => {
                  const n = Number(c.date.slice(8));
                  const label = `${n} de ${m.label.split(' de ')[0]}: ${c.status === 'menus' ? cal.highlight.label || DAY_STATUS_LABEL.menus : DAY_STATUS_LABEL[c.status]}${c.note ? ` (${c.note})` : ''}`;
                  return (
                    <li key={c.date} className={`cal__day cal__day--${c.status} ${c.date < today ? 'is-past' : ''} ${c.date === today ? 'is-today' : ''}`} aria-label={label} title={label}>
                      <span className="cal__n">{n}</span>
                      {c.note && <span className="cal__dot" aria-hidden="true" />}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>

        {cal.days.some((d) => d.note) && (
          <ul className="cal__notes" role="list">
            {cal.days
              .filter((d) => d.note)
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((d) => (
                <li key={d.date}>
                  <strong>{cap(new Date(`${d.date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))}</strong> · {d.note}
                </li>
              ))}
          </ul>
        )}
        {cal.note && <p className="cal__note">{t(cal.note)}</p>}
      </div>
    </section>
  );
}

/** Distintivo destacado con el periodo de los menús (portada y sección de menús). */
export function PeriodBadge({ className = '' }: { className?: string }) {
  const { content } = useContent();
  const cal = content.calendar;
  const period = formatPeriod(cal);
  if (!period || !cal.highlight.enabled) return null;
  return (
    <p className={`period-badge ${className}`}>
      <Star size={11} /> <span>{cal.highlight.label || DAY_STATUS_LABEL.menus}</span> <strong>{period}</strong>
    </p>
  );
}
