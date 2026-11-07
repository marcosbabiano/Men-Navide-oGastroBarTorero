import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import { createAdminHandler, createPublicHandler, createSeoHandler, type ApiDeps } from '../../server/api.ts';
import type { KV } from '../../server/repo.ts';
import type { BinaryKV } from '../../server/media.ts';
import type { AuthUser } from '../../server/auth.ts';
import type { SiteContent } from '../../shared/schema.ts';
import { newMenu } from '../../src/admin/menu-factory.ts';

const ORIGIN = 'https://torero.example';
const USERS: Record<string, AuthUser> = {
  'tok-admin': { id: '1', email: 'admin@torero.es', roles: ['admin'] },
  'tok-editor': { id: '2', email: 'editor@torero.es', roles: [] },
  'tok-boot': { id: '3', email: 'jefa@torero.es', roles: [] },
};

let server: BlobsServer;
let dir: string;
let url: string;
let purges: string[][];
let storeName: string;

function deps(): ApiDeps {
  const mk = (name: string) => getStore({ name, siteID: 'test', token: 't', edgeURL: url, uncachedEdgeURL: url, consistency: 'strong' });
  return {
    content: mk(`${storeName}-content`) as unknown as KV,
    media: mk(`${storeName}-media`) as unknown as BinaryKV,
    auth: async (req) => USERS[(req.headers.get('authorization') ?? '').replace('Bearer ', '')] ?? null,
    adminEmails: ['jefa@torero.es'],
    purge: async (t) => void purges.push(t),
  };
}

const admin = (pathname: string, init: RequestInit & { token?: string; noHeader?: boolean; origin?: string | null } = {}) => {
  const h = new Headers(init.headers);
  if (!init.noHeader) h.set('X-Torero-Admin', '1');
  if (init.token !== '') h.set('Authorization', `Bearer ${init.token ?? 'tok-admin'}`);
  if (init.origin !== null) h.set('Origin', init.origin ?? ORIGIN);
  if (typeof init.body === 'string' && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
  return createAdminHandler(deps())(new Request(`${ORIGIN}/api/admin${pathname}`, { ...init, headers: h }));
};
const pub = (p: string) => createPublicHandler(deps())(new Request(`${ORIGIN}${p}`));
const getState = async () => (await (await admin('/state')).json()) as { draft: { content: SiteContent; revision: number } };
const save = (content: SiteContent, baseRevision: number) => admin('/draft', { method: 'PUT', body: JSON.stringify({ content, baseRevision }) });
const publish = (baseRevision: number) => admin('/publish', { method: 'POST', body: JSON.stringify({ baseRevision }) });

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'torero-blobs-'));
  server = new BlobsServer({ directory: dir, token: 't' });
  url = `http://localhost:${(await server.start()).port}`;
});
afterAll(async () => {
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  purges = [];
  storeName = `s${Math.random().toString(36).slice(2, 8)}`;
});

describe('API pública', () => {
  it('sirve el contenido inicial sin escribir nada si no hay publicación', async () => {
    const res = await pub('/api/content');
    expect(res.status).toBe(200);
    expect(res.headers.get('netlify-cache-tag')).toBe('torero-content');
    const body = await res.json();
    expect(body.content.menus.map((m: { name: string }) => m.name)).toEqual(['Menú Esencia', 'Menú Distinción']);
    expect(body.publishedAt).toBeNull();
    expect(JSON.stringify(body)).not.toContain('adminNotes":"Pendiente');
  });
  it('solo acepta GET', async () => {
    const res = await createPublicHandler(deps())(new Request(`${ORIGIN}/api/content`, { method: 'POST' }));
    expect(res.status).toBe(405);
  });
  it('robots y sitemap usan el dominio real', async () => {
    const seo = createSeoHandler(deps());
    expect(await (await seo(new Request(`${ORIGIN}/robots.txt`))).text()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(await (await seo(new Request(`${ORIGIN}/sitemap.xml`))).text()).toContain(`<loc>${ORIGIN}/</loc>`);
  });
});

describe('autorización y CSRF', () => {
  it('401 sin sesión', async () => {
    expect((await admin('/state', { token: '' })).status).toBe(401);
  });
  it('403 si el usuario no tiene rol admin', async () => {
    const res = await admin('/state', { token: 'tok-editor' });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
  });
  it('permite el acceso por ADMIN_EMAILS (arranque del primer administrador)', async () => {
    expect((await admin('/session', { token: 'tok-boot' })).status).toBe(200);
  });
  it('rechaza peticiones sin cabecera anti-CSRF', async () => {
    expect((await admin('/state', { noHeader: true })).status).toBe(403);
  });
  it('rechaza escrituras desde otro origen o sin Origin', async () => {
    const { draft } = await getState();
    expect((await admin('/draft', { method: 'PUT', origin: 'https://malo.example', body: JSON.stringify({ content: draft.content, baseRevision: draft.revision }) })).status).toBe(403);
    expect((await admin('/draft', { method: 'PUT', origin: null, body: JSON.stringify({ content: draft.content, baseRevision: draft.revision }) })).status).toBe(403);
  });
  it('un usuario sin rol no puede modificar contenido manipulando la petición', async () => {
    const { draft } = await getState();
    const c = structuredClone(draft.content);
    c.menus[0].price.amount = 1;
    expect((await admin('/draft', { method: 'PUT', token: 'tok-editor', body: JSON.stringify({ content: c, baseRevision: draft.revision }) })).status).toBe(403);
    expect((await admin('/publish', { method: 'POST', token: 'tok-editor', body: JSON.stringify({ baseRevision: draft.revision }) })).status).toBe(403);
  });
  it('exige JSON y limita el tamaño', async () => {
    const res = await admin('/draft', { method: 'PUT', body: 'x'.repeat(10), headers: { 'Content-Type': 'text/plain' } });
    expect(res.status).toBe(415);
    const big = await admin('/draft', { method: 'PUT', body: JSON.stringify({ content: 'x'.repeat(700_000), baseRevision: 1 }) });
    expect(big.status).toBe(413);
  });
});

describe('edición y publicación', () => {
  it('cambiar un precio y verlo publicado (y purgar la caché)', async () => {
    const { draft } = await getState();
    const c = structuredClone(draft.content);
    c.menus[0].price.amount = 38.5;
    const saved = await save(c, draft.revision);
    expect(saved.status).toBe(200);
    const rev = (await saved.json()).draft.revision;
    // La web no cambia hasta publicar.
    expect((await (await pub('/api/content')).json()).content.menus[0].price.amount).toBe(36);
    const p = await publish(rev);
    expect(p.status).toBe(200);
    expect(purges).toEqual([['torero-content']]);
    expect((await (await pub('/api/content')).json()).content.menus[0].price.amount).toBe(38.5);
  });
  it('detecta conflictos de edición (409)', async () => {
    const { draft } = await getState();
    const c = structuredClone(draft.content);
    c.texts.hero.titleMain = 'A';
    expect((await save(c, draft.revision)).status).toBe(200);
    c.texts.hero.titleMain = 'B';
    const res = await save(c, draft.revision);
    expect(res.status).toBe(409);
  });
  it('valida en el servidor (422) con errores comprensibles', async () => {
    const { draft } = await getState();
    const c = structuredClone(draft.content) as unknown as { booking: { url: string } };
    c.booking.url = 'javascript:alert(1)';
    const res = await save(c as unknown as SiteContent, draft.revision);
    expect(res.status).toBe(422);
    expect((await res.json()).error.details[0].path).toBe('booking.url');
  });
  it('modificar platos, textos y horarios', async () => {
    const { draft } = await getState();
    const c = structuredClone(draft.content);
    c.menus[1].sections.find((s) => s.kind === 'dessert')!.items.push({ id: 'postre-x', name: 'Postre confirmado', detail: '', quantity: '', quantityPending: false, note: '' });
    c.menus[1].sections.find((s) => s.kind === 'dessert')!.pending = false;
    c.texts.hero.subtitle = 'Nuevo subtítulo';
    c.business.hours.verified = true;
    c.business.hours.specials.push({ id: 'nochebuena', date: '2026-12-24', label: 'Nochebuena', closed: false, ranges: [{ open: '12:00', close: '17:00' }], note: '' });
    const rev = (await (await save(c, draft.revision)).json()).draft.revision;
    expect((await publish(rev)).status).toBe(200);
    const live = (await (await pub('/api/content')).json()).content as SiteContent;
    expect(live.menus[1].sections.map((s) => s.kind)).toContain('dessert');
    expect(live.texts.hero.subtitle).toBe('Nuevo subtítulo');
    expect(live.business.hours.specials[0].label).toBe('Nochebuena');
  });
  it('alta de un tercer menú: borrador oculto, bloqueado sin precio, publicado al completarlo', async () => {
    let { draft } = await getState();
    const c = structuredClone(draft.content);
    const m = newMenu(2);
    c.menus.push(m);
    let rev = (await (await save(c, draft.revision)).json()).draft.revision;
    expect((await publish(rev)).status).toBe(200);
    expect((await (await pub('/api/content')).json()).content.menus).toHaveLength(2);

    c.menus[2].status = 'published';
    rev = (await (await save(c, rev)).json()).draft.revision;
    const blocked = await publish(rev);
    expect(blocked.status).toBe(422);
    expect((await blocked.json()).error.code).toBe('publish_blocked');

    c.menus[2].name = 'Menú Tradición';
    c.menus[2].price.amount = 52;
    c.menus[2].sections[0].items.push({ id: 'p1', name: 'Plato confirmado', detail: '', quantity: '', quantityPending: false, note: '' });
    rev = (await (await save(c, rev)).json()).draft.revision;
    expect((await publish(rev)).status).toBe(200);
    const live = (await (await pub('/api/content')).json()).content as SiteContent;
    expect(live.menus.map((x) => x.name)).toEqual(['Menú Esencia', 'Menú Distinción', 'Menú Tradición']);
    ({ draft } = await getState());
    expect(draft.content.menus).toHaveLength(3);
  });
  it('los cambios persisten con nuevas instancias (nuevo despliegue) y el seed no los sobrescribe', async () => {
    const { draft } = await getState();
    const c = structuredClone(draft.content);
    c.menus[0].price.amount = 40;
    const rev = (await (await save(c, draft.revision)).json()).draft.revision;
    await publish(rev);
    // Instancias completamente nuevas de los manejadores (como tras un redespliegue).
    const fresh = await (await createAdminHandler(deps())(new Request(`${ORIGIN}/api/admin/state`, { headers: { 'X-Torero-Admin': '1', Authorization: 'Bearer tok-admin' } }))).json();
    expect(fresh.draft.content.menus[0].price.amount).toBe(40);
    expect(fresh.draft.revision).toBe(rev);
    expect((await (await pub('/api/content')).json()).content.menus[0].price.amount).toBe(40);
  });
  it('historial: restaurar una versión anterior en el borrador', async () => {
    let { draft } = await getState();
    let rev = (await (await publish(draft.revision)).json()).published ? draft.revision : 0;
    const c = structuredClone(draft.content);
    c.texts.hero.titleMain = 'versión dos';
    rev = (await (await save(c, rev)).json()).draft.revision;
    await publish(rev);
    const hist = (await (await admin('/history')).json()).versions;
    expect(hist).toHaveLength(1);
    const restored = await admin('/history/restore', { method: 'POST', body: JSON.stringify({ key: hist[0].key, baseRevision: rev }) });
    expect(restored.status).toBe(200);
    ({ draft } = await getState());
    expect(draft.content.texts.hero.titleMain).toBe('cada encuentro');
    // La web sigue con la versión publicada hasta volver a publicar.
    expect((await (await pub('/api/content')).json()).content.texts.hero.titleMain).toBe('versión dos');
    const bad = await admin('/history/restore', { method: 'POST', body: JSON.stringify({ key: '../content/draft', baseRevision: draft.revision }) });
    expect(bad.status).toBe(400);
  });
});

describe('imágenes', () => {
  const upload = async (file: Blob, small?: Blob) => {
    const form = new FormData();
    form.append('file', file, 'a');
    if (small) form.append('small', small, 'b');
    form.append('alt', 'Mesa de prueba');
    form.append('folder', 'platos');
    form.append('name', 'Mesa Navidad');
    return admin('/media', { method: 'POST', body: form });
  };
  it('sube, sirve, usa, impide borrar en uso y elimina', async () => {
    const webp = await sharp({ create: { width: 640, height: 400, channels: 3, background: '#5a2533' } }).webp().toBuffer();
    const sm = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#5a2533' } }).webp().toBuffer();
    const res = await upload(new Blob([new Uint8Array(webp)], { type: 'image/webp' }), new Blob([new Uint8Array(sm)], { type: 'image/webp' }));
    expect(res.status).toBe(201);
    const { asset } = await res.json();
    expect(asset).toMatchObject({ kind: 'upload', width: 640, height: 400, widths: [320, 640], alt: 'Mesa de prueba', folder: 'platos' });
    const img = await pub(`/api/media/${asset.id}`);
    expect(img.headers.get('content-type')).toBe('image/webp');
    expect(img.headers.get('cache-control')).toContain('immutable');
    expect((await pub(`/api/media/${asset.id}?v=sm`)).status).toBe(200);

    const { draft } = await getState();
    const c = structuredClone(draft.content);
    c.texts.hero.image = { asset: asset.id, alt: 'Nueva portada' };
    const rev = (await (await save(c, draft.revision)).json()).draft.revision;
    expect((await publish(rev)).status).toBe(200);
    const live = await (await pub('/api/content')).json();
    expect(live.media[asset.id].src).toBe(`/api/media/${asset.id}`);

    expect((await admin(`/media/${asset.id}`, { method: 'DELETE' })).status).toBe(409);
    c.texts.hero.image = { asset: 'hero-ornament', alt: 'Portada' };
    const rev2 = (await (await save(c, rev)).json()).draft.revision;
    await publish(rev2);
    expect((await admin(`/media/${asset.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await pub(`/api/media/${asset.id}`)).status).toBe(404);
  });
  it('rechaza SVG/HTML disfrazados de imagen y no permite borrar imágenes incluidas', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/png' });
    expect((await upload(svg)).status).toBe(415);
    expect((await admin('/media/hero-ornament', { method: 'DELETE' })).status).toBe(400);
  });
});
