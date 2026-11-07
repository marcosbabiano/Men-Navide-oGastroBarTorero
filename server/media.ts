/**
 * Imágenes subidas desde el panel (store «torero-media» de Netlify Blobs → persisten entre despliegues).
 *
 * El navegador redimensiona y comprime antes de subir (≤ 2000 px, WebP o JPEG) y envía además una
 * variante pequeña (≈ 800 px). El servidor no confía en el cliente: comprueba la firma binaria del
 * archivo, sus dimensiones reales y el tamaño, y rechaza SVG/HTML u otros formatos.
 */
import { imageSize } from 'image-size';
import type { MediaAsset, SiteContent } from '../shared/schema.ts';
import { MEDIA_FOLDERS } from '../shared/schema.ts';
import { collectImageRefs } from '../shared/public.ts';
import { newId } from '../shared/ids.ts';
import { ApiError } from './http.ts';

export interface BinaryKV {
  get(key: string, options: { type: 'arrayBuffer' }): Promise<ArrayBuffer | null>;
  getWithMetadata(
    key: string,
    options: { type: 'arrayBuffer' },
  ): Promise<{ data: ArrayBuffer; etag?: string; metadata: Record<string, unknown> } | null>;
  set(key: string, data: ArrayBuffer, options?: { metadata?: Record<string, unknown> }): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export const MAX_FILE_BYTES = 4_000_000;
export const MAX_SMALL_BYTES = 1_200_000;
export const MAX_REQUEST_BYTES = 5_600_000; // Límite de payload de Netlify Functions: 6 MB.
const MAX_DIMENSION = 6000;
const ALLOWED: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

export function sniffImageType(buf: Uint8Array): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  const ascii = (o: number, n: number) => String.fromCharCode(...buf.slice(o, o + n));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 4))) return 'image/avif';
  return null;
}

function inspect(buf: Uint8Array, label: string): { type: string; width: number; height: number } {
  const type = sniffImageType(buf);
  if (!type) throw new ApiError(415, 'invalid_image', `${label}: formato no admitido. Usa JPG, PNG, WebP o AVIF.`);
  let dims: { width?: number; height?: number };
  try {
    dims = imageSize(buf);
  } catch {
    throw new ApiError(415, 'invalid_image', `${label}: el archivo está dañado o no es una imagen válida.`);
  }
  const width = dims.width ?? 0;
  const height = dims.height ?? 0;
  if (width < 16 || height < 16 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ApiError(422, 'invalid_dimensions', `${label}: dimensiones no válidas (${width}×${height}).`);
  }
  return { type, width, height };
}

export function blobKey(id: string, variant: 'full' | 'sm'): string {
  return `files/${id}${variant === 'sm' ? '@sm' : ''}`;
}

export async function parseUpload(req: Request, user: string): Promise<{ asset: MediaAsset; full: ArrayBuffer; small: ArrayBuffer | null }> {
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_REQUEST_BYTES) throw new ApiError(413, 'payload_too_large', 'La imagen es demasiado pesada (máx. 4 MB tras la compresión).');
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) throw new ApiError(415, 'unsupported_media_type', 'Se esperaba un formulario multipart.');
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'invalid_form', 'No se pudo leer el formulario de subida.');
  }
  const file = form.get('file');
  const small = form.get('small');
  if (!(file instanceof Blob)) throw new ApiError(400, 'missing_file', 'No se ha recibido ninguna imagen.');
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, 'payload_too_large', 'La imagen supera 4 MB tras la compresión.');
  if (small instanceof Blob && small.size > MAX_SMALL_BYTES) throw new ApiError(413, 'payload_too_large', 'La miniatura es demasiado pesada.');

  const fullBuf = await file.arrayBuffer();
  const fullInfo = inspect(new Uint8Array(fullBuf), 'Imagen');
  let smallBuf: ArrayBuffer | null = null;
  let smallInfo: { type: string; width: number; height: number } | null = null;
  if (small instanceof Blob) {
    smallBuf = await small.arrayBuffer();
    smallInfo = inspect(new Uint8Array(smallBuf), 'Miniatura');
  }

  // eslint-disable-next-line no-control-regex -- saneamiento intencionado de caracteres de control
  const alt = String(form.get('alt') ?? '').slice(0, 240).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const folderRaw = String(form.get('folder') ?? 'otros');
  const folder = (MEDIA_FOLDERS as readonly string[]).includes(folderRaw) ? folderRaw : 'otros';
  const nameHint = String(form.get('name') ?? 'img')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 24);
  const id = newId(nameHint || 'img');
  if (!Object.values(ALLOWED).includes(fullInfo.type)) throw new ApiError(415, 'invalid_image', 'Formato no admitido.');

  const asset: MediaAsset = {
    id,
    kind: 'upload',
    src: `/api/media/${id}`,
    widths: smallInfo ? [smallInfo.width, fullInfo.width] : [fullInfo.width],
    width: fullInfo.width,
    height: fullInfo.height,
    alt,
    folder,
    uploadedAt: new Date().toISOString(),
    uploadedBy: user,
    bytes: fullBuf.byteLength + (smallBuf?.byteLength ?? 0),
    contentType: fullInfo.type,
  };
  return { asset, full: fullBuf, small: smallBuf };
}

export async function storeUpload(kv: BinaryKV, parsed: { asset: MediaAsset; full: ArrayBuffer; small: ArrayBuffer | null }) {
  const { asset } = parsed;
  await kv.set(blobKey(asset.id, 'full'), parsed.full, { metadata: { contentType: asset.contentType } });
  if (parsed.small) {
    const t = sniffImageType(new Uint8Array(parsed.small));
    await kv.set(blobKey(asset.id, 'sm'), parsed.small, { metadata: { contentType: t } });
  }
}

export async function serveMedia(kv: BinaryKV, id: string, variant: 'full' | 'sm'): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(id)) return new Response('Not found', { status: 404 });
  let res = await kv.getWithMetadata(blobKey(id, variant), { type: 'arrayBuffer' });
  if (!res && variant === 'sm') res = await kv.getWithMetadata(blobKey(id, 'full'), { type: 'arrayBuffer' });
  if (!res) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  const sniffed = sniffImageType(new Uint8Array(res.data));
  if (!sniffed) return new Response('Not found', { status: 404 });
  return new Response(res.data, {
    status: 200,
    headers: {
      'Content-Type': sniffed,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-site',
    },
  });
}

/** Dónde se usa una imagen (para impedir borrar imágenes en uso). */
export function findUsages(id: string, docs: { label: string; content: SiteContent | null | undefined }[]): string[] {
  const out: string[] = [];
  for (const d of docs) {
    if (!d.content) continue;
    if (collectImageRefs(d.content).some((r) => r.asset === id)) out.push(d.label);
  }
  return out;
}
