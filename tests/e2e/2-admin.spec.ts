import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function login(page: Page, email = 'admin@torero.local', pw = 'torero-local-2026') {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(pw);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
async function publishNow(page: Page) {
  await page.locator('.topbar').getByRole('button', { name: 'Publicar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar ahora' }).click();
  await expect(page.getByText('¡Publicado!')).toBeVisible();
}
const landing = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem('torero:intro-visto', String(Date.now())));
  await page.goto('/');
};

test('credenciales incorrectas muestran un error comprensible', async ({ page }) => {
  await login(page, 'admin@torero.local', 'mala-contraseña');
  await expect(page.getByRole('alert')).toContainText('incorrectos');
});

test('un usuario sin rol admin no accede', async ({ page }) => {
  await login(page, 'editor@torero.local');
  await expect(page.getByRole('heading', { name: 'Sin permisos de administración' })).toBeVisible();
});

test('la vista previa exige sesión', async ({ page }) => {
  await page.goto('/preview');
  await expect(page.getByRole('heading', { name: 'Vista previa protegida' })).toBeVisible();
});

test('cambiar un precio y verlo publicado en la landing', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await page.goto('/admin#/menus/menu-esencia');
  const price = page.getByLabel('Precio', { exact: true });
  await price.fill('39,50');
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  await page.locator('.topbar').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Borrador guardado')).toBeVisible();
  await publishNow(page);
  await landing(page);
  await expect(page.locator('#menu-menu-esencia .menu__price-amount')).toHaveText('39,50 €');
});

test('crear y publicar un tercer menú desde el panel', async ({ page }) => {
  await login(page);
  await page.goto('/admin#/menus');
  // El Gourmet ya existe en borrador (creado por la actualización): no se duplica.
  await expect(page.locator('.mrow', { hasText: 'Menú Selección Gourmet' })).toHaveCount(1);
  await expect(page.locator('.mrow', { hasText: 'Menú Selección Gourmet' })).toContainText('Borrador');
  await page.getByRole('button', { name: '+ Nuevo menú' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo menú' })).toBeVisible();
  await page.getByLabel('Nombre comercial').fill('Menú Tradición');
  await page.getByLabel('Precio', { exact: true }).fill('52');
  const sections = page.locator('.sec');
  await expect(page.getByLabel('Opciones que elige cada comensal').first()).toHaveValue('1');
  await sections.nth(0).getByRole('button', { name: '+ Añadir plato' }).click();
  await sections.nth(0).getByLabel('Plato 1').fill('Plato de prueba para compartir');
  await sections.nth(1).getByRole('button', { name: '+ Añadir plato' }).click();
  await sections.nth(1).getByLabel('Plato 1').fill('Principal A');
  await sections.nth(1).getByRole('button', { name: '+ Añadir plato' }).click();
  await sections.nth(1).getByLabel('Plato 2').fill('Principal B');
  await page.getByText('Publicado', { exact: true }).first().click();
  await publishNow(page);
  await landing(page);
  await expect(page.locator('.menu')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: /Tradición/ })).toBeVisible();
  await expect(page.locator('.ctable thead th')).toHaveCount(3);
  await expect(page.getByText('Selección Gourmet')).toHaveCount(0);
  // Postre y bebida del nuevo menú siguen pendientes: no se muestran.
  const tercero = page.locator('.menu').nth(2);
  await expect(tercero.locator('.msec--dessert, .msec--drink')).toHaveCount(0);
});

test('editar horarios, textos y subir una imagen persisten y se publican', async ({ page }) => {
  await login(page);
  await page.goto('/admin#/establecimiento');
  await page.getByRole('switch', { name: /Horario confirmado/ }).click();
  await page.getByRole('button', { name: '+ Añadir horario especial' }).click();
  await page.getByLabel('Nombre (opcional)').fill('Nochebuena');
  await page.goto('/admin#/textos');
  await page.getByLabel('Titular · principal').fill('cada reencuentro');
  await page.goto('/admin#/multimedia');
  await page.locator('input[type=file]').first().setInputFiles('public/icon-512.png');
  await page.getByLabel(/Texto alternativo/).first().fill('Icono de prueba');
  await page.getByRole('button', { name: 'Subir imagen' }).click();
  await expect(page.getByText('Imagen subida')).toBeVisible();
  await publishNow(page);
  await landing(page);
  await expect(page.locator('#hero-title')).toContainText('cada reencuentro');
  await expect(page.locator('.hours')).toContainText('Viernes – Domingo');
  await expect(page.locator('.hours')).toContainText('Nochebuena');
  // Tras recargar el panel (sesión ya iniciada), los cambios siguen ahí (almacenamiento persistente).
  await page.goto('/admin#/multimedia');
  await page.reload();
  await expect(page.locator('.mlib__item input[value="Icono de prueba"]')).toHaveCount(1);
  await page.goto('/admin#/textos');
  await expect(page.getByLabel('Titular · principal')).toHaveValue('cada reencuentro');
});

test('vista previa del borrador con sesión', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await page.goto('/preview');
  await expect(page.getByText('Vista previa del borrador')).toBeVisible();
});

test('los enlaces de invitación de Identity que llegan a la portada se redirigen al panel', async ({ page }) => {
  await page.goto('/#invite_token=token-de-prueba');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Activa tu cuenta' })).toBeVisible();
  await expect(page.getByLabel('Nueva contraseña')).toBeVisible();
});

test('Selección Gourmet: precio desde el panel, publicación y presentación con primer y segundo plato', async ({ page }) => {
  await login(page);
  await page.goto('/admin#/menus/menu-seleccion-gourmet');
  await expect(page.getByRole('heading', { name: 'Menú Selección Gourmet' })).toBeVisible();
  // Sin precio no se puede publicar como visible.
  await page.locator('.segmented__opt', { hasText: /^Publicado$/ }).click();
  await expect(page.locator('.issue--blocker', { hasText: 'falta el precio' })).toBeVisible();
  await page.getByLabel('Precio', { exact: true }).fill('58');
  await expect(page.locator('.issue--blocker', { hasText: 'falta el precio' })).toHaveCount(0);
  await publishNow(page);
  await landing(page);
  const g = page.locator('#menu-menu-seleccion-gourmet');
  await expect(g).toHaveClass(/menu--gourmet/);
  await expect(g.locator('.menu__price-amount')).toHaveText('58 €');
  await expect(g.locator('.msec--choice')).toHaveCount(2);
  await expect(g.locator('.msec--choice').nth(0)).toContainText('Primer plato');
  await expect(g.locator('.msec--choice').nth(1)).toContainText('Magret de Pato');
  await expect(g.locator('.msec--shared .msec__or')).toHaveCount(0);
  await expect(g.locator('.msec--dessert')).toContainText('Café y Dulces Tradicionales');
  await expect(page.locator('#comparar .ctable__group', { hasText: 'Segundo plato' })).toHaveCount(1);
});
