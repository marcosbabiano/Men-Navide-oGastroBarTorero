import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import { createAdminHandler, signageDepsOf, type ApiDeps } from '../../server/api.ts';
import { createScreenHandler, sha256 } from '../../server/signage.ts';
import type { KV } from '../../server/repo.ts';
import type { BinaryKV } from '../../server/media.ts';
import type { AuthUser } from '../../server/auth.ts';
import {
  activeSchedule,
  defaultSignage,
  eventPromoted,
  isOnline,
  madridTime,
  nextScheduleChange,
  PARTY_PRESET_IDS,
  PARTY_PRESETS,
  partySchema,
  publicSignage,
  resolveProgram,
  type Schedule,
  type SignageConfig,
  signageConfigSchema,
} from '../../shared/signage.ts';
import { buildTimeline, menuPages, nextIndex, sceneSteps, type SceneData } from '../../src/screen/engine.ts';
import { createSeedContent } from '../../shared/seed.ts';
import { toPublicContent } from '../../shared/public.ts';
import { SEED_MEDIA } from '../../shared/media-catalog.ts';

const sched = (p: Partial<Schedule>): Schedule => ({
  id: 'h',
  name: 'h',
  enabled: true,
  playlistId: 'programa-navidad',
  days: [],
  start: '12:00',
  end: '17:00',
  dateFrom: '',
  dateTo: '',
  priority: 10,
  screenIds: [],
  ...p,
});
const cfgWith = (schedules: Schedule[]): SignageConfig => ({ ...defaultSignage(), schedules });

describe('hora de Madrid y horario de verano', () => {
  it('convierte UTC a hora peninsular en invierno (+1) y verano (+2)', () => {
    expect(madridTime(new Date('2026-12-24T20:30:00Z'))).toMatchObject({ date: '2026-12-24', minutes: 21 * 60 + 30, day: 3 }); // jueves
    expect(madridTime(new Date('2026-07-01T20:30:00Z'))).toMatchObject({ date: '2026-07-01', minutes: 22 * 60 + 30 });
  });
  it('cambio de hora de octubre: 03:00 → 02:00 (25-10-2026)', () => {
    expect(madridTime(new Date('2026-10-25T00:30:00Z')).minutes).toBe(2 * 60 + 30); // CEST
    expect(madridTime(new Date('2026-10-25T01:30:00Z')).minutes).toBe(2 * 60 + 30); // CET (se repite)
  });
  it('cambio de hora de marzo: 02:00 → 03:00 (29-03-2026)', () => {
    expect(madridTime(new Date('2026-03-29T00:59:00Z')).minutes).toBe(1 * 60 + 59);
    expect(madridTime(new Date('2026-03-29T01:00:00Z')).minutes).toBe(3 * 60);
  });
  it('un horario 12:00–17:00 se respeta en hora local antes y después del cambio', () => {
    const c = cfgWith([sched({})]);
    expect(activeSchedule(c, new Date('2026-10-24T10:30:00Z'), null)?.id).toBe('h'); // 12:30 CEST
    expect(activeSchedule(c, new Date('2026-10-26T11:30:00Z'), null)?.id).toBe('h'); // 12:30 CET
    expect(activeSchedule(c, new Date('2026-10-26T10:30:00Z'), null)).toBeNull(); // 11:30 CET
  });
});

describe('programación automática', () => {
  it('tramos que cruzan la medianoche cuentan para el día de inicio', () => {
    const c = cfgWith([sched({ id: 'viernes-noche', days: [4], start: '22:00', end: '03:00' })]); // viernes
    expect(activeSchedule(c, new Date('2026-12-04T22:30:00Z'), null)?.id).toBe('viernes-noche'); // vie 23:30
    expect(activeSchedule(c, new Date('2026-12-05T01:30:00Z'), null)?.id).toBe('viernes-noche'); // sáb 02:30
    expect(activeSchedule(c, new Date('2026-12-05T22:30:00Z'), null)).toBeNull(); // sáb 23:30
  });
  it('gana la mayor prioridad; a igualdad, el primero de la lista', () => {
    const c = cfgWith([sched({ id: 'a', priority: 10 }), sched({ id: 'b', priority: 50, playlistId: 'programa-fiesta' }), sched({ id: 'c', priority: 50 })]);
    expect(activeSchedule(c, new Date('2026-12-10T12:00:00Z'), null)?.id).toBe('b');
  });
  it('rangos de fechas (campañas) y horarios desactivados', () => {
    const c = cfgWith([sched({ id: 'nochevieja', dateFrom: '2026-12-31', dateTo: '2026-12-31', start: '00:00', end: '00:00', priority: 90 }), sched({ id: 'off', enabled: false, priority: 99 })]);
    expect(activeSchedule(c, new Date('2026-12-31T15:00:00Z'), null)?.id).toBe('nochevieja');
    expect(activeSchedule(c, new Date('2026-12-30T15:00:00Z'), null)?.id).toBeUndefined();
  });
  it('horarios por televisión', () => {
    const c = cfgWith([sched({ id: 'solo-barra', screenIds: ['tv-aaaaaaaaaaaa'] })]);
    expect(activeSchedule(c, new Date('2026-12-10T12:00:00Z'), 'tv-aaaaaaaaaaaa')?.id).toBe('solo-barra');
    expect(activeSchedule(c, new Date('2026-12-10T12:00:00Z'), 'tv-bbbbbbbbbbbb')).toBeNull();
    expect(activeSchedule(c, new Date('2026-12-10T12:00:00Z'), null)).toBeNull();
  });
  it('anulación manual temporal e indefinida, y vuelta a automática', () => {
    const c = defaultSignage();
    const at = new Date('2026-12-10T12:00:00Z'); // 13:00 → horario de mediodía
    const base = { id: 'tv-aaaaaaaaaaaa', playlistId: null };
    expect(resolveProgram(c, { ...base, override: null }, at)).toMatchObject({ source: 'schedule', playlistId: 'programa-navidad' });
    const party = PARTY_PRESETS['club-night'].config;
    expect(resolveProgram(c, { ...base, override: { kind: 'party', ref: '', party, until: null } }, at)).toMatchObject({ source: 'override', party });
    const expired = { kind: 'playlist' as const, ref: 'programa-fiesta', party: null, until: '2026-12-10T11:00:00Z' };
    expect(resolveProgram(c, { ...base, override: expired }, at).source).toBe('schedule');
    expect(resolveProgram(c, { ...base, playlistId: 'programa-fiesta', override: null }, at)).toMatchObject({ source: 'fixed', playlistId: 'programa-fiesta' });
    expect(resolveProgram(c, null, new Date('2026-12-10T09:00:00Z'))).toMatchObject({ source: 'default', playlistId: 'programa-habitual' });
  });
  it('calcula el próximo cambio de programación', () => {
    const c = defaultSignage();
    const n = nextScheduleChange(c, null, new Date('2026-12-10T12:00:00Z'));
    expect(n?.playlistId).toBe('programa-habitual');
    expect(madridTime(n!.at).minutes).toBe(17 * 60);
  });
  it('estado de conexión según el último latido', () => {
    const now = Date.parse('2026-12-10T12:00:00Z');
    expect(isOnline({ lastSeen: '2026-12-10T11:59:00Z' }, 60, now)).toBe(true);
    expect(isOnline({ lastSeen: '2026-12-10T11:56:00Z' }, 60, now)).toBe(false);
    expect(isOnline(null, 60, now)).toBe(false);
  });
});

describe('modelo y escenas', () => {
  it('la configuración inicial es válida y tiene los cinco estilos de fiesta', () => {
    expect(signageConfigSchema.safeParse(defaultSignage()).success).toBe(true);
    expect(PARTY_PRESET_IDS.map((p) => PARTY_PRESETS[p].label)).toEqual(['Gold Night', 'Red Velvet', 'Club Night', 'Midnight', 'Torero Classic']);
    for (const p of PARTY_PRESET_IDS) expect(partySchema.safeParse(PARTY_PRESETS[p].config).success).toBe(true);
  });
  it('rechaza referencias rotas y valores fuera de rango', () => {
    const c = defaultSignage();
    c.playlists[0].items.push({ id: 'x', sceneId: 'no-existe', duration: null, transition: null, hidden: false });
    expect(signageConfigSchema.safeParse(c).success).toBe(false);
    const d = defaultSignage();
    (d.scenes[7] as { party: { speed: number } }).party.speed = 50;
    expect(signageConfigSchema.safeParse(d).success).toBe(false);
  });
  it('los reproductores solo reciben escenas y eventos publicados', () => {
    const c = defaultSignage();
    c.scenes[0] = { ...c.scenes[0], status: 'draft' };
    const p = publicSignage(c);
    expect(p.scenes.some((s) => s.id === c.scenes[0].id)).toBe(false);
    expect(p.playlists[0].items.some((i) => i.sceneId === c.scenes[0].id)).toBe(false);
  });
  it('menús por pasos: solo publicados, con sus datos reales (sin Gourmet en borrador)', () => {
    const content = toPublicContent(createSeedContent());
    const scene = defaultSignage().scenes.find((s) => s.type === 'menus')!;
    if (scene.type !== 'menus') throw new Error();
    const pages = menuPages(scene, content);
    expect(pages.map((p) => p.menu.name)).toEqual(expect.arrayContaining(['Menú Esencia', 'Menú Distinción']));
    expect(pages.some((p) => p.menu.id === 'menu-seleccion-gourmet')).toBe(false);
    const dishes = pages.filter((p) => p.kind === 'dishes').flatMap((p) => p.sections.flatMap((s) => s.items.map((i) => i.name)));
    expect(dishes).toContain('Secreto ibérico');
    expect(dishes).toContain('Postre');
  });
  it('se saltan las escenas sin contenido y nunca queda la secuencia vacía', () => {
    const c = defaultSignage();
    const data: SceneData = { content: toPublicContent(createSeedContent()), media: Object.fromEntries(SEED_MEDIA.map((m) => [m.id, m])), events: [] };
    const at = new Date('2026-12-10T19:00:00Z');
    const habitual = buildTimeline(c, { source: 'default', playlistId: 'programa-habitual', sceneId: null, party: null, scheduleId: null }, data, at);
    expect(habitual.map((e) => e.scene.id)).not.toContain('escena-eventos'); // sin eventos
    expect(habitual.length).toBe(3);
    const empty = buildTimeline({ ...c, playlists: [{ id: 'vacia', name: 'v', loop: true, items: [] }] }, { source: 'fixed', playlistId: 'vacia', sceneId: null, party: null, scheduleId: null }, data, at);
    expect(empty).toHaveLength(1);
    expect(empty[0].scene.type).toBe('logo');
    const party = buildTimeline(c, { source: 'override', playlistId: null, sceneId: null, party: PARTY_PRESETS.midnight.config, scheduleId: null }, data, at);
    expect(party).toHaveLength(1);
    expect(party[0].scene.type).toBe('party');
    expect(sceneSteps(c.scenes.find((s) => s.type === 'photos')!, data, at)).toBe(3);
    expect(nextIndex(2, 3, true)).toBe(0);
    expect(nextIndex(2, 3, false)).toBe(2);
  });
  it('periodo de promoción de eventos', () => {
    const e = { id: 'e', name: 'Concierto', description: '', date: '2026-12-19', time: '22:00', artistImage: null, backgroundImage: null, highlight: '', status: 'published' as const, promoFrom: '2026-12-10', promoTo: '', order: 0, style: 'night' as const };
    expect(eventPromoted(e, new Date('2026-12-09T12:00:00Z'))).toBe(false);
    expect(eventPromoted(e, new Date('2026-12-15T12:00:00Z'))).toBe(true);
    expect(eventPromoted(e, new Date('2026-12-20T12:00:00Z'))).toBe(false);
    expect(eventPromoted({ ...e, status: 'draft' }, new Date('2026-12-15T12:00:00Z'))).toBe(false);
  });
});

/* ---------------- API con Netlify Blobs local ---------------- */
const ORIGIN = 'https://torero.example';
const USERS: Record<string, AuthUser> = { 'tok-admin': { id: '1', email: 'admin@torero.es', roles: ['admin'] }, 'tok-editor': { id: '2', email: 'e@torero.es', roles: [] } };
let server: BlobsServer;
let dir: string;
let url: string;
let storeName: string;
let purges: string[][];
let clock = new Date('2026-12-10T12:00:00Z');

function deps(): ApiDeps {
  const mk = (name: string) => getStore({ name, siteID: 'test', token: 't', edgeURL: url, uncachedEdgeURL: url, consistency: 'strong' });
  return {
    content: mk(`${storeName}-content`) as unknown as KV,
    media: mk(`${storeName}-media`) as unknown as BinaryKV,
    auth: async (req) => USERS[(req.headers.get('authorization') ?? '').replace('Bearer ', '')] ?? null,
    adminEmails: [],
    purge: async (t) => void purges.push(t),
    now: () => clock,
  };
}
const admin = (p: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
  createAdminHandler(deps())(
    new Request(`${ORIGIN}/api/admin${p}`, {
      method: init.method ?? 'GET',
      headers: { 'X-Torero-Admin': '1', Authorization: `Bearer ${init.token ?? 'tok-admin'}`, Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
const screen = (p: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
  createScreenHandler(signageDepsOf(deps()))(
    new Request(`${ORIGIN}${p}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
const report = (v = 0, seq = 0) => ({ appliedVersion: v, appliedCommandSeq: seq, playlistId: null, sceneId: 'escena-logo', nextSceneId: null, sceneStartedAt: null, resolution: '1920×1080', quality: 'high', fps: 60, uptimeMin: 1, memoryMb: 40, errors: 0, userAgent: 'test' });

async function pairNew(name = 'TV barra') {
  const start = (await (await screen('/api/screen/pair/start', { method: 'POST' })).json()) as { code: string; secret: string };
  expect((await (await screen('/api/screen/pair/poll', { method: 'POST', body: start })).json()).status).toBe('pending');
  const claim = await admin('/signage/pair', { method: 'POST', body: { code: start.code, name } });
  expect(claim.status).toBe(201);
  const { screen: tv } = (await claim.json()) as { screen: { id: string } & Record<string, unknown> };
  expect(tv).not.toHaveProperty('tokenHash');
  const got = (await (await screen('/api/screen/pair/poll', { method: 'POST', body: start })).json()) as { status: string; token: string };
  expect(got.status).toBe('paired');
  return { id: tv.id, token: got.token, code: start.code, secret: start.secret };
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'torero-signage-'));
  server = new BlobsServer({ directory: dir, token: 't' });
  url = `http://localhost:${(await server.start()).port}`;
});
afterAll(async () => {
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  storeName = `s${Math.random().toString(36).slice(2, 9)}`;
  purges = [];
  clock = new Date('2026-12-10T12:00:00Z');
});

describe('API de pantallas', () => {
  it('configuración pública inicial sin escrituras y cacheable en la CDN', async () => {
    const r = await screen('/api/screen/config');
    expect(r.status).toBe(200);
    expect(r.headers.get('netlify-cache-tag')).toContain('torero-signage');
    const body = (await r.json()) as { config: SignageConfig; media: Record<string, unknown> };
    expect(body.config.scenes.length).toBeGreaterThan(0);
    expect(body.media['bar-lights']).toBeTruthy();
  });

  it('vinculación: código temporal → token de un solo uso, guardado solo como huella', async () => {
    const { id, token, code, secret } = await pairNew();
    // El token se entrega una sola vez.
    expect((await (await screen('/api/screen/pair/poll', { method: 'POST', body: { code, secret } })).json()).status).toBe('expired');
    // Ningún blob guarda el token en claro.
    const store = deps().content;
    const { blobs } = await store.list({ prefix: 'signage/' });
    for (const b of blobs) expect(JSON.stringify(await store.get(b.key, { type: 'json' }))).not.toContain(token);
    const hash = await sha256(token);
    const d = await screen(`/api/screen/d/${hash}`);
    expect(d.status).toBe(200);
    expect(((await d.json()) as { directives: { id: string } }).directives.id).toBe(id);
  });

  it('un código caducado o con secreto equivocado no entrega nada', async () => {
    const start = (await (await screen('/api/screen/pair/start', { method: 'POST' })).json()) as { code: string; secret: string };
    expect((await (await screen('/api/screen/pair/poll', { method: 'POST', body: { code: start.code, secret: 'x'.repeat(30) } })).json()).status).toBe('expired');
    clock = new Date(clock.getTime() + 11 * 60_000);
    expect((await admin('/signage/pair', { method: 'POST', body: { code: start.code, name: 'Tarde' } })).status).toBe(404);
  });

  it('control remoto: versión, confirmación por latido y purga de la caché de esa TV', async () => {
    const { id, token } = await pairNew();
    const r = await admin('/signage/command', { method: 'POST', body: { screenIds: [id], action: 'party', party: PARTY_PRESETS['red-velvet'].config, minutes: 60 } });
    expect(r.status).toBe(200);
    expect(purges.flat()).toContain(`torero-screen-${id}`);
    const st1 = (await (await admin('/signage')).json()) as { screens: { id: string; version: number; override: { kind: string; until: string } | null; status: unknown }[] };
    const tv = st1.screens[0];
    expect(tv.override?.kind).toBe('party');
    expect(Date.parse(tv.override!.until)).toBe(clock.getTime() + 3600_000);
    expect(tv.status).toBeNull();
    // Latido con la versión aplicada.
    const hb = await screen('/api/screen/heartbeat', { method: 'POST', token, body: report(tv.version) });
    expect(hb.status).toBe(200);
    const st2 = (await (await admin('/signage')).json()) as { screens: { status: { appliedVersion: number; lastSeen: string } }[] };
    expect(st2.screens[0].status.appliedVersion).toBe(tv.version);
    expect(st2.screens[0].status.lastSeen).toBe(clock.toISOString());
    // Siguiente escena y reinicio usan un número de orden.
    await admin('/signage/command', { method: 'POST', body: { screenIds: 'all', action: 'next' } });
    const st3 = (await (await admin('/signage')).json()) as { screens: { command: { seq: number; action: string } }[] };
    expect(st3.screens[0].command).toEqual({ seq: 1, action: 'next' });
    // Vuelta a automática.
    await admin('/signage/command', { method: 'POST', body: { screenIds: [id], action: 'auto' } });
    const st4 = (await (await admin('/signage')).json()) as { screens: { override: unknown; paused: boolean }[] };
    expect(st4.screens[0].override).toBeNull();
  });

  it('valida órdenes: escenas inexistentes, borradores, ajustes de fiesta y televisiones', async () => {
    const { id } = await pairNew();
    expect((await admin('/signage/command', { method: 'POST', body: { screenIds: [id], action: 'scene', ref: 'no-existe' } })).status).toBe(400);
    expect((await admin('/signage/command', { method: 'POST', body: { screenIds: [id], action: 'party', party: { preset: 'x' } } })).status).toBe(422);
    expect((await admin('/signage/command', { method: 'POST', body: { screenIds: ['tv-000000000000'], action: 'pause' } })).status).toBe(400);
    expect((await admin('/signage/command', { method: 'POST', body: { screenIds: [id], action: 'formatear' } })).status).toBe(400);
  });

  it('revocar invalida el token al instante', async () => {
    const { id, token } = await pairNew();
    expect((await admin(`/signage/screens/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await screen('/api/screen/heartbeat', { method: 'POST', token, body: report() })).status).toBe(401);
    expect((await screen(`/api/screen/d/${await sha256(token)}`)).status).toBe(401);
  });

  it('el API de pantallas exige administrador y el token de una TV no sirve', async () => {
    const { token } = await pairNew();
    expect((await admin('/signage', { token: 'tok-editor' })).status).toBe(403);
    expect((await admin('/signage', { token })).status).toBe(401);
    expect((await admin('/signage/pair', { method: 'POST', token: 'nadie', body: { code: 'ABCDEF', name: 'x' } })).status).toBe(401);
    expect((await screen('/api/screen/heartbeat', { method: 'POST', body: report() })).status).toBe(401);
    expect((await screen('/api/screen/heartbeat', { method: 'POST', token: 'falso-falso-falso-falso-falso', body: report() })).status).toBe(401);
  });

  it('guardar la configuración: revisión, conflicto 409, validación 422 y purga', async () => {
    const s = (await (await admin('/signage')).json()) as { config: SignageConfig; revision: number };
    expect(s.revision).toBe(0);
    const c = structuredClone(s.config);
    c.scenes[0].name = 'Renombrada';
    const ok = await admin('/signage/config', { method: 'PUT', body: { config: c, baseRevision: 0 } });
    expect(ok.status).toBe(200);
    expect(purges.flat()).toContain('torero-signage');
    expect((await admin('/signage/config', { method: 'PUT', body: { config: c, baseRevision: 0 } })).status).toBe(409);
    const bad = structuredClone(c);
    bad.settings.defaultPlaylistId = 'no-existe';
    expect((await admin('/signage/config', { method: 'PUT', body: { config: bad, baseRevision: 1 } })).status).toBe(422);
    const pub = (await (await screen('/api/screen/config')).json()) as { config: SignageConfig; revision: number };
    expect(pub.revision).toBe(1);
    expect(pub.config.scenes[0].name).toBe('Renombrada');
  });

  it('renombrar, programación fija y calidad por televisión', async () => {
    const { id } = await pairNew();
    expect((await admin(`/signage/screens/${id}`, { method: 'PATCH', body: { name: 'TV terraza', playlistId: 'programa-fiesta', quality: 'low' } })).status).toBe(200);
    expect((await admin(`/signage/screens/${id}`, { method: 'PATCH', body: { playlistId: 'no-existe' } })).status).toBe(400);
    const s = (await (await admin('/signage')).json()) as { screens: { name: string; playlistId: string; quality: string }[] };
    expect(s.screens[0]).toMatchObject({ name: 'TV terraza', playlistId: 'programa-fiesta', quality: 'low' });
  });
});
