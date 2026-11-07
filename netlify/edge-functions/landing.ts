/**
 * Edge Function de la portada: inserta en el HTML el SEO (título, Open Graph, JSON-LD) y el
 * contenido publicado, para que las redes sociales y el primer render vean la información real.
 * Si algo falla, sirve el HTML original y la web carga el contenido desde /api/content.
 */
import type { Context } from '@netlify/edge-functions';
import { getStore } from '@netlify/blobs';
import { buildPublicPayload } from '../../shared/public.ts';
import { injectIntoHtml } from '../../shared/head.ts';
import { createSeedContent } from '../../shared/seed.ts';
import type { SiteContent, MediaAsset } from '../../shared/schema.ts';

export default async (req: Request, context: Context) => {
  const res = await context.next();
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) return res;
  const html = await res.text();
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  try {
    const store = getStore({ name: 'torero-content', consistency: 'strong' });
    const [published, index] = await Promise.all([
      store.get('content/published', { type: 'json' }) as Promise<{ content: SiteContent; publishedAt: string } | null>,
      store.get('media/index', { type: 'json' }) as Promise<{ assets: MediaAsset[] } | null>,
    ]);
    const content = published?.content ?? createSeedContent();
    const payload = buildPublicPayload(content, index?.assets ?? [], published?.publishedAt ?? null);
    const out = injectIntoHtml(html, payload, new URL(req.url).origin);
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('Netlify-CDN-Cache-Control', 'public, durable, s-maxage=300, stale-while-revalidate=60');
    headers.set('Netlify-Cache-Tag', 'torero-content');
    return new Response(out, { status: res.status, headers });
  } catch (err) {
    console.error('[landing] No se pudo inyectar el contenido', err);
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return new Response(html, { status: res.status, headers });
  }
};

// Ruta y caché declaradas en netlify.toml ([[edge_functions]]).
