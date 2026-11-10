import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

test.describe.configure({ mode: 'serial' });

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill('admin@torero.local');
  await page.getByLabel('Contraseña').fill('torero-local-2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
}

/** Llamada al API de administración desde la sesión del navegador (cookie + cabecera anti-CSRF). */
async function adminFetch<T = unknown>(page: Page, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(`/api/admin${path}`, {
        method: init.method ?? 'GET',
        credentials: 'same-origin',
        headers: { 'X-Torero-Admin': '1', 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      return { status: res.status, body: await res.json() };
    },
    { path, init },
  );
}

type Cfg = { revision: number; config: { scenes: { id: string; duration: number; type: string; status: string }[]; settings: Record<string, number | string> }; screens: { id: string; name: string; version: number; status: { appliedVersion: number; sceneId: string | null } | null }[] };

/** Acelera la prueba: escenas de 4 s y consultas cada 5 s. */
async function fastConfig(page: Page) {
  const s = (await adminFetch<Cfg>(page, '/signage')).body;
  const config = structuredClone(s.config);
  for (const sc of config.scenes) sc.duration = 4;
  config.settings.pollSeconds = 5;
  config.settings.heartbeatSeconds = 20;
  // Sin horarios: la prueba no depende de la hora a la que se ejecute (programación por defecto).
  (config as unknown as { schedules: unknown[] }).schedules = [];
  const r = await adminFetch(page, '/signage/config', { method: 'PUT', body: { config, baseRevision: s.revision } });
  expect(r.status).toBe(200);
}

const stageBox = (page: Page) => page.locator('.stage').boundingBox();

test('el reproductor se adapta a 1080p, 4K y 720p sin barras de desplazamiento', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [w, h] of [
    [1920, 1080],
    [3840, 2160],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/pantalla?kiosk=1');
    await expect(page.locator('.slayer.is-live').first()).toBeVisible();
    const box = await stageBox(page);
    expect(Math.round(box!.width)).toBe(w);
    expect(Math.round(box!.height)).toBe(h);
    const scroll = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight, overflow: getComputedStyle(document.body).overflow }));
    expect(scroll).toEqual({ x: false, y: false, overflow: 'hidden' });
  }
  expect(errors).toEqual([]);
});

test('pantalla de inicio con «Iniciar reproductor» y control discreto de pantalla completa', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/pantalla');
  const dialog = page.getByRole('dialog', { name: 'Reproductor de pantallas' });
  await expect(dialog.getByRole('button', { name: 'Iniciar reproductor' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Vincular esta pantalla' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Iniciar reproductor' }).click();
  await expect(dialog).toBeHidden();
  // El cursor se oculta solo y los controles aparecen al mover el ratón.
  await expect(page.locator('.frame')).toHaveClass(/cursor-hidden/, { timeout: 8000 });
  await page.mouse.move(400, 300);
  await expect(page.locator('.controls')).toHaveClass(/is-on/);
  await expect(page.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
});

test('las escenas de menús salen del gestor de menús (solo publicados, sin inventar)', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // Lo publicado en este momento (otras pruebas cambian precios y publican: la TV debe mostrar el dato vivo).
  const pub = (await (await request.get('/api/content')).json()) as { content: { menus: { id: string; name: string; status: string; price: { amount: number | null } }[] } };
  const first = pub.content.menus.filter((m) => m.status === 'published')[0];
  await page.goto('/pantalla?kiosk=1&escena=escena-menus');
  const live = page.locator('.slayer.is-live[data-scene="escena-menus"]');
  await expect(live.getByRole('heading', { name: first.name.replace(/^Men[uú]\s+/i, '') })).toBeVisible();
  const euros = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(first.price.amount ?? 0);
  await expect(live.locator('.sc-menus__price')).toContainText(euros);
  await expect(live.getByText('Incluye bebida y postre')).toBeVisible();
  // Un menú no publicado (el Gourmet en borrador) no aparece.
  if (!pub.content.menus.some((m) => m.id === 'menu-seleccion-gourmet')) await expect(page.getByText('Gourmet')).toHaveCount(0);
});

test('modo fiesta: los cinco estilos dibujan luz en tiempo real con el logotipo centrado', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const s = (await adminFetch<Cfg>(page, '/signage')).body;
  const presets = ['gold-night', 'red-velvet', 'club-night', 'midnight', 'torero-classic'];
  const { PARTY_PRESETS } = await import('../../shared/signage.ts');
  const config = structuredClone(s.config) as unknown as { scenes: Record<string, unknown>[] };
  for (const p of presets) config.scenes.push({ id: `prueba-${p}`, type: 'party', name: p, status: 'published', duration: 60, transition: 'auto', updatedAt: '', party: PARTY_PRESETS[p as keyof typeof PARTY_PRESETS].config });
  expect((await adminFetch(page, '/signage/config', { method: 'PUT', body: { config, baseRevision: s.revision } })).status).toBe(200);
  for (const p of presets) {
    await page.goto(`/pantalla?kiosk=1&escena=prueba-${p}`);
    const canvas = page.locator('.slayer.is-live canvas.sc-gl');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(600);
    // Se mide la luz en una captura del lienzo (el búfer WebGL no se conserva para leerlo).
    const shot = await page.locator('.stage').screenshot();
    const stats = await sharp(shot).stats();
    const lit = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
    expect(lit, `luz del estilo ${p}`).toBeGreaterThan(8);
    const logo = await page.locator('.slayer.is-live .sc-party__logo').boundingBox();
    const stage = await stageBox(page);
    expect(Math.abs(logo!.x + logo!.width / 2 - (stage!.x + stage!.width / 2))).toBeLessThan(4);
    expect(Math.abs(logo!.y + logo!.height / 2 - (stage!.y + stage!.height / 2))).toBeLessThan(stage!.height * 0.08);
  }
});

let pairedHash = '';
let pairedToken = '';

test('vincular una televisión con código temporal y controlarla a distancia', async ({ browser }) => {
  test.setTimeout(150_000);
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage();
  await login(admin);
  await fastConfig(admin);

  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  await tv.goto('/pantalla?vincular=1');
  const code = (await tv.getByTestId('pair-code').innerText()).replace(/[^A-Z0-9]/g, '');
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // Un código inventado no vincula nada.
  expect((await adminFetch(admin, '/signage/pair', { method: 'POST', body: { code: 'ZZZZ99', name: 'Falsa' } })).status).toBe(404);

  await admin.goto('/admin/pantallas');
  await expect(admin).toHaveURL(/#\/pantallas/);
  await admin.getByRole('link', { name: 'Televisiones' }).click();
  await admin.getByLabel('Código de la pantalla').fill(code);
  await admin.getByLabel('Nombre', { exact: true }).first().fill('TV barra');
  await admin.getByRole('button', { name: 'Vincular televisión' }).click();
  await expect(admin.getByText('Televisión vinculada')).toBeVisible();

  // La pantalla recoge su token y queda vinculada.
  await expect(tv.locator('.frame')).toHaveAttribute('data-paired', 'yes', { timeout: 15_000 });
  pairedToken = (await tv.evaluate(() => localStorage.getItem('torero-screen-token'))) ?? '';
  expect(pairedToken.length).toBeGreaterThan(30);
  pairedHash = await tv.evaluate(async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join(''), pairedToken);

  // El código ya no sirve una segunda vez.
  expect((await adminFetch(admin, '/signage/pair', { method: 'POST', body: { code, name: 'Otra' } })).status).toBeGreaterThanOrEqual(400);

  // Estado real: conectada (latido recibido).
  await admin.getByRole('link', { name: 'Panel de control' }).click();
  const card = admin.locator('.stv').filter({ hasText: 'TV barra' });
  await expect(card.getByText('● Conectada')).toBeVisible({ timeout: 20_000 });

  // Activar fiesta → pendiente → confirmado, y la TV muestra la escena de fiesta.
  await admin.getByRole('button', { name: '✦ Activar Fiesta' }).click();
  await expect(tv.locator('.slayer.is-live[data-type="party"]')).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('Confirmado por la TV')).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText(/Manual · Modo fiesta/)).toBeVisible();

  // Pausar y reanudar.
  await admin.getByRole('button', { name: '❚❚ Pausar' }).click();
  await expect(tv.locator('.frame')).toHaveClass(/is-paused/, { timeout: 20_000 });
  await admin.getByRole('button', { name: '▶ Reanudar' }).click();
  await expect(tv.locator('.frame')).not.toHaveClass(/is-paused/, { timeout: 20_000 });

  // Volver a la programación automática: deja la fiesta.
  await admin.getByRole('button', { name: '⟲ Volver a automática' }).click();
  await expect(tv.locator('.slayer.is-live[data-type="party"]')).toHaveCount(0, { timeout: 20_000 });
  await expect(card.getByText('Automática (horarios)')).toBeVisible();

  // Activar Navidad: la TV pasa a la programación de Navidad.
  await admin.getByRole('button', { name: '❄ Activar Navidad' }).click();
  await expect(tv.locator('.slayer.is-live[data-scene="escena-navidad"]')).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('Confirmado por la TV')).toBeVisible({ timeout: 20_000 });

  // Siguiente escena.
  await admin.getByRole('button', { name: '⏭ Siguiente escena' }).click();
  await expect(tv.locator('.slayer.is-live:not(.is-exit)[data-scene="escena-menus"]')).toBeVisible({ timeout: 20_000 });

  await adminCtx.close();
  await tvCtx.close();
});

test('seguridad: el token de una TV no da acceso al panel y la revocación es inmediata', async ({ page, request }) => {
  test.setTimeout(90_000);
  expect(pairedToken).not.toBe('');
  // Con el token del dispositivo no se entra al API de administración.
  const asTv = await request.get('/api/admin/signage', { headers: { Authorization: `Bearer ${pairedToken}`, 'X-Torero-Admin': '1' } });
  expect(asTv.status()).toBe(401);
  // Sin sesión no se puede vincular ni mandar órdenes.
  const noAuth = await request.post('/api/admin/signage/command', { headers: { 'X-Torero-Admin': '1', Origin: 'http://localhost:8899' }, data: { screenIds: 'all', action: 'party' } });
  expect(noAuth.status()).toBe(401);
  // Latido con token válido → 200; con token falso → 401.
  const ok = await request.get(`/api/screen/d/${pairedHash}`);
  expect(ok.status()).toBe(200);
  const fake = await request.post('/api/screen/heartbeat', { headers: { Authorization: 'Bearer token-inventado-que-no-existe-123' }, data: {} });
  expect(fake.status()).toBe(401);

  await login(page);
  const s = (await adminFetch<Cfg>(page, '/signage')).body;
  const tv = s.screens.find((x) => x.name === 'TV barra')!;
  expect((await adminFetch(page, `/signage/screens/${tv.id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await request.get(`/api/screen/d/${pairedHash}`)).status()).toBe(401);
  const hb = await request.post('/api/screen/heartbeat', { headers: { Authorization: `Bearer ${pairedToken}` }, data: {} });
  expect(hb.status()).toBe(401);
});

test('gestor: crear, editar y publicar una escena y una programación persiste tras recargar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto('/admin#/pantallas/escenas');
  await page.getByRole('button', { name: '+ Nueva escena' }).click();
  await page.getByRole('button', { name: /Mensaje personalizado/ }).click();
  await page.getByLabel('Nombre (solo en el panel)').fill('Aviso Nochevieja');
  await page.getByLabel('Texto principal').fill('Feliz Año Nuevo');
  await page.getByRole('switch', { name: /Publicada/ }).click();
  await expect(page.locator('.seditor__preview .sc-message__text')).toHaveText('Feliz Año Nuevo');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Pantallas actualizadas').last()).toBeVisible();

  // Añadirla a una programación nueva.
  await page.goto('/admin#/pantallas/programaciones');
  await page.getByRole('button', { name: '+ Nueva programación' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Fin de año');
  await page.getByLabel('Escena para añadir').selectOption({ label: 'Aviso Nochevieja (Mensaje personalizado)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Pantallas actualizadas').last()).toBeVisible();

  // Horario con prioridad que cruza la medianoche.
  await page.goto('/admin#/pantallas/horarios');
  await page.getByRole('button', { name: '+ Nuevo horario' }).click();
  const last = page.locator('.card').last();
  await last.getByLabel('Programación').selectOption({ label: 'Fin de año' });
  await last.getByLabel('Desde las').fill('22:00');
  await last.getByLabel('Hasta las').fill('03:00');
  await expect(last.getByText('Cruza la medianoche')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Pantallas actualizadas').last()).toBeVisible();

  await page.reload();
  await page.goto('/admin#/pantallas/escenas');
  await expect(page.locator('.sscene').filter({ hasText: 'Aviso Nochevieja' }).getByText('Publicada')).toBeVisible();
  const s = (await adminFetch<{ config: { playlists: { name: string; items: unknown[] }[]; schedules: { start: string; end: string; playlistId: string }[] } }>(page, '/signage')).body;
  const fin = s.config.playlists.find((p) => p.name === 'Fin de año');
  expect(fin?.items).toHaveLength(1);
  expect(s.config.schedules.some((x) => x.start === '22:00' && x.end === '03:00')).toBe(true);

  // El reproductor público recibe la escena publicada.
  const cfg = await page.request.get('/api/screen/config');
  const body = await cfg.json();
  expect(body.config.scenes.some((x: { name: string }) => x.name === 'Aviso Nochevieja')).toBe(true);
});

test('el panel de pantallas funciona en el móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/admin#/pantallas');
  await expect(page.getByRole('heading', { name: 'Gestor de Pantallas' })).toBeVisible();
  await expect(page.getByRole('button', { name: '✦ Activar Fiesta' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('resistencia: reproducción continua sin fugas de contextos WebGL ni capas', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await fastConfig(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  // Programación con escenas WebGL y DOM alternándose cada 4 s.
  await page.goto('/pantalla?kiosk=1');
  const samples: { contexts: number; created: number; layers: number; heap: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(2500);
    const sample = await page.evaluate(() => {
      const g = (globalThis as unknown as { __toreroGl?: { contexts: number; created: number } }).__toreroGl;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        contexts: g?.contexts ?? 0,
        created: g?.created ?? 0,
        layers: document.querySelectorAll('.slayer').length,
        heap: mem ? mem.usedJSHeapSize / 1048576 : 0,
        scene: document.querySelector('.slayer.is-live:not(.is-exit)')?.getAttribute('data-scene') ?? '',
      };
    });
    seen.add(sample.scene);
    samples.push(sample);
    expect(sample.contexts).toBeLessThanOrEqual(2);
    expect(sample.layers).toBeLessThanOrEqual(3);
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  const createdTotal = samples[samples.length - 1].created;
  // Se crean y liberan contextos al pasar por escenas con luz; nunca se acumulan.
  expect(samples[samples.length - 1].contexts).toBeLessThanOrEqual(2);
  console.log(`Escenas recorridas: ${[...seen].join(', ')} · contextos creados ${createdTotal} · memoria ${samples[0].heap.toFixed(1)} → ${samples[samples.length - 1].heap.toFixed(1)} MB`);
  if (samples[0].heap) expect(samples[samples.length - 1].heap).toBeLessThan(samples[0].heap * 2 + 20);
  expect(errors).toEqual([]);
});

test('enlace «Modo Pantalla» en el pie de la web', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('torero:intro-visto', String(Date.now())));
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Modo Pantalla' });
  await expect(link).toHaveAttribute('href', '/pantalla');
});
