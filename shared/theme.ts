/**
 * Paleta de campaña y comprobaciones de contraste (WCAG 2.2 AA).
 * Los colores editables desde el panel solo se aceptan si mantienen un contraste suficiente
 * en todas las combinaciones que usa el diseño.
 */
export interface ThemeColors {
  carbon: string;
  burgundy: string;
  gold: string;
  ivory: string;
}

export const DEFAULT_THEME: ThemeColors = {
  carbon: '#1d1517',
  burgundy: '#5a2533',
  gold: '#c9a96e',
  ivory: '#f4ece0',
};

export const THEME_PRESETS: { id: string; name: string; colors: ThemeColors }[] = [
  { id: 'burdeos', name: 'Burdeos y champán (recomendado)', colors: DEFAULT_THEME },
  { id: 'abeto', name: 'Verde abeto', colors: { carbon: '#141a17', burgundy: '#1f3a2e', gold: '#c8a86a', ivory: '#f3ede2' } },
  { id: 'noche', name: 'Noche de invierno', colors: { carbon: '#14161d', burgundy: '#2a2f45', gold: '#cdb07a', ivory: '#f2eee8' } },
  { id: 'granate', name: 'Granate intenso', colors: { carbon: '#1c1214', burgundy: '#6b1f2c', gold: '#d4b27a', ivory: '#f6efe4' } },
];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

interface Pair {
  fg: keyof ThemeColors;
  bg: keyof ThemeColors;
  min: number;
  label: string;
}

const PAIRS: Pair[] = [
  { fg: 'ivory', bg: 'carbon', min: 7, label: 'Texto marfil sobre fondo carbón' },
  { fg: 'gold', bg: 'carbon', min: 4.5, label: 'Detalles dorados sobre fondo carbón' },
  { fg: 'ivory', bg: 'burgundy', min: 4.5, label: 'Texto marfil sobre fondo burdeos' },
  { fg: 'carbon', bg: 'gold', min: 4.5, label: 'Texto carbón sobre botón dorado' },
  { fg: 'burgundy', bg: 'ivory', min: 4.5, label: 'Texto burdeos sobre fondo marfil' },
];

export function checkThemeContrast(t: ThemeColors): { field: keyof ThemeColors; message: string; ratio: number }[] {
  const out: { field: keyof ThemeColors; message: string; ratio: number }[] = [];
  for (const p of PAIRS) {
    if (!/^#[0-9a-f]{6}$/i.test(t[p.fg]) || !/^#[0-9a-f]{6}$/i.test(t[p.bg])) continue;
    const ratio = contrastRatio(t[p.fg], t[p.bg]);
    if (ratio < p.min) {
      out.push({
        field: p.fg,
        ratio,
        message: `${p.label}: contraste ${ratio.toFixed(2)}:1 (mínimo ${p.min}:1)`,
      });
    }
  }
  return out;
}

export function themeToCssVars(t: ThemeColors): Record<string, string> {
  return {
    '--c-carbon': t.carbon,
    '--c-burgundy': t.burgundy,
    '--c-gold': t.gold,
    '--c-ivory': t.ivory,
  };
}
