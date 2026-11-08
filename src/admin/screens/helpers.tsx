import { useId, type ReactNode } from 'react';
import type { Scene, SignageConfig } from '../../../shared/signage.ts';
import { SCENE_TYPE_LABEL, TRANSITION_LABEL, TRANSITIONS, type Transition } from '../../../shared/signage.ts';

export function Range({
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field srange">
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <output className="srange__value" htmlFor={id}>
          {format ? format(value) : value}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function NumberField({ label, value, min, max, onChange, suffix, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="input-affix">
        <input
          id={id}
          className="input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        {suffix && <span className="input-affix__suffix">{suffix}</span>}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field scolor">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <span className="scolor__row">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code>{value}</code>
      </span>
    </div>
  );
}

export function TransitionSelect({ label, value, onChange, allowInherit }: { label: string; value: Transition | null; onChange: (v: Transition | null) => void; allowInherit?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input input--select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? (e.target.value as Transition) : null)}>
        {allowInherit && <option value="">La de la escena</option>}
        {TRANSITIONS.map((t) => (
          <option key={t} value={t}>
            {TRANSITION_LABEL[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

export const sceneName = (cfg: SignageConfig, id: string | null | undefined) => (id ? (cfg.scenes.find((s) => s.id === id)?.name ?? (id === 'reserva-logo' ? 'Logotipo (reserva)' : id === 'fiesta-directa' ? 'Modo fiesta' : id)) : '—');
export const playlistName = (cfg: SignageConfig, id: string | null | undefined) => (id ? (cfg.playlists.find((p) => p.id === id)?.name ?? id) : '—');
export const typeLabel = (s: Scene) => SCENE_TYPE_LABEL[s.type];

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export function clock(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function totalSeconds(cfg: SignageConfig, playlistId: string): number {
  const p = cfg.playlists.find((x) => x.id === playlistId);
  if (!p) return 0;
  return p.items.filter((i) => !i.hidden).reduce((n, i) => n + (i.duration ?? cfg.scenes.find((s) => s.id === i.sceneId)?.duration ?? 0), 0);
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
