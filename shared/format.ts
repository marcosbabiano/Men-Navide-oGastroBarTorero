import type { Menu, SiteContent, TimeRange, WeeklyHours } from './schema.ts';

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SCHEMA_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Sustituye marcadores {telefono}, {direccion}, {año}, {precioDesde}, {nombre} en textos editables. */
export function interpolate(text: string, content: SiteContent): string {
  if (!text.includes('{')) return text;
  const vars: Record<string, string> = {
    telefono: content.business.phone,
    direccion: formatAddress(content),
    año: String(content.campaign.year),
    anio: String(content.campaign.year),
    nombre: content.business.name,
    precioDesde: (() => {
      const p = minPrice(content.menus);
      return p === null ? '' : formatPrice(p);
    })(),
  };
  return text.replace(/\{([a-zñA-Z]+)\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

export function formatPrice(amount: number): string {
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return `${amount.toLocaleString('es-ES', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })} €`;
}

export function minPrice(menus: Menu[]): number | null {
  const prices = menus
    .filter((m) => m.status === 'published' && m.price.amount !== null)
    .map((m) => m.price.amount as number);
  return prices.length ? Math.min(...prices) : null;
}

export function formatAddress(content: SiteContent): string {
  const a = content.business.address;
  const line2 = [a.postalCode, a.locality].filter(Boolean).join(' ');
  return [a.street, line2, a.region].filter(Boolean).join(', ');
}

export function mapsLink(content: SiteContent): string {
  if (content.business.mapsUrl) return content.business.mapsUrl;
  const q = [content.business.name, formatAddress(content)].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, '')}`;
}

export function formatRanges(ranges: TimeRange[]): string {
  return ranges.map((r) => `${r.open}–${r.close}`).join(' · ');
}

export function describeDay(h: WeeklyHours): string {
  if (h.closed) return 'Cerrado';
  if (!h.ranges.length) return '';
  return formatRanges(h.ranges);
}

/** Agrupa días consecutivos con el mismo horario: «Viernes – Domingo · 12:00–02:30». */
export function groupWeekly(weekly: WeeklyHours[]): { label: string; value: string }[] {
  const sorted = [...weekly].sort((a, b) => a.day - b.day);
  const groups: { from: number; to: number; value: string }[] = [];
  for (const d of sorted) {
    const value = describeDay(d);
    if (!value) continue;
    const last = groups[groups.length - 1];
    if (last && last.value === value && last.to === d.day - 1) last.to = d.day;
    else groups.push({ from: d.day, to: d.day, value });
  }
  return groups.map((g) => ({
    label: g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]} – ${DAY_NAMES[g.to]}`,
    value: g.value,
  }));
}

export function schemaOpeningHours(weekly: WeeklyHours[]) {
  return weekly
    .filter((d) => !d.closed && d.ranges.length)
    .flatMap((d) =>
      d.ranges.map((r) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${SCHEMA_DAYS[d.day]}`,
        opens: r.open,
        closes: r.close,
      })),
    );
}

export function formatDateEs(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function normalizeDish(name: string): string {
  return slugify(name).replace(/-/g, ' ').trim();
}
