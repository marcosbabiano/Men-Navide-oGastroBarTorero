import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const skipIntro = (page: Page) => page.addInitScript(() => localStorage.setItem('torero:intro-visto', String(Date.now())));

async function scrollThrough(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(40);
  }
}

test.describe('Landing', () => {
  test('muestra Esencia y Distinción con precio, postre y bebida; el Gourmet en borrador no aparece', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('cada encuentro');
    const esencia = page.locator('#menu-menu-esencia');
    const distincion = page.locator('#menu-menu-distincion');
    await expect(esencia.locator('.menu__price-amount')).toHaveText('36 €');
    await expect(distincion.locator('.menu__price-amount')).toHaveText('45 €');
    await expect(esencia.getByText('Para compartir en el centro de la mesa')).toBeVisible();
    await expect(esencia.getByText('A elegir un plato por comensal')).toBeVisible();
    await expect(esencia.getByText('Tarta de tres chocolates')).toBeVisible();
    await expect(distincion.locator('.msec--dessert')).toContainText('Postre');
    await expect(distincion.locator('.msec--drink')).toContainText('Bebida incluida');
    await expect(esencia.locator('.msec--dessert')).toContainText('Tarta de tres chocolates');
    await expect(page.locator('.menu')).toHaveCount(2);
    await expect(page.getByText('Selección Gourmet')).toHaveCount(0);
    await expect(page.locator('#comparar .ctable__pending')).toHaveCount(0);
    // Los entrantes compartidos no se presentan como alternativas.
    await expect(esencia.locator('.msec--shared .msec__or')).toHaveCount(0);
    await expect(esencia.locator('.msec--choice .msec__or')).toHaveCount(1);
  });

  test('todos los botones de reserva llevan a la elección de menús (/reservar)', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    const links = page.locator('[data-book]');
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(8);
    const places = new Set<string>();
    for (let i = 0; i < n; i++) {
      const a = links.nth(i);
      await expect(a).toHaveAttribute('href', '/reservar');
      await expect(a).not.toHaveAttribute('target', '_blank');
      places.add((await a.getAttribute('data-book')) ?? '');
    }
    for (const p of ['hero', 'nav', 'menu-menu-esencia', 'menu-menu-distincion', 'como-reservar', 'footer', 'barra-movil']) expect(places).toContain(p);
  });

  for (const width of [320, 390, 768, 1440]) {
    test(`sin scroll horizontal a ${width}px`, async ({ page }) => {
      await skipIntro(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await scrollThrough(page);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }

  for (const width of [390, 1440]) {
    test(`accesibilidad WCAG 2.2 AA (axe) a ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await scrollThrough(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }

  test('intro: aparece la primera vez, se puede saltar y no se repite', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('button', { name: 'Saltar intro' });
    await expect(skip).toBeVisible();
    await skip.click();
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 4000 });
    await page.getByRole('link', { name: /Descubrir los menús/ }).click();
    await page.reload();
    await expect(page.locator('.intro')).toHaveCount(0);
  });

  test('con movimiento reducido no hay intro y el contenido es visible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.intro')).toHaveCount(0);
    await expect(page.locator('#story-title')).toBeVisible();
    await expect(page.locator('#story-title')).toHaveCSS('opacity', '1');
  });

  test('menú móvil accesible: abre, enlaza y se cierra con Escape', async ({ page }) => {
    await skipIntro(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Abrir menú' });
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Menú de navegación' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused();
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await dialog.getByRole('link', { name: /Preguntas/ }).click();
    await expect(dialog).toBeHidden();
  });

  test('barra de reserva móvil aparece tras la portada', async ({ page }) => {
    await skipIntro(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const bar = page.locator('.mbar');
    await expect(page.locator('#menus')).toBeAttached();
    await expect(bar).not.toHaveClass(/is-visible/);
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, 1600));
        return bar.getAttribute('class');
      })
      .toMatch(/is-visible/);
    await expect(bar).toContainText('36 €');
  });

  test('SEO: título, Open Graph, Twitter, JSON-LD, robots y sitemap', async ({ page, request }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Menús de Navidad 2026 · GastroBar Torero');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og-default\.jpg$/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
    expect(ld['@type']).toBe('BarOrPub');
    expect(ld.hasMenu).toHaveLength(2);
    expect(ld.address).toBeUndefined();
    expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /admin');
    expect(await (await request.get('/sitemap.xml')).text()).toContain('<urlset');
  });

  test('cabeceras de seguridad y FAQ editable', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res?.headers()['x-frame-options']).toBe('DENY');
    await skipIntro(page);
    const q = page.getByRole('button', { name: /alergias o intolerancias/ });
    await q.click();
    await expect(q).toHaveAttribute('aria-expanded', 'true');
  });
});
