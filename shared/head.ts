/**
 * Inyección de SEO y contenido en el HTML de la landing.
 * Lo usa la Edge Function `landing` en Netlify (y el servidor local de pruebas), de forma que:
 *  - WhatsApp, Instagram, Google… reciben título, descripción, Open Graph y datos estructurados reales.
 *  - La página pinta el contenido publicado en el primer render, sin esperar a la API.
 * Código puro (sin APIs de Node) para poder ejecutarse en Deno (Edge Functions).
 */
import type { PublicPayload } from './public.ts';
import type { MediaAsset, SiteContent } from './schema.ts';
import { interpolate, schemaOpeningHours } from './format.ts';
import { themeToCssVars } from './theme.ts';

export const HEAD_START = '<!--torero:head:start-->';
export const HEAD_END = '<!--torero:head:end-->';
export const DATA_MARK = '<!--torero:data-->';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON seguro dentro de <script>: evita cerrar la etiqueta o inyectar HTML. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function absolute(origin: string, path: string): string {
  try {
    return new URL(path, origin).href;
  } catch {
    return path;
  }
}

function imageUrlFor(asset: MediaAsset | undefined, origin: string, preferWidth = 1280): string | null {
  if (!asset) return null;
  if (asset.kind === 'upload') return absolute(origin, asset.src);
  const w = asset.widths.find((x) => x >= preferWidth) ?? asset.widths[asset.widths.length - 1];
  return absolute(origin, `${asset.src}-${w}.webp`);
}

export function buildStructuredData(content: SiteContent, origin: string, media: Record<string, MediaAsset>) {
  const b = content.business;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BarOrPub',
    name: b.name,
    url: absolute(origin, '/'),
  };
  if (b.description) data.description = b.description;
  const heroUrl = imageUrlFor(media[content.texts.hero.image.asset], origin);
  if (heroUrl) data.image = heroUrl;
  if (b.verified.address) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: b.address.street,
      postalCode: b.address.postalCode,
      addressLocality: b.address.locality,
      addressRegion: b.address.region,
      addressCountry: 'ES',
    };
  }
  if (b.verified.phone && b.phone) data.telephone = b.phone.replace(/\s+/g, ' ');
  if (b.email) data.email = b.email;
  if (b.hours.verified) {
    const spec = schemaOpeningHours(b.hours.weekly);
    if (spec.length) data.openingHoursSpecification = spec;
  }
  const sameAs = Object.values(b.social).filter(Boolean);
  if (sameAs.length) data.sameAs = sameAs;
  if (content.campaign.active && content.menus.length) {
    data.hasMenu = content.menus.map((m) => ({
      '@type': 'Menu',
      name: m.name,
      ...(m.description ? { description: m.description } : {}),
      ...(m.price.amount !== null
        ? { offers: { '@type': 'Offer', price: m.price.amount.toFixed(2), priceCurrency: 'EUR' } }
        : {}),
      hasMenuSection: m.sections.map((s) => ({
        '@type': 'MenuSection',
        name: s.title,
        hasMenuItem: s.items.map((i) => ({ '@type': 'MenuItem', name: i.name })),
      })),
    }));
  }
  if (content.booking.url) data.acceptsReservations = content.booking.url;
  return data;
}

export function buildHead(payload: PublicPayload, origin: string): string {
  const { content, media } = payload;
  const title = interpolate(content.seo.title, content);
  const description = interpolate(content.seo.description, content);
  const url = absolute(origin, '/');
  const og = content.seo.ogImage;
  const ogAsset = og ? media[og.asset] : undefined;
  const ogUrl = ogAsset ? imageUrlFor(ogAsset, origin, 1200) : absolute(origin, '/og-default.jpg');
  const ogAlt = og?.alt || `${content.business.name} · Menús de Navidad ${content.campaign.year}`;
  const ogW = ogAsset ? ogAsset.width : 1200;
  const ogH = ogAsset ? ogAsset.height : 630;
  const fav = content.campaign.favicon ? media[content.campaign.favicon.asset] : undefined;
  const vars = themeToCssVars(content.campaign.theme);
  const css = `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta name="theme-color" content="${escapeHtml(content.campaign.theme.carbon)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="es_ES">`,
    `<meta property="og:site_name" content="${escapeHtml(content.seo.siteName || content.business.name)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(ogUrl ?? '')}">`,
    `<meta property="og:image:width" content="${ogW}">`,
    `<meta property="og:image:height" content="${ogH}">`,
    `<meta property="og:image:alt" content="${escapeHtml(ogAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(ogUrl ?? '')}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(ogAlt)}">`,
    fav
      ? `<link rel="icon" href="${escapeHtml(fav.src)}" type="${escapeHtml(fav.contentType ?? 'image/png')}">`
      : `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<style id="torero-theme">${css}</style>`,
    `<script type="application/ld+json">${safeJson(buildStructuredData(content, origin, media))}</script>`,
  ];
  return tags.join('\n    ');
}

export function injectIntoHtml(html: string, payload: PublicPayload, origin: string): string {
  let out = html;
  const s = out.indexOf(HEAD_START);
  const e = out.indexOf(HEAD_END);
  if (s !== -1 && e > s) {
    out = out.slice(0, s + HEAD_START.length) + '\n    ' + buildHead(payload, origin) + '\n    ' + out.slice(e);
  }
  if (out.includes(DATA_MARK)) {
    // Función de reemplazo: evita que secuencias como «$&» del contenido se interpreten.
    out = out.replace(DATA_MARK, () => `<script id="torero-data" type="application/json">${safeJson(payload)}</script>`);
  }
  return out;
}
