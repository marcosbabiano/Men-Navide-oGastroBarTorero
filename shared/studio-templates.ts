/**
 * Plantillas del Estudio Creativo. Comparten la dirección artística de la landing (paleta de
 * campaña, Fraunces + Manrope, ornamentos de marca) y se adaptan a cualquier formato.
 * Los textos de menú se vinculan a los menús publicados; si un dato no existe, no se incluye.
 */
import type { Menu } from './schema.ts';
import type { ThemeColors } from './theme.ts';
import type { OrnamentId } from './brand.ts';
import { FORMATS, STORY_SAFE, bindingValue, type BindingField, type Design, type DesignElement, type FormatId, type TextElement } from './studio.ts';

export interface TemplateContext {
  menus: Menu[];
  theme: ThemeColors;
  year: number;
  businessName: string;
  heroAsset: string | null;
  photoAsset: string | null;
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  format: FormatId;
  /** Índice del menú publicado que usa por defecto (si aplica). */
  menuIndex?: number;
  build: (ctx: TemplateContext, W: number, H: number, menu?: Menu) => Pick<Design, 'background' | 'elements'>;
}

let seq = 0;
const uid = () => `e${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const common = () => ({ id: uid(), rotation: 0, opacity: 1, locked: false });

type TextOpts = Partial<Omit<TextElement, 'type' | 'id'>> & { text: string; x: number; y: number; width: number };
function text(o: TextOpts): TextElement {
  return {
    ...common(),
    type: 'text',
    height: o.height ?? (o.size ?? 60) * 1.3,
    font: 'serif',
    size: 60,
    weight: 400,
    italic: false,
    color: '#f4ece0',
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.15,
    uppercase: false,
    binding: null,
    ...o,
  };
}
const eyebrow = (o: TextOpts) => text({ font: 'sans', size: 26, weight: 700, letterSpacing: 7, uppercase: true, ...o });

function bound(menu: Menu | undefined, field: BindingField, o: Omit<TextOpts, 'text'>, prefix = ''): TextElement | null {
  const v = bindingValue(menu, field);
  if (!v || !menu) return null;
  return text({ ...o, text: prefix + v, binding: { menuId: menu.id, field } });
}

function orn(ornament: OrnamentId, x: number, y: number, w: number, h: number, color: string, strokeWidth = 2, rotation = 0, opacity = 1): DesignElement {
  return { ...common(), type: 'ornament', ornament, x, y, width: w, height: h, color, strokeWidth, rotation, opacity };
}
function rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; strokeWidth?: number; radius?: number; opacity?: number }): DesignElement {
  return { ...common(), type: 'shape', shape: 'rect', x, y, width: w, height: h, fill: o.fill ?? '', stroke: o.stroke ?? '', strokeWidth: o.strokeWidth ?? 0, radius: o.radius ?? 0, opacity: o.opacity ?? 1 };
}
function line(x: number, y: number, w: number, color: string, strokeWidth = 2): DesignElement {
  return { ...common(), type: 'shape', shape: 'line', x, y, width: w, height: 1, fill: '', stroke: color, strokeWidth, radius: 0 };
}
function logo(x: number, y: number, w: number, color: string, accent: string): DesignElement {
  return { ...common(), type: 'logo', x, y, width: w, height: w * 0.3, color, accent };
}
function image(asset: string | null, x: number, y: number, w: number, h: number, radius = 0): DesignElement[] {
  if (!asset) return [];
  return [{ ...common(), type: 'image', asset, fit: 'cover', x, y, width: w, height: h, radius }];
}
const compact = (list: (DesignElement | null)[]) => list.filter((e): e is DesignElement => !!e);

/** Marco doble dorado característico de la landing. */
function frame(W: number, H: number, inset: number, color: string): DesignElement[] {
  return [rect(inset, inset, W - inset * 2, H - inset * 2, { stroke: color, strokeWidth: 2, opacity: 0.8 }), rect(inset + 14, inset + 14, W - (inset + 14) * 2, H - (inset + 14) * 2, { stroke: color, strokeWidth: 1, opacity: 0.45 })];
}

function menuCard(ctx: TemplateContext, W: number, H: number, menu: Menu | undefined, dark: boolean): Pick<Design, 'background' | 'elements'> {
  const t = ctx.theme;
  const fg = dark ? t.ivory : t.carbon;
  const accent = dark ? t.gold : t.burgundy;
  const m = 110;
  const cw = W - m * 2;
  let y = 170;
  const els: (DesignElement | null)[] = [...frame(W, H, 46, dark ? t.gold : t.burgundy), orn('sprig', W - 290, 70, 220, 220, t.gold, 2, 0, 0.9)];
  els.push(eyebrow({ text: `Navidad ${ctx.year}`, x: m, y, width: cw, color: accent, align: 'left' }));
  y += 70;
  els.push(bound(menu, 'nameMain', { x: m, y, width: cw, size: 140, weight: 300, color: fg, align: 'left', lineHeight: 1 }));
  y += 165;
  els.push(bound(menu, 'subtitle', { x: m, y, width: cw * 0.86, size: 40, italic: true, color: fg, align: 'left', opacity: 0.85 }));
  y += 115;
  els.push(line(m, y, cw, accent, 2));
  y += 34;
  els.push(bound(menu, 'price', { x: m, y, width: cw * 0.6, size: 110, weight: 400, color: accent, align: 'left', lineHeight: 1 }));
  els.push(bound(menu, 'priceUnit', { x: m + cw * 0.5, y: y + 50, width: cw * 0.5, font: 'sans', size: 26, weight: 700, letterSpacing: 5, uppercase: true, color: fg, align: 'right', opacity: 0.8 }));
  y += 140;
  els.push(line(m, y, cw, accent, 2));
  y += 50;
  const shared = bindingValue(menu, 'shared');
  const choice = bindingValue(menu, 'choice');
  const leftW = choice ? cw * 0.56 : cw;
  if (shared) {
    els.push(eyebrow({ text: 'Para compartir', x: m, y, width: leftW, color: accent, align: 'left', size: 22 }));
    els.push(bound(menu, 'shared', { x: m, y: y + 52, width: leftW, size: 36, color: fg, align: 'left', lineHeight: 1.4 }));
  }
  if (choice) {
    const cx = m + (shared ? cw * 0.62 : 0);
    const w = shared ? cw * 0.38 : cw;
    els.push(eyebrow({ text: 'A elegir', x: cx, y, width: w, color: accent, align: 'left', size: 22 }));
    els.push(bound(menu, 'choice', { x: cx, y: y + 52, width: w, size: 36, italic: true, color: fg, align: 'left', lineHeight: 1.3 }));
  }
  els.push(logo(W / 2 - 170, H - 150, 340, fg, t.gold));
  return { background: { color: dark ? '#141012' : t.ivory, gradient: dark ? { to: '#2a1219', angle: 160 } : null, image: null }, elements: compact(els) };
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'anuncio',
    name: 'Anuncio de los menús',
    description: 'Presentación de la campaña con los menús y sus precios.',
    format: 'post',
    build: (ctx, W, H) => {
      const t = ctx.theme;
      const m = 100;
      const els: (DesignElement | null)[] = [
        ...frame(W, H, 46, t.gold),
        orn('corner', 76, 76, 150, 150, t.gold, 2),
        orn('corner', W - 76, H - 76, 150, 150, t.gold, 2, 180),
        orn('star', W / 2 - 22, H * 0.15 - 30, 44, 44, t.gold, 1),
        eyebrow({ text: `Menús de Navidad ${ctx.year}`, x: m, y: H * 0.19, width: W - m * 2, color: t.gold }),
        text({ text: 'Cada encuentro', x: m, y: H * 0.27, width: W - m * 2, size: 118, weight: 300, lineHeight: 1 }),
        text({ text: 'merece algo especial', x: m, y: H * 0.27 + 130, width: W - m * 2, size: 92, weight: 300, italic: true, color: t.gold, lineHeight: 1 }),
        orn('rule', W / 2 - 160, H * 0.27 + 270, 320, 32, t.gold, 1.5),
      ];
      const pub = ctx.menus.slice(0, 3);
      const colW = (W - m * 2) / Math.max(pub.length, 1);
      pub.forEach((menu, i) => {
        const x = m + colW * i;
        els.push(bound(menu, 'nameMain', { x, y: H * 0.6, width: colW, size: 62, italic: true }));
        els.push(bound(menu, 'price', { x, y: H * 0.6 + 82, width: colW, size: 70, color: t.gold }));
      });
      els.push(text({ text: 'Comidas y cenas · Reserva tu mesa', x: m, y: H * 0.76, width: W - m * 2, font: 'sans', size: 32, weight: 500, opacity: 0.85 }));
      els.push(logo(W / 2 - 160, H - 165, 320, t.ivory, t.gold));
      return { background: { color: '#160f12', gradient: { to: t.burgundy, angle: 160 }, image: null }, elements: compact(els) };
    },
  },
  {
    id: 'menu-esencia',
    name: 'Menú I (Esencia)',
    description: 'Ficha del primer menú publicado en papel marfil.',
    format: 'post',
    menuIndex: 0,
    build: (ctx, W, H, menu) => menuCard(ctx, W, H, menu, false),
  },
  {
    id: 'menu-distincion',
    name: 'Menú II (Distinción)',
    description: 'Ficha del segundo menú publicado en negro y oro.',
    format: 'post',
    menuIndex: 1,
    build: (ctx, W, H, menu) => menuCard(ctx, W, H, menu, true),
  },
  {
    id: 'comparativa',
    name: 'Comparación de menús',
    description: 'Los menús publicados frente a frente con su precio y principales.',
    format: 'post',
    build: (ctx, W, H) => {
      const t = ctx.theme;
      const m = 90;
      const pub = ctx.menus.slice(0, 3);
      const colW = (W - m * 2) / Math.max(pub.length, 1);
      const els: (DesignElement | null)[] = [
        ...frame(W, H, 46, t.gold),
        eyebrow({ text: 'Elige tu menú', x: m, y: 150, width: W - m * 2, color: t.gold }),
        text({ text: 'Frente a frente', x: m, y: 210, width: W - m * 2, size: 104, weight: 300, italic: true }),
      ];
      pub.forEach((menu, i) => {
        const x = m + colW * i;
        if (i > 0) els.push(rect(x, 420, 1.5, H - 640, { fill: t.gold, opacity: 0.5 }));
        els.push(bound(menu, 'nameMain', { x: x + 20, y: 430, width: colW - 40, size: 64 }));
        els.push(bound(menu, 'price', { x: x + 20, y: 520, width: colW - 40, size: 76, color: t.gold }));
        const n = (bindingValue(menu, 'shared') ?? '').split('\n').filter(Boolean).length;
        if (n) els.push(text({ text: `${n} entrantes para compartir`, x: x + 20, y: 640, width: colW - 40, font: 'sans', size: 28, weight: 600, opacity: 0.85 }));
        els.push(eyebrow({ text: 'Principal a elegir', x: x + 20, y: 740, width: colW - 40, size: 20, color: t.gold }));
        els.push(bound(menu, 'choice', { x: x + 20, y: 790, width: colW - 40, size: 38, italic: true, lineHeight: 1.25 }));
      });
      els.push(logo(W / 2 - 150, H - 160, 300, t.ivory, t.gold));
      return { background: { color: '#151012', gradient: { to: '#2b141b', angle: 180 }, image: null }, elements: compact(els) };
    },
  },
  {
    id: 'historia-reservas',
    name: 'Historia: ya puedes reservar',
    description: 'Anuncio vertical de apertura de reservas.',
    format: 'story',
    build: (ctx, W, H) => {
      const t = ctx.theme;
      const m = STORY_SAFE.side + 30;
      const top = STORY_SAFE.top;
      const usable = H - STORY_SAFE.top - STORY_SAFE.bottom;
      const at = (f: number) => top + usable * f;
      const els: (DesignElement | null)[] = [
        orn('sprig', -40, top - 160, 400, 400, t.gold, 2, 0, 0.45),
        orn('sprig', W + 40, H - STORY_SAFE.bottom + 140, 400, 400, t.gold, 2, 180, 0.45),
        orn('star', W / 2 - 45, at(0.08), 90, 90, t.gold, 1),
        eyebrow({ text: `Navidad ${ctx.year}`, x: m, y: at(0.2), width: W - m * 2, color: t.gold, size: 30 }),
        text({ text: 'Ya puedes', x: m, y: at(0.26), width: W - m * 2, size: 150, weight: 300, lineHeight: 1 }),
        text({ text: 'reservar', x: m, y: at(0.26) + 160, width: W - m * 2, size: 170, weight: 300, italic: true, color: t.gold, lineHeight: 1 }),
        text({ text: 'tu mesa de Navidad', x: m, y: at(0.26) + 370, width: W - m * 2, size: 64, weight: 300 }),
        orn('rule', W / 2 - 180, at(0.6), 360, 36, t.gold, 1.5),
      ];
      ctx.menus.slice(0, 3).forEach((menu, i) => {
        els.push(bound(menu, 'nameMain', { x: m, y: at(0.66) + i * 120, width: (W - m * 2) * 0.6, size: 64, italic: true, align: 'right' }));
        els.push(bound(menu, 'price', { x: m + (W - m * 2) * 0.65, y: at(0.66) + i * 120, width: (W - m * 2) * 0.35, size: 64, color: t.gold, align: 'left' }));
      });
      els.push(logo(W / 2 - 170, H - STORY_SAFE.bottom - 120, 340, t.ivory, t.gold));
      return { background: { color: t.burgundy, gradient: { to: '#1a0d11', angle: 180 }, image: null }, elements: compact(els) };
    },
  },
  {
    id: 'historia-cta',
    name: 'Historia: llamada a la acción',
    description: 'Imagen de fondo con un mensaje directo para reservar.',
    format: 'story',
    build: (ctx, W, H) => {
      const t = ctx.theme;
      const m = STORY_SAFE.side + 30;
      const els: (DesignElement | null)[] = [
        rect(0, 0, W, H, { fill: '#0e0809', opacity: 0.45 }),
        rect(0, H * 0.45, W, H * 0.55, { fill: '#0e0809', opacity: 0.55 }),
        eyebrow({ text: ctx.businessName, x: m, y: STORY_SAFE.top + 20, width: W - m * 2, color: t.gold }),
        text({ text: '¿Comida o cena', x: m, y: H * 0.5, width: W - m * 2, size: 104, weight: 300, lineHeight: 1 }),
        text({ text: 'de Navidad?', x: m, y: H * 0.5 + 115, width: W - m * 2, size: 104, weight: 300, italic: true, color: t.gold, lineHeight: 1 }),
        text({ text: 'Reserva tu mesa', x: m + 120, y: H - STORY_SAFE.bottom - 210, width: W - (m + 120) * 2, height: 110, font: 'sans', size: 40, weight: 700, letterSpacing: 4, uppercase: true, color: t.carbon }),
        orn('star', W / 2 - 18, H - STORY_SAFE.bottom - 60, 36, 36, t.gold, 1),
      ];
      els.splice(els.length - 2, 0, rect(m + 120, H - STORY_SAFE.bottom - 240, W - (m + 120) * 2, 110, { fill: t.gold, radius: 55 }));
      return { background: { color: '#120c0e', gradient: null, image: ctx.heroAsset ? { asset: ctx.heroAsset, opacity: 1 } : null }, elements: compact(els) };
    },
  },
  {
    id: 'carrusel-portada',
    name: 'Portada de carrusel',
    description: 'Primera diapositiva para presentar los menús.',
    format: 'carousel',
    build: (ctx, W, H) => {
      const t = ctx.theme;
      const m = 100;
      const numerals = ctx.menus.slice(0, 3).map((_, i) => ['I', 'II', 'III'][i]).join(' · ') || 'I · II';
      const els: (DesignElement | null)[] = [
        orn('laurel', W / 2 - 230, 130, 220, 220, t.gold, 2, -20, 0.9),
        orn('laurel', W / 2 + 10, 130, 220, 220, t.gold, 2, 20, 0.9),
        text({ text: numerals, x: m, y: 380, width: W - m * 2, size: 74, italic: true, color: t.gold }),
        text({ text: 'Nuestros menús', x: m, y: 520, width: W - m * 2, size: 128, weight: 300, lineHeight: 1 }),
        text({ text: 'de Navidad', x: m, y: 660, width: W - m * 2, size: 128, weight: 300, italic: true, lineHeight: 1 }),
        text({ text: `Comidas y cenas · ${ctx.year}`, x: m, y: 860, width: W - m * 2, font: 'sans', size: 30, weight: 600, letterSpacing: 5, uppercase: true, opacity: 0.85 }),
        text({ text: 'Desliza  →', x: m, y: H - 230, width: W - m * 2, font: 'sans', size: 30, weight: 700, letterSpacing: 6, uppercase: true, color: t.gold }),
        logo(W / 2 - 150, H - 150, 300, t.ivory, t.gold),
      ];
      return { background: { color: t.carbon, gradient: { to: t.burgundy, angle: 200 }, image: null }, elements: compact(els) };
    },
  },
  {
    id: 'carrusel-plato',
    name: 'Diapositiva gastronómica',
    description: 'Imagen protagonista y los platos del menú.',
    format: 'carousel',
    menuIndex: 0,
    build: (ctx, W, H, menu) => {
      const t = ctx.theme;
      const m = 90;
      const imgH = H * 0.52;
      const els: (DesignElement | null)[] = [
        ...image(ctx.photoAsset, 0, 0, W, imgH),
        rect(0, imgH - 4, W, 4, { fill: t.gold }),
        bound(menu, 'name', { x: m, y: imgH + 60, width: W - m * 2, size: 74, weight: 300, color: t.carbon, align: 'left' }),
        bound(menu, 'price', { x: m, y: imgH + 60, width: W - m * 2, size: 74, color: t.burgundy, align: 'right' }),
        eyebrow({ text: 'Para compartir al centro', x: m, y: imgH + 180, width: W - m * 2, color: t.burgundy, align: 'left', size: 22 }),
        bound(menu, 'shared', { x: m, y: imgH + 225, width: W - m * 2, size: 36, color: t.carbon, align: 'left', lineHeight: 1.3 }),
        text({ text: 'Imagen ilustrativa', x: W - 360, y: imgH - 50, width: 330, font: 'sans', size: 18, weight: 600, letterSpacing: 3, uppercase: true, align: 'right', opacity: 0.8 }),
      ];
      return { background: { color: t.ivory, gradient: null, image: null }, elements: compact(els) };
    },
  },
  {
    id: 'felicitacion',
    name: 'Felicitación navideña',
    description: 'Saludo de temporada con ornamentos.',
    format: 'square',
    build: (ctx, W, H) => {
      const t = ctx.theme;
      const els: (DesignElement | null)[] = [
        ...frame(W, H, 40, t.gold),
        orn('bauble', W / 2 - 45, 120, 90, 150, t.gold, 2),
        orn('laurel', 90, H - 330, 210, 210, t.gold, 2, 0, 0.8),
        orn('laurel', W - 300, H - 330, 210, 210, t.gold, 2, 0, 0.8),
        text({ text: 'Felices', x: 80, y: 330, width: W - 160, size: 140, weight: 300, lineHeight: 1 }),
        text({ text: 'fiestas', x: 80, y: 470, width: W - 160, size: 150, weight: 300, italic: true, color: t.gold, lineHeight: 1 }),
        text({ text: 'Gracias por compartir mesa con nosotros', x: 140, y: 680, width: W - 280, size: 40, italic: true, opacity: 0.85 }),
        logo(W / 2 - 150, H - 170, 300, t.ivory, t.gold),
      ];
      return { background: { color: '#130d0f', gradient: { to: t.burgundy, angle: 135 }, image: null }, elements: compact(els) };
    },
  },
  {
    id: 'promo',
    name: 'Promoción genérica',
    description: 'Titular, texto y botón para cualquier anuncio.',
    format: 'post',
    build: (ctx, W, H) => {
      const t = ctx.theme;
      const m = 110;
      const els: (DesignElement | null)[] = [
        ...frame(W, H, 46, t.burgundy),
        orn('corner', 76, 76, 130, 130, t.burgundy, 2),
        eyebrow({ text: ctx.businessName, x: m, y: 220, width: W - m * 2, color: t.burgundy }),
        text({ text: 'Título de tu promoción', x: m, y: 300, width: W - m * 2, size: 112, weight: 300, color: t.carbon, lineHeight: 1.02 }),
        text({ text: 'Escribe aquí un mensaje breve con información confirmada.', x: m + 40, y: 640, width: W - (m + 40) * 2, font: 'sans', size: 38, weight: 400, color: t.carbon, opacity: 0.85, lineHeight: 1.4 }),
        rect(W / 2 - 230, 880, 460, 100, { fill: t.burgundy, radius: 4 }),
        text({ text: 'Reserva tu mesa', x: W / 2 - 230, y: 912, width: 460, font: 'sans', size: 30, weight: 700, letterSpacing: 4, uppercase: true, color: t.ivory }),
        logo(W / 2 - 150, H - 170, 300, t.carbon, t.burgundy),
      ];
      return { background: { color: t.ivory, gradient: null, image: null }, elements: compact(els) };
    },
  },
];

export function findTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function createDesignFromTemplate(tpl: TemplateDef, ctx: TemplateContext, opts: { formatId?: FormatId; width?: number; height?: number; menu?: Menu; id: string; now: string }): Design {
  const formatId = opts.formatId ?? tpl.format;
  const W = opts.width ?? FORMATS[formatId].width;
  const H = opts.height ?? FORMATS[formatId].height;
  const menu = opts.menu ?? (tpl.menuIndex !== undefined ? ctx.menus[tpl.menuIndex] : undefined);
  const built = tpl.build(ctx, W, H, menu);
  return {
    id: opts.id,
    name: menu && tpl.menuIndex !== undefined ? `${tpl.name.replace(/\s*\(.*\)$/, '')} · ${menu.name}` : tpl.name,
    formatId,
    width: W,
    height: H,
    templateId: tpl.id,
    showLogo: true,
    background: built.background,
    elements: built.elements,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}
