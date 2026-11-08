/**
 * Orquestador: reproduce la secuencia con dos capas (saliente y entrante), prepara la siguiente
 * escena unos segundos antes (montada oculta y con imágenes decodificadas) y aplica la transición.
 * Nunca deja la pantalla vacía: el fondo es negro y siempre hay una capa visible.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Resolution, type SignageConfig } from '../../shared/signage.ts';
import { buildTimeline, entryMs, nextIndex, programKey, type SceneData, sceneImages, type TimelineEntry } from './engine.ts';
import { SceneBoundary, SceneView } from './scenes.tsx';
import type { RenderQuality } from './common.tsx';

const PREPARE_MS = 4000;
const TRANSITION_MS = 1400;
const MAX_WAIT_MS = 5000;

/* ---------------- Precarga de imágenes ---------------- */
const decoded = new Set<string>();
export function preloadImages(urls: string[], timeout = MAX_WAIT_MS): Promise<void> {
  const pending = urls.filter((u) => !decoded.has(u));
  if (!pending.length) return Promise.resolve();
  const all = Promise.all(
    pending.map(
      (u) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.src = u;
          img
            .decode()
            .then(() => decoded.add(u))
            .catch(() => undefined)
            .finally(() => resolve());
        }),
    ),
  ).then(() => undefined);
  if (decoded.size > 400) decoded.clear();
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, timeout))]);
}

interface Layer {
  uid: number;
  entry: TimelineEntry;
  index: number;
  phase: 'prep' | 'live' | 'exit';
  ready: boolean;
  /** Paso congelado durante la salida. */
  frozen?: number;
}

export interface RunnerReport {
  sceneId: string | null;
  nextSceneId: string | null;
  sceneStartedAt: string | null;
  playlistId: string | null;
}

export interface RunnerHandle {
  next: () => void;
}

export function Runner({
  config,
  resolve,
  data,
  paused,
  quality,
  now,
  onReport,
  onSceneError,
  handleRef,
  dataKey,
}: {
  config: SignageConfig;
  resolve: (at: Date) => Resolution;
  data: SceneData;
  paused: boolean;
  quality: RenderQuality;
  now: () => Date;
  onReport?: (r: RunnerReport) => void;
  onSceneError?: (e: unknown) => void;
  handleRef?: React.MutableRefObject<RunnerHandle | null>;
  /** Cambia cuando cambian la configuración o el contenido publicado. */
  dataKey: string;
}) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [step, setStep] = useState(0);
  const st = useRef({
    uid: 0,
    program: '',
    dataKey: '',
    timeline: [] as TimelineEntry[],
    loop: true,
    index: 0,
    elapsed: 0,
    lastTick: 0,
    startedAt: '',
    prepIndex: -1,
    prepReady: false,
    prepSince: 0,
    switching: false,
    forceNext: false,
    step: 0,
  });
  const props = useRef({ config, resolve, data, paused, now, onReport, onSceneError, dataKey });
  useEffect(() => {
    props.current = { config, resolve, data, paused, now, onReport, onSceneError, dataKey };
  });

  const report = useCallback(() => {
    const s = st.current;
    const cur = s.timeline[s.index];
    const ni = nextIndex(s.index, s.timeline.length, s.loop);
    const res = props.current.resolve(props.current.now());
    props.current.onReport?.({
      sceneId: cur?.scene.id ?? null,
      nextSceneId: s.timeline[ni]?.scene.id ?? null,
      sceneStartedAt: s.startedAt,
      playlistId: res.playlistId,
    });
  }, []);

  /** Cambia a la escena «index» de la secuencia actual, con transición. */
  const goTo = useCallback(
    (index: number) => {
      const s = st.current;
      const entry = s.timeline[index];
      if (!entry) return;
      const frozen = s.step;
      s.index = index;
      s.step = 0;
      s.elapsed = 0;
      s.startedAt = props.current.now().toISOString();
      s.prepIndex = -1;
      s.prepReady = false;
      s.switching = true;
      setStep(0);
      setLayers((prev) => {
        const prepared = prev.find((l) => l.phase === 'prep' && l.entry.key === entry.key);
        const exiting = prev.filter((l) => l.phase === 'live').map((l) => ({ ...l, phase: 'exit' as const, frozen }));
        const incoming: Layer = prepared ? { ...prepared, phase: 'live' } : { uid: ++s.uid, entry, index, phase: 'live', ready: true };
        return [...exiting, incoming];
      });
      window.setTimeout(() => {
        st.current.switching = false;
        setLayers((prev) => prev.filter((l) => l.phase !== 'exit'));
      }, TRANSITION_MS + 100);
      report();
    },
    [report],
  );

  const prepare = useCallback((index: number) => {
    const s = st.current;
    const entry = s.timeline[index];
    if (!entry) return;
    s.prepIndex = index;
    s.prepReady = false;
    s.prepSince = performance.now();
    const uid = ++s.uid;
    setLayers((prev) => [...prev.filter((l) => l.phase !== 'prep'), { uid, entry, index, phase: 'prep', ready: false }]);
    const p = props.current;
    void preloadImages(sceneImages(entry.scene, p.data, p.now())).then(() => {
      if (st.current.prepIndex === index) st.current.prepReady = true;
    });
  }, []);

  useEffect(() => {
    if (handleRef) handleRef.current = { next: () => (st.current.forceNext = true) };
  }, [handleRef]);

  // Bucle de control (4 veces por segundo; las animaciones las hace el navegador/GPU).
  useEffect(() => {
    const tick = () => {
      const s = st.current;
      const p = props.current;
      const t = performance.now();
      const dt = s.lastTick ? Math.min(t - s.lastTick, 2000) : 0;
      s.lastTick = t;
      const at = p.now();
      const res = p.resolve(at);
      const key = programKey(res);

      if (key !== s.program || p.dataKey !== s.dataKey) {
        const timeline = buildTimeline(p.config, res, p.data, at);
        const playlist = res.playlistId ? p.config.playlists.find((x) => x.id === res.playlistId) : null;
        const programChanged = key !== s.program;
        const curKey = s.timeline[s.index]?.key;
        s.program = key;
        s.dataKey = p.dataKey;
        s.timeline = timeline;
        s.loop = playlist ? playlist.loop : true;
        const curScene = s.timeline[s.index]?.scene.id;
        let keep = programChanged ? -1 : timeline.findIndex((e) => e.key === curKey);
        if (keep < 0 && !programChanged) keep = timeline.findIndex((e) => e.scene.id === curScene);
        if (keep >= 0) {
          s.index = keep;
          // Actualiza la capa visible con los datos nuevos sin transición.
          setLayers((prev) => prev.filter((l) => l.phase !== 'prep').map((l) => (l.phase === 'live' ? { ...l, entry: timeline[keep] } : l)));
          s.prepIndex = -1;
        } else {
          goTo(0);
          return;
        }
      }

      if (!p.paused) s.elapsed += dt;
      const cur = s.timeline[s.index];
      if (!cur) return;
      const total = entryMs(cur);
      const stepNow = Math.min(cur.steps - 1, Math.floor(s.elapsed / cur.stepMs));
      s.step = stepNow;
      setStep((prev) => (prev === stepNow ? prev : stepNow));

      const ni = nextIndex(s.index, s.timeline.length, s.loop);
      const single = ni === s.index;
      if (single) {
        if (s.elapsed >= total) {
          // Escena única o fin sin bucle: se mantiene y sus pasos vuelven a empezar.
          s.elapsed = s.timeline.length > 1 ? total : 0;
          if (s.timeline.length === 1) setStep(0);
        }
        return;
      }
      if (s.forceNext) {
        s.forceNext = false;
        goTo(ni);
        return;
      }
      if (!s.switching && s.prepIndex !== ni && total - s.elapsed <= PREPARE_MS) prepare(ni);
      if (s.elapsed >= total && !s.switching) {
        const waited = performance.now() - s.prepSince;
        if (s.prepIndex === ni && (s.prepReady || waited > MAX_WAIT_MS)) goTo(ni);
        else if (s.prepIndex !== ni) prepare(ni);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [goTo, prepare]);

  // Si la escena visible falla, se pasa a la siguiente.
  const onError = useCallback(
    (uid: number, e: unknown) => {
      props.current.onSceneError?.(e);
      const s = st.current;
      setLayers((prev) => prev.filter((l) => l.uid !== uid));
      if (layersRef.current.find((l) => l.uid === uid)?.phase === 'live') s.forceNext = true;
    },
    [],
  );
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  });

  const at = now();
  return (
    <>
      {layers.map((l) => (
        <div key={l.uid} className={`slayer t-${l.entry.transition} is-${l.phase} ${l.phase !== 'prep' ? 'is-live' : ''}`} data-scene={l.entry.scene.id} data-type={l.entry.scene.type} aria-hidden={l.phase !== 'live'}>
          <SceneBoundary onError={(e) => onError(l.uid, e)}>
            <SceneView scene={l.entry.scene} data={data} step={l.phase === 'live' ? step : (l.frozen ?? 0)} live={l.phase !== 'prep'} paused={paused} quality={quality} at={at} />
          </SceneBoundary>
        </div>
      ))}
    </>
  );
}
