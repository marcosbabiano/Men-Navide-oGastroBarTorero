/**
 * Catálogo de imágenes incluidas en el proyecto (fotografía ilustrativa con licencia Unsplash).
 * Las imágenes subidas desde /admin se guardan en Netlify Blobs y se añaden a este catálogo en tiempo de ejecución.
 */
import type { MediaAsset } from './schema.ts';
import seed from './media-seed.generated.json' with { type: 'json' };

export const SEED_MEDIA: MediaAsset[] = seed as MediaAsset[];

export const SEED_MEDIA_IDS = new Set(SEED_MEDIA.map((m) => m.id));

export function findSeedAsset(id: string): MediaAsset | undefined {
  return SEED_MEDIA.find((m) => m.id === id);
}

/** URL de una variante concreta de una imagen. */
export function assetUrl(asset: MediaAsset, width: number, format: 'avif' | 'webp' = 'webp'): string {
  if (asset.kind === 'static') return `${asset.src}-${width}.${format}`;
  // Subidas: dos variantes (sm ≈ 800 px y original ≤ 2000 px), siempre WebP.
  return width <= 900 ? `${asset.src}?v=sm` : asset.src;
}

export function largestWidth(asset: MediaAsset): number {
  return asset.widths[asset.widths.length - 1] ?? asset.width;
}
