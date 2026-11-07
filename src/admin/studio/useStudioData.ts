import { useEffect, useMemo, useState } from 'react';
import type { MediaAsset, Menu } from '../../../shared/schema.ts';
import type { TemplateContext } from '../../../shared/studio-templates.ts';
import type { PublicPayload } from '../../../shared/public.ts';
import { useStore } from '../store.tsx';
import { loadBrandFonts } from './DesignCanvas.tsx';

/**
 * Datos que usa el Estudio: menús PUBLICADOS (los que ve el cliente), paleta de campaña,
 * logotipo y la biblioteca de imágenes del gestor existente.
 */
export function useStudioData() {
  const { content, media } = useStore();
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/content', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<PublicPayload>) : Promise.reject(new Error(`Error ${r.status}`))))
      .then((p) => alive && setMenus(p.content.menus))
      .catch(() => {
        if (!alive) return;
        setError('No se han podido cargar los menús publicados.');
        setMenus([]);
      });
    loadBrandFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const mediaMap = useMemo(() => new Map<string, MediaAsset>(media.map((m) => [m.id, m])), [media]);
  const logo = content.campaign.logo ? mediaMap.get(content.campaign.logo.asset) : undefined;

  const ctx: TemplateContext | null = menus
    ? {
        menus,
        theme: content.campaign.theme,
        year: content.campaign.year,
        businessName: content.business.name,
        heroAsset: content.texts.hero.image.asset,
        photoAsset: menus[0]?.image?.asset ?? content.texts.celebration.images[0]?.asset ?? null,
      }
    : null;

  return { ready: !!menus && fontsReady, menus: menus ?? [], ctx, mediaMap, logo, theme: content.campaign.theme, error };
}
