/**
 * Cartelería digital de GastroBar Torero: modelo de datos, valores iniciales y resolución de la
 * programación (zona horaria Europe/Madrid). Compartido por el reproductor, el panel y el servidor.
 */
import { z } from 'zod';
import { imageRefSchema, safeText } from './schema.ts';

export const TZ = 'Europe/Madrid';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TRANSITIONS = ['auto', 'fade', 'mask', 'wipe', 'layers', 'parallax', 'scale', 'editorial', 'light'] as const;
export type Transition = (typeof TRANSITIONS)[number];
export const TRANSITION_LABEL: Record<Transition, string> = {
  auto: 'Automática (según la escena)',
  fade: 'Fundido cinematográfico',
  mask: 'Revelado con máscara',
  wipe: 'Barrido elegante',
  layers: 'Aparición por capas',
  parallax: 'Profundidad y parallax',
  scale: 'Escala suave',
  editorial: 'Desplazamiento editorial',
  light: 'Transición de luz',
};

export const QUALITIES = ['auto', 'high', 'balanced', 'low'] as const;
export type Quality = (typeof QUALITIES)[number];
export const QUALITY_LABEL: Record<Quality, string> = { auto: 'Automático', high: 'Alto', balanced: 'Equilibrado', low: 'Bajo consumo' };

/* ---------------- Modo fiesta ---------------- */
export const PARTY_PRESET_IDS = ['gold-night', 'red-velvet', 'club-night', 'midnight', 'torero-classic'] as const;
export type PartyPresetId = (typeof PARTY_PRESET_IDS)[number];

export const partySchema = z.object({
  preset: z.enum(PARTY_PRESET_IDS),
  colors: z.array(hex).min(1).max(4),
  /** 0.2 – 2: velocidad de movimiento de los haces. */
  speed: z.number().min(0.2).max(2),
  /** 0.2 – 1.5: intensidad de la luz. */
  intensity: z.number().min(0.2).max(1.5),
  beams: z.number().int().min(2).max(12),
  /** 0 – 1: amplitud del barrido de los focos. */
  motion: z.number().min(0).max(1),
  /** 0 – 1: cantidad de partículas. */
  particles: z.number().min(0).max(1),
  /** 0 – 1: densidad de niebla / atmósfera. */
  haze: z.number().min(0).max(1),
  logoScale: z.number().min(0.3).max(1.6),
  /** −0.3 – 0.3: desplazamiento vertical del logotipo (fracción de la altura). */
  logoY: z.number().min(-0.3).max(0.3),
  text: safeText(80),
  background: hex,
});
export type PartyConfig = z.infer<typeof partySchema>;

export const PARTY_PRESETS: Record<PartyPresetId, { label: string; description: string; config: PartyConfig }> = {
  'gold-night': {
    label: 'Gold Night',
    description: 'Luces doradas y blanco cálido, atmósfera elegante.',
    config: { preset: 'gold-night', colors: ['#f2c879', '#fff1d6', '#c9a96e'], speed: 0.7, intensity: 0.95, beams: 6, motion: 0.55, particles: 0.45, haze: 0.55, logoScale: 1, logoY: 0, text: '', background: '#0c0806' },
  },
  'red-velvet': {
    label: 'Red Velvet',
    description: 'Rojos y burdeos con contrastes oscuros.',
    config: { preset: 'red-velvet', colors: ['#d4213d', '#7a1430', '#ff6b5e'], speed: 0.6, intensity: 1, beams: 6, motion: 0.5, particles: 0.35, haze: 0.65, logoScale: 1, logoY: 0, text: '', background: '#0d0406' },
  },
  'club-night': {
    label: 'Club Night',
    description: 'Haces azules, violetas y tonos nocturnos.',
    config: { preset: 'club-night', colors: ['#3d6bff', '#a23dff', '#21d4fd', '#ff3dbb'], speed: 1, intensity: 1.15, beams: 8, motion: 0.8, particles: 0.6, haze: 0.6, logoScale: 1, logoY: 0, text: '', background: '#05040d' },
  },
  midnight: {
    label: 'Midnight',
    description: 'Azul profundo, violeta y blanco frío.',
    config: { preset: 'midnight', colors: ['#2b4cff', '#7c5cff', '#dfe6ff'], speed: 0.55, intensity: 0.85, beams: 5, motion: 0.45, particles: 0.5, haze: 0.7, logoScale: 1, logoY: 0, text: '', background: '#03040b' },
  },
  'torero-classic': {
    label: 'Torero Classic',
    description: 'Iluminación cálida y protagonismo absoluto del logotipo.',
    config: { preset: 'torero-classic', colors: ['#c9a96e', '#5a2533', '#f4ece0'], speed: 0.4, intensity: 0.7, beams: 4, motion: 0.35, particles: 0.3, haze: 0.45, logoScale: 1.2, logoY: 0, text: '', background: '#0e0809' },
  },
};

// Los estilos predefinidos son de solo lectura (se copian al aplicarlos).
for (const p of Object.values(PARTY_PRESETS)) Object.freeze(Object.freeze(p.config).colors);

/* ---------------- Escenas ---------------- */
export const SCENE_TYPES = ['menus', 'event', 'events', 'photos', 'logo', 'party', 'message', 'booking'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];
export const SCENE_TYPE_LABEL: Record<SceneType, string> = {
  menus: 'Menús de Navidad',
  event: 'Evento',
  events: 'Próximos eventos',
  photos: 'Fotografías y ambiente',
  logo: 'Logotipo premium',
  party: 'Modo fiesta (luces)',
  message: 'Mensaje personalizado',
  booking: 'Reservas (con QR)',
};

export const MESSAGE_STYLES = ['elegant', 'christmas', 'night', 'minimal'] as const;
export const LOGO_MOODS = ['warm', 'christmas', 'night'] as const;

const sceneBase = {
  id,
  name: safeText(80),
  status: z.enum(['draft', 'published']),
  /** Segundos. En «menus» es la duración de cada paso. */
  duration: z.number().int().min(4).max(600),
  transition: z.enum(TRANSITIONS),
  updatedAt: z.string().max(40),
};

export const sceneSchema = z.discriminatedUnion('type', [
  z.object({
    ...sceneBase,
    type: z.literal('menus'),
    /** Vacío = todos los menús publicados. */
    menuIds: z.array(z.string().max(80)).max(20),
    showQr: z.boolean(),
  }),
  z.object({ ...sceneBase, type: z.literal('event'), eventId: z.string().max(80) }),
  z.object({ ...sceneBase, type: z.literal('events'), max: z.number().int().min(1).max(6) }),
  z.object({
    ...sceneBase,
    type: z.literal('photos'),
    images: z.array(imageRefSchema).max(30),
    effect: z.enum(['kenburns', 'pan', 'mask']),
    caption: safeText(120),
  }),
  z.object({ ...sceneBase, type: z.literal('logo'), mood: z.enum(LOGO_MOODS), tagline: safeText(120), particles: z.boolean() }),
  z.object({ ...sceneBase, type: z.literal('party'), party: partySchema }),
  z.object({
    ...sceneBase,
    type: z.literal('message'),
    text: safeText(160),
    subtext: safeText(240),
    style: z.enum(MESSAGE_STYLES),
    showLogo: z.boolean(),
    background: imageRefSchema.nullable(),
    accent: hex,
    animation: z.enum(['reveal', 'letters', 'fade']),
  }),
  z.object({ ...sceneBase, type: z.literal('booking'), title: safeText(120), subtext: safeText(240), showQr: z.boolean() }),
]);
export type Scene = z.infer<typeof sceneSchema>;

export const EVENT_STYLES = ['gastro', 'celebration', 'night'] as const;
export const EVENT_STYLE_LABEL: Record<(typeof EVENT_STYLES)[number], string> = {
  gastro: 'Gastronómico',
  celebration: 'Celebración',
  night: 'Fiesta nocturna',
};

export const eventSchema = z.object({
  id,
  name: safeText(100),
  description: safeText(400),
  date: z.union([date, z.literal('')]),
  time: z.union([time, z.literal('')]),
  artistImage: imageRefSchema.nullable(),
  backgroundImage: imageRefSchema.nullable(),
  highlight: safeText(120),
  status: z.enum(['draft', 'published']),
  promoFrom: z.union([date, z.literal('')]),
  promoTo: z.union([date, z.literal('')]),
  order: z.number().int().min(0).max(999),
  style: z.enum(EVENT_STYLES),
});
export type SignageEvent = z.infer<typeof eventSchema>;

export const playlistItemSchema = z.object({
  id,
  sceneId: id,
  /** null = duración de la escena. */
  duration: z.number().int().min(4).max(600).nullable(),
  transition: z.enum(TRANSITIONS).nullable(),
  hidden: z.boolean(),
});
export const playlistSchema = z.object({ id, name: safeText(80), items: z.array(playlistItemSchema).max(60), loop: z.boolean() });
export type Playlist = z.infer<typeof playlistSchema>;
export type PlaylistItem = z.infer<typeof playlistItemSchema>;

export const scheduleSchema = z.object({
  id,
  name: safeText(80),
  enabled: z.boolean(),
  playlistId: id,
  /** 0 = lunes … 6 = domingo. */
  days: z.array(z.number().int().min(0).max(6)).max(7),
  start: time,
  /** Si end <= start, el tramo cruza la medianoche. */
  end: time,
  dateFrom: z.union([date, z.literal('')]),
  dateTo: z.union([date, z.literal('')]),
  priority: z.number().int().min(0).max(100),
  /** Vacío = todas las televisiones. */
  screenIds: z.array(z.string().max(80)).max(50),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const signageConfigSchema = z
  .object({
    scenes: z.array(sceneSchema).max(120),
    events: z.array(eventSchema).max(60),
    playlists: z.array(playlistSchema).max(40),
    schedules: z.array(scheduleSchema).max(80),
    settings: z.object({
      defaultPlaylistId: id,
      quality: z.enum(QUALITIES),
      /** Cada cuántos segundos consultan las pantallas vinculadas (coste de Netlify Functions). */
      pollSeconds: z.number().int().min(5).max(120),
      /** Cada cuántos segundos informa cada televisión de su estado (latido). */
      heartbeatSeconds: z.number().int().min(20).max(600),
      /** Recarga preventiva del reproductor tras N horas (0 = nunca). */
      reloadHours: z.number().int().min(0).max(72),
      cursorHideSeconds: z.number().int().min(1).max(60),
    }),
  })
  .superRefine((c, ctx) => {
    const scenes = new Set(c.scenes.map((s) => s.id));
    const lists = new Set(c.playlists.map((p) => p.id));
    if (!lists.has(c.settings.defaultPlaylistId)) ctx.addIssue({ code: 'custom', message: 'La programación por defecto no existe.', path: ['settings', 'defaultPlaylistId'] });
    c.playlists.forEach((p, i) =>
      p.items.forEach((it, k) => {
        if (!scenes.has(it.sceneId)) ctx.addIssue({ code: 'custom', message: `«${p.name}»: una escena ya no existe.`, path: ['playlists', i, 'items', k, 'sceneId'] });
      }),
    );
    c.schedules.forEach((s, i) => {
      if (!lists.has(s.playlistId)) ctx.addIssue({ code: 'custom', message: `Horario «${s.name}»: su programación no existe.`, path: ['schedules', i, 'playlistId'] });
    });
    for (const key of ['scenes', 'events', 'playlists', 'schedules'] as const) {
      const ids = c[key].map((x) => x.id);
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: `Hay identificadores repetidos en ${key}.`, path: [key] });
    }
  });
export type SignageConfig = z.infer<typeof signageConfigSchema>;

/* ---------------- Televisiones y control remoto ---------------- */
export const overrideSchema = z
  .object({
    kind: z.enum(['playlist', 'scene', 'party']),
    /** Programación o escena (en «party», la escena de fiesta o vacío = configuración ad hoc). */
    ref: z.string().max(80),
    party: partySchema.nullable(),
    /** ISO; null = hasta que se quite manualmente. */
    until: z.string().max(40).nullable(),
  })
  .nullable();
export type Override = z.infer<typeof overrideSchema>;

export interface ScreenRecord {
  id: string;
  name: string;
  /** null = programación automática (horarios). */
  playlistId: string | null;
  quality: Quality | null;
  override: Override;
  paused: boolean;
  /** Se incrementa con cada cambio del administrador: el reproductor confirma la versión aplicada. */
  version: number;
  /** Órdenes puntuales (siguiente escena, reiniciar). */
  command: { seq: number; action: 'next' | 'reload' | 'none' };
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenStatus {
  lastSeen: string;
  appliedVersion: number;
  appliedCommandSeq: number;
  playlistId: string | null;
  sceneId: string | null;
  nextSceneId: string | null;
  sceneStartedAt: string | null;
  resolution: string;
  quality: string;
  fps: number | null;
  uptimeMin: number;
  memoryMb: number | null;
  errors: number;
  userAgent: string;
}

export const statusReportSchema = z.object({
  appliedVersion: z.number().int().min(0),
  appliedCommandSeq: z.number().int().min(0),
  playlistId: z.string().max(80).nullable(),
  sceneId: z.string().max(80).nullable(),
  nextSceneId: z.string().max(80).nullable(),
  sceneStartedAt: z.string().max(40).nullable(),
  resolution: z.string().max(40),
  quality: z.string().max(20),
  fps: z.number().min(0).max(1000).nullable(),
  uptimeMin: z.number().min(0).max(1e6),
  memoryMb: z.number().min(0).max(1e6).nullable(),
  errors: z.number().int().min(0).max(1e6),
  userAgent: z.string().max(300),
});

/** Lo que recibe un reproductor vinculado (sin datos de otras pantallas ni credenciales). */
export interface ScreenDirectives {
  id: string;
  name: string;
  playlistId: string | null;
  quality: Quality | null;
  override: Override;
  paused: boolean;
  version: number;
  command: ScreenRecord['command'];
}

/** Una televisión se considera conectada si su último latido es reciente (2,5 latidos de margen). */
export function isOnline(status: Pick<ScreenStatus, 'lastSeen'> | null | undefined, heartbeatSeconds: number, now = Date.now()): boolean {
  if (!status) return false;
  return now - Date.parse(status.lastSeen) < Math.max(45, heartbeatSeconds * 2.5) * 1000;
}

/* ---------------- Tiempo en Madrid y resolución de la programación ---------------- */
export interface MadridTime {
  date: string; // AAAA-MM-DD
  day: number; // 0 = lunes
  minutes: number; // desde medianoche
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Hora local de Madrid (con horario de verano) para un instante cualquiera. */
export function madridTime(at: Date): MadridTime {
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, day: WD[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** ¿El horario está activo en ese momento? Los tramos que cruzan medianoche cuentan para el día de inicio. */
export function scheduleActive(s: Schedule, t: MadridTime, prevDay: MadridTime): boolean {
  if (!s.enabled) return false;
  const start = toMin(s.start);
  const end = toMin(s.end);
  const inDates = (d: string) => (!s.dateFrom || d >= s.dateFrom) && (!s.dateTo || d <= s.dateTo);
  const dayOk = (d: number) => s.days.length === 0 || s.days.includes(d);
  if (end > start) return dayOk(t.day) && inDates(t.date) && t.minutes >= start && t.minutes < end;
  // Cruza medianoche (o 24 h si start == end).
  if (dayOk(t.day) && inDates(t.date) && t.minutes >= start) return true;
  return dayOk(prevDay.day) && inDates(prevDay.date) && t.minutes < end;
}

export function activeSchedule(cfg: Pick<SignageConfig, 'schedules'>, at: Date, screenId: string | null): Schedule | null {
  const t = madridTime(at);
  const prev = madridTime(new Date(at.getTime() - 24 * 3600 * 1000));
  const candidates = cfg.schedules
    .filter((s) => (s.screenIds.length === 0 || (screenId !== null && s.screenIds.includes(screenId))) && scheduleActive(s, t, prev))
    .sort((a, b) => b.priority - a.priority || cfg.schedules.indexOf(a) - cfg.schedules.indexOf(b));
  return candidates[0] ?? null;
}

export interface Resolution {
  source: 'override' | 'fixed' | 'schedule' | 'default';
  playlistId: string | null;
  /** Escena única forzada (anulación con escena o fiesta). */
  sceneId: string | null;
  party: PartyConfig | null;
  scheduleId: string | null;
}

export function resolveProgram(cfg: SignageConfig, screen: Pick<ScreenDirectives, 'id' | 'playlistId' | 'override'> | null, at: Date): Resolution {
  const ov = screen?.override;
  if (ov && (!ov.until || Date.parse(ov.until) > at.getTime())) {
    if (ov.kind === 'playlist' && cfg.playlists.some((p) => p.id === ov.ref)) return { source: 'override', playlistId: ov.ref, sceneId: null, party: null, scheduleId: null };
    if (ov.kind === 'scene' && cfg.scenes.some((s) => s.id === ov.ref)) return { source: 'override', playlistId: null, sceneId: ov.ref, party: null, scheduleId: null };
    if (ov.kind === 'party') return { source: 'override', playlistId: null, sceneId: ov.ref || null, party: ov.party, scheduleId: null };
  }
  if (screen?.playlistId && cfg.playlists.some((p) => p.id === screen.playlistId)) return { source: 'fixed', playlistId: screen.playlistId, sceneId: null, party: null, scheduleId: null };
  const sch = activeSchedule(cfg, at, screen?.id ?? null);
  if (sch) return { source: 'schedule', playlistId: sch.playlistId, sceneId: null, party: null, scheduleId: sch.id };
  return { source: 'default', playlistId: cfg.settings.defaultPlaylistId, sceneId: null, party: null, scheduleId: null };
}

/** Próximo instante (en los próximos 7 días) en el que cambia la programación por horario. */
export function nextScheduleChange(cfg: SignageConfig, screenId: string | null, from: Date): { at: Date; playlistId: string } | null {
  const current = activeSchedule(cfg, from, screenId)?.id ?? null;
  const start = Math.ceil(from.getTime() / 60000) * 60000;
  for (let i = 1; i <= 7 * 24 * 60; i++) {
    const at = new Date(start + i * 60000);
    const s = activeSchedule(cfg, at, screenId);
    if ((s?.id ?? null) !== current) return { at, playlistId: s?.playlistId ?? cfg.settings.defaultPlaylistId };
  }
  return null;
}

/** ¿Un evento está en su periodo de promoción? */
export function eventPromoted(e: SignageEvent, at: Date): boolean {
  if (e.status !== 'published') return false;
  const d = madridTime(at).date;
  const to = e.promoTo || e.date;
  return (!e.promoFrom || d >= e.promoFrom) && (!to || d <= to);
}

/** Proyección que reciben los reproductores: solo escenas y eventos publicados. */
export function publicSignage(cfg: SignageConfig): SignageConfig {
  const scenes = cfg.scenes.filter((s) => s.status === 'published');
  const ids = new Set(scenes.map((s) => s.id));
  return {
    ...cfg,
    scenes,
    events: cfg.events.filter((e) => e.status === 'published'),
    playlists: cfg.playlists.map((p) => ({ ...p, items: p.items.filter((i) => ids.has(i.sceneId) && !i.hidden) })),
  };
}

export function defaultTransition(type: SceneType): Exclude<Transition, 'auto'> {
  return ({ menus: 'editorial', event: 'mask', events: 'wipe', photos: 'fade', logo: 'light', party: 'light', message: 'layers', booking: 'scale' } as const)[type];
}

/* ---------------- Contenido inicial ---------------- */
const NOW = '2026-11-08T00:00:00.000Z';

export function defaultSignage(): SignageConfig {
  const sc = (s: Record<string, unknown>) => ({ status: 'published', transition: 'auto', updatedAt: NOW, ...s }) as Scene;
  return {
    scenes: [
      sc({ id: 'escena-navidad', type: 'message', name: 'Presentación navideña', duration: 12, text: 'Feliz Navidad', subtext: 'Comidas y cenas de Navidad en GastroBar Torero', style: 'christmas', showLogo: true, background: null, accent: '#c9a96e', animation: 'letters' }),
      sc({ id: 'escena-menus', type: 'menus', name: 'Menús de Navidad', duration: 10, menuIds: [], showQr: true }),
      sc({ id: 'escena-reservas', type: 'booking', name: 'Reserva tu mesa', duration: 14, title: 'Reserva tu mesa de Navidad', subtext: 'Escanea el código o pregúntanos en barra', showQr: true }),
      sc({ id: 'escena-logo', type: 'logo', name: 'Logotipo · ambiente cálido', duration: 20, mood: 'warm', tagline: '', particles: true }),
      sc({ id: 'escena-logo-navidad', type: 'logo', name: 'Logotipo · Navidad', duration: 18, mood: 'christmas', tagline: 'Feliz Navidad', particles: true }),
      sc({ id: 'escena-fotos', type: 'photos', name: 'Ambiente', duration: 8, images: [
        { asset: 'arte-celebracion', alt: 'Comedor navideño con mesa larga, velas y chimenea' },
        { asset: 'bar-lights', alt: 'Barra de bar iluminada con luz cálida' },
        { asset: 'arte-navidad-comparte', alt: 'Manos brindando con vino tinto y cava alrededor de la mesa' },
      ], effect: 'kenburns', caption: '' }),
      sc({ id: 'escena-eventos', type: 'events', name: 'Próximos eventos', duration: 14, max: 3 }),
      sc({ id: 'escena-fiesta', type: 'party', name: 'Fiesta · Gold Night', duration: 60, party: structuredClone(PARTY_PRESETS['gold-night'].config) }),
      sc({ id: 'escena-bienvenida', type: 'message', name: 'Bienvenida', duration: 12, text: 'Bienvenidos', subtext: 'GastroBar Torero', style: 'elegant', showLogo: false, background: null, accent: '#c9a96e', animation: 'reveal' }),
    ],
    events: [],
    playlists: [
      { id: 'programa-navidad', name: 'Programa Navidad', loop: true, items: ['escena-navidad', 'escena-menus', 'escena-reservas', 'escena-logo-navidad'].map((s, i) => ({ id: `navidad-${i}`, sceneId: s, duration: null, transition: null, hidden: false })) },
      { id: 'programa-habitual', name: 'Programa Habitual', loop: true, items: ['escena-logo', 'escena-fotos', 'escena-eventos', 'escena-bienvenida'].map((s, i) => ({ id: `habitual-${i}`, sceneId: s, duration: null, transition: null, hidden: false })) },
      { id: 'programa-fiesta', name: 'Programa Fiesta', loop: true, items: ['escena-fiesta', 'escena-eventos'].map((s, i) => ({ id: `fiesta-${i}`, sceneId: s, duration: null, transition: null, hidden: false })) },
    ],
    schedules: [
      { id: 'horario-mediodia', name: 'Mediodía: menús', enabled: true, playlistId: 'programa-navidad', days: [], start: '12:00', end: '17:00', dateFrom: '', dateTo: '', priority: 10, screenIds: [] },
      { id: 'horario-tarde', name: 'Tarde: ambiente', enabled: true, playlistId: 'programa-habitual', days: [], start: '17:00', end: '21:00', dateFrom: '', dateTo: '', priority: 10, screenIds: [] },
      { id: 'horario-noche', name: 'Noche: ambiente', enabled: true, playlistId: 'programa-habitual', days: [], start: '21:00', end: '03:00', dateFrom: '', dateTo: '', priority: 10, screenIds: [] },
    ],
    settings: { defaultPlaylistId: 'programa-habitual', quality: 'auto', pollSeconds: 10, heartbeatSeconds: 60, reloadHours: 12, cursorHideSeconds: 3 },
  };
}
