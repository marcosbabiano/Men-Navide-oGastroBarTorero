/**
 * Diseños del Estudio Creativo, guardados en el store «torero-content» de Netlify Blobs:
 *   designs/<id>    Documento completo del diseño (validado).
 *   designs-index   Resumen con miniatura para el listado.
 */
import { designSchema, thumbSchema, type Design, type DesignSummary } from '../shared/studio.ts';
import { formatIssues } from '../shared/schema.ts';
import { ApiError } from './http.ts';
import type { KV } from './repo.ts';

const INDEX = 'designs-index';
const STRONG = { type: 'json' as const, consistency: 'strong' as const };
const key = (id: string) => `designs/${id}`;

export class DesignRepo {
  constructor(private kv: KV) {}

  async list(): Promise<DesignSummary[]> {
    const idx = (await this.kv.get(INDEX, STRONG)) as { items: DesignSummary[] } | null;
    return (idx?.items ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Design> {
    if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new ApiError(400, 'invalid_id', 'Identificador no válido.');
    const d = (await this.kv.get(key(id), STRONG)) as Design | null;
    if (!d) throw new ApiError(404, 'not_found', 'Ese diseño no existe.');
    return d;
  }

  async save(id: string, body: { design?: unknown; thumb?: unknown }): Promise<DesignSummary> {
    const parsed = designSchema.safeParse(body.design);
    if (!parsed.success) throw new ApiError(422, 'validation', 'El diseño tiene datos no válidos.', formatIssues(parsed.error));
    const design = parsed.data;
    if (design.id !== id) throw new ApiError(400, 'bad_request', 'El identificador no coincide.');
    const thumb = thumbSchema.safeParse(body.thumb ?? '');
    if (!thumb.success) throw new ApiError(422, 'validation', 'La miniatura no es válida o es demasiado grande.');
    const doc: Design = { ...design, updatedAt: new Date().toISOString() };
    await this.kv.setJSON(key(id), doc);
    const summary: DesignSummary = { id, name: doc.name, formatId: doc.formatId, width: doc.width, height: doc.height, updatedAt: doc.updatedAt, thumb: thumb.data };
    await this.updateIndex((items) => [summary, ...items.filter((i) => i.id !== id)]);
    return summary;
  }

  /** Nombres de los diseños que usan una imagen (para no romperlos al borrarla). */
  async usingAsset(assetId: string): Promise<string[]> {
    const out: string[] = [];
    for (const sum of await this.list()) {
      const d = (await this.kv.get(key(sum.id), STRONG)) as Design | null;
      if (!d) continue;
      if (d.background.image?.asset === assetId || d.elements.some((e) => e.type === 'image' && e.asset === assetId)) out.push(d.name);
    }
    return out;
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.kv.delete(key(id));
    await this.updateIndex((items) => items.filter((i) => i.id !== id));
  }

  private async updateIndex(mutate: (items: DesignSummary[]) => DesignSummary[]) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await this.kv.getWithMetadata(INDEX, STRONG);
      const items = ((res?.data as { items: DesignSummary[] } | null)?.items ?? []) as DesignSummary[];
      const opts = res ? (res.etag ? { onlyIfMatch: res.etag } : undefined) : { onlyIfNew: true };
      const w = await this.kv.setJSON(INDEX, { items: mutate([...items]).slice(0, 300) }, opts);
      if (w === undefined || w.modified) return;
    }
    throw new ApiError(409, 'conflict', 'No se pudo actualizar la lista de diseños. Inténtalo de nuevo.');
  }
}
