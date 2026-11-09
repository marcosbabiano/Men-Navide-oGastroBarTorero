/**
 * Colección de ilustraciones propias (noviembre de 2026) que sustituye a la fotografía de stock.
 * Se aplica una sola vez a cada contenido guardado y SOLO donde sigue la imagen de stock original:
 * si una imagen se cambió desde el panel, se respeta. La foto de la barra («Sobre nosotros») se conserva.
 */
import type { ImageRef, SiteContent } from './schema.ts';

export const PATCH_ART_2026_11 = 'arte-2026-11-ilustraciones';

const ref = (asset: string, alt: string): ImageRef => ({ asset, alt });
export const ART = {
  portada: ref('arte-portada', 'Mesa navideña con copas de vino, vela y plato dorado sobre terciopelo granate'),
  acento: ref('arte-acento', 'Copa de champán dorada con cinta y ramas de abeto'),
  separador: ref('arte-separador', 'Separador dorado con estrella y hojas'),
  rama: ref('arte-rama', 'Rama de abeto dorada con acebo, cinta y bolas granates'),
  comparte: ref('arte-navidad-comparte', 'Manos brindando con vino tinto y cava alrededor de la mesa'),
  detalle: ref('arte-navidad-detalle', 'Servilleta granate con ramita de abeto y estrella dorada sobre un plato'),
  esencia: ref('arte-menu-esencia', 'Mesa de Navidad para compartir con tabla, platos y copas sobre mantel granate'),
  distincion: ref('arte-menu-distincion', 'Campana dorada, copa de vino y cubiertos sobre terciopelo oscuro'),
  celebracion: ref('arte-celebracion', 'Comedor navideño con mesa larga, velas y chimenea'),
  gourmet: ref('arte-menu-gourmet', 'Campana dorada, alcachofa y copa de vino sobre terciopelo granate'),
};

/** Sustituye una imagen solo si sigue siendo la de stock indicada (o está vacía, si se permite). */
function swap(cur: ImageRef | null | undefined, stock: string | null, next: ImageRef): ImageRef | null | undefined {
  if (stock === null) return cur ? cur : { ...next };
  return cur?.asset === stock ? { ...next } : cur;
}

export function applyArtPatch2026(c: SiteContent) {
  if (c.patches.includes(PATCH_ART_2026_11)) return;
  const t = c.texts;
  t.hero.image = swap(t.hero.image, 'hero-ornament', ART.portada) as ImageRef;
  const st = [['toast-red', ART.comparte], ['pine-branch', ART.detalle]] as const;
  st.forEach(([old, next], i) => {
    if (t.story.images[i]) t.story.images[i] = swap(t.story.images[i], old, next) as ImageRef;
  });
  const cel = [['long-table', ART.celebracion], ['friends-toast', ART.detalle], ['gold-ornament', ART.acento]] as const;
  cel.forEach(([old, next], i) => {
    if (t.celebration.images[i]) t.celebration.images[i] = swap(t.celebration.images[i], old, next) as ImageRef;
  });
  const d = c.campaign.decor;
  d.heroAccent = swap(d.heroAccent, null, ART.acento) ?? null;
  d.divider = swap(d.divider, null, ART.separador) ?? null;
  d.branch = swap(d.branch, null, ART.rama) ?? null;
  const menus: [string, string | null, ImageRef, string[]][] = [
    ['menu-esencia', 'sliced-meat', ART.esencia, ['cheese', 'chocolate-cake']],
    ['menu-distincion', 'steak', ART.distincion, ['prawns', 'champagne']],
    ['menu-seleccion-gourmet', null, ART.gourmet, []],
  ];
  for (const [id, old, next, gallery] of menus) {
    const m = c.menus.find((x) => x.id === id);
    if (!m) continue;
    m.image = swap(m.image, old, next) ?? null;
    // Galería: se retiran solo las fotos de stock originales.
    if (gallery.length) m.gallery = m.gallery.filter((g) => !gallery.includes(g.asset));
  }
  c.patches.push(PATCH_ART_2026_11);
}
