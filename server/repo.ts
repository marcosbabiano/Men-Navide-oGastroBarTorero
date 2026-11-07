/**
 * Repositorio de contenido sobre Netlify Blobs (store a nivel de sitio → persiste entre despliegues).
 *
 * Claves (store «torero-content»):
 *   content/draft       Borrador editable desde /admin.
 *   content/published   Versión publicada que ve la web.
 *   history/<fecha>     Versiones publicadas anteriores (se conservan las últimas 30).
 *   media/index         Índice de imágenes subidas.
 *
 * Control de conflictos: cada documento lleva un número de revisión. Guardar exige indicar la
 * revisión sobre la que se editó (baseRevision); si otra persona guardó antes → 409.
 * Cuando Blobs devuelve ETag (producción), la escritura además es condicional (onlyIfMatch).
 */
import type { MediaAsset, SiteContent } from '../shared/schema.ts';
import { siteContentSchema, formatIssues } from '../shared/schema.ts';
import { createSeedContent } from '../shared/seed.ts';
import { publishBlockers } from '../shared/completeness.ts';
import { SEED_MEDIA } from '../shared/media-catalog.ts';
import { migrateContent } from '../shared/layout.ts';
import { ApiError } from './http.ts';

/** Subconjunto de la API de `Store` de @netlify/blobs que usamos (facilita las pruebas). */
export interface KV {
  get(key: string, options: { type: 'json'; consistency?: 'strong' | 'eventual' }): Promise<unknown>;
  getWithMetadata(
    key: string,
    options: { type: 'json'; consistency?: 'strong' | 'eventual' },
  ): Promise<{ data: unknown; etag?: string; metadata: Record<string, unknown> } | null>;
  getMetadata(key: string, options?: { consistency?: 'strong' | 'eventual' }): Promise<{ etag?: string; metadata: Record<string, unknown> } | null>;
  setJSON(
    key: string,
    value: unknown,
    options?: { metadata?: Record<string, unknown>; onlyIfNew?: boolean; onlyIfMatch?: string },
  ): Promise<{ modified: boolean; etag?: string } | void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ blobs: { key: string; etag: string }[] }>;
}

export interface StoredDoc {
  content: SiteContent;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

export interface PublishedDoc extends StoredDoc {
  publishedAt: string;
  publishedBy: string;
  sourceRevision: number;
}

export interface HistoryEntry {
  key: string;
  revision: number;
  publishedAt: string;
  publishedBy: string;
}

export const KEYS = {
  draft: 'content/draft',
  published: 'content/published',
  historyPrefix: 'history/',
  mediaIndex: 'media/index',
};

const HISTORY_LIMIT = 30;
const STRONG = { type: 'json' as const, consistency: 'strong' as const };

function wasModified(res: { modified: boolean } | void): boolean {
  return res === undefined ? true : res.modified;
}

export function validateContent(value: unknown): SiteContent {
  const parsed = siteContentSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(422, 'validation', 'Hay campos con errores. Revísalos antes de guardar.', formatIssues(parsed.error));
  }
  return parsed.data;
}

export class ContentRepo {
  constructor(
    private kv: KV,
    private now: () => Date = () => new Date(),
  ) {}

  async readPublished(): Promise<PublishedDoc | null> {
    const doc = (await this.kv.get(KEYS.published, STRONG)) as PublishedDoc | null;
    return doc ? { ...doc, content: migrateContent(doc.content) } : null;
  }

  /** Lectura para la web pública: publicada o, si aún no existe, el contenido inicial. */
  async readPublicContent(): Promise<{ content: SiteContent; publishedAt: string | null }> {
    const pub = await this.readPublished();
    if (pub) return { content: pub.content, publishedAt: pub.publishedAt };
    return { content: createSeedContent(), publishedAt: null };
  }

  private async readDraftRaw(): Promise<{ doc: StoredDoc; etag?: string } | null> {
    const res = await this.kv.getWithMetadata(KEYS.draft, STRONG);
    if (!res || !res.data) return null;
    const doc = res.data as StoredDoc;
    return { doc: { ...doc, content: migrateContent(doc.content) }, etag: res.etag };
  }

  /** Devuelve el borrador, creándolo (sin sobrescribir nunca nada) si no existe. */
  async ensureDraft(user: string): Promise<StoredDoc> {
    const existing = await this.readDraftRaw();
    if (existing) return existing.doc;
    const published = await this.readPublished();
    const initial: StoredDoc = {
      content: published?.content ?? createSeedContent(),
      revision: 1,
      updatedAt: this.now().toISOString(),
      updatedBy: published ? published.publishedBy : `${user} (contenido inicial)`,
    };
    await this.kv.setJSON(KEYS.draft, initial, { onlyIfNew: true });
    const after = await this.readDraftRaw();
    return after?.doc ?? initial;
  }

  async saveDraft(value: unknown, baseRevision: number, user: string): Promise<StoredDoc> {
    const content = validateContent(value);
    await this.ensureDraft(user);
    const current = await this.readDraftRaw();
    if (!current) throw new ApiError(500, 'missing_draft', 'No se pudo leer el borrador.');
    if (current.doc.revision !== baseRevision) {
      throw new ApiError(409, 'conflict', 'Otra persona ha guardado cambios mientras editabas. Recarga para ver la última versión.', {
        revision: current.doc.revision,
        updatedAt: current.doc.updatedAt,
        updatedBy: current.doc.updatedBy,
      });
    }
    const next: StoredDoc = {
      content,
      revision: current.doc.revision + 1,
      updatedAt: this.now().toISOString(),
      updatedBy: user,
    };
    const res = await this.kv.setJSON(KEYS.draft, next, current.etag ? { onlyIfMatch: current.etag } : undefined);
    if (!wasModified(res)) {
      throw new ApiError(409, 'conflict', 'Otra persona ha guardado cambios a la vez. Recarga para ver la última versión.');
    }
    return next;
  }

  async publish(
    baseRevision: number,
    user: string,
    uploads: MediaAsset[],
  ): Promise<PublishedDoc> {
    const draft = await this.readDraftRaw();
    if (!draft) throw new ApiError(409, 'missing_draft', 'No hay borrador que publicar.');
    if (draft.doc.revision !== baseRevision) {
      throw new ApiError(409, 'conflict', 'El borrador ha cambiado desde que lo cargaste. Recarga antes de publicar.', {
        revision: draft.doc.revision,
        updatedBy: draft.doc.updatedBy,
      });
    }
    const content = validateContent(draft.doc.content);
    const known = new Set([...SEED_MEDIA.map((m) => m.id), ...uploads.map((u) => u.id)]);
    const blockers = publishBlockers(content, known);
    if (blockers.length) {
      throw new ApiError(422, 'publish_blocked', 'Hay información obligatoria sin completar.', blockers);
    }
    const previous = await this.readPublished();
    const now = this.now().toISOString();
    if (previous) {
      const key = `${KEYS.historyPrefix}${previous.publishedAt.replace(/[:.]/g, '-')}-r${previous.revision}`;
      await this.kv.setJSON(key, previous, {
        metadata: { revision: previous.revision, publishedAt: previous.publishedAt, publishedBy: previous.publishedBy },
      });
    }
    const doc: PublishedDoc = {
      content,
      revision: (previous?.revision ?? 0) + 1,
      sourceRevision: draft.doc.revision,
      updatedAt: draft.doc.updatedAt,
      updatedBy: draft.doc.updatedBy,
      publishedAt: now,
      publishedBy: user,
    };
    await this.kv.setJSON(KEYS.published, doc);
    await this.pruneHistory();
    return doc;
  }

  async listHistory(): Promise<HistoryEntry[]> {
    const { blobs } = await this.kv.list({ prefix: KEYS.historyPrefix });
    const entries = await Promise.all(
      blobs.map(async (b) => {
        const meta = await this.kv.getMetadata(b.key);
        const m = (meta?.metadata ?? {}) as Partial<HistoryEntry>;
        return {
          key: b.key,
          revision: Number(m.revision ?? 0),
          publishedAt: String(m.publishedAt ?? ''),
          publishedBy: String(m.publishedBy ?? ''),
        };
      }),
    );
    return entries.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  private async pruneHistory(): Promise<void> {
    const { blobs } = await this.kv.list({ prefix: KEYS.historyPrefix });
    const keys = blobs.map((b) => b.key).sort();
    const excess = keys.length - HISTORY_LIMIT;
    for (let i = 0; i < excess; i++) await this.kv.delete(keys[i]);
  }

  /** Restaura una versión anterior en el borrador (no publica: hay que revisarla y publicar). */
  async restoreToDraft(key: string, baseRevision: number, user: string): Promise<StoredDoc> {
    if (!key.startsWith(KEYS.historyPrefix) || key.includes('..')) {
      throw new ApiError(400, 'invalid_key', 'Versión no válida.');
    }
    const doc = (await this.kv.get(key, STRONG)) as PublishedDoc | null;
    if (!doc) throw new ApiError(404, 'not_found', 'Esa versión ya no existe.');
    return this.saveDraft(migrateContent(doc.content), baseRevision, `${user} (restaurado)`);
  }

  async readMediaIndex(): Promise<MediaAsset[]> {
    const idx = (await this.kv.get(KEYS.mediaIndex, STRONG)) as { assets: MediaAsset[] } | null;
    return idx?.assets ?? [];
  }

  /** Modifica el índice de imágenes con reintentos ante escrituras concurrentes. */
  async updateMediaIndex(mutate: (assets: MediaAsset[]) => MediaAsset[]): Promise<MediaAsset[]> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await this.kv.getWithMetadata(KEYS.mediaIndex, STRONG);
      const current = ((res?.data as { assets: MediaAsset[] } | null)?.assets ?? []) as MediaAsset[];
      const next = mutate([...current]);
      const opts = res ? (res.etag ? { onlyIfMatch: res.etag } : undefined) : { onlyIfNew: true };
      const w = await this.kv.setJSON(KEYS.mediaIndex, { assets: next }, opts);
      if (wasModified(w)) return next;
    }
    throw new ApiError(409, 'conflict', 'No se pudo actualizar la biblioteca de imágenes. Inténtalo de nuevo.');
  }
}
