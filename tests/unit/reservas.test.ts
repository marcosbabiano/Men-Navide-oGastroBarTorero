import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import { createAdminHandler, type ApiDeps } from '../../server/api.ts';
import { createReservasPublicHandler, runScheduledSync } from '../../server/reservas/api.ts';
import { reservasDepsOf } from '../../server/api.ts';
import type { KV } from '../../server/repo.ts';
import type { BinaryKV } from '../../server/media.ts';
import type { AuthUser } from '../../server/auth.ts';
import { parseEmail, htmlToText, parseDate } from '../../server/reservas/parse.ts';
import { gmailToRaw } from '../../server/reservas/gmail.ts';
import { createSeedContent } from '../../shared/seed.ts';
import {
  applyAdultMenu,
  type Booking,
  defaultReservasConfig,
  fillTemplate,
  kitchenReport,
  normalizePhone,
  parseCsv,
  type SelectionInput,
  selectionProblems,
  syncDiners,
  toCsv,
  verification,
  whatsappUrl,
  buildSelection,
} from '../../shared/reservas.ts';
import { gourmetMenu } from '../../shared/menu-data-2026.ts';
import { christmasSignal } from '../../shared/reservas.ts';

const content = createSeedContent();
const cfg = defaultReservasConfig();

/** Selección válida: N adultos con el Menú Esencia y platos alternos. */
function sel(adults: number, children = 0, extra: Partial<SelectionInput> = {}): SelectionInput {
  const diners = syncDiners([], adults, children, 'menu-esencia').map((d, i) =>
    d.kind === 'adult' ? { ...d, choices: { 'esencia-principal': [i % 2 ? 'esencia-bacalao' : 'esencia-secreto'] } } : d,
  );
  return {
    holder: { name: 'Lucía Martín Pérez', phone: '612 345 678', email: 'lucia@example.com' },
    service: 'dinner',
    adults,
    children,
    adultMenuId: adults ? 'menu-esencia' : null,
    diners,
    notes: { general: '', allergies: '', special: '' },
    ...extra,
  };
}

describe('selección de menús (reglas)', () => {
  it('ids reales del menú Esencia', () => {
    const es = content.menus.find((m) => m.id === 'menu-esencia')!;
    expect(es.sections.find((s) => s.kind === 'choice')!.id).toBe('esencia-principal');
  });
  it('dos adultos con el mismo menú y platos distintos es válido', () => {
    expect(selectionProblems(sel(2), content, cfg)).toEqual([]);
  });
  it('diez adultos', () => {
    expect(selectionProblems(sel(10), content, cfg)).toEqual([]);
  });
  it('un adulto con otro menú se rechaza (todos los adultos el mismo menú)', () => {
    const s = sel(2);
    s.diners[1] = { ...s.diners[1], menuId: 'menu-distincion', choices: { 'distincion-principal': ['distincion-entrecot'] } };
    expect(selectionProblems(s, content, cfg).some((p) => /mismo menú/.test(p.message))).toBe(true);
  });
  it('niño de carta habitual y niño con otro menú navideño', () => {
    const s = sel(2, 2);
    s.diners[3] = { ...s.diners[3], mode: 'menu', menuId: 'menu-distincion', choices: { 'distincion-principal': ['distincion-entrecot'] } };
    expect(selectionProblems(s, content, cfg)).toEqual([]);
    const b = buildSelection(s, content, '2026-11-10T10:00:00Z');
    expect(b.diners[2]).toMatchObject({ label: 'Niño 1', mode: 'carta', menuId: null });
    expect(b.diners[3].picks[0].items[0].name).toBe('Entrecot');
    expect(b.estimate).toEqual({ amount: 36 * 2 + 45, unknown: 0 });
  });
  it('solo niños (sin adultos) es válido', () => {
    const s = sel(0, 1);
    expect(selectionProblems(s, content, cfg)).toEqual([]);
  });
  it('faltan platos o campos obligatorios', () => {
    const s = sel(2);
    s.diners[0].choices = {};
    s.holder.phone = '123';
    const p = selectionProblems(s, content, cfg).map((x) => x.message);
    expect(p.some((m) => /teléfono/.test(m))).toBe(true);
    expect(p.some((m) => /Adulto 1: elige un plato/.test(m))).toBe(true);
  });
  it('Gourmet: primero y segundo a elegir; solo disponible si está publicado', () => {
    const c = structuredClone(content);
    const g = c.menus.find((m) => m.id === 'menu-seleccion-gourmet') ?? gourmetMenu(2);
    const s = sel(1, 0, { adultMenuId: g.id });
    s.diners = applyAdultMenu(s.diners, g.id);
    expect(selectionProblems(s, c, cfg).some((p) => /no está disponible/.test(p.message))).toBe(true);
    g.status = 'published';
    g.price.amount = 60;
    const choices = g.sections.filter((x) => x.kind === 'choice');
    expect(choices.length).toBe(2);
    s.diners[0].choices = Object.fromEntries(choices.map((x) => [x.id, [x.items[0].id]]));
    expect(selectionProblems(s, c, cfg)).toEqual([]);
  });
  it('cambiar el menú común deja pendientes las elecciones incompatibles', () => {
    const d = applyAdultMenu(sel(2).diners, 'menu-distincion');
    expect(d.every((x) => x.menuId === 'menu-distincion' && Object.keys(x.choices).length === 0)).toBe(true);
  });
  it('teléfonos, WhatsApp y plantilla', () => {
    expect(normalizePhone('612 345 678')).toBe('+34612345678');
    expect(normalizePhone('0034 612345678')).toBe('+34612345678');
    expect(normalizePhone('12345')).toBeNull();
    const url = whatsappUrl('612345678', fillTemplate('Hola{nombre}: {enlace}', { nombre: 'Lucía Martín', enlace: 'https://x/y' }))!;
    expect(url).toBe(`https://wa.me/34612345678?text=${encodeURIComponent('Hola Lucía: https://x/y')}`);
  });
  it('CSV con separador «;» y comillas, ida y vuelta', () => {
    const csv = toCsv([['a', 'b;c', 'd"e'], ['1', '', 'x\ny']]);
    expect(parseCsv(csv)).toEqual([['a', 'b;c', 'd"e'], ['1', '', 'x\ny']]);
  });
});

describe('señales de Navidad en el correo', () => {
  it('detecta palabras clave y nombres de menús sin tildes ni mayúsculas', () => {
    const kw = defaultReservasConfig().email.christmasKeywords;
    expect(christmasSignal(['MENU ESENCIA'], kw, [])).toBe('menú esencia');
    expect(christmasSignal(['Cena de Nochebuena'], kw, [])).toBe('nochebuena');
    expect(christmasSignal(['Menú Tradición'], kw, ['Menú Tradición'])).toBe('Menú Tradición');
    expect(christmasSignal(['Mesa para 4, terraza'], kw, ['Menú Esencia'])).toBeNull();
  });
});

describe('cocina', () => {
  it('cuenta platos elegidos, entrantes compartidos, carta y alergias; no inventa raciones', () => {
    const s = sel(3, 1);
    s.diners[0].allergy = 'Celiaca';
    const sel1 = buildSelection(s, content, '2026-11-10T10:00:00Z');
    const b = { selection: sel1, holder: { name: 'Lucía' }, qamarero: { time: '21:00', people: 4 } } as unknown as Booking;
    const r = kitchenReport([b], { ...cfg, kitchen: { ...cfg.kitchen, sharedRules: { 'esencia-jamon': 4 } } });
    expect(r.people).toBe(4);
    expect(r.carta).toBe(1);
    const principal = r.groups.find((g) => g.kind === 'choice')!;
    expect(principal.lines).toEqual(expect.arrayContaining([{ name: 'Secreto ibérico', count: 2 }, { name: 'Bacalao en salsa', count: 1 }]));
    const shared = r.groups.find((g) => g.kind === 'shared')!;
    expect(shared.lines.find((l) => l.name.startsWith('Jamón'))!.detail).toContain('1 raciones (1 cada 4 comensales)');
    expect(shared.lines.find((l) => l.name.startsWith('Selección de quesos'))!.detail).toContain('pendiente de definir');
    expect(r.allergies).toEqual([{ booking: 'Lucía', who: 'Adulto 1', text: 'Celiaca' }]);
  });
});

describe('intérprete de correos', () => {
  const html = `<html><body><h2>Nueva reserva</h2><table>
    <tr><td>Localizador:</td><td>QM-88213</td></tr>
    <tr><td>Nombre</td><td>Lucía Martín Pérez</td></tr>
    <tr><td>Teléfono</td><td>+34 612 345 678</td></tr>
    <tr><td>Email</td><td>lucia@example.com</td></tr>
    <tr><td>Fecha</td><td>jueves, 24 de diciembre de 2026</td></tr>
    <tr><td>Hora</td><td>21:30</td></tr>
    <tr><td>Personas</td><td>2</td></tr>
    <tr><td>Zona</td><td>Salón</td></tr>
    <tr><td>Observaciones</td><td>Referencia TOR-ABCDE &amp; cumpleaños</td></tr>
  </table></body></html>`;
  it('HTML con tabla', () => {
    const p = parseEmail({ messageId: 'm1', from: 'Qamarero <no-reply@qamarero.com>', subject: 'Nueva reserva en Bar Torero', date: '2026-11-10T10:00:00Z', text: '', html });
    expect(p).toMatchObject({ type: 'new', reservationId: 'QM-88213', name: 'Lucía Martín Pérez', phone: '+34612345678', email: 'lucia@example.com', date: '2026-12-24', time: '21:30', people: 2, zone: 'Salón', ref: 'TOR-ABCDE' });
    expect(p.missing).toEqual([]);
  });
  it('texto plano con «etiqueta: valor», etiqueta en línea aparte y año implícito', () => {
    const text = 'Reserva modificada\nCliente: Pedro Gil\nTeléfono\n699 111 222\nDía: 5/1\nHora: 14.00 h\nComensales: 6 personas';
    const p = parseEmail({ messageId: '', from: 'reservas@qamarero.com', subject: 'Tu reserva ha sido modificada', date: '2026-12-20T10:00:00Z', text, html: '' });
    expect(p).toMatchObject({ type: 'modified', name: 'Pedro Gil', phone: '+34699111222', time: '14:00', people: 6 });
    expect(parseDate('5 de enero', '2026-12-20T10:00:00Z')).toBe('2027-01-05');
  });
  it('cancelación y campos incompletos (no inventa)', () => {
    const p = parseEmail({ messageId: 'x', from: 'qamarero', subject: 'Reserva cancelada', date: '2026-12-01T00:00:00Z', text: 'La reserva de Ana para el 28/12/2026 ha sido cancelada.', html: '' });
    expect(p.type).toBe('cancelled');
    expect(p.date).toBe('2026-12-28');
    expect(p.people).toBeNull();
    expect(p.missing).toEqual(expect.arrayContaining(['reservationId', 'time', 'people']));
  });
  it('entidades HTML y mensajes de Gmail (base64url, multipart)', () => {
    expect(htmlToText('<p>Se&ntilde;or&nbsp;Gómez</p>')).toBe('Señor Gómez');
    const enc = (s: string) => Buffer.from(s).toString('base64url');
    const raw = gmailToRaw({ id: 'g1', internalDate: '1797000000000', payload: { headers: [{ name: 'From', value: 'q@qamarero.com' }, { name: 'Subject', value: 'Nueva reserva' }, { name: 'Message-ID', value: '<abc@q>' }], parts: [{ mimeType: 'text/plain', body: { data: enc('Fecha: 24/12/2026\nHora: 14:00\nNombre: Ana Ruiz') } }] } });
    expect(raw.messageId).toBe('<abc@q>');
    expect(parseEmail(raw)).toMatchObject({ date: '2026-12-24', time: '14:00', name: 'Ana Ruiz' });
  });
});

/* ---------------- API completa con Netlify Blobs local ---------------- */
const ORIGIN = 'https://torero.example';
const USERS: Record<string, AuthUser> = { 'tok-admin': { id: '1', email: 'admin@torero.es', roles: ['admin'] }, 'tok-editor': { id: '2', email: 'e@torero.es', roles: [] } };
let server: BlobsServer;
let dir: string;
let url: string;
let storeName: string;
let fakeFetch: typeof fetch | undefined;

function deps(): ApiDeps {
  const mk = (name: string) => getStore({ name, siteID: 'test', token: 't', edgeURL: url, uncachedEdgeURL: url, consistency: 'strong' });
  return {
    content: mk(`${storeName}-content`) as unknown as KV,
    media: mk(`${storeName}-media`) as unknown as BinaryKV,
    auth: async (req) => USERS[(req.headers.get('authorization') ?? '').replace('Bearer ', '')] ?? null,
    adminEmails: [],
    purge: async () => undefined,
    reservas: { store: mk(`${storeName}-res`) as unknown as KV, inboundSecret: 'secreto-webhook', gmail: { clientId: 'cid', clientSecret: 'csec', fetch: fakeFetch } },
  };
}
const admin = async <T = Record<string, unknown>>(p: string, init: { method?: string; body?: unknown; token?: string } = {}) => {
  const res = await createAdminHandler(deps())(
    new Request(`${ORIGIN}/api/admin${p}`, { method: init.method ?? 'GET', headers: { 'X-Torero-Admin': '1', Authorization: `Bearer ${init.token ?? 'tok-admin'}`, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body) }),
  );
  return { status: res.status, body: (await res.json()) as T };
};
const pub = async <T = Record<string, unknown>>(p: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
  const res = await createReservasPublicHandler(reservasDepsOf(deps())!)(
    new Request(`${ORIGIN}${p}`, { method: init.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...init.headers }, body: init.body === undefined ? undefined : JSON.stringify(init.body) }),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T, headers: res.headers };
};
const preselect = (s: SelectionInput) => pub<{ ref: string; bookingUrl: string }>('/api/reservas/preselect', { method: 'POST', body: { selection: s, consent: true } });
const inbound = (body: Record<string, string>) => pub<{ status: string; result: string }>('/api/reservas/inbound', { method: 'POST', body, headers: { 'X-Torero-Inbound-Token': 'secreto-webhook' } });
type Row = { id: string; ref: string; name: string; category: string; qStatus: string; gStatus: string; matchStatus: string; date: string; time: string; issues: number; peopleChangePending: boolean; archived: boolean; confirmed: number | null; requested: number | null };
const rows = async () => (await admin<{ rows: Row[] }>('/reservas')).body.rows;
const full = async (id: string) => (await admin<{ booking: Booking; tokens: { status: string; kind: string }[]; candidates: { id: string; score: number }[] }>(`/reservas/b/${id}`)).body;
const mail = (over: Partial<Record<string, string>> = {}) => ({
  MessageID: `m-${Math.random()}`,
  From: 'Qamarero <notificaciones@qamarero.com>',
  Subject: 'Nueva reserva',
  Date: '2026-11-10T12:00:00Z',
  TextBody: 'Localizador: Q-1001\nNombre: Lucía Martín Pérez\nTeléfono: 612345678\nFecha: 24/12/2026\nHora: 21:30\nPersonas: 2\nZona: Salón\nMenú: Menú Esencia',
  ...over,
});

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'torero-res-'));
  server = new BlobsServer({ directory: dir, token: 't' });
  url = `http://localhost:${(await server.start()).port}`;
});
afterAll(async () => {
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  storeName = `s${Math.random().toString(36).slice(2, 9)}`;
  fakeFetch = undefined;
});

describe('API de reservas', () => {
  it('guardar la preselección: referencia, estado pendiente de Qamarero y URL oficial', async () => {
    const r = await preselect(sel(2));
    expect(r.status).toBe(201);
    expect(r.body.ref).toMatch(/^TOR-[A-Z0-9]{5}$/);
    expect(r.body.bookingUrl).toBe('https://booking.qamarero.com/new-reservation/bar-torero');
    const [row] = await rows();
    expect(row).toMatchObject({ ref: r.body.ref, qStatus: 'pending_confirmation', gStatus: 'complete', requested: 2, confirmed: null });
  });
  it('rechaza selecciones incompletas, sin consentimiento o sin sesión de admin', async () => {
    const s = sel(2);
    s.diners[1].choices = {};
    expect((await preselect(s)).status).toBe(422);
    expect((await pub('/api/reservas/preselect', { method: 'POST', body: { selection: sel(1), consent: false } })).status).toBe(400);
    expect((await admin('/reservas', { token: 'tok-editor' })).status).toBe(403);
    expect((await admin('/reservas', { token: 'nadie' })).status).toBe(401);
  });

  it('correo con referencia → vinculación exacta; duplicado → sin duplicar', async () => {
    const { body } = await preselect(sel(2));
    const m = mail({ MessageID: 'dup-1', TextBody: `${mail().TextBody}\nObservaciones: ${body.ref}` });
    expect((await inbound(m)).body.status).toBe('processed');
    expect((await inbound(m)).body.status).toBe('duplicate');
    const rs = await rows();
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ qStatus: 'email_confirmed', matchStatus: 'linked', date: '2026-12-24', time: '21:30', confirmed: 2 });
    const b = (await full(rs[0].id)).booking;
    expect(b.match.method).toBe('ref');
    // Principio 3: una confirmación por email sin revisión no es «verificada».
    expect(verification(b, 3, Date.parse('2026-11-10T13:00:00Z'))).toBe('email_only');
  });

  it('vinculación por teléfono; ambigua → revisión manual y fusión', async () => {
    await preselect(sel(2));
    expect((await inbound(mail())).body.result).toMatch(/coincidencia de datos/);
    // Dos preselecciones casi iguales → no se elige arbitrariamente.
    const a = sel(4, 0, { holder: { name: 'Juan Gómez', phone: '600111222', email: 'juan@x.es' } });
    await preselect(a);
    expect((await preselect({ ...a, holder: { name: 'Juan Gómez Ruiz', phone: '600111222', email: 'juan2@x.es' } })).status).toBe(201);
    const r = await inbound(mail({ TextBody: 'Localizador: Q-2002\nNombre: Juan Gómez\nTeléfono: 600111222\nFecha: 26/12/2026\nHora: 14:00\nPersonas: 4' }));
    expect(r.body.result).toMatch(/pendiente de revisar coincidencia/);
    const emailRow = (await rows()).find((x) => x.matchStatus === 'review')!;
    const det = await full(emailRow.id);
    expect(det.candidates.length).toBeGreaterThanOrEqual(2);
    const merged = await admin<{ booking: Booking }>('/reservas/merge', { method: 'POST', body: { emailId: emailRow.id, targetId: det.candidates[0].id } });
    expect(merged.status).toBe(200);
    expect(merged.body.booking.qamarero).toMatchObject({ status: 'manual_linked', reservationId: 'Q-2002', date: '2026-12-26' });
    expect((await rows()).find((x) => x.id === emailRow.id)!.archived).toBe(true);
    // Una modificación posterior del mismo localizador va a la reserva fusionada.
    await inbound(mail({ Subject: 'Reserva modificada', TextBody: 'Localizador: Q-2002\nHora: 15:00\nPersonas: 5' }));
    const after = (await full(det.candidates[0].id)).booking;
    expect(after.qamarero).toMatchObject({ status: 'modification_notified', time: '15:00', people: 5 });
    expect(after.issues.some((i) => i.type === 'people_mismatch' && !i.resolvedAt)).toBe(true);
  });

  it('cancelación notificada y correos sin datos de reserva', async () => {
    await inbound(mail());
    await inbound(mail({ Subject: 'Reserva cancelada', TextBody: 'Localizador: Q-1001\nEstado: cancelada' }));
    const [row] = await rows();
    expect(row).toMatchObject({ qStatus: 'cancellation_notified', gStatus: 'cancelled' });
    const bad = await inbound(mail({ TextBody: 'Hola, ¿tenéis menú para celíacos?' }));
    expect(bad.body.status).toBe('error');
    expect((await inbound({ ...mail(), From: 'spam@otro.com' })).body.status).toBe('ignored');
    expect((await pub('/api/reservas/inbound', { method: 'POST', body: mail() })).status).toBe(401);
  });

  it('clasificación: reserva normal (no se añade y se puede convertir), Navidad por palabra clave y «por clasificar» dentro del periodo', async () => {
    // Sin señales de Navidad y sin periodo de menús configurado → reserva normal.
    const normal = await inbound(mail({ MessageID: 'normal-1', TextBody: 'Localizador: N-1\nNombre: Juan Normal\nTeléfono: 600999888\nFecha: 15/11/2026\nHora: 14:00\nPersonas: 4' }));
    expect(normal.body.status).toBe('normal');
    expect(await rows()).toHaveLength(0);
    const log = (await admin<{ emails: { key: string; status: string }[] }>('/reservas/emails')).body.emails;
    expect(log[0].status).toBe('normal');
    // Una cancelación de una reserva normal tampoco entra.
    expect((await inbound(mail({ Subject: 'Reserva cancelada', TextBody: 'Localizador: N-1\nEstado: cancelada\nFecha: 15/11/2026' }))).body.status).toBe('normal');
    // El restaurante puede convertirla después.
    const promoted = await admin<{ booking: Booking }>('/reservas/emails/promote', { method: 'POST', body: { key: log[0].key } });
    expect(promoted.status).toBe(200);
    expect(promoted.body.booking).toMatchObject({ category: 'christmas', qamarero: { reservationId: 'N-1', date: '2026-11-15' } });
    // Palabra clave en observaciones o nombre de un menú publicado → Navidad.
    expect((await inbound(mail({ TextBody: 'Localizador: K-1\nNombre: Ana\nFecha: 20/12/2026\nHora: 21:00\nPersonas: 6\nObservaciones: Cena de empresa de Navidad' }))).body.status).toBe('processed');
    expect((await inbound(mail({ TextBody: 'Localizador: K-2\nNombre: Bea\nFecha: 20/12/2026\nHora: 14:00\nPersonas: 2\nMenú: Menú Distinción' }))).body.status).toBe('processed');
    // Con periodo de menús: fecha dentro y sin señales → «por clasificar».
    const d = deps();
    const content = createSeedContent();
    content.calendar.period = { start: '2026-12-01', end: '2027-01-06' };
    await (d.content as KV).setJSON('content/published', { content, revision: 1, sourceRevision: 1, updatedAt: '', updatedBy: '', publishedAt: '2026-11-10T00:00:00Z', publishedBy: 'x' });
    const dudosa = await inbound(mail({ TextBody: 'Localizador: U-1\nNombre: Carlos Duda\nTeléfono: 622000111\nFecha: 26/12/2026\nHora: 14:00\nPersonas: 3' }));
    expect(dudosa.body.status).toBe('processed');
    const u = (await rows()).find((r) => r.name === 'Carlos Duda')!;
    expect(u.category).toBe('unclassified');
    expect(u.issues).toBe(1);
    // Fuera del periodo sigue siendo normal.
    expect((await inbound(mail({ TextBody: 'Localizador: U-2\nNombre: Otro\nFecha: 20/01/2027\nHora: 14:00\nPersonas: 2' }))).body.status).toBe('normal');
    // El restaurante decide: reserva normal → se retira.
    const cls = await admin<{ booking: Booking }>(`/reservas/b/${u.id}/action`, { method: 'POST', body: { action: 'classify-normal' } });
    expect(cls.body.booking).toMatchObject({ category: 'normal', archived: true });
  });

  it('enlace de modificación: un solo uso, cambios de comensales pendientes, sin consumirse al abrirlo', async () => {
    const { body } = await preselect(sel(8));
    await inbound(mail({ TextBody: `Localizador: Q-3003\nNombre: Lucía Martín Pérez\nTeléfono: 612345678\nFecha: 24/12/2026\nHora: 21:30\nPersonas: 8\nObservaciones: ${body.ref}` }));
    const [row] = await rows();
    const link = await admin<{ link: string }>(`/reservas/b/${row.id}/link`, { method: 'POST', body: { kind: 'modify' } });
    expect(link.status).toBe(201);
    const token = link.body.link.split('/').pop()!;
    expect(link.body.link).toContain('/reservar/modificar/');
    // Abrir no consume.
    for (let i = 0; i < 2; i++) expect((await pub<{ state: string }>(`/api/reservas/link/${token}`)).body.state).toBe('active');
    const opened = (await pub<{ booking: { selection: SelectionInput } }>(`/api/reservas/link/${token}`)).body.booking.selection;
    expect(opened.adults).toBe(8);
    // 10 adultos y 2 niños: se guarda, el enlace queda consumido y el cambio de comensales queda pendiente.
    const mod = sel(10, 2);
    const [r1, r2] = await Promise.all([pub(`/api/reservas/link/${token}`, { method: 'POST', body: { selection: mod } }), pub(`/api/reservas/link/${token}`, { method: 'POST', body: { selection: mod } })]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await pub<{ state: string }>(`/api/reservas/link/${token}`)).body.state).toBe('used');
    expect((await pub(`/api/reservas/link/${token}`, { method: 'POST', body: { selection: mod } })).status).toBe(410);
    const b = (await full(row.id)).booking;
    expect(b.gastroStatus).toBe('modified');
    expect(b.peopleChange).toMatchObject({ from: 8, to: 12, status: 'pending' });
    expect(b.qamarero.people).toBe(8); // nunca se cambia solo
    expect(b.history.some((h) => h.source === 'link' && h.details?.some((d) => d.includes('Adultos: 8 → 10')))).toBe(true);
    // Solicitar otro enlace y generar uno nuevo revoca los anteriores.
    expect((await pub(`/api/reservas/link/${token}/request`, { method: 'POST', body: { reason: 'Viene un primo' } })).status).toBe(201);
    expect((await admin<{ requests: { status: string }[] }>('/reservas/requests')).body.requests[0].status).toBe('pending');
    const l2 = (await admin<{ link: string }>(`/reservas/b/${row.id}/link`, { method: 'POST', body: { kind: 'modify' } })).body.link.split('/').pop()!;
    const l3 = (await admin<{ link: string }>(`/reservas/b/${row.id}/link`, { method: 'POST', body: { kind: 'modify' } })).body.link.split('/').pop()!;
    expect((await pub<{ state: string }>(`/api/reservas/link/${l2}`)).body.state).toBe('revoked');
    expect((await pub<{ state: string }>(`/api/reservas/link/${l3}`)).body.state).toBe('active');
    expect((await admin<{ requests: { status: string }[] }>('/reservas/requests')).body.requests[0].status).toBe('done');
    // Confirmar el cambio en Qamarero desde el panel.
    const conf = await admin<{ booking: Booking }>(`/reservas/b/${row.id}/action`, { method: 'POST', body: { action: 'confirm-people' } });
    expect(conf.body.booking.qamarero.people).toBe(12);
    expect(conf.body.booking.peopleChange?.status).toBe('confirmed');
    // Un token inventado no da acceso a nada.
    expect((await pub(`/api/reservas/link/${'x'.repeat(43)}`)).status).toBe(404);
  });

  it('plazo de modificación con autorización excepcional y caducidad', async () => {
    const { body } = await preselect(sel(1));
    const id = (await rows()).find((r) => r.ref === body.ref)!.id;
    const st = await admin<{ config: ReturnType<typeof defaultReservasConfig>; configRevision: number }>('/reservas');
    await admin('/reservas/config', { method: 'PUT', body: { config: { ...st.body.config, whatsapp: { ...st.body.config.whatsapp, deadline: '2020-01-01T00:00' } }, baseRevision: st.body.configRevision } });
    const t1 = (await admin<{ link: string }>(`/reservas/b/${id}/link`, { method: 'POST', body: { kind: 'modify' } })).body.link.split('/').pop()!;
    expect((await pub<{ state: string }>(`/api/reservas/link/${t1}`)).body.state).toBe('deadline');
    const t2 = (await admin<{ link: string }>(`/reservas/b/${id}/link`, { method: 'POST', body: { kind: 'modify', allowLate: true } })).body.link.split('/').pop()!;
    expect((await pub<{ state: string }>(`/api/reservas/link/${t2}`)).body.state).toBe('active');
  });

  it('reserva directa en Qamarero: enlace para completar la elección (sin volver a reservar)', async () => {
    await inbound(mail({ TextBody: 'Localizador: Q-4004\nNombre: Marta Sanz\nTeléfono: 655000111\nFecha: 31/12/2026\nHora: 14:00\nPersonas: 3\nMenú: Menú de Navidad' }));
    const [row] = await rows();
    expect(row.gStatus).toBe('pending');
    const t = (await admin<{ link: string }>(`/reservas/b/${row.id}/link`, { method: 'POST', body: { kind: 'complete' } })).body.link.split('/').pop()!;
    const open = await pub<{ kind: string; booking: { selection: unknown; date: string } }>(`/api/reservas/link/${t}`);
    expect(open.body).toMatchObject({ kind: 'complete', booking: { selection: null, date: '2026-12-31' } });
    expect((await pub(`/api/reservas/link/${t}`, { method: 'POST', body: { selection: sel(3, 0, { holder: { name: 'Marta Sanz', phone: '655000111', email: 'm@x.es' } }) } })).status).toBe(200);
    const b = (await full(row.id)).booking;
    expect(b.gastroStatus).toBe('complete');
    expect(b.peopleChange).toBeNull();
  });

  it('edición, revisión, cancelación e historial desde el panel; conflicto de versión', async () => {
    const { body } = await preselect(sel(2));
    const id = (await rows()).find((r) => r.ref === body.ref)!.id;
    const b = (await full(id)).booking;
    const ed = await admin<{ booking: Booking }>(`/reservas/b/${id}`, { method: 'PATCH', body: { baseVersion: b.version, qamarero: { date: '2026-12-24', time: '14:00', zone: 'Terraza', people: 2 }, qStatus: 'manual_linked' } });
    expect(ed.status).toBe(200);
    expect((await admin(`/reservas/b/${id}`, { method: 'PATCH', body: { baseVersion: b.version, internalNotes: 'x' } })).status).toBe(409);
    await admin(`/reservas/b/${id}/action`, { method: 'POST', body: { action: 'confirm-review' } });
    let cur = (await full(id)).booking;
    expect(verification(cur, 3)).toBe('verified');
    await admin(`/reservas/b/${id}/action`, { method: 'POST', body: { action: 'cancel' } });
    cur = (await full(id)).booking;
    expect(verification(cur, 3)).toBe('cancelled');
    expect(cur.history.map((h) => h.type)).toEqual(expect.arrayContaining(['form_completed', 'edited', 'reviewed', 'cancelled']));
  });

  it('Gmail: lectura programada con OAuth simulado e idempotencia', async () => {
    const enc = (s: string) => Buffer.from(s).toString('base64url');
    const calls: string[] = [];
    fakeFetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      calls.push(u);
      if (u.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'at' });
      if (u.includes('/messages?')) return Response.json({ messages: [{ id: 'g1' }] });
      if (u.includes('/messages/g1')) return Response.json({ id: 'g1', internalDate: '1797000000000', payload: { headers: [{ name: 'From', value: 'avisos@qamarero.com' }, { name: 'Subject', value: 'Nueva reserva' }], mimeType: 'text/plain', body: { data: enc('Localizador: G-1\nNombre: Eva\nFecha: 24/12/2026\nHora: 14:00\nPersonas: 2\nObservaciones: comida de Navidad') } } });
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
    const d = reservasDepsOf(deps())!;
    expect((await runScheduledSync(d)).ok).toBe(false); // sin buzón conectado
    await (d.store as KV).setJSON('secret/gmail', { refreshToken: 'rt', email: 'reservas@torero.es', connectedAt: '', connectedBy: '' });
    expect((await runScheduledSync(d)).processed).toBe(1);
    expect((await runScheduledSync(d)).processed).toBe(0);
    expect(await rows()).toHaveLength(1);
    const st = await admin<{ sync: { lastOkAt: string }; email: { gmailConnected: boolean; gmailAccount: string } }>('/reservas');
    expect(st.body.email).toMatchObject({ gmailConnected: true, gmailAccount: 'reservas@torero.es' });
    expect(JSON.stringify(st.body)).not.toContain('"rt"');
  });
});
