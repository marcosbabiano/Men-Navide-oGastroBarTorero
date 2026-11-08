/** Escenas y eventos: listados y editores visuales con vista previa 16:9 en vivo. */
import { useState } from 'react';
import type { Draft } from 'immer';
import { newId } from '../../../shared/ids.ts';
import {
  EVENT_STYLE_LABEL,
  EVENT_STYLES,
  LOGO_MOODS,
  MESSAGE_STYLES,
  PARTY_PRESET_IDS,
  PARTY_PRESETS,
  type PartyConfig,
  type PartyPresetId,
  type Scene,
  SCENE_TYPE_LABEL,
  SCENE_TYPES,
  type SceneType,
  type SignageEvent,
  eventPromoted,
} from '../../../shared/signage.ts';
import { Badge, Card, PageHeader, Select, TextArea, TextField, Toggle, useConfirm } from '../ui.tsx';
import { ImagePicker } from '../media.tsx';
import { navigate } from '../router.ts';
import { ScenePreview } from '../../screen/Preview.tsx';
import { useSignage } from './state.tsx';
import { ColorField, fmtDuration, NumberField, Range, TransitionSelect } from './helpers.tsx';

const TYPE_HINT: Record<SceneType, string> = {
  menus: 'Los menús de Navidad publicados, paso a paso y legibles a distancia.',
  event: 'Un evento con imagen del artista, fecha y hora.',
  events: 'Agenda con los próximos eventos publicados.',
  photos: 'Fotografías de la biblioteca con movimiento suave.',
  logo: 'El logotipo protagonista con luz ambiental.',
  party: 'Focos y haces de luz en tiempo real para la noche.',
  message: 'Un mensaje con animación tipográfica.',
  booking: 'Invitación a reservar con código QR.',
};

const MOOD_LABEL = { warm: 'Cálido', christmas: 'Navidad', night: 'Noche' } as const;
const STYLE_LABEL = { elegant: 'Elegante', christmas: 'Navideño', night: 'Nocturno', minimal: 'Claro minimalista' } as const;

export function newScene(type: SceneType, cfg: { events: SignageEvent[] }): Scene {
  const base = { id: newId(`escena-${type}`), name: SCENE_TYPE_LABEL[type], status: 'draft' as const, duration: 12, transition: 'auto' as const, updatedAt: new Date().toISOString() };
  switch (type) {
    case 'menus':
      return { ...base, type, duration: 10, menuIds: [], showQr: true };
    case 'event':
      return { ...base, type, duration: 14, eventId: cfg.events[0]?.id ?? '' };
    case 'events':
      return { ...base, type, duration: 14, max: 3 };
    case 'photos':
      return { ...base, type, duration: 8, images: [], effect: 'kenburns', caption: '' };
    case 'logo':
      return { ...base, type, duration: 20, mood: 'warm', tagline: '', particles: true };
    case 'party':
      return { ...base, type, duration: 60, party: structuredClone(PARTY_PRESETS['gold-night'].config) };
    case 'message':
      return { ...base, type, text: 'Tu mensaje', subtext: '', style: 'elegant', showLogo: true, background: null, accent: '#c9a96e', animation: 'reveal' };
    case 'booking':
      return { ...base, type, duration: 14, title: 'Reserva tu mesa', subtext: 'Escanea el código con el móvil', showQr: true };
  }
}

/* ====================== Listado de escenas ====================== */
export function ScenesList() {
  const { config, update, data } = useSignage();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const usedIn = (id: string) => config.playlists.filter((p) => p.items.some((i) => i.sceneId === id));

  const create = (type: SceneType) => {
    const s = newScene(type, config);
    update((d) => void d.scenes.push(s as Draft<Scene>));
    navigate(`#/pantallas/escenas/${s.id}`);
  };
  const duplicate = (s: Scene) => {
    const copy = { ...structuredClone(s), id: newId(`escena-${s.type}`), name: `${s.name} (copia)`.slice(0, 80), status: 'draft' as const, updatedAt: new Date().toISOString() };
    update((d) => void d.scenes.splice(d.scenes.findIndex((x) => x.id === s.id) + 1, 0, copy as Draft<Scene>));
  };
  const remove = async (s: Scene) => {
    const lists = usedIn(s.id);
    const ok = await confirm({
      title: `¿Eliminar «${s.name}»?`,
      text: lists.length ? `Se quitará también de: ${lists.map((l) => l.name).join(', ')}.` : 'No está en ninguna programación.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    update((d) => {
      d.scenes = d.scenes.filter((x) => x.id !== s.id);
      for (const p of d.playlists) p.items = p.items.filter((i) => i.sceneId !== s.id);
    });
  };

  return (
    <>
      <PageHeader
        title="Escenas"
        intro="Cada escena es una «diapositiva» animada. Combínalas en programaciones."
        actions={
          <button type="button" className="abtn abtn--primary" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            + Nueva escena
          </button>
        }
      />
      <div className="stabs stabs--sub">
        <a className="stabs__link is-active" href="#/pantallas/escenas" aria-current="page">
          Escenas
        </a>
        <a className="stabs__link" href="#/pantallas/eventos">
          Eventos
        </a>
      </div>
      {creating && (
        <Card title="Elige el tipo de escena">
          <div className="stypes">
            {SCENE_TYPES.map((t) => (
              <button key={t} type="button" className="stype" onClick={() => create(t)}>
                <strong>{SCENE_TYPE_LABEL[t]}</strong>
                <span>{TYPE_HINT[t]}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
      <div className="sscenes">
        {config.scenes.map((s) => (
          <article className="sscene" key={s.id} data-scene={s.id}>
            <a href={`#/pantallas/escenas/${s.id}`} className="sscene__preview" aria-label={`Editar ${s.name}`}>
              <ScenePreview scene={s} data={data} running={false} quality="low" />
            </a>
            <div className="sscene__body">
              <h2>{s.name}</h2>
              <p className="muted">
                {SCENE_TYPE_LABEL[s.type]} · {fmtDuration(s.duration)}
                {s.type === 'menus' || s.type === 'photos' ? ' por paso' : ''}
              </p>
              <p>
                <Badge tone={s.status === 'published' ? 'ok' : 'draft'}>{s.status === 'published' ? 'Publicada' : 'Borrador'}</Badge>{' '}
                {usedIn(s.id).length > 0 && <Badge tone="info">En {usedIn(s.id).length} programación(es)</Badge>}
              </p>
              <div className="sscene__actions">
                <a className="abtn abtn--ghost abtn--small" href={`#/pantallas/escenas/${s.id}`}>
                  Editar
                </a>
                <button type="button" className="abtn abtn--text abtn--small" onClick={() => duplicate(s)}>
                  Duplicar
                </button>
                <button type="button" className="abtn abtn--text abtn--small danger" onClick={() => void remove(s)}>
                  Eliminar
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

/* ====================== Editor de escena ====================== */
export function SceneEditor({ id }: { id: string }) {
  const { config, update, data, command, screens } = useSignage();
  const { content } = data;
  const [replay, setReplay] = useState(0);
  const scene = config.scenes.find((s) => s.id === id);
  if (!scene) {
    return (
      <Card title="Escena no encontrada">
        <a href="#/pantallas/escenas">Volver a las escenas</a>
      </Card>
    );
  }
  const set = (fn: (s: Draft<Scene>) => void) =>
    update((d) => {
      const s = d.scenes.find((x) => x.id === id);
      if (s) {
        fn(s);
        s.updatedAt = new Date().toISOString();
      }
    });
  const published = content.menus.filter((m) => m.status === 'published');

  return (
    <>
      <PageHeader
        title={scene.name || 'Escena'}
        intro={
          <>
            <a href="#/pantallas/escenas">← Escenas</a> · {SCENE_TYPE_LABEL[scene.type]}
          </>
        }
        actions={
          <>
            <Badge tone={scene.status === 'published' ? 'ok' : 'draft'}>{scene.status === 'published' ? 'Publicada' : 'Borrador'}</Badge>
            {scene.status === 'published' && screens.length > 0 && (
              <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void command({ screenIds: 'all', action: scene.type === 'party' ? 'party' : 'scene', ref: scene.id }, 'Escena enviada a todas las TV')}>
                Mostrar ahora en todas las TV
              </button>
            )}
          </>
        }
      />
      <div className="seditor">
        <div className="seditor__form">
          <Card title="General">
            <TextField label="Nombre (solo en el panel)" value={scene.name} max={80} onChange={(v) => set((s) => void (s.name = v))} />
            <Toggle
              label="Publicada"
              checked={scene.status === 'published'}
              onChange={(v) => set((s) => void (s.status = v ? 'published' : 'draft'))}
              hint="Las escenas en borrador nunca llegan a las televisiones."
            />
            <div className="grid-2">
              <NumberField
                label={scene.type === 'menus' || scene.type === 'photos' ? 'Duración de cada paso' : 'Duración'}
                value={scene.duration}
                min={4}
                max={600}
                suffix="s"
                onChange={(v) => set((s) => void (s.duration = v))}
              />
              <TransitionSelect label="Transición de entrada" value={scene.transition} onChange={(v) => set((s) => void (s.transition = v ?? 'auto'))} />
            </div>
          </Card>

          {scene.type === 'menus' && (
            <Card title="Menús" description="Solo se muestran menús publicados en la web. Precios y platos salen del gestor de menús: no hay que copiarlos.">
              <Toggle label="Todos los menús publicados" checked={scene.menuIds.length === 0} onChange={(v) => set((s) => void (s.type === 'menus' && (s.menuIds = v ? [] : published.map((m) => m.id))))} />
              {scene.menuIds.length > 0 && (
                <div className="chips">
                  {published.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`chip ${scene.menuIds.includes(m.id) ? 'is-on' : ''}`}
                      aria-pressed={scene.menuIds.includes(m.id)}
                      onClick={() =>
                        set((s) => {
                          if (s.type !== 'menus') return;
                          s.menuIds = s.menuIds.includes(m.id) ? s.menuIds.filter((x) => x !== m.id) : [...s.menuIds, m.id];
                          if (!s.menuIds.length) s.menuIds = [];
                        })
                      }
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              {content.menus.some((m) => m.status !== 'published') && (
                <p className="field__hint">Menús no publicados (no aparecen): {content.menus.filter((m) => m.status !== 'published').map((m) => m.name).join(', ')}.</p>
              )}
              <Toggle label="Mostrar código QR de reservas en la portada de cada menú" checked={scene.showQr} onChange={(v) => set((s) => void (s.type === 'menus' && (s.showQr = v)))} />
            </Card>
          )}

          {scene.type === 'event' && (
            <Card title="Evento">
              <Select
                label="Evento"
                value={scene.eventId}
                options={[{ value: '', label: '— Elige un evento —' }, ...config.events.map((e) => ({ value: e.id, label: `${e.name}${e.status !== 'published' ? ' (borrador)' : ''}` }))]}
                onChange={(v) => set((s) => void (s.type === 'event' && (s.eventId = v)))}
              />
              <p className="field__hint">
                Se muestra solo durante su periodo de promoción y si el evento está publicado. <a href="#/pantallas/eventos">Gestionar eventos</a>
              </p>
            </Card>
          )}

          {scene.type === 'events' && (
            <Card title="Agenda">
              <NumberField label="Máximo de eventos" value={scene.max} min={1} max={6} onChange={(v) => set((s) => void (s.type === 'events' && (s.max = v)))} hint="Si no hay eventos vigentes, la escena se salta." />
            </Card>
          )}

          {scene.type === 'photos' && (
            <Card title="Fotografías" description="Se eligen de la biblioteca de imágenes de siempre. El encuadre respeta el punto focal de cada imagen.">
              {scene.images.map((img, i) => (
                <div className="sphoto" key={`${img.asset}-${i}`}>
                  <ImagePicker
                    label={`Foto ${i + 1}`}
                    value={img}
                    folder="ambiente"
                    onChange={(v) => set((s) => void (s.type === 'photos' && v && (s.images[i] = v)))}
                  />
                  <button type="button" className="abtn abtn--text abtn--small danger" onClick={() => set((s) => void (s.type === 'photos' && s.images.splice(i, 1)))}>
                    Quitar foto
                  </button>
                </div>
              ))}
              <AddPhoto onAdd={(ref) => set((s) => void (s.type === 'photos' && s.images.push(ref)))} />
              <Select
                label="Movimiento"
                value={scene.effect}
                options={[
                  { value: 'kenburns', label: 'Ken Burns (acercamiento lento)' },
                  { value: 'pan', label: 'Paneo lateral' },
                  { value: 'mask', label: 'Revelado con máscara' },
                ]}
                onChange={(v) => set((s) => void (s.type === 'photos' && (s.effect = v)))}
              />
              <TextField label="Texto (opcional)" value={scene.caption} max={120} onChange={(v) => set((s) => void (s.type === 'photos' && (s.caption = v)))} />
            </Card>
          )}

          {scene.type === 'logo' && (
            <Card title="Logotipo" description="Usa el logotipo de Campaña (sin deformarlo). Si no hay, se muestra el nombre con la tipografía de la marca.">
              <Select label="Ambiente" value={scene.mood} options={LOGO_MOODS.map((m) => ({ value: m, label: MOOD_LABEL[m] }))} onChange={(v) => set((s) => void (s.type === 'logo' && (s.mood = v)))} />
              <TextField label="Frase (opcional)" value={scene.tagline} max={120} onChange={(v) => set((s) => void (s.type === 'logo' && (s.tagline = v)))} />
              <Toggle label="Luces desenfocadas (bokeh)" checked={scene.particles} onChange={(v) => set((s) => void (s.type === 'logo' && (s.particles = v)))} />
            </Card>
          )}

          {scene.type === 'party' && <PartyEditor party={scene.party} onChange={(p) => set((s) => void (s.type === 'party' && (s.party = p)))} />}

          {scene.type === 'message' && (
            <Card title="Mensaje">
              <TextField label="Texto principal" value={scene.text} max={160} onChange={(v) => set((s) => void (s.type === 'message' && (s.text = v)))} />
              <TextArea label="Texto secundario" value={scene.subtext} max={240} rows={2} onChange={(v) => set((s) => void (s.type === 'message' && (s.subtext = v)))} />
              <div className="grid-2">
                <Select label="Estilo" value={scene.style} options={MESSAGE_STYLES.map((m) => ({ value: m, label: STYLE_LABEL[m] }))} onChange={(v) => set((s) => void (s.type === 'message' && (s.style = v)))} />
                <Select
                  label="Animación del texto"
                  value={scene.animation}
                  options={[
                    { value: 'reveal', label: 'Revelado' },
                    { value: 'letters', label: 'Letra a letra' },
                    { value: 'fade', label: 'Fundido' },
                  ]}
                  onChange={(v) => set((s) => void (s.type === 'message' && (s.animation = v)))}
                />
              </div>
              <ColorField label="Color de acento" value={scene.accent} onChange={(v) => set((s) => void (s.type === 'message' && (s.accent = v)))} />
              <Toggle label="Mostrar logotipo" checked={scene.showLogo} onChange={(v) => set((s) => void (s.type === 'message' && (s.showLogo = v)))} />
              <ImagePicker label="Fondo (opcional)" value={scene.background} nullable onChange={(v) => set((s) => void (s.type === 'message' && (s.background = v)))} />
            </Card>
          )}

          {scene.type === 'booking' && (
            <Card title="Reservas" description={`El código QR enlaza a la plataforma de reservas configurada en Local (${content.booking.url}).`}>
              <TextField label="Titular" value={scene.title} max={120} onChange={(v) => set((s) => void (s.type === 'booking' && (s.title = v)))} />
              <TextArea label="Texto" value={scene.subtext} max={240} rows={2} onChange={(v) => set((s) => void (s.type === 'booking' && (s.subtext = v)))} />
              <Toggle label="Mostrar código QR" checked={scene.showQr} onChange={(v) => set((s) => void (s.type === 'booking' && (s.showQr = v)))} />
            </Card>
          )}
        </div>
        <aside className="seditor__preview">
          <div className="seditor__sticky">
            <ScenePreview scene={scene} data={data} quality={scene.type === 'party' || scene.type === 'logo' ? 'balanced' : 'low'} replayKey={replay} />
            <div className="seditor__previewbar">
              <span className="muted">Vista previa 16:9 · igual que en la televisión</span>
              <button type="button" className="abtn abtn--text abtn--small" onClick={() => setReplay((r) => r + 1)}>
                ↻ Repetir animación
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function AddPhoto({ onAdd }: { onAdd: (ref: { asset: string; alt: string }) => void }) {
  const [key, setKey] = useState(0);
  return (
    <ImagePicker
      key={key}
      label="Añadir fotografía"
      value={null}
      folder="ambiente"
      onChange={(v) => {
        if (v) onAdd(v);
        setKey((k) => k + 1);
      }}
    />
  );
}

/* ====================== Modo fiesta ====================== */
export function PartyEditor({ party, onChange }: { party: PartyConfig; onChange: (p: PartyConfig) => void }) {
  const set = <K extends keyof PartyConfig>(k: K, v: PartyConfig[K]) => onChange({ ...party, [k]: v });
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  return (
    <Card title="Modo fiesta" description="Luces en tiempo real (WebGL). Sin destellos ni parpadeos rápidos: los cambios de luz son lentos y suaves. No reproduce sonido.">
      <div className="spresets" role="group" aria-label="Estilos predefinidos">
        {PARTY_PRESET_IDS.map((p: PartyPresetId) => (
          <button
            key={p}
            type="button"
            className={`spreset ${party.preset === p ? 'is-on' : ''}`}
            aria-pressed={party.preset === p}
            onClick={() => onChange({ ...structuredClone(PARTY_PRESETS[p].config), text: party.text })}
            style={{ background: `linear-gradient(180deg, rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.62)), linear-gradient(135deg, ${PARTY_PRESETS[p].config.colors.join(', ')})` }}
          >
            <strong>{PARTY_PRESETS[p].label}</strong>
            <span>{PARTY_PRESETS[p].description}</span>
          </button>
        ))}
      </div>
      <div className="scolors">
        {party.colors.map((c, i) => (
          <span key={i} className="scolors__item">
            <ColorField label={`Color ${i + 1}`} value={c} onChange={(v) => set('colors', party.colors.map((x, k) => (k === i ? v : x)))} />
            {party.colors.length > 1 && (
              <button type="button" className="abtn abtn--text abtn--small" aria-label={`Quitar color ${i + 1}`} onClick={() => set('colors', party.colors.filter((_, k) => k !== i))}>
                ✕
              </button>
            )}
          </span>
        ))}
        {party.colors.length < 4 && (
          <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => set('colors', [...party.colors, '#ffffff'])}>
            + Color
          </button>
        )}
        <ColorField label="Fondo" value={party.background} onChange={(v) => set('background', v)} />
      </div>
      <div className="grid-2">
        <Range label="Velocidad" value={party.speed} min={0.2} max={2} onChange={(v) => set('speed', v)} format={(v) => `${v.toFixed(2)}×`} />
        <Range label="Intensidad" value={party.intensity} min={0.2} max={1.5} onChange={(v) => set('intensity', v)} format={pct} />
        <Range label="Número de focos" value={party.beams} min={2} max={12} step={1} onChange={(v) => set('beams', v)} />
        <Range label="Movimiento de los haces" value={party.motion} min={0} max={1} onChange={(v) => set('motion', v)} format={pct} />
        <Range label="Partículas" value={party.particles} min={0} max={1} onChange={(v) => set('particles', v)} format={pct} />
        <Range label="Niebla" value={party.haze} min={0} max={1} onChange={(v) => set('haze', v)} format={pct} />
        <Range label="Tamaño del logotipo" value={party.logoScale} min={0.3} max={1.6} onChange={(v) => set('logoScale', v)} format={pct} />
        <Range label="Posición vertical del logotipo" value={party.logoY} min={-0.3} max={0.3} step={0.01} onChange={(v) => set('logoY', v)} format={(v) => (v === 0 ? 'centrado' : v > 0 ? `${Math.round(v * 100)} % arriba` : `${Math.round(-v * 100)} % abajo`)} />
      </div>
      <TextField label="Texto opcional" value={party.text} max={80} onChange={(v) => set('text', v)} hint="Por ejemplo: «Nochevieja 2026». Vacío = solo el logotipo." />
      <p className="field__hint">La calidad gráfica (Alto, Equilibrado, Bajo consumo) se ajusta por televisión en Televisiones o en Configuración.</p>
    </Card>
  );
}

/* ====================== Eventos ====================== */
export function newEvent(order: number): SignageEvent {
  return { id: newId('evento'), name: 'Nuevo evento', description: '', date: '', time: '', artistImage: null, backgroundImage: null, highlight: '', status: 'draft', promoFrom: '', promoTo: '', order, style: 'gastro' };
}

export function EventsList() {
  const { config, update } = useSignage();
  const confirm = useConfirm();
  const create = () => {
    const e = newEvent(config.events.length);
    update((d) => void d.events.push(e));
    navigate(`#/pantallas/eventos/${e.id}`);
  };
  const remove = async (e: SignageEvent) => {
    const scenes = config.scenes.filter((s) => s.type === 'event' && s.eventId === e.id);
    if (!(await confirm({ title: `¿Eliminar «${e.name}»?`, text: scenes.length ? `Las escenas que lo muestran (${scenes.map((s) => s.name).join(', ')}) se saltarán.` : undefined, confirmLabel: 'Eliminar', danger: true }))) return;
    update((d) => void (d.events = d.events.filter((x) => x.id !== e.id)));
  };
  const addScene = (e: SignageEvent) => {
    const s = { ...newScene('event', config), name: `Evento · ${e.name}`.slice(0, 80), eventId: e.id };
    update((d) => void d.scenes.push(s as Draft<Scene>));
    navigate(`#/pantallas/escenas/${s.id}`);
  };
  const sorted = [...config.events].sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeader
        title="Eventos"
        intro="Conciertos, catas, fiestas… Se anuncian solos en las pantallas durante su periodo de promoción."
        actions={
          <button type="button" className="abtn abtn--primary" onClick={create}>
            + Nuevo evento
          </button>
        }
      />
      <div className="stabs stabs--sub">
        <a className="stabs__link" href="#/pantallas/escenas">
          Escenas
        </a>
        <a className="stabs__link is-active" href="#/pantallas/eventos" aria-current="page">
          Eventos
        </a>
      </div>
      {!sorted.length && <p className="muted">No hay eventos. La escena «Próximos eventos» se salta mientras no haya ninguno publicado.</p>}
      <div className="sevents">
        {sorted.map((e) => (
          <Card
            key={e.id}
            title={e.name}
            description={`${e.date || 'Sin fecha'}${e.time ? ` · ${e.time} h` : ''} · ${EVENT_STYLE_LABEL[e.style]}`}
            actions={
              <>
                <Badge tone={e.status === 'published' ? 'ok' : 'draft'}>{e.status === 'published' ? 'Publicado' : 'Borrador'}</Badge>
                {eventPromoted(e, new Date()) && <Badge tone="info">Anunciándose</Badge>}
              </>
            }
          >
            <div className="sscene__actions">
              <a className="abtn abtn--ghost abtn--small" href={`#/pantallas/eventos/${e.id}`}>
                Editar
              </a>
              <button type="button" className="abtn abtn--text abtn--small" onClick={() => addScene(e)}>
                Crear escena de este evento
              </button>
              <button type="button" className="abtn abtn--text abtn--small danger" onClick={() => void remove(e)}>
                Eliminar
              </button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export function EventEditor({ id }: { id: string }) {
  const { config, update, data } = useSignage();
  const ev = config.events.find((e) => e.id === id);
  if (!ev) {
    return (
      <Card title="Evento no encontrado">
        <a href="#/pantallas/eventos">Volver a los eventos</a>
      </Card>
    );
  }
  const set = (fn: (e: Draft<SignageEvent>) => void) =>
    update((d) => {
      const e = d.events.find((x) => x.id === id);
      if (e) fn(e);
    });
  const previewScene: Scene = { id: 'vista-evento', type: 'event', name: ev.name, status: 'published', duration: 14, transition: 'auto', updatedAt: '', eventId: ev.id };
  const previewData = { ...data, events: config.events.map((e) => (e.id === ev.id ? { ...e, status: 'published' as const, promoFrom: '', promoTo: '', date: e.date } : e)) };
  return (
    <>
      <PageHeader
        title={ev.name || 'Evento'}
        intro={
          <>
            <a href="#/pantallas/eventos">← Eventos</a>
          </>
        }
      />
      <div className="seditor">
        <div className="seditor__form">
          <Card title="Datos del evento">
            <TextField label="Nombre" value={ev.name} max={100} onChange={(v) => set((e) => void (e.name = v))} />
            <TextArea label="Descripción" value={ev.description} max={400} rows={3} onChange={(v) => set((e) => void (e.description = v))} />
            <div className="grid-2">
              <DateField label="Fecha" value={ev.date} onChange={(v) => set((e) => void (e.date = v))} />
              <TimeField label="Hora" value={ev.time} onChange={(v) => set((e) => void (e.time = v))} />
            </div>
            <TextField label="Texto destacado" value={ev.highlight} max={120} onChange={(v) => set((e) => void (e.highlight = v))} hint="Por ejemplo: «Entrada libre» o «Último fin de semana»." />
            <Select label="Estilo visual" value={ev.style} options={EVENT_STYLES.map((s) => ({ value: s, label: EVENT_STYLE_LABEL[s] }))} onChange={(v) => set((e) => void (e.style = v))} />
            <Toggle label="Publicado" checked={ev.status === 'published'} onChange={(v) => set((e) => void (e.status = v ? 'published' : 'draft'))} hint="Solo los eventos publicados aparecen en las pantallas." />
          </Card>
          <Card title="Imágenes" description="De la biblioteca de imágenes (puedes subir nuevas desde aquí).">
            <ImagePicker label="Imagen del artista" value={ev.artistImage} nullable onChange={(v) => set((e) => void (e.artistImage = v))} />
            <ImagePicker label="Imagen de fondo" value={ev.backgroundImage} nullable onChange={(v) => set((e) => void (e.backgroundImage = v))} />
          </Card>
          <Card title="Promoción" description="Durante estas fechas el evento se anuncia en las pantallas. Sin «hasta», se anuncia hasta el día del evento.">
            <div className="grid-2">
              <DateField label="Anunciar desde" value={ev.promoFrom} onChange={(v) => set((e) => void (e.promoFrom = v))} />
              <DateField label="Anunciar hasta" value={ev.promoTo} onChange={(v) => set((e) => void (e.promoTo = v))} />
            </div>
            <NumberField label="Orden" value={ev.order} min={0} max={999} onChange={(v) => set((e) => void (e.order = v))} hint="Con la misma fecha, menor número aparece antes." />
            <p className="field__hint">
              Programación asignada: los eventos aparecen en las programaciones que incluyan una escena «Evento» o «Próximos eventos» (por ejemplo «Programa Habitual» o «Programa Fiesta»).
            </p>
          </Card>
        </div>
        <aside className="seditor__preview">
          <div className="seditor__sticky">
            <ScenePreview scene={previewScene} data={previewData} quality="low" />
            <p className="muted">Vista previa con el estilo «{EVENT_STYLE_LABEL[ev.style]}».</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
export { DateField, TimeField };
