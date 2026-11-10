import { describe, expect, it } from 'vitest';
import { calendarMonths, dayStatus, formatPeriod, hasCalendar, weekday } from '../../shared/calendar.ts';
import { createSeedContent } from '../../shared/seed.ts';
import { migrateContent } from '../../shared/layout.ts';
import { siteContentSchema, type SiteContent } from '../../shared/schema.ts';
import { contentIssues } from '../../shared/completeness.ts';

const withCal = (patch: Partial<SiteContent['calendar']>) => {
  const c = createSeedContent();
  c.calendar = { ...c.calendar, ...patch };
  return c;
};

describe('calendario de Navidad', () => {
  it('sin fechas no se inventa nada: la sección no se muestra y el panel avisa', () => {
    const c = createSeedContent();
    expect(c.calendar.period).toEqual({ start: '', end: '' });
    expect(hasCalendar(c.calendar)).toBe(false);
    expect(contentIssues(c).some((i) => i.area === 'calendario')).toBe(true);
    expect(c.layout.sections.map((s) => s.type)).toContain('calendar');
  });
  it('estado de cada día: periodo, cierre semanal, festivos verificados y excepciones', () => {
    const c = withCal({ period: { start: '2026-12-01', end: '2027-01-06' }, closedWeekdays: [0], days: [{ date: '2026-12-25', status: 'closed', note: 'Navidad' }] });
    expect(weekday('2026-12-07')).toBe(0); // lunes
    expect(dayStatus(c, '2026-12-05').status).toBe('menus');
    expect(dayStatus(c, '2026-12-07').status).toBe('closed');
    expect(dayStatus(c, '2026-12-25')).toEqual({ status: 'closed', note: 'Navidad' });
    expect(dayStatus(c, '2026-11-28').status).toBe('open');
    expect(dayStatus(c, '2027-01-07').status).toBe('open');
    c.business.hours.verified = true;
    c.business.hours.specials.push({ id: 'nochevieja', date: '2026-12-31', label: 'Nochevieja', closed: true, ranges: [], note: '' });
    expect(dayStatus(c, '2026-12-31')).toEqual({ status: 'closed', note: 'Nochevieja' });
    c.business.hours.verified = false;
    expect(dayStatus(c, '2026-12-31').status).toBe('menus');
  });
  it('meses del periodo y texto destacado', () => {
    const cal = withCal({ period: { start: '2026-12-01', end: '2027-01-06' } }).calendar;
    const m = calendarMonths(cal);
    expect(m.map((x) => x.key)).toEqual(['2026-12', '2027-01']);
    expect(m[0].days).toHaveLength(31);
    expect(m[0].offset).toBe(1); // 1-12-2026 es martes
    expect(formatPeriod(cal)).toBe('del 1 de diciembre de 2026 al 6 de enero de 2027');
    expect(formatPeriod(withCal({ period: { start: '2026-12-05', end: '2026-12-30' } }).calendar)).toBe('del 5 de diciembre al 30 de diciembre');
  });
  it('valida fechas: fin anterior al inicio, una sola fecha o días repetidos', () => {
    expect(siteContentSchema.safeParse(withCal({ period: { start: '2026-12-10', end: '2026-12-01' } })).success).toBe(false);
    expect(siteContentSchema.safeParse(withCal({ period: { start: '2026-12-10', end: '' } })).success).toBe(false);
    const d = { date: '2026-12-24', status: 'closed' as const, note: '' };
    expect(siteContentSchema.safeParse(withCal({ days: [d, d] })).success).toBe(false);
    expect(siteContentSchema.safeParse(withCal({ period: { start: '2026-12-01', end: '2027-01-06' } })).success).toBe(true);
  });
  it('contenido guardado antes del calendario: se añade una sola vez tras los menús', () => {
    const old = createSeedContent() as unknown as Record<string, unknown> & SiteContent;
    delete (old as Record<string, unknown>).calendar;
    old.layout.sections = old.layout.sections.filter((s) => s.type !== 'calendar');
    old.patches = old.patches.filter((p) => !p.startsWith('calendario'));
    const m = migrateContent(old) as SiteContent;
    expect(siteContentSchema.safeParse(m).success).toBe(true);
    const types = m.layout.sections.map((s) => s.type);
    expect(types.indexOf('calendar')).toBe(types.indexOf('menus') + 1);
    // Si se elimina después, no vuelve a aparecer.
    m.layout.sections = m.layout.sections.filter((s) => s.type !== 'calendar');
    expect(migrateContent(m).layout.sections.some((s) => s.type === 'calendar')).toBe(false);
  });
});
