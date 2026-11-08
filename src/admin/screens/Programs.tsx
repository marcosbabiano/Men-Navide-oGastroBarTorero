/** Programaciones (listas de escenas) y horarios automáticos (Europe/Madrid, con horario de verano). */
import { useState } from 'react';
import { newId } from '../../../shared/ids.ts';
import { activeSchedule, nextScheduleChange, SCENE_TYPE_LABEL, type Playlist, type Schedule } from '../../../shared/signage.ts';
import { Badge, Card, PageHeader, SortableList, TextField, Toggle, useConfirm } from '../ui.tsx';
import { navigate } from '../router.ts';
import { ScenePreview } from '../../screen/Preview.tsx';
import { useSignage } from './state.tsx';
import { clock, DAY_LONG, DAY_SHORT, fmtDuration, NumberField, playlistName, totalSeconds, TransitionSelect } from './helpers.tsx';
import { DateField } from './Scenes.tsx';

/* ====================== Programaciones ====================== */
export function PlaylistsList() {
  const { config, update } = useSignage();
  const confirm = useConfirm();
  const create = () => {
    const p: Playlist = { id: newId('programa'), name: 'Nueva programación', loop: true, items: [] };
    update((d) => void d.playlists.push(p));
    navigate(`#/pantallas/programaciones/${p.id}`);
  };
  const duplicate = (p: Playlist) => {
    const copy: Playlist = { ...structuredClone(p), id: newId('programa'), name: `${p.name} (copia)`.slice(0, 80), items: p.items.map((i) => ({ ...i, id: newId('item') })) };
    update((d) => void d.playlists.push(copy));
  };
  const remove = async (p: Playlist) => {
    if (config.settings.defaultPlaylistId === p.id) {
      await confirm({ title: 'No se puede eliminar', text: 'Es la programación por defecto. Elige otra en Configuración antes de eliminarla.', confirmLabel: 'Entendido' });
      return;
    }
    const scheds = config.schedules.filter((s) => s.playlistId === p.id);
    if (!(await confirm({ title: `¿Eliminar «${p.name}»?`, text: scheds.length ? `También se eliminarán sus horarios: ${scheds.map((s) => s.name).join(', ')}.` : undefined, confirmLabel: 'Eliminar', danger: true }))) return;
    update((d) => {
      d.playlists = d.playlists.filter((x) => x.id !== p.id);
      d.schedules = d.schedules.filter((s) => s.playlistId !== p.id);
    });
  };
  return (
    <>
      <PageHeader
        title="Programaciones"
        intro="Una programación es una secuencia de escenas que se repite. Los horarios deciden cuál suena en cada momento."
        actions={
          <button type="button" className="abtn abtn--primary" onClick={create}>
            + Nueva programación
          </button>
        }
      />
      <div className="stabs stabs--sub">
        <a className="stabs__link is-active" href="#/pantallas/programaciones" aria-current="page">
          Programaciones
        </a>
        <a className="stabs__link" href="#/pantallas/horarios">
          Horarios
        </a>
      </div>
      <div className="sevents">
        {config.playlists.map((p) => (
          <Card
            key={p.id}
            title={p.name}
            description={`${p.items.filter((i) => !i.hidden).length} escenas · ${fmtDuration(totalSeconds(config, p.id))} por vuelta${p.loop ? ' · en bucle' : ''}`}
            actions={config.settings.defaultPlaylistId === p.id ? <Badge tone="info">Por defecto</Badge> : undefined}
          >
            <div className="sscene__actions">
              <a className="abtn abtn--ghost abtn--small" href={`#/pantallas/programaciones/${p.id}`}>
                Editar
              </a>
              <button type="button" className="abtn abtn--text abtn--small" onClick={() => duplicate(p)}>
                Duplicar
              </button>
              <button type="button" className="abtn abtn--text abtn--small danger" onClick={() => void remove(p)}>
                Eliminar
              </button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export function PlaylistEditor({ id }: { id: string }) {
  const { config, update, data } = useSignage();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const p = config.playlists.find((x) => x.id === id);
  if (!p) {
    return (
      <Card title="Programación no encontrada">
        <a href="#/pantallas/programaciones">Volver</a>
      </Card>
    );
  }
  const set = (fn: (d: Playlist) => void) =>
    update((d) => {
      const x = d.playlists.find((y) => y.id === id);
      if (x) fn(x as Playlist);
    });
  const sel = p.items.find((i) => i.id === selected) ?? p.items[0];
  const selScene = sel ? config.scenes.find((s) => s.id === sel.sceneId) : null;
  return (
    <>
      <PageHeader
        title={p.name || 'Programación'}
        intro={
          <>
            <a href="#/pantallas/programaciones">← Programaciones</a> · {fmtDuration(totalSeconds(config, p.id))} por vuelta
          </>
        }
      />
      <div className="seditor">
        <div className="seditor__form">
          <Card title="General">
            <TextField label="Nombre" value={p.name} max={80} onChange={(v) => set((x) => void (x.name = v))} />
            <Toggle label="Repetir en bucle" checked={p.loop} onChange={(v) => set((x) => void (x.loop = v))} hint="Si se desactiva, al terminar se queda en la última escena." />
          </Card>
          <Card title="Escenas" description="Arrastra para ordenar. La siguiente escena se prepara antes de mostrarse (sin pantallazos en blanco).">
            {p.items.length === 0 && <p className="muted">Añade escenas a esta programación.</p>}
            <SortableList
              label="Escenas de la programación"
              items={p.items}
              onReorder={(items) => set((x) => void (x.items = items))}
              renderItem={(item, i, handle) => {
                const sc = config.scenes.find((s) => s.id === item.sceneId);
                return (
                  <div className={`sitem ${item.hidden ? 'is-hidden' : ''} ${sel?.id === item.id ? 'is-selected' : ''}`}>
                    {handle}
                    <button type="button" className="sitem__name" onClick={() => setSelected(item.id)}>
                      <strong>{sc?.name ?? 'Escena eliminada'}</strong>
                      <span className="muted">
                        {sc ? SCENE_TYPE_LABEL[sc.type] : ''} {sc?.status === 'draft' && '· borrador (no se muestra)'}
                      </span>
                    </button>
                    <div className="sitem__opts">
                      <NumberField
                        label="Duración"
                        value={item.duration ?? sc?.duration ?? 10}
                        min={4}
                        max={600}
                        suffix="s"
                        onChange={(v) => set((x) => void (x.items[i].duration = v === sc?.duration ? null : v))}
                      />
                      <TransitionSelect label="Transición" value={item.transition} allowInherit onChange={(v) => set((x) => void (x.items[i].transition = v))} />
                      <Toggle label="Oculta" checked={item.hidden} onChange={(v) => set((x) => void (x.items[i].hidden = v))} />
                      <button type="button" className="abtn abtn--text abtn--small danger" onClick={() => set((x) => void x.items.splice(i, 1))}>
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              }}
            />
            <div className="sadd">
              <select className="input input--select" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Escena para añadir">
                <option value="">— Añadir escena —</option>
                {config.scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({SCENE_TYPE_LABEL[s.type]}){s.status === 'draft' ? ' · borrador' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="abtn abtn--ghost"
                disabled={!adding}
                onClick={() => {
                  set((x) => void x.items.push({ id: newId('item'), sceneId: adding, duration: null, transition: null, hidden: false }));
                  setAdding('');
                }}
              >
                Añadir
              </button>
            </div>
          </Card>
        </div>
        <aside className="seditor__preview">
          <div className="seditor__sticky">
            {selScene ? <ScenePreview scene={selScene} data={data} quality="low" /> : <p className="muted">Selecciona una escena para verla.</p>}
            {selScene && (
              <p className="muted">
                {selScene.name} · <a href={`#/pantallas/escenas/${selScene.id}`}>Editar escena</a>
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

/* ====================== Horarios ====================== */
export function SchedulesView() {
  const { config, update, screens, clockOffset, lastRefresh } = useSignage();
  const confirm = useConfirm();
  const now = new Date(lastRefresh + clockOffset);
  const active = activeSchedule(config, now, null);
  const next = nextScheduleChange(config, null, now);
  const set = (id: string, fn: (s: Schedule) => void) =>
    update((d) => {
      const s = d.schedules.find((x) => x.id === id);
      if (s) fn(s as Schedule);
    });
  const create = () =>
    update((d) =>
      void d.schedules.push({
        id: newId('horario'),
        name: 'Nuevo horario',
        enabled: true,
        playlistId: config.settings.defaultPlaylistId,
        days: [],
        start: '12:00',
        end: '16:00',
        dateFrom: '',
        dateTo: '',
        priority: 20,
        screenIds: [],
      }),
    );
  return (
    <>
      <PageHeader
        title="Horarios"
        intro="Hora de España peninsular (Europe/Madrid), con el cambio de horario de verano incluido. Si dos horarios coinciden, gana el de mayor prioridad."
        actions={
          <button type="button" className="abtn abtn--primary" onClick={create}>
            + Nuevo horario
          </button>
        }
      />
      <div className="stabs stabs--sub">
        <a className="stabs__link" href="#/pantallas/programaciones">
          Programaciones
        </a>
        <a className="stabs__link is-active" href="#/pantallas/horarios" aria-current="page">
          Horarios
        </a>
      </div>
      <div className="banner banner--info">
        Ahora ({clock(now)}): {active ? `«${active.name}» → ${playlistName(config, active.playlistId)}` : `ningún horario → ${playlistName(config, config.settings.defaultPlaylistId)} (por defecto)`}.
        {next ? ` Próximo cambio: ${clock(next.at)} → ${playlistName(config, next.playlistId)}.` : ''}
      </div>
      {config.schedules.map((s) => (
        <Card
          key={s.id}
          title={
            <span className="stvlist__title">
              {s.name} {active?.id === s.id && <Badge tone="ok">Activo ahora</Badge>} {!s.enabled && <Badge tone="draft">Desactivado</Badge>}
            </span>
          }
        >
          <div className="grid-3">
            <TextField label="Nombre" value={s.name} max={80} onChange={(v) => set(s.id, (x) => void (x.name = v))} />
            <label className="field">
              <span className="field__label">Programación</span>
              <select className="input input--select" value={s.playlistId} onChange={(e) => set(s.id, (x) => void (x.playlistId = e.target.value))}>
                {config.playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="Prioridad" value={s.priority} min={0} max={100} onChange={(v) => set(s.id, (x) => void (x.priority = v))} hint="Eventos y campañas: pon más prioridad." />
          </div>
          <div className="sdays" role="group" aria-label="Días de la semana">
            <span className="field__label">Días {s.days.length === 0 && <span className="muted">(todos)</span>}</span>
            <div className="chips">
              {DAY_SHORT.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip ${s.days.includes(i) ? 'is-on' : ''}`}
                  aria-pressed={s.days.includes(i)}
                  aria-label={DAY_LONG[i]}
                  onClick={() => set(s.id, (x) => void (x.days = x.days.includes(i) ? x.days.filter((y) => y !== i) : [...x.days, i].sort()))}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-3">
            <label className="field">
              <span className="field__label">Desde las</span>
              <input className="input" type="time" value={s.start} onChange={(e) => e.target.value && set(s.id, (x) => void (x.start = e.target.value))} />
            </label>
            <label className="field">
              <span className="field__label">Hasta las</span>
              <input className="input" type="time" value={s.end} onChange={(e) => e.target.value && set(s.id, (x) => void (x.end = e.target.value))} />
              {s.end <= s.start && <span className="field__hint">Cruza la medianoche (termina al día siguiente).</span>}
            </label>
            <Toggle label="Activado" checked={s.enabled} onChange={(v) => set(s.id, (x) => void (x.enabled = v))} />
          </div>
          <div className="grid-3">
            <DateField label="Solo desde la fecha (opcional)" value={s.dateFrom} onChange={(v) => set(s.id, (x) => void (x.dateFrom = v))} />
            <DateField label="Hasta la fecha (opcional)" value={s.dateTo} onChange={(v) => set(s.id, (x) => void (x.dateTo = v))} />
            <div className="field">
              <span className="field__label">Televisiones {s.screenIds.length === 0 && <span className="muted">(todas)</span>}</span>
              <div className="chips">
                {screens.map((tv) => (
                  <button
                    key={tv.id}
                    type="button"
                    className={`chip ${s.screenIds.includes(tv.id) ? 'is-on' : ''}`}
                    aria-pressed={s.screenIds.includes(tv.id)}
                    onClick={() => set(s.id, (x) => void (x.screenIds = x.screenIds.includes(tv.id) ? x.screenIds.filter((y) => y !== tv.id) : [...x.screenIds, tv.id]))}
                  >
                    {tv.name}
                  </button>
                ))}
                {!screens.length && <span className="muted">Sin televisiones vinculadas</span>}
              </div>
            </div>
          </div>
          <div className="card__foot">
            <button
              type="button"
              className="abtn abtn--text abtn--small danger"
              onClick={async () => {
                if (await confirm({ title: `¿Eliminar el horario «${s.name}»?`, confirmLabel: 'Eliminar', danger: true })) update((d) => void (d.schedules = d.schedules.filter((x) => x.id !== s.id)));
              }}
            >
              Eliminar horario
            </button>
          </div>
        </Card>
      ))}
    </>
  );
}
