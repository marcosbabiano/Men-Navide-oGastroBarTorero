/**
 * Sistema de diseño compartido entre la landing y el Estudio Creativo.
 * Colores (desde la paleta de campaña), tipografías y ornamentos vectoriales de la marca.
 * Los ornamentos son dibujos lineales propios en SVG (sin imágenes de stock).
 */
import type { ThemeColors } from './theme.ts';

export const BRAND_FONTS = {
  serif: 'Fraunces',
  sans: 'Manrope',
} as const;
export type BrandFont = keyof typeof BRAND_FONTS;

export interface OrnamentDef {
  label: string;
  /** Ancho y alto del sistema de coordenadas. */
  box: [number, number];
  paths: { d: string; mode: 'fill' | 'stroke' }[];
}

const r = (n: number) => Math.round(n * 10) / 10;

/** Rama de abeto: tallo curvo y agujas cortas a ambos lados. */
function sprig(): string {
  const parts = ['M8 92 C30 70 58 42 92 8'];
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    // Punto aproximado sobre la curva y dirección del tallo.
    const x = 8 + 84 * t;
    const y = 92 - 84 * t + Math.sin(t * Math.PI) * -3;
    const len = 13 * (1 - t * 0.55);
    parts.push(`M${r(x)} ${r(y)} l${r(-len * 0.35)} ${r(-len * 0.94)}`);
    parts.push(`M${r(x)} ${r(y)} l${r(len * 0.94)} ${r(len * 0.35)}`);
  }
  return parts.join(' ');
}

/** Rama de laurel: tallo y hojas en forma de almendra alternadas. */
function laurel(): string {
  const parts = ['M50 96 C48 70 40 40 22 8'];
  for (let i = 0; i < 7; i++) {
    const t = 0.12 + i * 0.12;
    const x = 50 - 28 * t * t - 2 * t;
    const y = 96 - 88 * t;
    const side = i % 2 ? 1 : -1;
    const lx = x + side * 15;
    const ly = y - 7;
    parts.push(`M${r(x)} ${r(y)} Q${r((x + lx) / 2 + side * 2)} ${r(y - 10)} ${r(lx)} ${r(ly)} Q${r((x + lx) / 2 - side * 2)} ${r(y + 2)} ${r(x)} ${r(y)} Z`);
  }
  return parts.join(' ');
}

export const ORNAMENTS = {
  star: {
    label: 'Estrella',
    box: [40, 40],
    paths: [
      {
        d: 'M20 0l2.6 13.7L33.1 6.9l-6.8 10.5L40 20l-13.7 2.6 6.8 10.5-10.5-6.8L20 40l-2.6-13.7-10.5 6.8 6.8-10.5L0 20l13.7-2.6L6.9 6.9l10.5 6.8z',
        mode: 'fill',
      },
    ],
  },
  sparkle: {
    label: 'Destello',
    box: [40, 40],
    paths: [{ d: 'M20 0 C21 14 26 19 40 20 C26 21 21 26 20 40 C19 26 14 21 0 20 C14 19 19 14 20 0 Z', mode: 'fill' }],
  },
  sprig: { label: 'Rama de abeto', box: [100, 100], paths: [{ d: sprig(), mode: 'stroke' }] },
  laurel: { label: 'Rama de laurel', box: [100, 100], paths: [{ d: laurel(), mode: 'stroke' }] },
  corner: {
    label: 'Esquina',
    box: [100, 100],
    paths: [
      {
        d: 'M4 96 L4 34 C4 16 16 4 34 4 L96 4 M12 96 L12 38 C12 22 22 12 38 12 L96 12 M4 58 C14 58 20 52 20 42 M58 4 C58 14 52 20 42 20',
        mode: 'stroke',
      },
      { d: 'M27 27 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0', mode: 'stroke' },
    ],
  },
  rule: {
    label: 'Filete',
    box: [200, 20],
    paths: [{ d: 'M0 10 L86 10 M114 10 L200 10 M100 3 L107 10 L100 17 L93 10 Z M76 10 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M124 10 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', mode: 'stroke' }],
  },
  glass: {
    label: 'Copa',
    box: [60, 100],
    paths: [{ d: 'M14 6 L46 6 C48 34 42 52 30 54 C18 52 12 34 14 6 Z M15 22 C24 25 36 25 45 22 M30 54 L30 90 M16 94 C22 91 38 91 44 94', mode: 'stroke' }],
  },
  cutlery: {
    label: 'Cubiertos',
    box: [60, 100],
    paths: [
      {
        d: 'M14 6 L14 30 M20 6 L20 30 M26 6 L26 30 M14 30 C14 38 26 38 26 30 M20 36 L20 94 M44 6 C36 18 36 40 42 48 L42 94 M44 6 L44 48',
        mode: 'stroke',
      },
    ],
  },
  bauble: {
    label: 'Bola',
    box: [60, 100],
    paths: [
      { d: 'M30 0 L30 22 M24 22 L36 22 L36 30 L24 30 Z', mode: 'stroke' },
      { d: 'M30 30 m-26 34 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0', mode: 'stroke' },
      { d: 'M14 58 C18 46 26 42 34 42', mode: 'stroke' },
      { d: 'M8 66 C20 72 40 72 52 66', mode: 'stroke' },
    ],
  },
} satisfies Record<string, OrnamentDef>;

export type OrnamentId = keyof typeof ORNAMENTS;
export const ORNAMENT_IDS = Object.keys(ORNAMENTS) as OrnamentId[];

/** Colores de marca para selectores y plantillas (derivados de la paleta de campaña). */
export function brandSwatches(t: ThemeColors): { name: string; value: string }[] {
  return [
    { name: 'Carbón', value: t.carbon },
    { name: 'Burdeos', value: t.burgundy },
    { name: 'Oro champán', value: t.gold },
    { name: 'Marfil', value: t.ivory },
    { name: 'Blanco', value: '#ffffff' },
    { name: 'Noche', value: '#120d0e' },
  ];
}
