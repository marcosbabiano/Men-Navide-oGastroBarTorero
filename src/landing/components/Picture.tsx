import { useState } from 'react';
import type { ImageRef, MediaAsset } from '../../../shared/schema.ts';
import { assetUrl } from '../../../shared/media-catalog.ts';
import { useContent } from '../ContentContext.tsx';
import { Star } from './Ornament.tsx';

interface Props {
  image: ImageRef | null | undefined;
  sizes: string;
  className?: string;
  priority?: boolean;
  /** Imagen ampliada para efectos de parallax. */
  parallax?: number;
  /** Si es decorativa, alt vacío. */
  decorative?: boolean;
}

function srcSet(asset: MediaAsset, format: 'avif' | 'webp'): string {
  if (asset.kind === 'upload') {
    return asset.widths.length > 1
      ? `${asset.src}?v=sm ${asset.widths[0]}w, ${asset.src} ${asset.widths[asset.widths.length - 1]}w`
      : `${asset.src} ${asset.width}w`;
  }
  return asset.widths.map((w) => `${assetUrl(asset, w, format)} ${w}w`).join(', ');
}

/**
 * Imagen responsive (AVIF/WebP) con marcador de baja resolución.
 * Si la imagen no existe, muestra un fondo decorativo (nunca una imagen rota).
 */
export function Picture({ image, sizes, className = '', priority = false, parallax, decorative = false }: Props) {
  const { media } = useContent();
  const [loaded, setLoaded] = useState(false);
  const asset = image ? media[image.asset] : undefined;

  if (!asset) {
    return (
      <div className={`pic pic--fallback ${className}`} aria-hidden="true">
        <Star className="pic__fallback-star" size={42} />
      </div>
    );
  }
  const alt = decorative ? '' : (image?.alt || asset.alt || '');
  const fallbackWidth = asset.kind === 'static' ? (asset.widths.find((w) => w >= 1280) ?? asset.widths[asset.widths.length - 1]) : asset.width;
  return (
    <div
      className={`pic ${loaded ? 'is-loaded' : ''} ${className}`}
      style={asset.lqip ? { backgroundImage: `url("${asset.lqip}")` } : undefined}
    >
      <picture>
        {asset.kind === 'static' && <source type="image/avif" srcSet={srcSet(asset, 'avif')} sizes={sizes} />}
        <source type="image/webp" srcSet={srcSet(asset, 'webp')} sizes={sizes} />
        <img
          src={assetUrl(asset, fallbackWidth, 'webp')}
          alt={alt}
          width={asset.width}
          height={asset.height}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)}
          ref={(el) => {
            if (el?.complete && el.naturalWidth && !loaded) setLoaded(true);
          }}
          style={{ objectPosition: asset.position ?? '50% 50%' }}
          data-parallax={parallax}
          draggable={false}
        />
      </picture>
    </div>
  );
}
