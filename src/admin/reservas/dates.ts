/** Fechas y horas de hojas de cálculo (dd/mm/aaaa, aaaa-mm-dd, «24 de diciembre»…). */
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function parseDate(s: string): string {
  const t = s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+de\\s+(\\d{4}))?`).exec(t);
  if (m) return `${m[3] ?? new Date().getFullYear()}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export function parseTime(s: string): string {
  const m = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}
