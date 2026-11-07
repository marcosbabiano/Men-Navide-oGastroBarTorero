/**
 * Proyección pública del contenido: lo que llega a la web.
 * - Solo menús publicados (o también borradores en la vista previa, si se pide).
 * - Sin notas internas.
 * - Sin secciones pendientes ni vacías (nunca se afirma una inclusión no confirmada).
 * - Sin cantidades pendientes de confirmar.
 * - Sin horario si no está verificado.
 */
import type { ImageRef, MediaAsset, Menu, SiteContent } from './schema.ts';
import { SEED_MEDIA } from './media-catalog.ts';

export interface PublicPayload {
  content: SiteContent;
  media: Record<string, MediaAsset>;
  publishedAt: string | null;
  preview?: boolean;
}

export function visibleMenus(menus: Menu[], includeDrafts = false): Menu[] {
  return menus
    .filter((m) => m.status === 'published' || (includeDrafts && m.status === 'draft'))
    .sort((a, b) => a.order - b.order);
}

export function sanitizeMenu(menu: Menu): Menu {
  return {
    ...menu,
    adminNotes: '',
    sections: menu.sections
      .filter((s) => !s.pending)
      .map((s) => ({
        ...s,
        items: s.items
          .filter((i) => i.name.trim() !== '')
          .map((i) => ({ ...i, quantity: i.quantityPending ? '' : i.quantity, quantityPending: false })),
      }))
      .filter((s) => s.items.length > 0),
  };
}

export function toPublicContent(content: SiteContent, opts: { includeDrafts?: boolean } = {}): SiteContent {
  const hours = content.business.hours;
  return {
    ...content,
    menus: visibleMenus(content.menus, opts.includeDrafts).map(sanitizeMenu),
    business: {
      ...content.business,
      hours: hours.verified
        ? hours
        : { ...hours, weekly: hours.weekly.map((d) => ({ ...d, ranges: [], closed: false })), specials: [] },
    },
  };
}

/** Recorre todas las referencias a imágenes del contenido. */
export function collectImageRefs(content: SiteContent): ImageRef[] {
  const refs: (ImageRef | null)[] = [
    content.campaign.logo,
    content.campaign.favicon,
    content.seo.ogImage,
    content.texts.hero.image,
    ...content.texts.story.images,
    ...content.texts.celebration.images,
    content.texts.about.image,
  ];
  for (const m of content.menus) refs.push(m.image, ...m.gallery);
  return refs.filter((r): r is ImageRef => !!r);
}

export function buildMediaMap(content: SiteContent, uploads: MediaAsset[]): Record<string, MediaAsset> {
  const all = new Map<string, MediaAsset>();
  for (const a of SEED_MEDIA) all.set(a.id, a);
  for (const a of uploads) all.set(a.id, a);
  const out: Record<string, MediaAsset> = {};
  for (const ref of collectImageRefs(content)) {
    const a = all.get(ref.asset);
    if (a) out[a.id] = a;
  }
  return out;
}

export function buildPublicPayload(
  content: SiteContent,
  uploads: MediaAsset[],
  publishedAt: string | null,
  opts: { includeDrafts?: boolean; preview?: boolean } = {},
): PublicPayload {
  const pub = toPublicContent(content, opts);
  return { content: pub, media: buildMediaMap(pub, uploads), publishedAt, ...(opts.preview ? { preview: true } : {}) };
}
