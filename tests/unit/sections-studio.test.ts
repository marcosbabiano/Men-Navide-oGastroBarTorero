import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import { createAdminHandler, createPublicHandler, type ApiDeps } from '../../server/api.ts';
import type { KV } from '../../server/repo.ts';
import type { BinaryKV } from '../../server/media.ts';
import { siteContentSchema, type SiteContent } from '../../shared/schema.ts';
import { createSeedContent } from '../../shared/seed.ts';
import { migrateContent, newCustomBlock } from '../../shared/layout.ts';
import { contentIssues } from '../../shared/completeness.ts';
import { buildPublicPayload, toPublicContent } from '../../shared/public.ts';
import { TEMPLATES, createDesignFromTemplate, type TemplateContext } from '../../shared/studio-templates.ts';
import { STORY_SAFE, bindingValue, designSchema, type Design } from '../../shared/studio.ts';
import { DEFAULT_THEME } from '../../shared/theme.ts';

describe('estructura de secciones', () => {
  it('migra contenidos antiguos sin perder nada (comparativa oculta se respeta)', () => {
    const old = createSeedContent() as unknown as Record<string, unknown> & { texts: { compare: Record<string, unknown> }; campaign: Record<string, unknown> };
    delete old.layout;
    delete old.campaign.decor;
    old.texts.compare.enabled = false;
    const m = migrateContent(old) as unknown as SiteContent;
    expect(siteContentSchema.safeParse(m).success).toBe(true);
    expect(m.layout.sections.map((s) => s.type)).toEqual(['hero', 'story', 'menus', 'calendar', 'compare', 'celebration', 'howTo', 'faq', 'about']);
    expect(m.layout.sections.find((s) => s.type === 'compare')!.visible).toBe(false);
    expect(m.campaign.decor).toEqual({ heroAccent: null, divider: null, branch: null });
    expect(migrateContent(m)).toEqual(m);
  });
  it('valida bloques, enlaces y duplicados', () => {
    const c = createSeedContent();
    c.layout.sections.push({ id: 'bloque-a', type: 'custom', visible: true, label: 'A', navLabel: '', block: { ...newCustomBlock('cta'), cta: { label: 'Ir', href: 'javascript:alert(1)' } } });
    expect(siteContentSchema.safeParse(c).success).toBe(false);
    for (const href of ['', 'https://x.es', '#menus', 'tel:+34 617 55 04 11', 'mailto:a@b.es']) {
      c.layout.sections[c.layout.sections.length - 1].block!.cta.href = href;
      expect(siteContentSchema.safeParse(c).success, href).toBe(true);
    }
    const d = createSeedContent();
    d.layout.sections.push({ ...d.layout.sections[3], id: 'compare-2' });
    expect(siteContentSchema.safeParse(d).success).toBe(false);
    const e = createSeedContent();
    e.layout.sections.push({ id: 'roto', type: 'custom', visible: true, label: 'x', navLabel: '', block: null });
    expect(siteContentSchema.safeParse(e).success).toBe(false);
  });
  it('protege las secciones esenciales', () => {
    const c = createSeedContent();
    c.layout.sections = c.layout.sections.filter((s) => s.type !== 'menus');
    c.layout.sections[0].visible = false;
    const blockers = contentIssues(c).filter((i) => i.level === 'blocker').map((i) => i.message);
    expect(blockers.join('\n')).toContain('Menús navideños');
    expect(blockers.join('\n')).toContain('Portada principal');
  });
  it('la web pública solo recibe secciones visibles y las imágenes de los bloques', () => {
    const c = createSeedContent();
    c.layout.sections.find((s) => s.type === 'compare')!.visible = false;
    c.layout.sections.push({ id: 'bloque-g', type: 'custom', visible: true, label: 'G', navLabel: 'Galería', block: { ...newCustomBlock('gallery'), images: [{ asset: 'pine-lights', alt: 'Luces' }] } });
    const pub = toPublicContent(c);
    expect(pub.layout.sections.some((s) => s.type === 'compare')).toBe(false);
    expect(buildPublicPayload(c, [], null).media['pine-lights']).toBeDefined();
  });
});

describe('plantillas del Estudio', () => {
  const pub = toPublicContent(createSeedContent());
  const ctx: TemplateContext = { menus: pub.menus, theme: DEFAULT_THEME, year: 2026, businessName: 'GastroBar Torero', heroAsset: 'hero-ornament', photoAsset: 'sliced-meat' };
  it('las 10 plantillas generan diseños válidos con las dimensiones de su formato', () => {
    expect(TEMPLATES).toHaveLength(11);
    for (const t of TEMPLATES) {
      const d = createDesignFromTemplate(t, ctx, { id: `d-${t.id}`, now: '2026-11-08T00:00:00Z' });
      const r = designSchema.safeParse(d);
      expect(r.success, `${t.id}: ${!r.success && JSON.stringify(r.error.issues.slice(0, 2))}`).toBe(true);
      expect([d.width, d.height]).toEqual(t.format === 'story' ? [1080, 1920] : t.format === 'square' ? [1080, 1080] : [1080, 1350]);
    }
  });
  it('los textos de menú salen de los datos actuales y no inventan nada', () => {
    const d = createDesignFromTemplate(TEMPLATES.find((t) => t.id === 'menu-distincion')!, ctx, { id: 'x', now: '' });
    const texts = d.elements.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('\n');
    expect(texts).toContain('45 €');
    expect(texts).toContain('Entrecot');
    expect(bindingValue(pub.menus[1], 'dessert')).toBe('Postre');
  });
  it('plantilla del Gourmet: grupos vinculados por separado y «Precio próximamente» sin inventar precio', () => {
    const all = toPublicContent(createSeedContent(), { includeDrafts: true }).menus;
    const gctx = { ...ctx, menus: all };
    const g = all.find((m) => m.id === 'menu-seleccion-gourmet')!;
    const d = createDesignFromTemplate(TEMPLATES.find((t) => t.id === 'menu-gourmet')!, gctx, { id: 'g', now: '', menu: g });
    expect(designSchema.safeParse(d).success).toBe(true);
    const texts = d.elements.flatMap((e) => (e.type === 'text' ? [e.text] : []));
    expect(texts).toContain('Precio próximamente');
    expect(texts.join('\n')).not.toMatch(/\d+ €/);
    const sectionBindings = d.elements.flatMap((e) => (e.type === 'text' && e.binding?.field === 'section' ? [e.binding.sectionId] : []));
    expect(sectionBindings).toEqual(['gourmet-entrantes', 'gourmet-postre', 'gourmet-primero', 'gourmet-segundo', 'gourmet-bebida']);
    // Las plantillas generales no anuncian menús en borrador.
    const anuncio = createDesignFromTemplate(TEMPLATES[0], gctx, { id: 'a', now: '' });
    expect(anuncio.elements.some((e) => e.type === 'text' && e.binding?.menuId === 'menu-seleccion-gourmet')).toBe(false);
  });
  it('las historias mantienen el texto dentro de la zona segura', () => {
    for (const t of TEMPLATES.filter((x) => x.format === 'story')) {
      const d = createDesignFromTemplate(t, ctx, { id: 'y', now: '' });
      for (const e of d.elements) if (e.type === 'text') {
        expect(e.y, `${t.id}: ${e.text}`).toBeGreaterThanOrEqual(STORY_SAFE.top);
        expect(e.y + e.size, `${t.id}: ${e.text}`).toBeLessThanOrEqual(1920 - STORY_SAFE.bottom);
      }
    }
  });
});

let server: BlobsServer;
let dir: string;
let url: string;
let store: string;
const ORIGIN = 'https://torero.example';
const deps = (): ApiDeps => {
  const mk = (n: string) => getStore({ name: n, siteID: 't', token: 't', edgeURL: url, uncachedEdgeURL: url, consistency: 'strong' });
  return {
    content: mk(`${store}-c`) as unknown as KV,
    media: mk(`${store}-m`) as unknown as BinaryKV,
    auth: async (req) => {
      const t = req.headers.get('authorization');
      if (t === 'Bearer admin') return { id: '1', email: 'a@t.es', roles: ['admin'] };
      if (t === 'Bearer editor') return { id: '2', email: 'e@t.es', roles: [] };
      return null;
    },
    adminEmails: [],
    purge: async () => undefined,
  };
};
const admin = (p: string, init: RequestInit & { token?: string } = {}) => {
  const h = new Headers(init.headers);
  h.set('X-Torero-Admin', '1');
  h.set('Origin', ORIGIN);
  h.set('Authorization', `Bearer ${init.token ?? 'admin'}`);
  if (typeof init.body === 'string') h.set('Content-Type', 'application/json');
  return createAdminHandler(deps())(new Request(`${ORIGIN}/api/admin${p}`, { ...init, headers: h }));
};
const pub = (p: string) => createPublicHandler(deps())(new Request(`${ORIGIN}${p}`));
const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'torero-s-'));
  server = new BlobsServer({ directory: dir, token: 't' });
  url = `http://localhost:${(await server.start()).port}`;
});
afterAll(async () => {
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  store = `s${Math.random().toString(36).slice(2, 8)}`;
});

describe('API: secciones', () => {
  it('ocultar la comparativa, reordenar, crear un bloque y publicar', async () => {
    const st = await (await admin('/state')).json();
    const c = st.draft.content as SiteContent;
    c.layout.sections.find((s) => s.type === 'compare')!.visible = false;
    const faq = c.layout.sections.findIndex((s) => s.type === 'faq');
    const [f] = c.layout.sections.splice(faq, 1);
    c.layout.sections.splice(1, 0, f);
    c.layout.sections.push({ id: 'bloque-cta', type: 'custom', visible: true, label: 'CTA', navLabel: '', block: newCustomBlock('cta') });
    const saved = await admin('/draft', { method: 'PUT', body: JSON.stringify({ content: c, baseRevision: st.draft.revision }) });
    expect(saved.status).toBe(200);
    const rev = (await saved.json()).draft.revision;
    expect((await admin('/publish', { method: 'POST', body: JSON.stringify({ baseRevision: rev }) })).status).toBe(200);
    const live = (await (await pub('/api/content')).json()).content as SiteContent;
    expect(live.layout.sections.map((s) => s.type)).toEqual(['hero', 'faq', 'story', 'menus', 'calendar', 'celebration', 'howTo', 'about', 'custom']);
    // Volver a mostrarla: el contenido se conservó.
    const st2 = await (await admin('/state')).json();
    const c2 = st2.draft.content as SiteContent;
    expect(c2.layout.sections.find((s) => s.type === 'compare')!.visible).toBe(false);
    c2.layout.sections.find((s) => s.type === 'compare')!.visible = true;
    const rev2 = (await (await admin('/draft', { method: 'PUT', body: JSON.stringify({ content: c2, baseRevision: st2.draft.revision }) })).json()).draft.revision;
    await admin('/publish', { method: 'POST', body: JSON.stringify({ baseRevision: rev2 }) });
    expect(((await (await pub('/api/content')).json()).content as SiteContent).layout.sections.some((s) => s.type === 'compare')).toBe(true);
  });
  it('contenido publicado con la versión anterior (sin «layout») se sirve migrado', async () => {
    const legacy = createSeedContent() as unknown as Record<string, unknown>;
    delete legacy.layout;
    await (deps().content as KV).setJSON('content/published', { content: legacy, revision: 1, sourceRevision: 1, updatedAt: '', updatedBy: '', publishedAt: '2026-11-01T00:00:00Z', publishedBy: 'x' });
    const live = (await (await pub('/api/content')).json()).content as SiteContent;
    expect(live.layout.sections).toHaveLength(9);
    const st = await (await admin('/state')).json();
    expect(st.draft.content.layout.sections).toHaveLength(9);
  });
});

describe('API: diseños del Estudio', () => {
  const pubC = toPublicContent(createSeedContent());
  const ctx: TemplateContext = { menus: pubC.menus, theme: DEFAULT_THEME, year: 2026, businessName: 'GastroBar Torero', heroAsset: 'hero-ornament', photoAsset: null };
  const make = (id: string): Design => createDesignFromTemplate(TEMPLATES[0], ctx, { id, now: new Date().toISOString() });

  it('guardar, listar, reabrir, duplicar y eliminar', async () => {
    const d = make('diseno-a');
    const res = await admin('/designs/diseno-a', { method: 'PUT', body: JSON.stringify({ design: d, thumb: THUMB }) });
    expect(res.status).toBe(200);
    const list = (await (await admin('/designs')).json()).designs;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'diseno-a', formatId: 'post', width: 1080, height: 1350, thumb: THUMB });
    const back = (await (await admin('/designs/diseno-a')).json()).design as Design;
    expect(back.elements).toEqual(d.elements);
    await admin('/designs/diseno-b', { method: 'PUT', body: JSON.stringify({ design: { ...back, id: 'diseno-b', name: 'Copia' }, thumb: THUMB }) });
    expect((await (await admin('/designs')).json()).designs).toHaveLength(2);
    expect((await admin('/designs/diseno-a', { method: 'DELETE' })).status).toBe(200);
    expect((await admin('/designs/diseno-a')).status).toBe(404);
    expect((await (await admin('/designs')).json()).designs.map((x: { id: string }) => x.id)).toEqual(['diseno-b']);
  });
  it('exige rol admin y valida los datos', async () => {
    const d = make('diseno-c');
    expect((await admin('/designs', { token: 'editor' })).status).toBe(403);
    expect((await admin('/designs/diseno-c', { method: 'PUT', token: 'editor', body: JSON.stringify({ design: d, thumb: THUMB }) })).status).toBe(403);
    expect((await admin('/designs/diseno-c', { method: 'PUT', token: 'nadie', body: JSON.stringify({ design: d, thumb: THUMB }) })).status).toBe(401);
    expect((await admin('/designs/diseno-c', { method: 'PUT', body: JSON.stringify({ design: { ...d, width: 99999 }, thumb: THUMB }) })).status).toBe(422);
    expect((await admin('/designs/diseno-c', { method: 'PUT', body: JSON.stringify({ design: d, thumb: 'data:text/html,<b>' }) })).status).toBe(422);
    expect((await admin('/designs/otro', { method: 'PUT', body: JSON.stringify({ design: d, thumb: THUMB }) })).status).toBe(400);
  });
  it('no permite borrar del gestor de imágenes una imagen usada en un diseño', async () => {
    const webp = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#5a2533' } }).webp().toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(webp)], { type: 'image/webp' }), 'a');
    form.append('alt', 'Prueba');
    form.append('folder', 'ilustraciones');
    const { asset } = await (await admin('/media', { method: 'POST', body: form })).json();
    const d = make('diseno-img');
    d.elements.push({ id: 'img1', type: 'image', asset: asset.id, fit: 'cover', x: 0, y: 0, width: 100, height: 100, radius: 0, rotation: 0, opacity: 1, locked: false });
    await admin('/designs/diseno-img', { method: 'PUT', body: JSON.stringify({ design: d, thumb: THUMB }) });
    const del = await admin(`/media/${asset.id}`, { method: 'DELETE' });
    expect(del.status).toBe(409);
    expect((await del.json()).error.message).toContain('Estudio');
  });
});
