import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const INBOUND = { 'X-Torero-Inbound-Token': 'local-inbound-secret' };
const DATE = '2026-12-24';

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico').fill('admin@torero.local');
  await page.getByLabel('Contraseña').fill('torero-local-2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
}
const inbound = (request: APIRequestContext, body: Record<string, string>) => request.post('/api/reservas/inbound', { headers: INBOUND, data: { From: 'Qamarero <avisos@qamarero.com>', Subject: 'Nueva reserva', Date: '2026-11-10T12:00:00Z', MessageID: `e2e-${Math.random()}`, ...body } });

let ref = '';

test('formulario: adultos con el mismo menú y platos individuales, niños de carta y con otro menú, alergias y continuación a Qamarero', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reservar');
  await expect(page.getByRole('heading', { name: 'Elegid vuestros menús de Navidad' })).toBeVisible();
  // Campos obligatorios.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('nombre del titular');
  await page.getByLabel('Nombre y apellidos del titular').fill('Lucía Martín Pérez');
  await page.getByLabel('Teléfono de contacto').fill('612 345 678');
  await page.getByLabel('Correo electrónico').fill('lucia@example.com');
  await page.locator('.rs-seg label', { hasText: 'Cena' }).click();
  await page.getByRole('button', { name: 'Añadir uno (Adultos)' }).click();
  await page.getByRole('button', { name: 'Añadir uno (Niños)' }).click();
  await page.getByRole('button', { name: 'Añadir uno (Niños)' }).click();
  await expect(page.locator('.rs-total')).toContainText('5');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Menú común: no se puede seguir sin elegirlo.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('menú común');
  await page.locator('.rs-menu', { hasText: 'Menú Esencia' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Niños: uno con carta habitual, otro con el Menú Distinción.
  const kids = page.locator('.rs-kid');
  await expect(kids).toHaveCount(2);
  await kids.nth(1).locator('.rs-option', { hasText: 'Menú Distinción' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Platos: aplicar a todos y cambiar uno.
  await expect(page.getByText('1 de 5')).toBeVisible(); // solo el niño de carta está completo
  await page.getByRole('button', { name: 'Secreto ibérico' }).click();
  await page.locator('#diner-a2').getByRole('button', { expanded: false }).click();
  await page.locator('#diner-a2 .rs-option', { hasText: 'Bacalao en salsa' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('Niño 2');
  await page.locator('#diner-c2 .rs-option', { hasText: 'Entrecot' }).click();
  await page.locator('#diner-c2').getByLabel(/Alergias o intolerancias/).fill('Frutos secos');
  await expect(page.getByText('5 de 5')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel('Alergias e intolerancias (de todo el grupo)').fill('Un adulto celíaco');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Revisión.
  const sum = page.locator('.rs-sum');
  await expect(sum).toContainText('Lucía Martín Pérez');
  await expect(sum).toContainText('Total de personas');
  await expect(sum).toContainText('Adulto 2 — Menú Esencia');
  await expect(sum).toContainText('Bacalao en salsa');
  await expect(sum).toContainText('Niño 1 — Carta habitual — elección en el restaurante');
  await expect(sum).toContainText('Niño 2 — Menú Distinción');
  await expect(sum).toContainText('Frutos secos');
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page.getByText('acepta el tratamiento')).toBeVisible();
  await page.locator('.rs-consent input').check();
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();

  await expect(page.getByRole('heading', { name: /Ya tenemos la elección de vuestros menús/ })).toBeVisible();
  ref = (await page.getByTestId('ref').innerText()).trim();
  expect(ref).toMatch(/^TOR-[A-Z0-9]{5}$/);
  await expect(page.getByTestId('continuar')).toHaveAttribute('href', /^https:\/\/booking\.qamarero\.com\//);
  await expect(page.getByText('Vuestra mesa todavía no está reservada')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('formulario: diez adultos con «aplicar a todos»', async ({ page }) => {
  await page.goto('/reservar');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel('Nombre y apellidos del titular').fill('Grupo Empresa Torres');
  await page.getByLabel('Teléfono de contacto').fill('699 000 111');
  await page.getByLabel('Correo electrónico').fill('torres@example.com');
  await page.getByLabel('Adultos', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.rs-menu', { hasText: 'Menú Distinción' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Entrecot' }).click();
  await expect(page.getByText('10 de 10')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.rs-consent input').check();
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page.getByTestId('ref')).toBeVisible();
});

test('correo de Qamarero con la referencia → vinculación automática; duplicado sin duplicar', async ({ page, request }) => {
  const body = { MessageID: 'e2e-dup-1', TextBody: `Localizador: QM-555\nNombre: Lucía Martín Pérez\nTeléfono: +34 612 345 678\nFecha: 24/12/2026\nHora: 21:30\nPersonas: 5\nZona: Salón\nObservaciones: ${ref}` };
  expect((await (await inbound(request, body)).json()).status).toBe('processed');
  expect((await (await inbound(request, body)).json()).status).toBe('duplicate');
  // Sin secreto no se acepta.
  expect((await request.post('/api/reservas/inbound', { data: body })).status()).toBe(401);
  await login(page);
  await page.goto('/admin#/reservas/lista');
  const row = page.locator('.rtable tbody tr', { hasText: 'Lucía Martín Pérez' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Confirmación recibida por email');
  await expect(row).toContainText('21:30');
  await row.getByRole('button', { name: 'Ver' }).click();
  await expect(page.getByText(`Referencia ${ref}`)).toBeVisible();
  await expect(page.getByText('Vinculada (referencia)')).toBeVisible();
  // Principio 3: confirmación por email sin revisión reciente.
  await expect(page.locator('.rbadges')).toContainText('Confirmación por email sin revisión reciente');
  await expect(page.locator('.rallergy').first()).toBeVisible();
});

test('WhatsApp, enlace de un solo uso, cambio de comensales pendiente y nueva solicitud', async ({ page, context }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/admin#/reservas/lista');
  await page.locator('.rtable tbody tr', { hasText: 'Lucía Martín Pérez' }).getByRole('button', { name: 'Ver' }).click();
  await page.getByRole('button', { name: 'Enviar enlace de modificación por WhatsApp' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Se abrirá WhatsApp con +34612345678')).toBeVisible();
  await dlg.getByRole('button', { name: 'Generar enlace privado' }).click();
  const msg = await dlg.getByLabel('Mensaje (puedes editarlo)').inputValue();
  expect(msg).toContain('Hola Lucía');
  expect(msg).not.toContain('Frutos secos');
  const link = /https?:\/\/\S+\/reservar\/modificar\/[\w-]+/.exec(msg)![0];
  const wa = await dlg.getByTestId('wa-link').getAttribute('href');
  expect(wa).toBe(`https://wa.me/34612345678?text=${encodeURIComponent(msg)}`);
  await dlg.getByRole('button', { name: 'Cerrar' }).click();

  // El cliente abre el enlace (abrir no lo consume), añade un adulto y guarda.
  const client = await context.newPage();
  await client.goto(link);
  await client.reload();
  await expect(client.getByRole('heading', { name: 'Revisad y modificad vuestra elección' })).toBeVisible();
  await client.getByRole('button', { name: 'Añadir uno (Adultos)' }).click();
  await expect(client.getByText('no cambia vuestra reserva de mesa')).toBeVisible();
  await client.getByRole('button', { name: 'Continuar' }).click();
  await client.getByRole('button', { name: 'Continuar' }).click();
  await client.getByRole('button', { name: 'Continuar' }).click();
  await expect(client.getByText('5 de 6')).toBeVisible();
  await client.locator('#diner-a4 .rs-option', { hasText: 'Secreto ibérico' }).click();
  await client.getByRole('button', { name: 'Continuar' }).click();
  await client.getByRole('button', { name: 'Continuar' }).click();
  await client.getByRole('button', { name: 'Guardar modificaciones' }).click();
  await expect(client.getByRole('heading', { name: 'Hemos recibido correctamente las modificaciones de vuestros menús.' })).toBeVisible();
  await expect(client.getByText('aún no modifica vuestra reserva de mesa')).toBeVisible();
  // Segunda vez: consumido; se puede pedir otro.
  await client.goto(link);
  await expect(client.getByRole('heading', { name: 'Este enlace ya se ha utilizado' })).toBeVisible();
  await client.getByLabel('Motivo (opcional)').fill('Se apunta un primo');
  await client.getByRole('button', { name: 'Solicitar una nueva modificación' }).click();
  await expect(client.getByText('Hemos recibido vuestra solicitud')).toBeVisible();

  // Panel: cambio de comensales pendiente de confirmar (5 confirmados → 6 solicitados).
  await page.reload();
  await expect(page.getByText(/Cambio de comensales pendiente de confirmar en Qamarero/).first()).toBeVisible();
  await expect(page.getByText('El cliente modifica la elección de menús (enlace privado)')).toBeVisible();
  await expect(page.getByText('Adultos: 3 → 4')).toBeVisible();
  await page.goto('/admin#/reservas/solicitudes');
  await expect(page.getByText('Motivo: Se apunta un primo')).toBeVisible();
  await page.goto('/admin#/reservas/lista');
  await page.locator('.rtable tbody tr', { hasText: 'Lucía Martín Pérez' }).getByRole('button', { name: 'Ver' }).click();
  await page.getByRole('button', { name: /Ya está actualizado en Qamarero \(6 personas\)/ }).click();
  await expect(page.getByText('Cambio de comensales confirmado en Qamarero: 6 personas')).toBeVisible();
});

test('coincidencia ambigua: revisión manual y vinculación desde el panel', async ({ page, request }) => {
  // Correo sin referencia de alguien con dos formularios posibles (misma persona, distinto servicio).
  for (const svc of ['Comida', 'Cena']) {
    await page.goto('/reservar');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByLabel('Nombre y apellidos del titular').fill('Pedro Gil');
    await page.getByLabel('Teléfono de contacto').fill('655 444 333');
    await page.getByLabel('Correo electrónico').fill(`pedro.${svc}@example.com`);
    await page.locator('.rs-seg label', { hasText: svc }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('.rs-menu', { hasText: 'Menú Esencia' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Secreto ibérico' }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('.rs-consent input').check();
    await page.getByRole('button', { name: 'Guardar y continuar' }).click();
    await expect(page.getByTestId('ref')).toBeVisible();
  }
  const r = await (await inbound(request, { TextBody: `Localizador: QM-777\nNombre: Pedro Gil\nTeléfono: 655444333\nFecha: ${DATE.split('-').reverse().join('/')}\nHora: 14:00\nPersonas: 2` })).json();
  expect(r.result).toMatch(/pendiente de revisar coincidencia/);
  await login(page);
  await page.goto('/admin#/reservas/lista?f=unlinked');
  await page.locator('.rtable tbody tr', { hasText: 'Pedro Gil' }).first().getByRole('button', { name: 'Ver' }).click();
  await expect(page.getByText('Pendiente de revisar coincidencia.')).toBeVisible();
  const rows = page.locator('.ralert table tbody tr');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'mismo servicio' }).getByRole('button', { name: 'Es esta' }).click();
  await expect(page.getByText('Vinculada (manual)')).toBeVisible();
  await expect(page.getByText('Vinculada manualmente').first()).toBeVisible();
});

test('cocina e informes: cálculo, cancelaciones, impresión A4, PDF, CSV y cambios posteriores', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/admin#/reservas/cocina');
  await page.getByLabel('Desde').fill(DATE);
  await page.getByLabel('Hasta').fill(DATE);
  await page.getByLabel('Servicio').selectOption('dinner');
  const principal = page.locator('.card', { has: page.getByRole('heading', { name: 'Principal' }) });
  // Lucía: Secreto ×3 (adultos 1, 3 y 4) + Bacalao ×1; Niño 2 Distinción → Entrecot.
  await expect(principal.locator('tr', { hasText: 'Secreto ibérico' })).toContainText('3');
  await expect(principal.locator('tr', { hasText: 'Bacalao en salsa' })).toContainText('1');
  await expect(page.locator('.card', { hasText: 'Niños con carta habitual' }).first()).toContainText('1');
  await expect(page.locator('.card', { has: page.getByRole('heading', { name: 'Alergias e intolerancias' }) })).toContainText('Frutos secos');
  await expect(page.locator('.card', { has: page.getByRole('heading', { name: 'Entrantes para compartir' }) })).toContainText('pendiente de definir');

  // Imprimir (ventana A4 propia) y PDF.
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('.rreport', { hasText: 'B · Producción de cocina' }).getByRole('button', { name: 'Imprimir' }).click()]);
  await expect(popup.locator('h1')).toHaveText('Producción de cocina');
  await expect(popup.locator('body')).toContainText('Secreto ibérico');
  await popup.close();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.rreport', { hasText: 'C · Desglose por reserva' }).getByRole('button', { name: 'PDF' }).click()]);
  const pdf = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of pdf) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe('%PDF');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Comensales' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/comensales\.csv$/);

  // Una reserva cambia después de imprimir → aviso.
  await page.reload();
  await page.getByLabel('Desde').fill(DATE);
  await page.getByLabel('Hasta').fill(DATE);
  await page.getByLabel('Servicio').selectOption('dinner');
  await expect(page.getByText(/Última impresión/)).toBeVisible();
  await page.goto('/admin#/reservas/lista');
  await page.locator('.rtable tbody tr', { hasText: 'Lucía Martín Pérez' }).getByRole('button', { name: 'Ver' }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Zona').fill('Terraza');
  await page.locator('#admin-main').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Reserva actualizada')).toBeVisible();
  await page.goto('/admin#/reservas/cocina');
  await page.getByLabel('Desde').fill(DATE);
  await page.getByLabel('Hasta').fill(DATE);
  await page.getByLabel('Servicio').selectOption('dinner');
  await expect(page.getByText('Hay modificaciones posteriores a la última impresión')).toBeVisible();
  await page.getByRole('button', { name: 'Ver qué cambió' }).click();
  await expect(page.locator('.card', { hasText: 'Cambios desde la última impresión' })).toContainText('Datos corregidos por el restaurante');

  // Cancelada → deja de contar.
  await page.goto('/admin#/reservas/lista');
  await page.locator('.rtable tbody tr', { hasText: 'Lucía Martín Pérez' }).getByRole('button', { name: 'Ver' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar reserva' }).click();
  await expect(page.getByText('Reserva cancelada')).toBeVisible();
  await page.goto('/admin#/reservas/cocina');
  await page.getByLabel('Desde').fill(DATE);
  await page.getByLabel('Hasta').fill(DATE);
  await page.getByLabel('Servicio').selectOption('dinner');
  await expect(page.locator('.card', { has: page.getByRole('heading', { name: 'Principal' }) })).toHaveCount(0);
});

test('panel de reservas: resumen, filtros y vista por día en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/admin#/reservas');
  await expect(page.getByRole('heading', { name: 'Reservas de Navidad' })).toBeVisible();
  await expect(page.getByText('Una elección de menús no es una reserva confirmada.')).toBeVisible();
  await page.goto('/admin#/reservas/lista');
  await page.getByRole('button', { name: 'Canceladas' }).click();
  await expect(page.locator('.rtable tbody tr', { hasText: 'Lucía Martín Pérez' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Con alergias' }).click();
  await page.goto('/admin#/reservas/dia');
  await page.getByLabel('Fecha').fill(DATE);
  await expect(page.getByRole('heading', { name: 'COMIDAS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CENAS' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
