/**
 * Motor de la cartelería: construye la secuencia de escenas que toca reproducir y calcula
 * duraciones y pasos. Es código puro (sin DOM) para poder probarlo y compartirlo con el panel.
 *
 * Ciclo de vida de una escena en el reproductor:
 *   preparar (montada oculta + imágenes decodificadas) → reproducir (activa) → pausar/reanudar
 *   → retirar (transición de salida) → liberar (desmontaje: timers, listeners y WebGL liberados).
 */
import type { MediaAsset, Menu, SiteContent } from '../../shared/schema.ts';
import { assetUrl, largestWidth } from '../../shared/media-catalog.ts';
import {
  type PartyConfig,
  type Resolution,
  type Scene,
  type SignageConfig,
  type SignageEvent,
  type Transition,
  defaultTransition,
  eventPromoted,
  madridTime,
  PARTY_PRESETS,
} from '../../shared/signage.ts';

export interface SceneData {
  content: SiteContent;
  media: Record<string, MediaAsset>;
  events: SignageEvent[];
}

export interface TimelineEntry {
  /** Clave estable del elemento (cambia si cambia la escena). */
  key: string;
  scene: Scene;
  /** Duración de cada paso, en ms. */
  stepMs: number;
  steps: number;
  transition: Exclude<Transition, 'auto'>;
}

export const FALLBACK_SCENE: Scene = {
  id: 'reserva-logo',
  type: 'logo',
  name: 'Logotipo',
  status: 'published',
  duration: 30,
  transition: 'light',
  updatedAt: '',
  mood: 'warm',
  tagline: '',
  particles: true,
};

/* ---------------- Menús ---------------- */
export interface MenuPage {
  menu: Menu;
  index: number;
  kind: 'cover' | 'dishes';
  sections: Menu['sections'];
  part: number;
  parts: number;
}

/** Peso visual aproximado de una sección (título + platos) para repartirla en pantallas legibles. */
const sectionWeight = (s: Menu['sections'][number]) => 1.7 + s.items.reduce((n, i) => n + (i.detail ? 1.5 : 1), 0);
export const MENU_PAGE_CAPACITY = 17;

export function menusFor(scene: Extract<Scene, { type: 'menus' }>, content: SiteContent): Menu[] {
  const pub = content.menus.filter((m) => m.status === 'published').sort((a, b) => a.order - b.order);
  if (!scene.menuIds.length) return pub;
  return scene.menuIds.map((id) => pub.find((m) => m.id === id)).filter((m): m is Menu => !!m);
}

export function menuPages(scene: Extract<Scene, { type: 'menus' }>, content: SiteContent): MenuPage[] {
  const pages: MenuPage[] = [];
  const all = content.menus.filter((m) => m.status === 'published').sort((a, b) => a.order - b.order);
  for (const menu of menusFor(scene, content)) {
    const index = all.indexOf(menu);
    pages.push({ menu, index, kind: 'cover', sections: [], part: 0, parts: 0 });
    const groups: Menu['sections'][] = [];
    let cur: Menu['sections'] = [];
    let w = 0;
    for (const s of menu.sections) {
      const sw = sectionWeight(s);
      if (cur.length && w + sw > MENU_PAGE_CAPACITY) {
        groups.push(cur);
        cur = [];
        w = 0;
      }
      cur.push(s);
      w += sw;
    }
    if (cur.length) groups.push(cur);
    groups.forEach((g, i) => pages.push({ menu, index, kind: 'dishes', sections: g, part: i + 1, parts: groups.length }));
  }
  return pages;
}

/* ---------------- Eventos ---------------- */
export function upcomingEvents(events: SignageEvent[], at: Date, max = 6): SignageEvent[] {
  return events
    .filter((e) => eventPromoted(e, at))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.order - b.order)
    .slice(0, max);
}

/* ---------------- Disponibilidad, pasos e imágenes ---------------- */
export function sceneSteps(scene: Scene, data: SceneData, at: Date): number {
  if (scene.type === 'menus') return menuPages(scene, data.content).length;
  if (scene.type === 'photos') return scene.images.filter((i) => data.media[i.asset]).length;
  if (scene.type === 'events') return upcomingEvents(data.events, at, scene.max).length ? 1 : 0;
  if (scene.type === 'event') return data.events.some((e) => e.id === scene.eventId && eventPromoted(e, at)) ? 1 : 0;
  return 1;
}

export function imageUrl(asset: MediaAsset | undefined, width = 1920): string | null {
  if (!asset) return null;
  const w = asset.kind === 'static' ? (asset.widths.find((x) => x >= width) ?? largestWidth(asset)) : asset.width;
  return assetUrl(asset, w, 'webp');
}

/** Imágenes que conviene decodificar antes de mostrar la escena (evita fogonazos y huecos). */
export function sceneImages(scene: Scene, data: SceneData, at: Date): string[] {
  const urls: (string | null)[] = [];
  const logo = data.content.campaign.logo;
  if (logo && (scene.type === 'logo' || scene.type === 'party' || (scene.type === 'message' && scene.showLogo))) urls.push(imageUrl(data.media[logo.asset], 1280));
  if (scene.type === 'photos') urls.push(...scene.images.slice(0, 2).map((i) => imageUrl(data.media[i.asset])));
  if (scene.type === 'message' && scene.background) urls.push(imageUrl(data.media[scene.background.asset]));
  if (scene.type === 'menus') {
    for (const m of menusFor(scene, data.content).slice(0, 1)) if (m.image) urls.push(imageUrl(data.media[m.image.asset]));
  }
  if (scene.type === 'event') {
    const e = data.events.find((x) => x.id === scene.eventId);
    if (e) urls.push(imageUrl(data.media[e.backgroundImage?.asset ?? '']), imageUrl(data.media[e.artistImage?.asset ?? ''], 1280));
  }
  if (scene.type === 'events') {
    for (const e of upcomingEvents(data.events, at, scene.max)) urls.push(imageUrl(data.media[(e.artistImage ?? e.backgroundImage)?.asset ?? ''], 640));
  }
  return urls.filter((u): u is string => !!u);
}

/* ---------------- Secuencia ---------------- */
function partyScene(base: Scene | undefined, party: PartyConfig | null): Scene {
  const cfg = party ?? (base?.type === 'party' ? base.party : PARTY_PRESETS['gold-night'].config);
  return {
    id: base?.id ?? 'fiesta-directa',
    type: 'party',
    name: base?.name ?? 'Modo fiesta',
    status: 'published',
    duration: 600,
    transition: 'light',
    updatedAt: '',
    party: cfg,
  };
}

/**
 * Secuencia a reproducir para una resolución de programación. Las escenas sin contenido
 * (sin menús publicados, sin eventos vigentes…) se saltan; si no queda ninguna, se muestra el logotipo.
 */
export function buildTimeline(cfg: SignageConfig, res: Resolution, data: SceneData, at: Date): TimelineEntry[] {
  const entry = (scene: Scene, key: string, duration: number | null, transition: Transition | null): TimelineEntry | null => {
    const steps = sceneSteps(scene, data, at);
    if (steps <= 0) return null;
    const t = transition && transition !== 'auto' ? transition : scene.transition !== 'auto' ? scene.transition : defaultTransition(scene.type);
    return { key, scene, stepMs: (duration ?? scene.duration) * 1000, steps, transition: t };
  };
  let out: (TimelineEntry | null)[] = [];
  if (res.party) {
    out = [entry(partyScene(cfg.scenes.find((s) => s.id === res.sceneId), res.party), `party:${res.sceneId ?? ''}:${JSON.stringify(res.party)}`, null, 'light')];
  } else if (res.sceneId) {
    const sc = cfg.scenes.find((s) => s.id === res.sceneId);
    if (sc) out = [entry(sc, `scene:${sc.id}:${sc.updatedAt}`, null, null)];
  } else if (res.playlistId) {
    const pl = cfg.playlists.find((p) => p.id === res.playlistId);
    if (pl) {
      out = pl.items
        .filter((i) => !i.hidden)
        .map((i) => {
          const sc = cfg.scenes.find((s) => s.id === i.sceneId && s.status === 'published');
          return sc ? entry(sc, `${pl.id}:${i.id}:${sc.id}:${sc.updatedAt}`, i.duration, i.transition) : null;
        });
    }
  }
  const list = out.filter((e): e is TimelineEntry => !!e);
  if (list.length) return list;
  return [{ key: 'fallback', scene: FALLBACK_SCENE, stepMs: FALLBACK_SCENE.duration * 1000, steps: 1, transition: 'fade' }];
}

export const entryMs = (e: TimelineEntry) => e.stepMs * e.steps;

/** Clave de programa: si cambia, el reproductor empieza la nueva secuencia desde el principio. */
export function programKey(res: Resolution): string {
  return `${res.source}|${res.playlistId ?? ''}|${res.sceneId ?? ''}|${res.party ? JSON.stringify(res.party) : ''}`;
}

/** Siguiente posición de la secuencia (respeta «repetir en bucle»). */
export function nextIndex(index: number, length: number, loop: boolean): number {
  if (length <= 1) return 0;
  if (index + 1 < length) return index + 1;
  return loop ? 0 : index;
}

/* ---------------- Formatos ---------------- */
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function eventDateParts(date: string): { weekday: string; day: string; month: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T12:00:00Z`);
  const t = madridTime(d);
  return { weekday: WEEKDAYS[t.day], day: String(Number(date.slice(8, 10))), month: MONTHS[Number(date.slice(5, 7)) - 1] };
}
