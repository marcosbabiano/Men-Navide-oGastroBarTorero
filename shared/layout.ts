/**
 * Estructura de la landing: secciones del sistema, protecciones y migración de contenidos antiguos.
 */
import type { BuiltinSection, BlockTemplate, CustomBlock, LayoutSection, SiteContent } from './schema.ts';

export const BUILTIN_INFO: Record<BuiltinSection, { label: string; anchor: string; protection: 'locked' | 'no-delete' | 'none'; description: string }> = {
  hero: { label: 'Portada principal', anchor: 'inicio', protection: 'locked', description: 'Titular, botones de menús y reserva.' },
  story: { label: 'Presentación de Navidad', anchor: 'la-navidad', protection: 'none', description: '«La Navidad se comparte».' },
  menus: { label: 'Menús navideños', anchor: 'menus', protection: 'locked', description: 'Menús publicados con precio y botón de reserva.' },
  compare: { label: 'Comparativa de menús', anchor: 'comparar', protection: 'none', description: 'Tabla generada con los menús publicados.' },
  celebration: { label: 'Galería / ambiente', anchor: 'celebrar', protection: 'none', description: '«Una celebración a tu medida».' },
  howTo: { label: 'Proceso de reservas', anchor: 'reservar', protection: 'no-delete', description: 'Pasos para reservar y aviso del menú.' },
  faq: { label: 'Preguntas frecuentes', anchor: 'preguntas', protection: 'none', description: 'Acordeón de preguntas.' },
  about: { label: 'Información del gastrobar', anchor: 'nosotros', protection: 'none', description: 'Texto e imagen sobre el local.' },
};

/** Etiqueta de navegación por defecto según los textos existentes. */
export function defaultNavLabel(type: BuiltinSection, content: Pick<SiteContent, 'texts'>): string {
  const n = content.texts.nav;
  return { hero: '', story: n.story, menus: n.menus, compare: n.compare, celebration: '', howTo: n.howTo, faq: n.faq, about: '' }[type];
}

export function builtinEntry(type: BuiltinSection, content: Pick<SiteContent, 'texts'>, visible = true): LayoutSection {
  return { id: type === 'howTo' ? 'how-to' : type, type, visible, label: BUILTIN_INFO[type].label, navLabel: defaultNavLabel(type, content), block: null };
}

export function defaultLayout(content: Pick<SiteContent, 'texts'>, compareVisible = true): SiteContent['layout'] {
  return {
    sections: (['hero', 'story', 'menus', 'compare', 'celebration', 'howTo', 'faq', 'about'] as BuiltinSection[]).map((t) =>
      builtinEntry(t, content, t === 'compare' ? compareVisible : true),
    ),
  };
}

export const TEMPLATE_INFO: Record<BlockTemplate, { label: string; description: string; images: number }> = {
  'image-text': { label: 'Imagen y texto', description: 'Imagen a la izquierda y texto a la derecha.', images: 1 },
  'text-image': { label: 'Texto e imagen', description: 'Texto a la izquierda e imagen a la derecha.', images: 1 },
  fullbleed: { label: 'Imagen a pantalla completa', description: 'Imagen de fondo con titular superpuesto.', images: 1 },
  gallery: { label: 'Galería', description: 'Composición editorial de 2 a 6 imágenes.', images: 6 },
  quote: { label: 'Texto destacado', description: 'Una frase grande con firma.', images: 0 },
  divider: { label: 'Separador editorial', description: 'Ornamento o frase breve entre secciones.', images: 1 },
  cta: { label: 'Llamada a la acción', description: 'Titular y botón destacado (por defecto, reservar).', images: 0 },
  info: { label: 'Bloque informativo', description: 'Aviso o información práctica con título y texto.', images: 0 },
};

export function newCustomBlock(template: BlockTemplate): CustomBlock {
  const base: CustomBlock = { template, tone: 'dark', eyebrow: '', title: '', subtitle: '', body: '', images: [], cta: { label: '', href: '' } };
  switch (template) {
    case 'quote':
      return { ...base, tone: 'light', title: 'Escribe aquí la frase destacada', subtitle: 'GastroBar Torero' };
    case 'divider':
      return { ...base, tone: 'dark', title: '' };
    case 'cta':
      return { ...base, tone: 'burgundy', title: 'Reserva tu mesa de Navidad', cta: { label: 'Reservar mesa', href: '' } };
    case 'info':
      return { ...base, tone: 'light', eyebrow: 'Información', title: 'Título del aviso', body: 'Escribe aquí la información confirmada.' };
    default:
      return { ...base, title: 'Título de la sección', body: 'Escribe aquí el texto.' };
  }
}

type Raw = Record<string, unknown>;

/**
 * Completa contenidos guardados con versiones anteriores (sin «layout» ni «decor»).
 * No modifica nada que ya exista; solo añade valores por defecto. Es idempotente.
 */
export function migrateContent<T>(raw: T): T {
  if (!raw || typeof raw !== 'object') return raw;
  const c = structuredClone(raw) as unknown as Raw & { texts?: Raw; campaign?: Raw };
  const texts = c.texts as (Raw & { compare?: Raw; nav?: Raw }) | undefined;
  const compareEnabled = texts?.compare && typeof texts.compare.enabled === 'boolean' ? (texts.compare.enabled as boolean) : true;
  if (texts?.compare && 'enabled' in texts.compare) delete texts.compare.enabled;
  if (!c.layout && texts?.nav) c.layout = defaultLayout(c as unknown as Pick<SiteContent, 'texts'>, compareEnabled);
  if (c.campaign && !c.campaign.decor) c.campaign.decor = { heroAccent: null, divider: null, branch: null };
  return c as unknown as T;
}

export function visibleSections(content: SiteContent): LayoutSection[] {
  return content.layout.sections.filter((s) => s.visible);
}

export function sectionAnchor(s: LayoutSection): string {
  return s.type === 'custom' ? `bloque-${s.id}` : BUILTIN_INFO[s.type].anchor;
}
