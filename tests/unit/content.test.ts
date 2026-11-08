import { describe, expect, it } from 'vitest';
import { siteContentSchema } from '../../shared/schema.ts';
import { createSeedContent, DEFAULT_BOOKING_URL } from '../../shared/seed.ts';
import { migrateContent } from '../../shared/layout.ts';
import { PATCH_MENUS_2026_11 } from '../../shared/menu-data-2026.ts';
import { THEME_PRESETS, checkThemeContrast } from '../../shared/theme.ts';
import { toPublicContent, buildPublicPayload } from '../../shared/public.ts';
import { buildComparison } from '../../shared/comparison.ts';
import { contentIssues, publishBlockers } from '../../shared/completeness.ts';
import { injectIntoHtml, safeJson } from '../../shared/head.ts';
import { interpolate, formatPrice, groupWeekly } from '../../shared/format.ts';
import { SEED_MEDIA } from '../../shared/media-catalog.ts';

describe('contenido inicial', () => {
  const seed = createSeedContent();
  it('cumple el esquema', () => {
    const r = siteContentSchema.safeParse(seed);
    expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
  });
  it('tiene Esencia (36 €) y Distinción (45 €) publicados y el Gourmet en borrador sin precio', () => {
    expect(seed.menus.map((m) => [m.name, m.price.amount, m.status])).toEqual([
      ['Menú Esencia', 36, 'published'],
      ['Menú Distinción', 45, 'published'],
      ['Menú Selección Gourmet', null, 'draft'],
    ]);
    expect(seed.menus.every((m) => m.price.confirmed === false)).toBe(true);
  });
  it('respeta los platos reales del Menú Esencia', () => {
    const m = seed.menus[0];
    const names = (k: string) => m.sections.filter((s) => s.kind === k).flatMap((s) => s.items.map((i) => i.name));
    expect(names('shared')).toEqual(['Surtido de croquetas artesanas', 'Canelón de foie y trufa', 'Jamón ibérico de cebo', 'Selección de quesos', 'Langostinos torpedo']);
    expect(names('choice')).toEqual(['Secreto ibérico', 'Bacalao en salsa']);
    expect(names('dessert')).toEqual(['Tarta de tres chocolates']);
    expect(names('drink')).toEqual(['Bebida incluida']);
    expect(m.sections[0].items[0].quantity).toBe('3 por persona');
    expect(m.sections[0].items[1].quantityPending).toBe(true);
  });
  it('Menú Distinción: incluye «Postre» (sin concretar) y «Bebida incluida»', () => {
    const m = seed.menus[1];
    const dessert = m.sections.find((x) => x.kind === 'dessert')!;
    const drink = m.sections.find((x) => x.kind === 'drink')!;
    expect([dessert.pending, dessert.items.map((i) => [i.name, i.detail])]).toEqual([false, [['Postre', '']]]);
    expect([drink.pending, drink.items.map((i) => i.name)]).toEqual([false, ['Bebida incluida']]);
    expect(m.sections.find((s) => s.kind === 'choice')!.items.map((i) => i.name)).toEqual(['Entrecot', 'Rodaballo al horno']);
  });
  it('Menú Selección Gourmet: estructura exacta (compartir, primero y segundo a elegir, para terminar, bebida)', () => {
    const g = seed.menus[2];
    expect(g.sections.map((s) => [s.kind, s.title, s.choose, s.items.map((i) => i.name)])).toEqual([
      ['shared', 'Para empezar', 1, ['Surtido de Jamón Ibérico y Queso Curado', 'Surtido de Croquetas Caseras de la Casa', 'Canelón de Carrillera']],
      ['choice', 'Primer plato', 1, ['Alcachofas Confitadas', 'Mariscada Cocida Especial']],
      ['choice', 'Segundo plato', 1, ['Lomo de Rodaballo al Horno', 'Magret de Pato', 'Entrecot']],
      ['dessert', 'Para terminar', 1, ['Postre Navideño de la Casa', 'Café y Dulces Tradicionales']],
      ['drink', 'Bebida', 1, ['Bebida incluida']],
    ]);
    expect(g.sections[2].items[2].detail).toBe('');
    expect(g.sections[0].items[0].detail).toBe('Con tostas de pan de cristal.');
    expect(g.price.amount).toBeNull();
  });
  it('todos los menús incluyen postre y bebida, cada uno con su postre', () => {
    const dess = seed.menus.map((m) => m.sections.find((s) => s.kind === 'dessert')!.items.map((i) => i.name).join(' + '));
    expect(dess).toEqual(['Tarta de tres chocolates', 'Postre', 'Postre Navideño de la Casa + Café y Dulces Tradicionales']);
    expect(seed.menus.every((m) => m.sections.some((s) => s.kind === 'drink' && s.items.some((i) => i.name === 'Bebida incluida')))).toBe(true);
  });
  it('usa la URL oficial de reservas y no tiene redes ni horario verificado', () => {
    expect(seed.booking.url).toBe(DEFAULT_BOOKING_URL);
    expect(Object.values(seed.business.social).every((v) => v === '')).toBe(true);
    expect(seed.business.hours.verified).toBe(false);
  });
  it('todas las imágenes referenciadas existen en el catálogo', () => {
    const ids = new Set(SEED_MEDIA.map((m) => m.id));
    expect(publishBlockers(seed, ids)).toEqual([]);
  });
});

describe('validación', () => {
  it('rechaza enlaces peligrosos y no https en reservas', () => {
    const c = createSeedContent();
    c.booking.url = 'javascript:alert(1)';
    expect(siteContentSchema.safeParse(c).success).toBe(false);
    c.booking.url = 'http://booking.qamarero.com/x';
    expect(siteContentSchema.safeParse(c).success).toBe(false);
    const d = createSeedContent();
    d.business.social.instagram = 'data:text/html,hola';
    expect(siteContentSchema.safeParse(d).success).toBe(false);
  });
  it('rechaza caracteres de control y textos demasiado largos', () => {
    const c = createSeedContent();
    c.texts.hero.titleMain = 'x\u0000y';
    expect(siteContentSchema.safeParse(c).success).toBe(false);
    c.texts.hero.titleMain = 'a'.repeat(61);
    expect(siteContentSchema.safeParse(c).success).toBe(false);
  });
  it('las paletas predefinidas cumplen el contraste y una paleta ilegible se rechaza', () => {
    for (const p of THEME_PRESETS) expect(checkThemeContrast(p.colors), p.id).toEqual([]);
    const c = createSeedContent();
    c.campaign.theme.gold = '#2a2a2a';
    expect(siteContentSchema.safeParse(c).success).toBe(false);
  });
});

describe('proyección pública', () => {
  it('nunca muestra secciones pendientes, cantidades pendientes ni notas internas', () => {
    const pub = toPublicContent(createSeedContent());
    const dist = pub.menus.find((m) => m.id === 'menu-distincion')!;
    expect(dist.sections.map((s) => s.kind)).toEqual(['shared', 'choice', 'dessert', 'drink']);
    expect(pub.menus.some((m) => m.id === 'menu-seleccion-gourmet')).toBe(false);
    expect(pub.menus.every((m) => m.adminNotes === '')).toBe(true);
    const canelon = pub.menus[0].sections[0].items.find((i) => i.name.startsWith('Canelón'))!;
    expect(canelon.quantity).toBe('');
    expect(JSON.stringify(pub)).not.toContain('Pendiente: confirmar');
  });
  it('oculta el horario no verificado y los menús en borrador', () => {
    const c = createSeedContent();
    c.menus.push({ ...structuredClone(c.menus[0]), id: 'menu-tres', status: 'draft', name: 'Menú Tres' });
    const pub = toPublicContent(c);
    expect(pub.menus.map((m) => m.id)).toEqual(['menu-esencia', 'menu-distincion']);
    expect(pub.business.hours.weekly.every((d) => d.ranges.length === 0)).toBe(true);
    expect(toPublicContent(c, { includeDrafts: true }).menus).toHaveLength(4);
  });
});

describe('comparativa', () => {
  const rows = buildComparison(toPublicContent(createSeedContent()).menus);
  it('se genera desde el contenido real', () => {
    expect(rows.map((r) => r.kind)).toEqual(['shared', 'choice', 'dessert', 'drink']);
  });
  it('marca platos comunes y muestra el postre de cada menú', () => {
    const shared = rows[0];
    const common = shared.cells[0].items.filter((i) => i.common).map((i) => i.name);
    expect(common).toEqual(['Jamón ibérico de cebo', 'Selección de quesos']);
    const dessert = rows.find((r) => r.kind === 'dessert')!;
    expect(dessert.cells.map((c) => c.items.map((i) => i.name))).toEqual([['Tarta de tres chocolates'], ['Postre']]);
  });
  it('con el Gourmet publicado, sus primer y segundo plato aparecen como grupos separados', () => {
    const c = createSeedContent();
    c.menus[2].status = 'published';
    c.menus[2].price.amount = 60;
    const r = buildComparison(toPublicContent(c).menus);
    const choice = r.find((x) => x.kind === 'choice')!;
    expect(choice.cells).toHaveLength(3);
    const g = choice.cells[2].items;
    expect(g.filter((i) => i.group).map((i) => i.group)).toEqual(['Primer plato', 'Segundo plato']);
    expect(g.map((i) => i.name)).toEqual(['Alcachofas Confitadas', 'Mariscada Cocida Especial', 'Lomo de Rodaballo al Horno', 'Magret de Pato', 'Entrecot']);
    expect(choice.cells[0].items.some((i) => i.group)).toBe(false);
  });
});

describe('formato y SEO', () => {
  const c = createSeedContent();
  it('interpola marcadores', () => {
    expect(interpolate('Llama al {telefono} · {año} · desde {precioDesde}', c)).toBe('Llama al +34 617 55 04 11 · 2026 · desde 36 €');
    expect(formatPrice(36.5)).toBe('36,50 €');
  });
  it('agrupa horarios consecutivos', () => {
    expect(groupWeekly(c.business.hours.weekly)).toEqual([{ label: 'Viernes – Domingo', value: '12:00–02:30' }]);
  });
  it('inyecta SEO escapado y datos sin romper el HTML', () => {
    const k = createSeedContent();
    k.seo.title = 'Título "con" <script>alert(1)</script> $& fin';
    const payload = buildPublicPayload(k, [], null);
    const html = '<head><!--torero:head:start--><title>x</title><!--torero:head:end--></head><body><!--torero:data--></body>';
    const out = injectIntoHtml(html, payload, 'https://torero.example');
    expect(out).toContain('<title>Título &quot;con&quot; &lt;script&gt;alert(1)&lt;/script&gt; $&amp; fin</title>');
    expect(out).not.toContain('<script>alert(1)');
    expect(out).toContain('property="og:image" content="https://torero.example/og-default.jpg"');
    const data = /<script id="torero-data" type="application\/json">(.*?)<\/script>/s.exec(out)![1];
    expect(JSON.parse(data).content.seo.title).toBe(k.seo.title);
    expect(safeJson('</script>')).not.toContain('</');
  });
  it('los datos estructurados solo incluyen datos verificados', () => {
    const k = createSeedContent();
    let out = injectIntoHtml('<!--torero:head:start--><!--torero:head:end-->', buildPublicPayload(k, [], null), 'https://t.es');
    const ld = (s: string) => JSON.parse(/application\/ld\+json">(.*?)<\/script>/s.exec(s)![1]);
    expect(ld(out).address).toBeUndefined();
    expect(ld(out).telephone).toBeUndefined();
    expect(ld(out).openingHoursSpecification).toBeUndefined();
    k.business.verified = { address: true, phone: true };
    k.business.hours.verified = true;
    out = injectIntoHtml('<!--torero:head:start--><!--torero:head:end-->', buildPublicPayload(k, [], null), 'https://t.es');
    expect(ld(out).address.addressLocality).toBe('Fuenlabrada de los Montes');
    expect(ld(out).openingHoursSpecification).toHaveLength(3);
  });
  it('lista lo pendiente en el panel', () => {
    const msgs = contentIssues(c).map((i) => i.message).join('\n');
    expect(msgs).toContain('Menú Selección Gourmet: falta el precio.');
    expect(msgs).not.toContain('Menú Distinción: no muestra postre');
    expect(msgs).toContain('Horario sin verificar');
    expect(msgs).toContain('precio pendiente de confirmación');
  });
});

describe('actualización controlada de menús (contenido ya guardado)', () => {
  const legacy = () => {
    const c = createSeedContent() as unknown as Record<string, unknown> & { menus: Record<string, unknown>[]; patches?: string[] };
    c.menus = c.menus.slice(0, 2);
    delete c.patches;
    const dist = c.menus[1] as unknown as { sections: { kind: string; pending: boolean; items: unknown[]; title: string; choose?: number }[] };
    for (const s of dist.sections) {
      delete s.choose;
      if (s.kind === 'dessert' || s.kind === 'drink') Object.assign(s, { pending: true, items: [], title: s.kind === 'dessert' ? 'Postre' : 'Bebida' });
    }
    return c;
  };
  it('añade el Gourmet en borrador y completa postre/bebida del Distinción una sola vez', () => {
    const m = migrateContent(legacy()) as unknown as ReturnType<typeof createSeedContent>;
    expect(siteContentSchema.safeParse(m).success).toBe(true);
    expect(m.menus.map((x) => [x.id, x.status])).toEqual([['menu-esencia', 'published'], ['menu-distincion', 'published'], ['menu-seleccion-gourmet', 'draft']]);
    expect(m.menus[1].sections.find((s) => s.kind === 'dessert')!.items.map((i) => i.name)).toEqual(['Postre']);
    expect(m.patches).toEqual([PATCH_MENUS_2026_11]);
    expect(migrateContent(m)).toEqual(m);
  });
  it('no pisa lo editado en el panel ni recrea el Gourmet si se eliminó', () => {
    const l = legacy();
    const dist = l.menus[1] as unknown as { sections: { kind: string; pending: boolean; items: { name: string }[] }[] };
    const dessert = dist.sections.find((s) => s.kind === 'dessert')!;
    dessert.pending = false;
    dessert.items = [{ name: 'Turrón de la casa' } as never];
    const m = migrateContent(l) as unknown as ReturnType<typeof createSeedContent>;
    expect(m.menus[1].sections.find((s) => s.kind === 'dessert')!.items.map((i) => i.name)).toEqual(['Turrón de la casa']);
    m.menus = m.menus.filter((x) => x.id !== 'menu-seleccion-gourmet');
    expect(migrateContent(m).menus).toHaveLength(2);
  });
  it('no duplica el Gourmet si ya se creó a mano desde el panel', () => {
    const l = legacy();
    l.menus.push({ ...(createSeedContent().menus[2] as unknown as Record<string, unknown>), id: 'menu-abc', name: 'Menú Selección Gourmet' });
    const m = migrateContent(l) as unknown as ReturnType<typeof createSeedContent>;
    expect(m.menus.filter((x) => /Gourmet/.test(x.name))).toHaveLength(1);
  });
});
