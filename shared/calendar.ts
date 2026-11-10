/**
 * Calendario informativo de Navidad: días con menús de Navidad, días abiertos y días cerrados.
 * Es solo informativo: no consulta ni muestra disponibilidad de reservas.
 */
import type { SiteContent } from './schema.ts';

export type DayStatus = 'menus' | 'open' | 'closed';
export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  menus: 'Menús de Navidad',
  open: 'Abierto',
  closed: 'Cerrado',
};

export const PATCH_CALENDAR_2026_11 = 'calendario-2026-11';

export function defaultCalendar(): SiteContent['calendar'] {
  return {
    period: { start: '', end: '' },
    highlight: { enabled: true, label: 'Menús de Navidad' },
    eyebrow: 'Calendario de Navidad',
    title: 'Cuándo puedes disfrutar de nuestros menús',
    intro: 'Consulta qué días servimos los menús de Navidad y qué días abrimos.',
    note: 'Calendario informativo. Para reservar, usa el botón de reservas o llámanos.',
    closedWeekdays: [],
    days: [],
  };
}

/** Día de la semana (0 = lunes) de una fecha AAAA-MM-DD. */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export function inPeriod(cal: SiteContent['calendar'], date: string): boolean {
  const { start, end } = cal.period;
  return !!start && !!end && date >= start && date <= end;
}

/**
 * Estado de un día. Prioridad: día marcado a mano → festivo cerrado del horario (si está verificado)
 * → día de cierre semanal → periodo de menús → abierto.
 */
export function dayStatus(content: Pick<SiteContent, 'calendar' | 'business'>, date: string): { status: DayStatus; note: string } {
  const cal = content.calendar;
  const manual = cal.days.find((d) => d.date === date);
  if (manual) return { status: manual.status, note: manual.note };
  const hours = content.business.hours;
  const special = hours.verified ? hours.specials.find((s) => s.date === date) : undefined;
  if (special?.closed) return { status: 'closed', note: special.label };
  if (cal.closedWeekdays.includes(weekday(date))) return { status: 'closed', note: '' };
  return { status: inPeriod(cal, date) ? 'menus' : 'open', note: special?.label ?? '' };
}

export interface CalendarMonth {
  key: string; // AAAA-MM
  label: string; // «diciembre de 2026»
  /** Huecos iniciales (lunes = 0) y días del mes. */
  offset: number;
  days: string[];
}

/** Meses a mostrar: los del periodo de menús y los de los días marcados (máx. 4). */
export function calendarMonths(cal: SiteContent['calendar']): CalendarMonth[] {
  const keys = new Set<string>();
  const { start, end } = cal.period;
  if (start && end && start <= end) {
    const d = parse(start);
    d.setUTCDate(1);
    while (iso(d).slice(0, 7) <= end.slice(0, 7) && keys.size < 4) {
      keys.add(iso(d).slice(0, 7));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }
  for (const day of cal.days) if (keys.size < 4 || keys.has(day.date.slice(0, 7))) keys.add(day.date.slice(0, 7));
  return [...keys]
    .sort()
    .slice(0, 4)
    .map((key) => {
      const first = parse(`${key}-01`);
      const days: string[] = [];
      const d = new Date(first);
      while (iso(d).slice(0, 7) === key) {
        days.push(iso(d));
        d.setUTCDate(d.getUTCDate() + 1);
      }
      const label = first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return { key, label, offset: weekday(days[0]), days };
    });
}

/** «del 1 de diciembre al 6 de enero» (con año si cambia). */
export function formatPeriod(cal: SiteContent['calendar']): string {
  const { start, end } = cal.period;
  if (!start || !end) return '';
  const f = (s: string, year: boolean) =>
    parse(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  const cross = start.slice(0, 4) !== end.slice(0, 4);
  return `del ${f(start, cross)} al ${f(end, cross)}`;
}

export function hasCalendar(cal: SiteContent['calendar']): boolean {
  return (!!cal.period.start && !!cal.period.end) || cal.days.length > 0;
}
