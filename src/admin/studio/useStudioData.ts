import { useEffect, useMemo, useState } from 'react';
import type { MediaAsset, Menu } from '../../../shared/schema.ts';
import type { TemplateContext } from '../../../shared/studio-templates.ts';
import { sanitizeMenu } from '../../../shared/public.ts';
import { useStore } from '../store.tsx';
import { loadBrandFonts } from './DesignCanvas.tsx';

/**
 * Datos que usa el Estudio: menús con los datos ACTUALES del panel (publicados, y también los
 * que están en borrador, como un menú nuevo aún sin publicar), sin notas internas ni secciones o
 * cantidades pendientes; paleta de campaña, logotipo y la biblioteca de imágenes existente.
 */
export function useStudioData() {
  const { content, media } = useStore();
  const [fontsReady, setFontsReady] = useState(false);
  const error = '';
  const menus = useMemo<Menu[]>(
    () =>
      [...content.menus]
        .sort((a, b) => (a.status === 'published' ? 0 : 1) - (b.status === 'published' ? 0 : 1) || a.order - b.order)
        .map(sanitizeMenu),
    [content.menus],
  );

  useEffect(() => {
    let alive = true;
    loadBrandFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const mediaMap = useMemo(() => new Map<string, MediaAsset>(media.map((m) => [m.id, m])), [media]);
  const logo = content.campaign.logo ? mediaMap.get(content.campaign.logo.asset) : undefined;

  const ctx: TemplateContext | null = fontsReady
    ? {
        menus,
        theme: content.campaign.theme,
        year: content.campaign.year,
        businessName: content.business.name,
        heroAsset: content.texts.hero.image.asset,
        photoAsset: menus[0]?.image?.asset ?? content.texts.celebration.images[0]?.asset ?? null,
      }
    : null;

  return { ready: fontsReady, menus, ctx, mediaMap, logo, theme: content.campaign.theme, error };
}
