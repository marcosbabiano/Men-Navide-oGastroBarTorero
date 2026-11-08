/** Vista previa 16:9 de una escena (la misma que reproduce la televisión), escalada al contenedor. */
import { useEffect, useRef, useState } from 'react';
import type { Scene } from '../../shared/signage.ts';
import { sceneSteps, type SceneData } from './engine.ts';
import { SceneBoundary, SceneView } from './scenes.tsx';
import type { RenderQuality } from './common.tsx';
import './screen.css';

export function ScenePreview({
  scene,
  data,
  quality = 'low',
  running = true,
  replayKey = 0,
  label,
}: {
  scene: Scene;
  data: SceneData;
  quality?: RenderQuality;
  running?: boolean;
  replayKey?: number;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const steps = Math.max(1, sceneSteps(scene, data, new Date()));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1920));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!running || steps <= 1) return;
    const ms = Math.min(scene.duration, 8) * 1000;
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps), ms);
    return () => clearInterval(id);
  }, [running, steps, scene.duration]);

  const empty = sceneSteps(scene, data, new Date()) === 0;
  return (
    <div className="spreview" ref={box} role="img" aria-label={label ?? `Vista previa: ${scene.name}`}>
      <div className="spreview__stage" style={{ transform: `scale(${scale})` }}>
        <div className="slayer is-live t-fade" key={`${scene.id}-${replayKey}`}>
          {!failed && (
            <SceneBoundary onError={() => setFailed(true)}>
              <SceneView scene={scene} data={data} step={step % steps} live paused={!running} quality={quality} at={new Date()} />
            </SceneBoundary>
          )}
        </div>
      </div>
      {(empty || failed) && (
        <p className="spreview__note">{failed ? 'No se puede previsualizar esta escena.' : 'Sin contenido ahora mismo: la televisión saltará esta escena.'}</p>
      )}
    </div>
  );
}
