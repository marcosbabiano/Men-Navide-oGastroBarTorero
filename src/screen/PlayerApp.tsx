/**
 * Reproductor /pantalla para televisiones (portátil + HDMI + Chrome).
 *
 * - Sin vincular: reproduce la programación general (horarios sin televisión concreta).
 * - Vinculada: consulta sus órdenes cada pocos segundos (respuesta cacheada en la CDN y purgada
 *   al cambiar algo en el panel), aplica y confirma con un latido que también informa del estado.
 * - Guarda en el navegador la última configuración y contenido válidos: si se cae la conexión,
 *   sigue reproduciendo lo último que tenía.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicPayload } from '../../shared/public.ts';
import type { MediaAsset } from '../../shared/schema.ts';
import { defaultSignage, publicSignage, resolveProgram, type ScreenDirectives, type SignageConfig } from '../../shared/signage.ts';
import { Runner, type RunnerHandle, type RunnerReport } from './Runner.tsx';
import type { RenderQuality } from './common.tsx';
import { detectQuality, enterFullscreen, FpsMeter, keepAwake, LS, lsGet, lsSet, resolveQuality, screenResolution, sha256Hex, toggleFullscreen } from './device.ts';

interface CachedState {
  config: SignageConfig;
  configRevision: number;
  configMedia: Record<string, MediaAsset>;
  payload: PublicPayload | null;
  savedAt: string;
}

const params = new URLSearchParams(location.search);
const KIOSK = params.get('kiosk') === '1';
/** Prueba de una escena publicada concreta: /pantalla?escena=<id> (no afecta a las televisiones). */
const FORCED_SCENE = params.get('escena');
const STARTED_AT = Date.now();

function readCache(): CachedState | null {
  try {
    const raw = lsGet(LS.cache);
    return raw ? (JSON.parse(raw) as CachedState) : null;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T | null; date: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { cache: 'no-store', ...init, signal: ctrl.signal, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
    return { status: res.status, body, date: res.headers.get('date') };
  } finally {
    clearTimeout(timer);
  }
}

/** Escala el lienzo lógico 1920×1080 a cualquier pantalla (1080p, 4K…) manteniendo 16:9. */
function useStageScale() {
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
  useEffect(() => {
    const on = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

type PairState = { phase: 'idle' } | { phase: 'starting' } | { phase: 'code'; code: string; secret: string; expiresAt: string } | { phase: 'error'; message: string } | { phase: 'done'; name: string };

export function PlayerApp() {
  const [cached] = useState(readCache);
  const [config, setConfig] = useState<SignageConfig>(() => cached?.config ?? defaultSignage());
  const [configRev, setConfigRev] = useState(cached?.configRevision ?? -1);
  const [configMedia, setConfigMedia] = useState<Record<string, MediaAsset>>(cached?.configMedia ?? {});
  const [payload, setPayload] = useState<PublicPayload | null>(cached?.payload ?? null);
  const [token, setToken] = useState<string | null>(() => lsGet(LS.token));
  const [directives, setDirectives] = useState<ScreenDirectives | null>(null);
  const [offline, setOffline] = useState(false);
  const [overlay, setOverlay] = useState(!KIOSK);
  const [pair, setPair] = useState<PairState>({ phase: 'idle' });
  const [controls, setControls] = useState(false);
  const [autoQuality, setAutoQuality] = useState<RenderQuality>(detectQuality);
  const scale = useStageScale();
  const runner = useRef<RunnerHandle | null>(null);
  const offset = useRef(0);
  const report = useRef<RunnerReport>({ sceneId: null, nextSceneId: null, sceneStartedAt: null, playlistId: null });
  const errors = useRef(0);
  const fps = useRef<FpsMeter | null>(null);
  const applied = useRef({ version: 0, seq: 0 });

  const now = useCallback(() => new Date(Date.now() + offset.current), []);

  /* ---------- carga de datos ---------- */
  const saveCache = useCallback((patch: Partial<CachedState>) => {
    const base = readCache();
    const next = { config: defaultSignage(), configRevision: -1, configMedia: {}, payload: null, ...base, ...patch, savedAt: new Date().toISOString() };
    lsSet(LS.cache, JSON.stringify(next));
  }, []);

  const loadConfig = useCallback(
    async (rev?: number) => {
      try {
        const r = await getJson<{ config: SignageConfig; revision: number; media: Record<string, MediaAsset> }>(`/api/screen/config${rev !== undefined ? `?r=${rev}` : ''}`);
        if (r.status !== 200 || !r.body) throw new Error(String(r.status));
        const cfg = publicSignage(r.body.config);
        setConfig(cfg);
        setConfigRev(r.body.revision);
        setConfigMedia(r.body.media ?? {});
        saveCache({ config: cfg, configRevision: r.body.revision, configMedia: r.body.media ?? {} });
        setOffline(false);
      } catch {
        setOffline(true);
      }
    },
    [saveCache],
  );

  const loadContent = useCallback(async () => {
    try {
      const r = await getJson<PublicPayload>('/api/content');
      if (r.status !== 200 || !r.body) throw new Error(String(r.status));
      setPayload(r.body);
      saveCache({ payload: r.body });
      setOffline(false);
      // Si el reloj del portátil está muy desfasado y no hay latido, se corrige con la hora del servidor.
      if (r.date && !lsGet(LS.token)) {
        const diff = Date.parse(r.date) - Date.now();
        if (Math.abs(diff) > 120_000) offset.current = diff;
      }
    } catch {
      setOffline(true);
    }
  }, [saveCache]);

  useEffect(() => {
    void loadConfig();
    void loadContent();
    const c = window.setInterval(() => void loadContent(), 5 * 60_000);
    return () => clearInterval(c);
  }, [loadConfig, loadContent]);

  // Sin vincular: la configuración se revisa cada minuto (respuesta cacheada en la CDN).
  useEffect(() => {
    if (token) return;
    const id = window.setInterval(() => void loadConfig(), 60_000);
    return () => clearInterval(id);
  }, [token, loadConfig]);

  /* ---------- televisión vinculada: órdenes y latido ---------- */
  const unpair = useCallback(() => {
    lsSet(LS.token, null);
    lsSet(LS.cmdSeq, null);
    setToken(null);
    setDirectives(null);
  }, []);

  const heartbeat = useCallback(async () => {
    const tk = lsGet(LS.token);
    if (!tk) return;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const body = {
      appliedVersion: applied.current.version,
      appliedCommandSeq: applied.current.seq,
      playlistId: report.current.playlistId,
      sceneId: report.current.sceneId,
      nextSceneId: report.current.nextSceneId,
      sceneStartedAt: report.current.sceneStartedAt,
      resolution: screenResolution(),
      quality: qualityRef.current,
      fps: fps.current?.value ?? null,
      uptimeMin: Math.round((Date.now() - STARTED_AT) / 60000),
      memoryMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      errors: errors.current,
      userAgent: navigator.userAgent.slice(0, 300),
    };
    try {
      const r = await getJson<{ serverTime: string }>('/api/screen/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify(body),
      });
      if (r.status === 401) return unpair();
      if (r.body?.serverTime) offset.current = Date.parse(r.body.serverTime) - Date.now();
    } catch {
      setOffline(true);
    }
  }, [unpair]);

  const contentStamp = useRef<string | null | undefined>(undefined);
  const configRevRef = useRef(configRev);
  useEffect(() => {
    configRevRef.current = configRev;
  });

  const poll = useCallback(async () => {
    const tk = lsGet(LS.token);
    if (!tk) return;
    try {
      const hash = await sha256Hex(tk);
      const r = await getJson<{ directives: ScreenDirectives; configRevision: number; contentPublishedAt: string | null }>(`/api/screen/d/${hash}`);
      if (r.status === 401) return unpair();
      if (r.status !== 200 || !r.body) throw new Error(String(r.status));
      setOffline(false);
      const { directives: d, configRevision, contentPublishedAt } = r.body;
      if (configRevision !== configRevRef.current) await loadConfig(configRevision);
      if (contentStamp.current !== undefined && contentStamp.current !== contentPublishedAt) void loadContent();
      contentStamp.current = contentPublishedAt;
      setDirectives((prev) => (prev && prev.version === d.version && prev.command.seq === d.command.seq ? prev : d));
    } catch {
      setOffline(true);
    }
  }, [loadConfig, loadContent, unpair]);

  useEffect(() => {
    if (!token) return;
    void poll();
    void heartbeat();
    const p = window.setInterval(() => void poll(), config.settings.pollSeconds * 1000);
    const h = window.setInterval(() => void heartbeat(), config.settings.heartbeatSeconds * 1000);
    return () => {
      clearInterval(p);
      clearInterval(h);
    };
  }, [token, poll, heartbeat, config.settings.pollSeconds, config.settings.heartbeatSeconds]);

  // Aplicar órdenes nuevas y confirmarlas.
  useEffect(() => {
    if (!directives) return;
    const handled = Number(lsGet(LS.cmdSeq) ?? '-1');
    const seq = directives.command.seq;
    let reload = false;
    if (handled < 0) lsSet(LS.cmdSeq, String(seq)); // primera vez: no se repiten órdenes antiguas
    else if (seq > handled) {
      lsSet(LS.cmdSeq, String(seq));
      if (directives.command.action === 'next') runner.current?.next();
      if (directives.command.action === 'reload') reload = true;
    }
    applied.current = { version: directives.version, seq };
    // Pequeño margen para que el reproductor informe ya de la escena nueva.
    const t = window.setTimeout(() => {
      void heartbeat().then(() => {
        if (reload) location.reload();
      });
    }, 1800);
    return () => clearTimeout(t);
  }, [directives, heartbeat]);

  /* ---------- vinculación ---------- */
  const startPairing = useCallback(async () => {
    setPair({ phase: 'starting' });
    try {
      const r = await getJson<{ code: string; secret: string; expiresAt: string }>('/api/screen/pair/start', { method: 'POST' });
      if (r.status !== 201 || !r.body) throw new Error(r.status === 429 ? 'Demasiados intentos. Espera un minuto.' : 'No se pudo obtener un código.');
      setPair({ phase: 'code', ...r.body });
    } catch (e) {
      setPair({ phase: 'error', message: e instanceof Error && e.message ? e.message : 'Sin conexión.' });
    }
  }, []);

  useEffect(() => {
    if (pair.phase !== 'code') return;
    let renewals = 0;
    const id = window.setInterval(async () => {
      try {
        const r = await getJson<{ status: string; token?: string; screenId?: string }>('/api/screen/pair/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: pair.code, secret: pair.secret }),
        });
        if (r.body?.status === 'paired' && r.body.token) {
          lsSet(LS.token, r.body.token);
          lsSet(LS.cmdSeq, null);
          setToken(r.body.token);
          setPair({ phase: 'done', name: '' });
          window.setTimeout(() => setOverlay(false), 2500);
        } else if (r.body?.status === 'expired' && renewals++ < 5) {
          void startPairing();
        }
      } catch {
        /* se reintenta */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [pair, startPairing]);

  useEffect(() => {
    if (params.get('vincular') === '1' && !lsGet(LS.token)) {
      setOverlay(true);
      void startPairing();
    }
  }, [startPairing]);

  /* ---------- dispositivo ---------- */
  useEffect(() => {
    const m = new FpsMeter();
    m.start();
    fps.current = m;
    const release = keepAwake();
    const onErr = () => (errors.current += 1);
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);
    // Si en automático el equipo no llega a ~35 FPS, se baja la calidad un escalón.
    const degrade = window.setInterval(() => {
      const v = m.value;
      if (v !== null && v < 35 && !document.hidden) setAutoQuality((q) => (q === 'high' ? 'balanced' : 'low'));
    }, 20_000);
    return () => {
      m.stop();
      release();
      clearInterval(degrade);
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onErr);
    };
  }, []);

  // Recarga preventiva tras muchas horas (solo si el servidor responde, para no quedarse sin página).
  useEffect(() => {
    const hours = config.settings.reloadHours;
    if (!hours) return;
    const id = window.setInterval(async () => {
      if (Date.now() - STARTED_AT < hours * 3600_000) return;
      try {
        const r = await fetch('/pantalla', { method: 'HEAD', cache: 'no-store' });
        if (r.ok) location.reload();
      } catch {
        /* sin conexión: se sigue reproduciendo */
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [config.settings.reloadHours]);

  // Cursor y controles discretos.
  const hideTimer = useRef(0);
  useEffect(() => {
    const show = () => {
      setControls(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setControls(false), config.settings.cursorHideSeconds * 1000);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') void toggleFullscreen();
      show();
    };
    window.addEventListener('mousemove', show);
    window.addEventListener('pointerdown', show);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', show);
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', onKey);
      clearTimeout(hideTimer.current);
    };
  }, [config.settings.cursorHideSeconds]);

  // La pantalla de inicio se retira sola: la reproducción no espera a nadie.
  useEffect(() => {
    if (!overlay || pair.phase !== 'idle') return;
    const id = window.setTimeout(() => setOverlay(false), 15_000);
    return () => clearTimeout(id);
  }, [overlay, pair.phase]);

  /* ---------- reproducción ---------- */
  const quality = resolveQuality(directives?.quality ?? config.settings.quality, autoQuality);
  const qualityRef = useRef(quality);
  useEffect(() => {
    qualityRef.current = quality;
  });
  const data = useMemo(
    () => (payload ? { content: payload.content, media: { ...payload.media, ...configMedia }, events: config.events } : null),
    [payload, configMedia, config.events],
  );
  const resolve = useCallback(
    (at: Date) =>
      FORCED_SCENE && config.scenes.some((s) => s.id === FORCED_SCENE)
        ? { source: 'override' as const, playlistId: null, sceneId: FORCED_SCENE, party: null, scheduleId: null }
        : resolveProgram(config, directives, at),
    [config, directives],
  );
  const dataKey = `${configRev}|${payload?.publishedAt ?? ''}|${payload ? 1 : 0}|${directives?.version ?? 0}`;
  const paused = !!directives?.paused;

  const start = async () => {
    await enterFullscreen();
    setOverlay(false);
  };

  return (
    <div className={`frame ${controls ? '' : 'cursor-hidden'} ${paused ? 'is-paused' : ''}`} data-quality={quality} data-paired={token ? 'yes' : 'no'}>
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {data ? (
          <Runner
            config={config}
            resolve={resolve}
            data={data}
            paused={paused}
            quality={quality}
            now={now}
            dataKey={dataKey}
            handleRef={runner}
            onReport={(r) => (report.current = r)}
            onSceneError={() => (errors.current += 1)}
          />
        ) : (
          <div className="boot">
            <span className="boot__mark">GastroBar Torero</span>
          </div>
        )}
      </div>

      {overlay && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Reproductor de pantallas">
          <div className="overlay__card">
            <p className="overlay__eyebrow">GastroBar Torero · Modo pantalla</p>
            {pair.phase === 'idle' && (
              <>
                <h1>Reproductor listo</h1>
                <p className="overlay__text">
                  {token ? 'Esta televisión está vinculada y se controla desde el panel.' : 'Reproduciendo la programación general. Vincula esta televisión para controlarla desde el móvil.'}
                </p>
                <div className="overlay__actions">
                  <button className="btn btn--gold" onClick={() => void start()} autoFocus>
                    Iniciar reproductor
                  </button>
                  {!token && (
                    <button className="btn btn--ghost" onClick={() => void startPairing()}>
                      Vincular esta pantalla
                    </button>
                  )}
                </div>
                <p className="overlay__hint">Pulsa F para pantalla completa. Este aviso se cierra solo.</p>
              </>
            )}
            {pair.phase === 'starting' && <h1>Pidiendo código…</h1>}
            {pair.phase === 'code' && (
              <>
                <h1>Código de vinculación</h1>
                <p className="overlay__code" data-testid="pair-code">
                  {pair.code.slice(0, 3)}
                  <span>·</span>
                  {pair.code.slice(3)}
                </p>
                <p className="overlay__text">
                  En el móvil o el ordenador abre <strong>/admin/pantallas</strong> → <strong>Televisiones</strong> → <strong>Vincular televisión</strong> y escribe este código.
                </p>
                <p className="overlay__hint">Caduca a las {new Date(pair.expiresAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. Se renueva solo.</p>
                <div className="overlay__actions">
                  <button className="btn btn--ghost" onClick={() => setPair({ phase: 'idle' })}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
            {pair.phase === 'done' && <h1>Televisión vinculada ✓</h1>}
            {pair.phase === 'error' && (
              <>
                <h1>No se pudo vincular</h1>
                <p className="overlay__text">{pair.message}</p>
                <div className="overlay__actions">
                  <button className="btn btn--gold" onClick={() => void startPairing()}>
                    Reintentar
                  </button>
                  <button className="btn btn--ghost" onClick={() => setPair({ phase: 'idle' })}>
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={`controls ${controls && !overlay ? 'is-on' : ''}`}>
        <button onClick={() => void toggleFullscreen()} aria-label="Pantalla completa">
          ⛶ <span>Pantalla completa</span>
        </button>
        <button
          onClick={() => {
            setPair({ phase: 'idle' });
            setOverlay(true);
          }}
        >
          {token ? 'Estado' : 'Vincular'}
        </button>
        {offline && <span className="controls__offline">Sin conexión · reproduciendo lo guardado</span>}
      </div>
    </div>
  );
}
