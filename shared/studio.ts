/**
 * Estudio Creativo: modelo de diseños para redes sociales (validado en servidor y cliente).
 */
import { z } from 'zod';
import { safeText } from './schema.ts';
import type { Menu } from './schema.ts';
import { ORNAMENT_IDS, type OrnamentId } from './brand.ts';
import { formatPrice } from './format.ts';

export const FORMATS = {
  post: { label: 'Publicación vertical 4:5', width: 1080, height: 1350 },
  square: { label: 'Publicación cuadrada 1:1', width: 1080, height: 1080 },
  story: { label: 'Historia 9:16', width: 1080, height: 1920 },
  carousel: { label: 'Carrusel 4:5', width: 1080, height: 1350 },
  custom: { label: 'Personalizado', width: 1200, height: 1200 },
} as const;
export type FormatId = keyof typeof FORMATS;
export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

/** Zonas seguras de las historias de Instagram (interfaz superior e inferior). */
export const STORY_SAFE = { top: 250, bottom: 340, side: 64 };

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const num = (min: number, max: number) => z.number().min(min).max(max);

export const BINDING_FIELDS = ['name', 'nameMain', 'price', 'priceUnit', 'subtitle', 'description', 'shared', 'choice', 'dessert', 'drink', 'section'] as const;
export type BindingField = (typeof BINDING_FIELDS)[number];
export const BINDING_LABEL: Record<BindingField, string> = {
  name: 'Nombre completo',
  nameMain: 'Nombre (sin «Menú»)',
  price: 'Precio',
  priceUnit: 'Unidad del precio',
  subtitle: 'Subtítulo',
  description: 'Descripción',
  shared: 'Entrantes para compartir',
  choice: 'Principales a elegir',
  dessert: 'Postre',
  drink: 'Bebida',
  section: 'Grupo de platos',
};

const base = {
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  x: num(-5000, 10000),
  y: num(-5000, 10000),
  width: num(1, 10000),
  height: num(1, 10000),
  rotation: num(-360, 360),
  opacity: num(0, 1),
  locked: z.boolean(),
};

export const textElementSchema = z.object({
  ...base,
  type: z.literal('text'),
  text: safeText(1200),
  font: z.enum(['serif', 'sans']),
  size: num(6, 600),
  weight: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
  italic: z.boolean(),
  color: hex,
  align: z.enum(['left', 'center', 'right']),
  letterSpacing: num(-20, 100),
  lineHeight: num(0.6, 3),
  uppercase: z.boolean(),
  binding: z.object({ menuId: z.string().max(80), field: z.enum(BINDING_FIELDS), sectionId: z.string().max(80).optional() }).nullable(),
});

export const imageElementSchema = z.object({
  ...base,
  type: z.literal('image'),
  asset: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/),
  fit: z.enum(['cover', 'contain']),
  radius: num(0, 2000),
});

export const ornamentElementSchema = z.object({
  ...base,
  type: z.literal('ornament'),
  ornament: z.enum(ORNAMENT_IDS as [OrnamentId, ...OrnamentId[]]),
  color: hex,
  strokeWidth: num(0.2, 20),
});

export const shapeElementSchema = z.object({
  ...base,
  type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line']),
  fill: z.union([hex, z.literal('')]),
  stroke: z.union([hex, z.literal('')]),
  strokeWidth: num(0, 100),
  radius: num(0, 2000),
});

export const logoElementSchema = z.object({
  ...base,
  type: z.literal('logo'),
  color: hex,
  accent: hex,
});

export const designElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  imageElementSchema,
  ornamentElementSchema,
  shapeElementSchema,
  logoElementSchema,
]);

export const designSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  name: safeText(80),
  formatId: z.enum(FORMAT_IDS as [FormatId, ...FormatId[]]),
  width: z.number().int().min(200).max(4000),
  height: z.number().int().min(200).max(4000),
  templateId: z.string().max(40),
  showLogo: z.boolean(),
  background: z.object({
    color: hex,
    gradient: z.object({ to: hex, angle: num(0, 360) }).nullable(),
    image: z.object({ asset: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/), opacity: num(0, 1) }).nullable(),
  }),
  elements: z.array(designElementSchema).max(80),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});

export type Design = z.infer<typeof designSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type TextElement = z.infer<typeof textElementSchema>;

export const THUMB_MAX = 80_000;
export const thumbSchema = z
  .string()
  .max(THUMB_MAX)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Miniatura no válida');

export interface DesignSummary {
  id: string;
  name: string;
  formatId: FormatId;
  width: number;
  height: number;
  updatedAt: string;
  thumb: string;
}

function sectionItems(menu: Menu, kind: string): string[] {
  return menu.sections.filter((s) => s.kind === kind && !s.pending).flatMap((s) => s.items.map((i) => i.name).filter(Boolean));
}

function choiceText(names: string[], joiner: string): string {
  return names.join(`\n${joiner}\n`);
}

/** Valor actual de un dato de menú (solo información confirmada: nunca secciones pendientes). */
export function bindingValue(menu: Menu | undefined, field: BindingField, joiner = 'o', sectionId?: string): string | null {
  if (!menu) return null;
  if (field === 'section') {
    const sec = menu.sections.find((s) => s.id === sectionId && !s.pending);
    const names = sec?.items.map((i) => i.name).filter(Boolean) ?? [];
    if (!sec || !names.length) return null;
    return sec.kind === 'choice' && sec.choose === 1 ? choiceText(names, joiner) : names.join('\n');
  }
  switch (field) {
    case 'name':
      return menu.name;
    case 'nameMain':
      return menu.name.replace(/^men[uú]\s+/i, '');
    case 'price':
      return menu.price.amount === null ? null : formatPrice(menu.price.amount);
    case 'priceUnit':
      return menu.price.unit;
    case 'subtitle':
      return menu.subtitle;
    case 'description':
      return menu.description;
    case 'shared':
      return sectionItems(menu, 'shared').join('\n') || null;
    case 'choice': {
      const groups = menu.sections.filter((s) => s.kind === 'choice' && !s.pending && s.items.some((i) => i.name));
      if (groups.length <= 1) return choiceText(sectionItems(menu, 'choice'), joiner) || null;
      // Varios grupos a elegir (p. ej. Primer y Segundo plato): título de cada grupo y sus opciones.
      return groups.map((g) => `${g.title}: ${g.items.map((i) => i.name).filter(Boolean).join(` ${joiner} `)}`).join('\n');
    }
    case 'dessert':
      return sectionItems(menu, 'dessert').join('\n') || null;
    case 'drink':
      return sectionItems(menu, 'drink').join('\n') || null;
    default:
      return null;
  }
}

/** Valor actual de un texto vinculado. */
export function boundValue(menus: Menu[], binding: { menuId: string; field: BindingField; sectionId?: string }): string | null {
  return bindingValue(
    menus.find((m) => m.id === binding.menuId),
    binding.field,
    'o',
    binding.sectionId,
  );
}

export function displayText(el: TextElement): string {
  return el.uppercase ? el.text.toLocaleUpperCase('es-ES') : el.text;
}
