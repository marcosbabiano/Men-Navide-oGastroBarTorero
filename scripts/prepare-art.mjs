// Integra la colección de ilustraciones propias (generadas con ChatGPT a partir de
// docs/PROMPT-MAESTRO-CHATGPT.md). Fuentes en assets-src/arte/pieza-N.png (no versionadas).
// Genera variantes AVIF/WebP (con transparencia en los ornamentos), LQIP y la imagen social,
// y añade/actualiza las entradas en shared/media-seed.generated.json. Uso: node scripts/prepare-art.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = (n) => path.join(root, 'assets-src', 'arte', `pieza-${n}.png`);
const outDir = path.join(root, 'public', 'media', 'seed');
const catalogFile = path.join(root, 'shared', 'media-seed.generated.json');

export const ART = [
  { n: 1, id: 'arte-portada', folder: 'portada', position: '70% 50%', alt: 'Ilustración de mesa navideña con copas de vino, vela y plato dorado sobre terciopelo granate' },
  { n: 2, id: 'arte-acento', folder: 'ornamentos', position: '50% 50%', alt: 'Copa de champán dorada con cinta y ramas de abeto', alpha: true },
  { n: 3, id: 'arte-separador', folder: 'ornamentos', position: '50% 50%', alt: 'Separador dorado con estrella y hojas', alpha: true },
  { n: 4, id: 'arte-rama', folder: 'ornamentos', position: '50% 50%', alt: 'Rama de abeto dorada con acebo, cinta y bolas granates', alpha: true },
  { n: 5, id: 'arte-navidad-comparte', folder: 'ilustraciones', position: '50% 50%', alt: 'Ilustración de manos brindando con vino tinto y cava alrededor de la mesa' },
  { n: 6, id: 'arte-navidad-detalle', folder: 'ilustraciones', position: '50% 45%', alt: 'Servilleta granate con ramita de abeto y estrella dorada sobre un plato' },
  { n: 7, id: 'arte-menu-esencia', folder: 'platos', position: '50% 50%', alt: 'Ilustración de mesa de Navidad para compartir con tabla, platos y copas sobre mantel granate' },
  { n: 8, id: 'arte-menu-distincion', folder: 'platos', position: '60% 45%', alt: 'Ilustración de campana dorada, copa de vino y cubiertos sobre terciopelo oscuro' },
  { n: 9, id: 'arte-celebracion', folder: 'ambiente', position: '50% 50%', alt: 'Ilustración de un comedor navideño con mesa larga, velas y chimenea' },
  { n: 11, id: 'arte-papel-marfil', folder: 'texturas', position: '50% 50%', alt: 'Textura de papel marfil' },
  { n: 12, id: 'arte-menu-gourmet', folder: 'platos', position: '55% 50%', alt: 'Ilustración de campana dorada, alcachofa y copa de vino sobre terciopelo granate' },
];

const WIDTHS = [640, 1280, 1920];
const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));

for (const a of ART) {
  const meta = await sharp(src(a.n)).metadata();
  const widths = [...new Set([...WIDTHS.filter((w) => w < meta.width), Math.min(meta.width, 2400)])].sort((x, y) => x - y);
  for (const w of widths) {
    const base = sharp(src(a.n)).resize({ width: w, withoutEnlargement: true });
    const img = a.alpha ? base : base.flatten({ background: '#140c0d' });
    await img.clone().avif({ quality: a.alpha ? 60 : 55, effort: 5 }).toFile(path.join(outDir, `${a.id}-${w}.avif`));
    await img.clone().webp({ quality: a.alpha ? 82 : 80, effort: 5, alphaQuality: 90 }).toFile(path.join(outDir, `${a.id}-${w}.webp`));
  }
  const lqip = a.alpha ? undefined : `data:image/webp;base64,${(await sharp(src(a.n)).resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer()).toString('base64')}`;
  const entry = {
    id: a.id,
    kind: 'static',
    src: `/media/seed/${a.id}`,
    widths,
    width: meta.width,
    height: meta.height,
    alt: a.alt,
    folder: a.folder,
    position: a.position,
    ...(lqip ? { lqip } : {}),
    credit: 'Ilustración propia de GastroBar Torero (generada con IA)',
    illustrative: true,
  };
  const i = catalog.findIndex((c) => c.id === a.id);
  if (i >= 0) catalog[i] = entry;
  else catalog.push(entry);
  console.log(`✓ ${a.id} (${widths.join(', ')})`);
}

// Imagen social 1200×630 a partir del bodegón de portada.
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#170f12" stop-opacity=".94"/><stop offset=".55" stop-color="#170f12" stop-opacity=".5"/><stop offset="1" stop-color="#170f12" stop-opacity="0"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="28" y="28" width="1144" height="574" fill="none" stroke="#c9a96e" stroke-opacity=".7" stroke-width="1.5"/>
  <text x="80" y="170" font-family="Georgia, serif" font-size="26" letter-spacing="6" fill="#c9a96e">GASTROBAR TORERO · NAVIDAD 2026</text>
  <text x="80" y="290" font-family="Georgia, serif" font-size="76" fill="#f6eee3">Cada encuentro</text>
  <text x="80" y="380" font-family="Georgia, serif" font-style="italic" font-size="76" fill="#e2c78f">merece algo especial</text>
  <text x="80" y="480" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#f6eee3" fill-opacity=".85">Menús de Navidad para comidas y cenas</text>
  <text x="80" y="525" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#f6eee3" fill-opacity=".7">Fuenlabrada de los Montes · Badajoz</text>
</svg>`);
await sharp(src(1)).resize(1200, 630, { fit: 'cover', position: 'right' }).composite([{ input: overlay }]).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(root, 'public', 'og-default.jpg'));

await writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Catálogo: ${catalog.length} imágenes.`);
