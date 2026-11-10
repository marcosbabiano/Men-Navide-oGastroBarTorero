import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill('admin@torero.local');
  await page.getByLabel('Contraseña').fill('torero-local-2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
}

test('calendario: fijar inicio y fin, cierres y excepciones, publicar y verlo destacado en la web', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('torero:intro-visto', String(Date.now())));
  // Sin fechas, la web no muestra el calendario ni el distintivo.
  await page.goto('/');
  await expect(page.locator('#calendario')).toHaveCount(0);
  await expect(page.locator('.period-badge')).toHaveCount(0);

  await login(page);
  await page.goto('/admin#/calendario');
  await page.getByLabel('Fecha de inicio').fill('2026-12-01');
  await page.getByLabel('Fecha de fin').fill('2027-01-06');
  await expect(page.getByText('Se mostrará: «Menús de Navidad del 1 de diciembre de 2026 al 6 de enero de 2027»')).toBeVisible();
  await page.getByRole('button', { name: 'Lunes', exact: true }).click();
  await page.getByLabel('Día para añadir').fill('2026-12-25');
  await page.getByRole('button', { name: '+ Añadir día' }).click();
  await page.getByLabel('Nota del 2026-12-25').fill('Navidad: cerrado');
  await expect(page.locator('.cal-admin__day.is-menus').first()).toBeVisible();
  await page.locator('.topbar').getByRole('button', { name: 'Publicar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar ahora' }).click();
  await expect(page.getByText('¡Publicado!')).toBeVisible();

  await page.goto('/');
  const cal = page.locator('#calendario');
  await expect(cal).toBeVisible();
  await expect(cal.getByText('del 1 de diciembre de 2026 al 6 de enero de 2027')).toBeVisible();
  await expect(page.locator('.hero .period-badge')).toContainText('del 1 de diciembre de 2026 al 6 de enero de 2027');
  await expect(cal.locator('[aria-label^="5 de diciembre: Menús de Navidad"]')).toHaveCount(1);
  await expect(cal.locator('[aria-label^="7 de diciembre: Cerrado"]')).toHaveCount(1);
  await expect(cal.locator('[aria-label="25 de diciembre: Cerrado (Navidad: cerrado)"]')).toHaveCount(1);
  await expect(cal.locator('[aria-label^="10 de enero: Abierto"]')).toHaveCount(1);
  // Solo informativo: sin disponibilidad ni plazas.
  await expect(cal).not.toContainText(/disponib|plazas|completo|agotad/i);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Calendario' }).first()).toHaveAttribute('href', '#calendario');

  // Móvil sin desbordes.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#calendario');
  await expect(cal).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
