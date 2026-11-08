/**
 * API del sitio. Tres manejadores independientes (cada uno se despliega como función propia):
 *
 *  Públicos (solo lectura, cacheados en la CDN y purgados al publicar):
 *    GET  /api/content            Contenido publicado (proyección pública).
 *    GET  /api/media/:id[?v=sm]   Imagen subida desde el panel.
 *    GET  /api/health             Comprobación de funcionamiento (lee Blobs).
 *
 *  Administración (requieren usuario de Netlify Identity con rol «admin» + protección CSRF):
 *    GET    /api/admin/session            Usuario actual.
 *    GET    /api/admin/state              Borrador, estado de publicación e imágenes.
 *    PUT    /api/admin/draft              Guardar borrador { content, baseRevision }.
 *    POST   /api/admin/publish            Publicar el borrador { baseRevision }.
 *    GET    /api/admin/preview[?drafts=1] Vista previa del borrador.
 *    GET    /api/admin/history            Versiones publicadas anteriores.
 *    POST   /api/admin/history/restore    Restaurar una versión en el borrador { key, baseRevision }.
 *    POST   /api/admin/media              Subir imagen (multipart).
 *    PATCH  /api/admin/media/:id          Editar texto alternativo / carpeta.
 *    DELETE /api/admin/media/:id          Eliminar imagen (si no está en uso).
 *    GET    /api/admin/designs            Diseños del Estudio Creativo (resumen + miniatura).
 *    GET    /api/admin/designs/:id        Diseño completo.
 *    PUT    /api/admin/designs/:id        Crear o guardar { design, thumb }.
 *    DELETE /api/admin/designs/:id        Eliminar diseño.
 *    /api/admin/signage…                  Pantallas digitales (ver server/signage.ts).
 *
 *  SEO:
 *    GET /sitemap.xml · GET /robots.txt
 */
import type { MediaAsset } from '../shared/schema.ts';
import { buildPublicPayload } from '../shared/public.ts';
import { SEED_MEDIA } from '../shared/media-catalog.ts';
import { contentIssues } from '../shared/completeness.ts';
import { ApiError, errorResponse, json, methodNotAllowed, noStore, readJson } from './http.ts';
import { type AuthResolver, requireAdmin } from './auth.ts';
import { ContentRepo, type KV } from './repo.ts';
import { type BinaryKV, blobKey, findUsages, parseUpload, serveMedia, storeUpload } from './media.ts';
import { DesignRepo } from './designs.ts';
import { type SignageDeps, handleSignageAdmin } from './signage.ts';

export const CONTENT_CACHE_TAG = 'torero-content';

export interface ApiDeps {
  content: KV;
  media: BinaryKV;
  auth: AuthResolver;
  adminEmails: string[];
  allowedOrigins?: string[];
  purge: (tags: string[]) => Promise<void>;
  now?: () => Date;
}

export const publicCacheHeaders = (): Record<string, string> => ({
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=60',
  'Netlify-Cache-Tag': CONTENT_CACHE_TAG,
});

export function createPublicHandler(deps: ApiDeps) {
  const repo = new ContentRepo(deps.content, deps.now);
  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, '');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw methodNotAllowed(['GET']);
      if (path === '/api/content') {
        const [{ content, publishedAt }, uploads] = await Promise.all([repo.readPublicContent(), repo.readMediaIndex()]);
        return json(200, buildPublicPayload(content, uploads, publishedAt), publicCacheHeaders());
      }
      const m = /^\/api\/media\/([a-z0-9-]+)$/.exec(path);
      if (m) return serveMedia(deps.media, m[1], url.searchParams.get('v') === 'sm' ? 'sm' : 'full');
      if (path === '/api/health') {
        const pub = await repo.readPublished();
        return json(200, { ok: true, storage: 'netlify-blobs', published: !!pub, publishedAt: pub?.publishedAt ?? null }, noStore());
      }
      throw new ApiError(404, 'not_found', 'Recurso no encontrado.');
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function signageDepsOf(deps: Pick<ApiDeps, 'content' | 'purge' | 'now'>): SignageDeps {
  const repo = new ContentRepo(deps.content, deps.now);
  return {
    content: deps.content,
    purge: deps.purge,
    now: deps.now,
    readPublished: () => repo.readPublicContent(),
    readUploads: () => repo.readMediaIndex(),
  };
}

export function createAdminHandler(deps: ApiDeps) {
  const repo = new ContentRepo(deps.content, deps.now);
  const designs = new DesignRepo(deps.content);
  const signage = signageDepsOf(deps);

  const knownAssets = async (): Promise<MediaAsset[]> => [...SEED_MEDIA, ...(await repo.readMediaIndex())];

  return async (req: Request): Promise<Response> => {
    try {
      const user = await requireAdmin(req, deps.auth, deps.adminEmails, deps.allowedOrigins);
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/api\/admin/, '').replace(/\/+$/, '') || '/';
      const method = req.method.toUpperCase();
      const who = user.email || user.id;

      if (path === '/session') {
        if (method !== 'GET') throw methodNotAllowed(['GET']);
        return json(200, { user: { email: user.email, roles: user.roles } }, noStore());
      }

      if (path === '/state') {
        if (method !== 'GET') throw methodNotAllowed(['GET']);
        const draft = await repo.ensureDraft(who);
        const [published, uploads] = await Promise.all([repo.readPublished(), repo.readMediaIndex()]);
        const media = [...SEED_MEDIA, ...uploads];
        return json(
          200,
          {
            user: { email: user.email, roles: user.roles },
            draft,
            published: published
              ? {
                  revision: published.revision,
                  sourceRevision: published.sourceRevision,
                  publishedAt: published.publishedAt,
                  publishedBy: published.publishedBy,
                }
              : null,
            hasUnpublishedChanges: !published || published.sourceRevision !== draft.revision,
            media,
            issues: contentIssues(draft.content, new Set(media.map((m) => m.id))),
          },
          noStore(),
        );
      }

      if (path === '/draft') {
        if (method !== 'PUT') throw methodNotAllowed(['PUT']);
        const body = await readJson<{ content?: unknown; baseRevision?: unknown }>(req);
        if (typeof body.baseRevision !== 'number') throw new ApiError(400, 'bad_request', 'Falta la revisión base.');
        const saved = await repo.saveDraft(body.content, body.baseRevision, who);
        const media = await knownAssets();
        return json(
          200,
          {
            draft: { revision: saved.revision, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy },
            issues: contentIssues(saved.content, new Set(media.map((m) => m.id))),
          },
          noStore(),
        );
      }

      if (path === '/publish') {
        if (method !== 'POST') throw methodNotAllowed(['POST']);
        const body = await readJson<{ baseRevision?: unknown }>(req, 10_000);
        if (typeof body.baseRevision !== 'number') throw new ApiError(400, 'bad_request', 'Falta la revisión base.');
        const uploads = await repo.readMediaIndex();
        const pub = await repo.publish(body.baseRevision, who, uploads);
        let cachePurged = true;
        try {
          await deps.purge([CONTENT_CACHE_TAG]);
        } catch (e) {
          cachePurged = false;
          console.warn('[api] No se pudo purgar la caché', e);
        }
        return json(
          200,
          {
            published: { revision: pub.revision, sourceRevision: pub.sourceRevision, publishedAt: pub.publishedAt, publishedBy: pub.publishedBy },
            cachePurged,
          },
          noStore(),
        );
      }

      if (path === '/preview') {
        if (method !== 'GET') throw methodNotAllowed(['GET']);
        const draft = await repo.ensureDraft(who);
        const uploads = await repo.readMediaIndex();
        const includeDrafts = url.searchParams.get('drafts') === '1';
        return json(200, buildPublicPayload(draft.content, uploads, null, { includeDrafts, preview: true }), noStore());
      }

      if (path === '/history') {
        if (method !== 'GET') throw methodNotAllowed(['GET']);
        return json(200, { versions: await repo.listHistory() }, noStore());
      }

      if (path === '/history/restore') {
        if (method !== 'POST') throw methodNotAllowed(['POST']);
        const body = await readJson<{ key?: unknown; baseRevision?: unknown }>(req, 10_000);
        if (typeof body.key !== 'string' || typeof body.baseRevision !== 'number') {
          throw new ApiError(400, 'bad_request', 'Petición de restauración incompleta.');
        }
        const saved = await repo.restoreToDraft(body.key, body.baseRevision, who);
        return json(200, { draft: saved }, noStore());
      }

      if (path === '/media') {
        if (method !== 'POST') throw methodNotAllowed(['POST']);
        const parsed = await parseUpload(req, who);
        await storeUpload(deps.media, parsed);
        await repo.updateMediaIndex((assets) => [parsed.asset, ...assets]);
        return json(201, { asset: parsed.asset }, noStore());
      }

      if (path === '/designs') {
        if (method !== 'GET') throw methodNotAllowed(['GET']);
        return json(200, { designs: await designs.list() }, noStore());
      }
      const dm = /^\/designs\/([a-z0-9-]+)$/.exec(path);
      if (dm) {
        if (method === 'GET') return json(200, { design: await designs.get(dm[1]) }, noStore());
        if (method === 'PUT') {
          const body = await readJson<{ design?: unknown; thumb?: unknown }>(req, 900_000);
          return json(200, { summary: await designs.save(dm[1], body) }, noStore());
        }
        if (method === 'DELETE') {
          await designs.remove(dm[1]);
          return json(200, { deleted: dm[1] }, noStore());
        }
        throw methodNotAllowed(['GET', 'PUT', 'DELETE']);
      }

      const mm = /^\/media\/([a-z0-9-]+)$/.exec(path);
      if (mm) {
        const id = mm[1];
        if (method === 'PATCH') {
          const body = await readJson<{ alt?: unknown; folder?: unknown }>(req, 10_000);
          let found: MediaAsset | undefined;
          await repo.updateMediaIndex((assets) =>
            assets.map((a) => {
              if (a.id !== id) return a;
              found = {
                ...a,
                // eslint-disable-next-line no-control-regex -- saneamiento intencionado de caracteres de control
                alt: typeof body.alt === 'string' ? body.alt.slice(0, 240).replace(/[\u0000-\u001F\u007F]/g, '') : a.alt,
                folder: typeof body.folder === 'string' ? body.folder.slice(0, 30) : a.folder,
              };
              return found;
            }),
          );
          if (!found) throw new ApiError(404, 'not_found', 'Imagen no encontrada.');
          return json(200, { asset: found }, noStore());
        }
        if (method === 'DELETE') {
          if (SEED_MEDIA.some((a) => a.id === id)) {
            throw new ApiError(400, 'static_asset', 'Las imágenes incluidas en el proyecto no se pueden eliminar desde el panel.');
          }
          const draft = await repo.ensureDraft(who);
          const published = await repo.readPublished();
          const usages = findUsages(id, [
            { label: 'borrador', content: draft.content },
            { label: 'web publicada', content: published?.content },
          ]);
          const inDesigns = await designs.usingAsset(id);
          if (inDesigns.length) usages.push(`Estudio: ${inDesigns.slice(0, 3).join(', ')}`);
          if (usages.length) {
            throw new ApiError(409, 'in_use', `La imagen está en uso (${usages.join(' y ')}). Sustitúyela antes de eliminarla.`, usages);
          }
          await repo.updateMediaIndex((assets) => assets.filter((a) => a.id !== id));
          await deps.media.delete(blobKey(id, 'full'));
          await deps.media.delete(blobKey(id, 'sm'));
          return json(200, { deleted: id }, noStore());
        }
        throw methodNotAllowed(['PATCH', 'DELETE']);
      }

      const sig = await handleSignageAdmin(req, path, who, signage);
      if (sig) return sig;

      throw new ApiError(404, 'not_found', 'Recurso no encontrado.');
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function createSeoHandler(deps: Pick<ApiDeps, 'content' | 'now'>) {
  const repo = new ContentRepo(deps.content, deps.now);
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const origin = url.origin;
    if (url.pathname === '/robots.txt') {
      const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /preview\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
      return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      });
    }
    if (url.pathname === '/sitemap.xml') {
      let lastmod = '';
      try {
        const pub = await repo.readPublished();
        if (pub) lastmod = `<lastmod>${pub.publishedAt.slice(0, 10)}</lastmod>`;
      } catch {
        /* sin fecha */
      }
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc>${lastmod}<changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`;
      return new Response(body, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Netlify-Cache-Tag': CONTENT_CACHE_TAG },
      });
    }
    return new Response('Not found', { status: 404 });
  };
}
