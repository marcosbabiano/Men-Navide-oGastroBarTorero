/**
 * Prepara las imágenes en el navegador antes de subirlas:
 *  - Corrige la orientación, redimensiona (≤ 2000 px) y comprime a WebP (o JPEG si el navegador no codifica WebP).
 *  - Genera una variante pequeña (≈ 800 px) para móviles.
 *  - Imagen social: recorte exacto 1200×630 en JPEG (máxima compatibilidad con WhatsApp/Facebook).
 * Así cada subida pesa normalmente entre 150 y 600 KB, muy por debajo del límite de las funciones (6 MB).
 */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3_800_000;

export interface Processed {
  full: Blob;
  small: Blob;
  width: number;
  height: number;
  type: string;
}

async function decode(file: File): Promise<ImageBitmap> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('La imagen original supera 25 MB. Reduce su tamaño antes de subirla.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  if (file.type === 'image/svg+xml') throw new Error('Por seguridad no se admiten imágenes SVG. Usa PNG, JPG o WebP.');
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No se ha podido leer la imagen. Prueba a exportarla como JPG o PNG.');
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen.'))), type, quality),
  );
}

async function encode(canvas: HTMLCanvasElement, prefer: 'webp' | 'jpeg' | 'png'): Promise<Blob> {
  if (prefer === 'png') return toBlob(canvas, 'image/png', 1);
  let quality = 0.84;
  for (let i = 0; i < 5; i++) {
    let blob = prefer === 'webp' ? await toBlob(canvas, 'image/webp', quality) : await toBlob(canvas, 'image/jpeg', quality);
    // Safari antiguo devuelve PNG si no sabe codificar WebP: se usa JPEG.
    if (prefer === 'webp' && blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
    if (blob.size <= MAX_OUTPUT_BYTES) return blob;
    quality -= 0.12;
  }
  throw new Error('La imagen sigue siendo demasiado pesada tras comprimirla.');
}

function draw(bitmap: ImageBitmap, w: number, h: number, crop?: { sx: number; sy: number; sw: number; sh: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite procesar imágenes.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (crop) ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
  else ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function fit(w: number, h: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export async function processImage(file: File, mode: 'photo' | 'social' | 'icon' = 'photo'): Promise<Processed> {
  const bitmap = await decode(file);
  try {
    if (mode === 'social') {
      const targetRatio = 1200 / 630;
      const srcRatio = bitmap.width / bitmap.height;
      const sw = srcRatio > targetRatio ? bitmap.height * targetRatio : bitmap.width;
      const sh = srcRatio > targetRatio ? bitmap.height : bitmap.width / targetRatio;
      const crop = { sx: (bitmap.width - sw) / 2, sy: (bitmap.height - sh) / 2, sw, sh };
      const full = await encode(draw(bitmap, 1200, 630, crop), 'jpeg');
      const small = await encode(draw(bitmap, 600, 315, crop), 'jpeg');
      return { full, small, width: 1200, height: 630, type: full.type };
    }
    if (mode === 'icon') {
      const side = Math.min(bitmap.width, bitmap.height);
      const crop = { sx: (bitmap.width - side) / 2, sy: (bitmap.height - side) / 2, sw: side, sh: side };
      const full = await encode(draw(bitmap, 512, 512, crop), 'png');
      const small = await encode(draw(bitmap, 64, 64, crop), 'png');
      return { full, small, width: 512, height: 512, type: 'image/png' };
    }
    const big = fit(bitmap.width, bitmap.height, 2000);
    const sm = fit(bitmap.width, bitmap.height, 800);
    const full = await encode(draw(bitmap, big.w, big.h), 'webp');
    const small = await encode(draw(bitmap, sm.w, sm.h), 'webp');
    return { full, small, width: big.w, height: big.h, type: full.type };
  } finally {
    bitmap.close();
  }
}

export function formatBytes(n: number | undefined): string {
  if (!n) return '—';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
