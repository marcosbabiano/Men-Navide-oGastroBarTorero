/** Utilidades del dispositivo: almacenamiento local seguro, calidad, FPS, pantalla completa y Wake Lock. */
import type { Quality } from '../../shared/signage.ts';
import type { RenderQuality } from './common.tsx';

export const LS = {
  token: 'torero-screen-token',
  cmdSeq: 'torero-screen-cmdseq',
  cache: 'torero-screen-cache-v1',
};

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento lleno o bloqueado: se sigue sin caché */
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Calidad inicial en modo automático según el equipo (se ajusta después según los FPS reales). */
export function detectQuality(): RenderQuality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  if (cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'balanced';
  return 'high';
}

export function resolveQuality(q: Quality, auto: RenderQuality): RenderQuality {
  return q === 'auto' ? auto : q;
}

/** Medidor de FPS del navegador (media móvil de ~5 s). */
export class FpsMeter {
  private raf = 0;
  private frames = 0;
  private since = performance.now();
  value: number | null = null;
  start() {
    const loop = (t: number) => {
      this.frames++;
      if (t - this.since >= 5000) {
        this.value = Math.round((this.frames * 1000) / (t - this.since));
        this.frames = 0;
        this.since = t;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }
}

export async function enterFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}
export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await enterFullscreen();
  } catch {
    /* sin permiso */
  }
}

/** Mantiene la pantalla encendida mientras la pestaña está visible (si el navegador lo permite). */
export function keepAwake(): () => void {
  type Sentinel = { release: () => Promise<void>; released: boolean };
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
  if (!wl) return () => undefined;
  let sentinel: Sentinel | null = null;
  let stopped = false;
  const request = async () => {
    if (stopped || document.hidden || (sentinel && !sentinel.released)) return;
    try {
      sentinel = await wl.request('screen');
    } catch {
      sentinel = null;
    }
  };
  const onVis = () => void request();
  document.addEventListener('visibilitychange', onVis);
  void request();
  const retry = window.setInterval(() => void request(), 60_000);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVis);
    clearInterval(retry);
    void sentinel?.release().catch(() => undefined);
  };
}

export function screenResolution(): string {
  const dpr = window.devicePixelRatio || 1;
  return `${Math.round(screen.width * dpr)}×${Math.round(screen.height * dpr)}`;
}
