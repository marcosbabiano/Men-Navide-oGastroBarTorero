import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

test.describe.configure({ mode: 'serial' });

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill('admin@torero.local');
  await page.getByLabel('Contraseña').fill('torero-local-2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
}
async function publishNow(page: Page) {
  await page.locator('.topbar').getByRole('button', { name: 'Publicar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar ahora' }).click();
  await expect(page.getByText('¡Publicado!')).toBeVisible();
}
async function landing(page: Page) {
  await page.addInitScript(() => localStorage.setItem('torero:intro-visto', String(Date.now())));
  await page.goto('/');
}
const row = (page: Page, type: string) => page.locator(`.srow[data-section="${type}"]`);

test.describe('Gestor de secciones', () => {
  test('ocultar y volver a mostrar la comparativa', async ({ page }) => {
    await login(page);
    await page.goto('/admin#/secciones');
    await row(page, 'compare').getByRole('switch').click();
    await expect(row(page, 'compare').locator('.badge', { hasText: 'Oculta' })).toBeVisible();
    await publishNow(page);
    await landing(page);
    await expect(page.locator('#comparar')).toHaveCount(0);
    await expect(page.locator('.nav__links a[href="#comparar"]')).toHaveCount(0);
    await expect(page.locator('#menus')).toBeVisible();

    await page.goto('/admin#/secciones');
    await row(page, 'compare').getByRole('switch').click();
    await publishNow(page);
    await landing(page);
    await expect(page.locator('#comparar')).toHaveCount(1);
  });

  test('las secciones esenciales están protegidas', async ({ page }) => {
    await login(page);
    await page.goto('/admin#/secciones');
    await expect(row(page, 'menus').getByRole('switch')).toBeDisabled();
    await expect(row(page, 'menus').getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    await expect(row(page, 'howTo').getByRole('button', { name: 'Eliminar' })).toBeDisabled();
  });

  test('reordenar, editar textos, crear un bloque, publicar y recargar', async ({ page }) => {
    await login(page);
    await page.goto('/admin#/secciones');
    // Subir «Preguntas frecuentes» dos posiciones con los controles accesibles.
    await row(page, 'faq').getByRole('button', { name: 'Subir' }).click();
    await row(page, 'faq').getByRole('button', { name: 'Subir' }).click();
    // Editar textos de una sección.
    await row(page, 'story').getByRole('link', { name: 'Editar', exact: true }).click();
    await expect(page).toHaveURL(/#\/textos\?s=story/);
    const title = page.locator('#g-story').getByLabel('Título', { exact: true });
    await title.fill('La Navidad se celebra en compañía');
    // Nuevo bloque «Llamada a la acción».
    await page.goto('/admin#/secciones');
    await page.getByRole('button', { name: /Llamada a la acción/ }).click();
    await expect(page.getByRole('heading', { name: /Llamada a la acción/ })).toBeVisible();
    await page.getByLabel('Título', { exact: true }).fill('Brindemos juntos esta Navidad');
    await page.getByLabel('Texto en el menú de navegación').fill('Brindis');
    await publishNow(page);

    await landing(page);
    await expect(page.locator('#celebrar')).toBeAttached();
    await expect(page.locator('#preguntas')).toBeAttached();
    const order = await page.evaluate(() => ['celebrar', 'preguntas', 'reservar'].map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1));
    expect(order[1]).toBeLessThan(order[0]);
    await expect(page.locator('#story-title')).toContainText('La Navidad se celebra en compañía');
    const block = page.locator('.cblock--cta');
    await expect(block).toContainText('Brindemos juntos esta Navidad');
    await expect(block.locator('a[data-book]')).toHaveAttribute('href', '/reservar');
    await expect(page.locator('.nav__links')).toContainText('Brindis');

    // Recargar el panel: todo sigue guardado.
    await page.goto('/admin#/secciones');
    await page.reload();
    await expect(page.locator('.srow[data-section="custom"]')).toContainText('Llamada a la acción');
    const types = await page.locator('.srow').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
    expect(types.indexOf('faq')).toBeLessThan(types.indexOf('celebration'));
  });
});

async function pngSize(path: string) {
  const b = await readFile(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test.describe('Estudio Creativo', () => {
  test('publicación vertical desde plantilla: textos, datos de menú, imagen, guardar, reabrir y exportar', async ({ page }) => {
    await login(page);
    await page.goto('/admin#/estudio');
    await page.getByRole('button', { name: 'Usar plantilla Menú I (Esencia)' }).click();
    await expect(page.locator('.newdesign__row select').nth(1)).toHaveValue('menu-esencia');
    await page.getByRole('button', { name: 'Crear con esta plantilla' }).click();
    await expect(page.locator('.studio__canvas canvas').first()).toBeVisible();
    await expect(page.locator('.studio .badge')).toContainText('1080×1350');

    // Texto nuevo y edición.
    await page.getByRole('button', { name: '+ Titular' }).click();
    const content = page.getByLabel('Contenido');
    await content.fill('Navidad en Torero');
    await page.getByLabel('Tamaño').fill('120');
    // Datos del menú publicado.
    await page.getByRole('tab', { name: 'Menús' }).click();
    await page.getByRole('button', { name: '+ Precio' }).click();
    await expect(page.locator('.bindinfo')).toContainText('Menú Esencia');
    await expect(page.getByLabel('Contenido')).toHaveValue(/^\d+(,\d{2})? €$/);
    // Imagen existente de la biblioteca del panel.
    await page.getByRole('tab', { name: 'Añadir' }).click();
    await page.getByRole('button', { name: '+ Fotografía o ilustración' }).click();
    await page.locator('.mgrid__item').first().click();
    await expect(page.getByRole('button', { name: 'Cambiar imagen' })).toBeVisible();
    // Guardar.
    await page.getByLabel('Nombre del diseño').fill('Prueba Esencia');
    await page.locator('.studio__actions').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Diseño guardado')).toBeVisible();
    await expect(page).toHaveURL(/#\/estudio\/diseno-/);

    // Reabrir desde el listado.
    await page.goto('/admin#/estudio');
    const card = page.locator('.dcard', { hasText: 'Prueba Esencia' });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    await card.getByRole('link', { name: 'Editar', exact: true }).click();
    await page.getByRole('tab', { name: 'Capas' }).click();
    await expect(page.locator('.layers')).toContainText('Navidad en Torero');
    await expect(page.locator('.layers')).toContainText(' €');

    // Exportar PNG, JPG y PDF con dimensiones reales.
    const exp = async (label: string) => {
      await page.locator('.studio__actions .exportmenu summary').click();
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
      return dl.path();
    };
    const png = await exp('PNG alta resolución');
    expect(await pngSize(png)).toEqual({ w: 1080, h: 1350 });
    const jpg = await exp('JPG alta calidad');
    const meta = await sharp(jpg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 1350]);
    const pdf = await exp('PDF');
    expect((await readFile(pdf)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('historia 1080×1920 con zona segura, guardada y exportada', async ({ page }) => {
    await login(page);
    await page.goto('/admin#/estudio');
    await page.getByRole('button', { name: 'Usar plantilla Historia: ya puedes reservar' }).click();
    await page.getByRole('button', { name: 'Crear con esta plantilla' }).click();
    await expect(page.locator('.studio .badge')).toContainText('1080×1920');
    await page.locator('.studio__actions').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Diseño guardado')).toBeVisible();
    await page.locator('.studio__actions .exportmenu summary').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PNG alta resolución' }).click()]);
    expect(await pngSize(await dl.path())).toEqual({ w: 1080, h: 1920 });
  });

  test('si cambia el precio de un menú, el diseño guardado pregunta antes de actualizarse', async ({ page }) => {
    await login(page);
    await page.goto('/admin#/menus/menu-esencia');
    await page.getByLabel('Precio', { exact: true }).fill('41');
    await publishNow(page);
    await page.goto('/admin#/estudio');
    await page.locator('.dcard', { hasText: 'Prueba Esencia' }).getByRole('link', { name: 'Editar', exact: true }).click();
    await expect(page.getByText(/cambiado desde que se guardó/)).toBeVisible();
    await page.getByRole('tab', { name: 'Capas' }).click();
    await expect(page.locator('.layers')).not.toContainText('41 €');
    await page.getByRole('button', { name: 'Actualizar con los datos actuales' }).click();
    await expect(page.locator('.layers')).toContainText('41 €');
  });

  test('el gestor de imágenes existente sigue funcionando', async ({ page }) => {
    await login(page);
    await page.goto('/admin#/multimedia');
    await page.locator('input[type=file]').first().setInputFiles('public/icon-512.png');
    await page.getByLabel(/Texto alternativo/).first().fill('Ornamento de prueba');
    await page.getByRole('button', { name: 'Subir imagen' }).click();
    await expect(page.getByText('Imagen subida')).toBeVisible();
    await expect(page.locator('.mlib__item input[value="Ornamento de prueba"]')).toHaveCount(1);
  });
});
