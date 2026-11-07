// Genera las variantes responsive (AVIF + WebP), placeholders LQIP y la imagen social
// a partir de las fotografías fuente. Uso: npm run images
// Las fuentes se guardan en assets-src/ (no versionado). Si faltan, se descargan de Unsplash
// (licencia Unsplash: uso comercial gratuito, sin atribución obligatoria).
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(root, 'assets-src');
const outDir = path.join(root, 'public', 'media', 'seed');
const sources = JSON.parse(await readFile(path.join(root, 'scripts', 'image-sources.json'), 'utf8'));
const WIDTHS = [640, 1280, 1920];

await mkdir(srcDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const exists = (p) => access(p).then(() => true, () => false);

const catalog = [];
for (const s of sources) {
  const file = path.join(srcDir, `${s.id}.jpg`);
  if (!(await exists(file))) {
    const url = `https://images.unsplash.com/photo-${s.unsplash}?w=2400&q=85&fm=jpg`;
    console.log(`Descargando ${s.id} …`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar ${url}: ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const img = sharp(file).rotate();
  const meta = await img.metadata();
  const widths = [...WIDTHS, s.maxWidth ?? 0].filter((w) => w > 0 && w <= meta.width);
  const uniq = [...new Set(widths)].sort((a, b) => a - b);
  for (const w of uniq) {
    const base = sharp(file).rotate().resize({ width: w, withoutEnlargement: true });
    await base.clone().avif({ quality: 52, effort: 5 }).toFile(path.join(outDir, `${s.id}-${w}.avif`));
    await base.clone().webp({ quality: 76, effort: 5 }).toFile(path.join(outDir, `${s.id}-${w}.webp`));
  }
  const lqipBuf = await sharp(file).rotate().resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  catalog.push({
    id: s.id,
    kind: 'static',
    src: `/media/seed/${s.id}`,
    widths: uniq,
    width: meta.width,
    height: meta.height,
    alt: s.alt,
    folder: s.folder,
    position: s.position,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
    credit: 'Fotografía ilustrativa · Unsplash',
    sourceUrl: `https://images.unsplash.com/photo-${s.unsplash}`,
    illustrative: true,
  });
  console.log(`✓ ${s.id} (${uniq.join(', ')})`);
}

// Imagen social por defecto (1200×630, JPG para máxima compatibilidad con WhatsApp/Instagram).
const heroFile = path.join(srcDir, 'hero-ornament.jpg');
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#170f12" stop-opacity=".92"/><stop offset=".62" stop-color="#170f12" stop-opacity=".45"/><stop offset="1" stop-color="#170f12" stop-opacity=".1"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="28" y="28" width="1144" height="574" fill="none" stroke="#c9a96e" stroke-opacity=".7" stroke-width="1.5"/>
  <text x="80" y="170" font-family="Georgia, serif" font-size="26" letter-spacing="6" fill="#c9a96e">GASTROBAR TORERO · NAVIDAD 2026</text>
  <text x="80" y="290" font-family="Georgia, serif" font-size="76" fill="#f6eee3">Cada encuentro</text>
  <text x="80" y="380" font-family="Georgia, serif" font-style="italic" font-size="76" fill="#e2c78f">merece algo especial</text>
  <text x="80" y="480" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#f6eee3" fill-opacity=".85">Menús de Navidad para comidas y cenas</text>
  <text x="80" y="525" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#f6eee3" fill-opacity=".7">Fuenlabrada de los Montes · Badajoz</text>
</svg>`);
await sharp(heroFile)
  .resize(1200, 630, { fit: 'cover', position: 'right' })
  .composite([{ input: overlay }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(path.join(root, 'public', 'og-default.jpg'));

await writeFile(path.join(root, 'shared', 'media-seed.generated.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Catálogo con ${catalog.length} imágenes generado.`);
