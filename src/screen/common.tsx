import { Fragment, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import type { ImageRef, SiteContent } from '../../shared/schema.ts';
import type { Scene } from '../../shared/signage.ts';
import { imageUrl, type SceneData } from './engine.ts';

export type RenderQuality = 'high' | 'balanced' | 'low';

export interface SceneProps<T extends Scene['type'] = Scene['type']> {
  scene: Extract<Scene, { type: T }>;
  data: SceneData;
  /** Paso actual (menús y fotografías avanzan por pasos). */
  step: number;
  /** La capa es visible (las animaciones solo arrancan entonces). */
  live: boolean;
  paused: boolean;
  quality: RenderQuality;
  at: Date;
}

/** Imagen a sangre con encuadre del punto focal de la biblioteca. */
export function Photo({ image, data, className = '', width = 1920, style }: { image: ImageRef | null | undefined; data: SceneData; className?: string; width?: number; style?: React.CSSProperties }) {
  const asset = image ? data.media[image.asset] : undefined;
  const src = imageUrl(asset, width);
  if (!asset || !src) return <div className={`sc-photo sc-photo--empty ${className}`} aria-hidden="true" />;
  return (
    <img
      className={`sc-photo ${className}`}
      src={src}
      alt={image?.alt || asset.alt || ''}
      width={asset.width}
      height={asset.height}
      decoding="async"
      draggable={false}
      style={{ objectPosition: asset.position ?? '50% 50%', ...style }}
    />
  );
}

/** Logotipo: imagen de Campaña (nunca se deforma: object-fit contain) o tratamiento tipográfico. */
export function Logo({ content, data, scale = 1, className = '' }: { content: SiteContent; data: SceneData; scale?: number; className?: string }) {
  const logo = content.campaign.logo;
  const asset = logo ? data.media[logo.asset] : undefined;
  if (logo && asset) {
    return (
      <div className={`sc-logo sc-logo--img ${className}`} style={{ width: 900 * scale, height: 420 * scale }}>
        <img src={imageUrl(asset, 1280) ?? ''} alt={logo.alt || content.business.name} draggable={false} />
      </div>
    );
  }
  const parts = content.business.name.trim().split(/\s+/);
  const big = parts.length > 1 ? parts[parts.length - 1] : content.business.name;
  const small = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  return (
    <div className={`sc-logo sc-logo--type ${className}`} style={{ fontSize: 110 * scale }} role="img" aria-label={content.business.name}>
      {small && <span className="sc-logo__small">{small}</span>}
      <span className="sc-logo__big">{big}</span>
      <span className="sc-logo__rule" aria-hidden="true" />
    </div>
  );
}

/** Código QR en SVG (generado localmente, sin servicios externos). */
export function Qr({ value, size = 300, label }: { value: string; size?: number; label: string }) {
  const svg = useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      let path = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path += `M${x + 2},${y + 2}h1v1h-1z`;
      return { n: n + 4, path };
    } catch {
      return null;
    }
  }, [value]);
  if (!svg) return null;
  return (
    <svg className="sc-qr" width={size} height={size} viewBox={`0 0 ${svg.n} ${svg.n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={svg.n} height={svg.n} fill="#fff" />
      <path d={svg.path} fill="#14100f" />
    </svg>
  );
}

export function Star({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0l2.4 9.6L24 12l-9.6 2.4L12 24l-2.4-9.6L0 12l9.6-2.4z" fill="currentColor" />
    </svg>
  );
}

/** Divide un texto en letras animables (con espacios conservados). */
export function Letters({ text, baseDelay = 0, step = 0.045 }: { text: string; baseDelay?: number; step?: number }) {
  let i = 0;
  return (
    <span className="sc-letters" aria-label={text}>
      {text.split(' ').map((word, w) => (
        <Fragment key={w}>
          {w > 0 && ' '}
          <span className="sc-letters__word" aria-hidden="true">
            {[...word].map((ch) => (
              <span className="sc-letter" key={i} style={{ animationDelay: `${baseDelay + i++ * step}s` }}>
                {ch}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** Copos/destellos decorativos deterministas (CSS, sin JS por fotograma). */
export function Sparkles({ count = 28, seed = 1 }: { count?: number; seed?: number }) {
  const items = useMemo(() => {
    let s = seed * 9301;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: count }, (_, i) => ({ i, x: rnd() * 100, y: rnd() * 100, d: 6 + rnd() * 10, delay: -rnd() * 16, size: 3 + rnd() * 7, o: 0.25 + rnd() * 0.5 }));
  }, [count, seed]);
  return (
    <div className="sc-sparkles" aria-hidden="true">
      {items.map((p) => (
        <span key={p.i} style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, opacity: p.o, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  );
}
