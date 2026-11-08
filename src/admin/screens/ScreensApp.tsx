/**
 * Gestor de Pantallas (/admin/pantallas): panel de control, escenas, programaciones, televisiones
 * y configuración. Las órdenes de control remoto se envían al instante; los cambios de escenas y
 * programaciones se guardan con «Guardar cambios».
 */
import { useMemo, useState } from 'react';
import {
  activeSchedule,
  isOnline,
  nextScheduleChange,
  PARTY_PRESET_IDS,
  PARTY_PRESETS,
  type PartyPresetId,
  QUALITIES,
  QUALITY_LABEL,
  resolveProgram,
} from '../../../shared/signage.ts';
import { Badge, Card, PageHeader, useConfirm } from '../ui.tsx';
import type { CommandBody, ScreenView } from '../api.ts';
import { ScenePreview } from '../../screen/Preview.tsx';
import { SignageProvider, useSignage } from './state.tsx';
import { ago, clock, NumberField, playlistName, sceneName } from './helpers.tsx';
import { EventEditor, EventsList, SceneEditor, ScenesList } from './Scenes.tsx';
import { PlaylistEditor, PlaylistsList, SchedulesView } from './Programs.tsx';
import '../../screen/screen.css';

const TABS = [
  { key: 'panel', label: 'Panel de control' },
  { key: 'escenas', label: 'Escenas', also: ['eventos'] },
  { key: 'programaciones', label: 'Programaciones', also: ['horarios'] },
  { key: 'televisiones', label: 'Televisiones' },
  { key: 'configuracion', label: 'Configuración' },
];

export default function ScreensRoutes({ path }: { path: string[] }) {
  return (
    <SignageProvider>
      <ScreensShell path={path} />
    </SignageProvider>
  );
}

function ScreensShell({ path }: { path: string[] }) {
  const { dirty, saving, save, discard, conflict, reload, issues } = useSignage();
  const confirm = useConfirm();
  const tab = path[1] ?? 'panel';
  const id = path[2];
  let view;
  switch (tab) {
    case 'escenas':
      view = id ? <SceneEditor id={id} /> : <ScenesList />;
      break;
    case 'eventos':
      view = id ? <EventEditor id={id} /> : <EventsList />;
      break;
    case 'programaciones':
      view = id ? <PlaylistEditor id={id} /> : <PlaylistsList />;
      break;
    case 'horarios':
      view = <SchedulesView />;
      break;
    case 'televisiones':
      view = <TvsView />;
      break;
    case 'configuracion':
      view = <SettingsView />;
      break;
    default:
      view = <ControlPanel />;
  }
  return (
    <div className="screens">
      <nav className="stabs" aria-label="Gestor de Pantallas">
        {TABS.map((t) => {
          const on = t.key === tab || t.also?.includes(tab) || (t.key === 'panel' && !TABS.some((x) => x.key === tab || x.also?.includes(tab)));
          return (
            <a key={t.key} href={`#/pantallas/${t.key}`} className={`stabs__link ${on ? 'is-active' : ''}`} aria-current={on ? 'page' : undefined}>
              {t.label}
            </a>
          );
        })}
      </nav>
      {conflict && (
        <div className="banner banner--danger" role="alert">
          <span>Otra persona ha guardado cambios en las pantallas. Recarga para ver la última versión.</span>
          <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => void reload()}>
            Recargar
          </button>
        </div>
      )}
      {dirty && (
        <div className="ssavebar" role="region" aria-label="Cambios sin guardar">
          <span>
            <strong>Cambios sin guardar en pantallas.</strong> {issues.length ? <span className="ssavebar__err">{issues[0].message}</span> : 'Las televisiones no los verán hasta que guardes.'}
          </span>
          <span className="ssavebar__actions">
            <button
              type="button"
              className="abtn abtn--text abtn--small"
              onClick={async () => {
                if (await confirm({ title: '¿Descartar los cambios de pantallas?', confirmLabel: 'Descartar', danger: true })) discard();
              }}
            >
              Descartar
            </button>
            <button type="button" className="abtn abtn--primary abtn--small" disabled={saving} onClick={() => void save()}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </span>
        </div>
      )}
      {view}
    </div>
  );
}

/* ====================== Panel de control ====================== */
type Sync = { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' };
function syncState(s: ScreenView, heartbeat: number, now: number): { online: boolean; sync: Sync } {
  const online = isOnline(s.status, heartbeat, now);
  if (!s.status) return { online, sync: { label: 'Nunca se ha conectado', tone: 'neutral' } };
  if (s.status.appliedVersion >= s.version && s.status.appliedCommandSeq >= s.command.seq) return { online, sync: { label: 'Confirmado por la TV', tone: 'ok' } };
  return { online, sync: { label: online ? 'Pendiente de confirmación…' : 'Pendiente (TV sin conexión)', tone: 'warn' } };
}

function modeText(s: ScreenView, cfgNames: (id: string) => string, sceneNames: (id: string) => string, now: number): string {
  const ov = s.override;
  if (ov && (!ov.until || Date.parse(ov.until) > now)) {
    const until = ov.until ? ` hasta ${clock(ov.until)}` : ' (indefinido)';
    if (ov.kind === 'party') return `Manual · Modo fiesta${until}`;
    if (ov.kind === 'scene') return `Manual · Escena «${sceneNames(ov.ref)}»${until}`;
    return `Manual · «${cfgNames(ov.ref)}»${until}`;
  }
  if (s.playlistId) return `Fija · «${cfgNames(s.playlistId)}»`;
  return 'Automática (horarios)';
}

function ControlPanel() {
  const { config, screens, command, clockOffset, data, lastRefresh } = useSignage();
  const now = lastRefresh + clockOffset;
  const [selected, setSelected] = useState<string[] | 'all'>('all');
  const [minutes, setMinutes] = useState<number>(0);
  const [preset, setPreset] = useState<PartyPresetId>('gold-night');
  const [preview, setPreview] = useState<string | null>(null);
  const hb = config.settings.heartbeatSeconds;
  const online = screens.filter((s) => isOnline(s.status, hb, now)).length;
  const general = activeSchedule(config, new Date(now), null);
  const generalNext = nextScheduleChange(config, null, new Date(now));
  const navidad = config.playlists.find((p) => p.id === 'programa-navidad') ?? config.playlists.find((p) => /navidad/i.test(p.name));
  const ambiente = config.playlists.find((p) => p.id === 'programa-habitual') ?? config.playlists.find((p) => /habitual|ambiente/i.test(p.name));
  const targets = selected === 'all' ? 'all' : selected;
  const noTarget = !screens.length || (targets !== 'all' && !targets.length);
  const send = (body: Omit<CommandBody, 'screenIds'>, ok: string) => command({ screenIds: targets, minutes: minutes || null, ...body }, ok);
  const toggle = (id: string) => setSelected((cur) => (cur === 'all' ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const previewScreen = screens.find((s) => s.id === preview);
  const previewScene = previewScreen?.status?.sceneId ? config.scenes.find((s) => s.id === previewScreen.status?.sceneId) : null;

  return (
    <>
      <PageHeader
        title="Gestor de Pantallas"
        intro={
          <>
            Controla las televisiones del local desde aquí o desde el móvil. Reproductor: <a href="/pantalla" target="_blank" rel="noopener">/pantalla</a>
          </>
        }
      />
      <div className="sstats">
        <div className="sstat">
          <span className="sstat__n">{screens.length}</span>
          <span>televisiones vinculadas</span>
        </div>
        <div className="sstat">
          <span className="sstat__n">{online}</span>
          <span>conectadas ahora</span>
        </div>
        <div className="sstat sstat--wide">
          <span className="sstat__label">Programación general ahora</span>
          <strong>{general ? `${general.name} → ${playlistName(config, general.playlistId)}` : `Por defecto → ${playlistName(config, config.settings.defaultPlaylistId)}`}</strong>
          <span className="muted">{generalNext ? `Próximo cambio: ${clock(generalNext.at)} → ${playlistName(config, generalNext.playlistId)}` : 'Sin cambios programados en 7 días'}</span>
        </div>
      </div>

      <Card title="Acciones rápidas" description="Se aplican a las televisiones seleccionadas. Cada televisión confirma cuando la ha aplicado.">
        <div className="squick__targets">
          <span className="field__label">Televisiones</span>
          <div className="chips" role="group" aria-label="Televisiones destino">
            <button type="button" className={`chip ${selected === 'all' ? 'is-on' : ''}`} aria-pressed={selected === 'all'} onClick={() => setSelected('all')}>
              Todas
            </button>
            {screens.map((s) => (
              <button key={s.id} type="button" className={`chip ${selected !== 'all' && selected.includes(s.id) ? 'is-on' : ''}`} aria-pressed={selected !== 'all' && selected.includes(s.id)} onClick={() => toggle(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="squick__opts">
          <label className="field">
            <span className="field__label">Duración del cambio manual</span>
            <select className="input input--select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={0}>Hasta que lo cambie</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={120}>2 horas</option>
              <option value={240}>4 horas</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Estilo de fiesta</span>
            <select className="input input--select" value={preset} onChange={(e) => setPreset(e.target.value as PartyPresetId)}>
              {PARTY_PRESET_IDS.map((p) => (
                <option key={p} value={p}>
                  {PARTY_PRESETS[p].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!screens.length && <p className="muted">Aún no hay televisiones vinculadas. Ve a «Televisiones» para vincular la primera.</p>}
        <div className="squick__actions">
          <button type="button" className="sqbtn sqbtn--party" disabled={noTarget} onClick={() => void send({ action: 'party', party: PARTY_PRESETS[preset].config }, 'Modo fiesta activado')}>
            ✦ Activar Fiesta
          </button>
          <button type="button" className="sqbtn sqbtn--xmas" disabled={noTarget || !navidad} onClick={() => navidad && void send({ action: 'playlist', ref: navidad.id }, 'Programa Navidad activado')}>
            ❄ Activar Navidad
          </button>
          <button type="button" className="sqbtn" disabled={noTarget || !ambiente} onClick={() => ambiente && void send({ action: 'playlist', ref: ambiente.id }, 'Ambiente activado')}>
            ☾ Activar Ambiente
          </button>
          <button type="button" className="sqbtn sqbtn--auto" disabled={noTarget} onClick={() => void send({ action: 'auto' }, 'Vuelta a la programación automática')}>
            ⟲ Volver a automática
          </button>
          <button type="button" className="sqbtn" disabled={noTarget} onClick={() => void send({ action: 'pause' }, 'Pausa enviada')}>
            ❚❚ Pausar
          </button>
          <button type="button" className="sqbtn" disabled={noTarget} onClick={() => void send({ action: 'resume' }, 'Reanudación enviada')}>
            ▶ Reanudar
          </button>
          <button type="button" className="sqbtn" disabled={noTarget} onClick={() => void send({ action: 'next' }, 'Siguiente escena')}>
            ⏭ Siguiente escena
          </button>
          <button type="button" className="sqbtn" disabled={noTarget} onClick={() => void send({ action: 'reload' }, 'Reinicio del reproductor enviado')}>
            ↻ Reiniciar reproductor
          </button>
        </div>
      </Card>

      <div className="stvs">
        {screens.map((s) => {
          const { online: on, sync } = syncState(s, hb, now);
          const res = resolveProgram(config, s, new Date(now));
          const sched = res.source === 'schedule' ? config.schedules.find((x) => x.id === res.scheduleId) : null;
          const next = nextScheduleChange(config, s.id, new Date(now));
          return (
            <article className={`stv ${on ? 'is-on' : 'is-off'}`} key={s.id} data-screen={s.id}>
              <header className="stv__head">
                <h2>{s.name}</h2>
                <Badge tone={on ? 'ok' : 'danger'}>{on ? '● Conectada' : '○ Sin conexión'}</Badge>
                {s.paused && <Badge tone="warn">En pausa</Badge>}
              </header>
              <dl className="stv__facts">
                <div>
                  <dt>Última comunicación</dt>
                  <dd>{ago(s.status?.lastSeen, now)}</dd>
                </div>
                <div>
                  <dt>Modo</dt>
                  <dd>{modeText(s, (id) => playlistName(config, id), (id) => sceneName(config, id), now)}</dd>
                </div>
                <div>
                  <dt>Programación activa</dt>
                  <dd>{res.party ? 'Modo fiesta' : res.playlistId ? playlistName(config, res.playlistId) : sceneName(config, res.sceneId)}{sched ? ` · horario «${sched.name}»` : ''}</dd>
                </div>
                <div>
                  <dt>Escena actual</dt>
                  <dd>{s.status ? sceneName(config, s.status.sceneId) : '—'}</dd>
                </div>
                <div>
                  <dt>Siguiente escena</dt>
                  <dd>{s.status ? sceneName(config, s.status.nextSceneId) : '—'}</dd>
                </div>
                <div>
                  <dt>Próximo cambio de horario</dt>
                  <dd>{res.source === 'schedule' || res.source === 'default' ? (next ? `${clock(next.at)} → ${playlistName(config, next.playlistId)}` : '—') : 'Manual / fija (no cambia sola)'}</dd>
                </div>
                <div>
                  <dt>Estado de las órdenes</dt>
                  <dd>
                    <Badge tone={sync.tone}>{sync.label}</Badge>
                  </dd>
                </div>
                <div>
                  <dt>Pantalla</dt>
                  <dd>
                    {s.status ? `${s.status.resolution} · ${s.status.quality}${s.status.fps ? ` · ${s.status.fps} FPS` : ''}` : '—'}
                  </dd>
                </div>
              </dl>
              <div className="stv__actions">
                <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => setPreview(preview === s.id ? null : s.id)}>
                  {preview === s.id ? 'Ocultar vista previa' : 'Vista previa'}
                </button>
                <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void command({ screenIds: [s.id], action: s.paused ? 'resume' : 'pause' }, s.paused ? 'Reanudación enviada' : 'Pausa enviada')}>
                  {s.paused ? 'Reanudar' : 'Pausar'}
                </button>
                <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void command({ screenIds: [s.id], action: 'next' }, 'Siguiente escena')}>
                  Siguiente
                </button>
                <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => void command({ screenIds: [s.id], action: 'auto' }, 'Vuelta a automática')}>
                  Automática
                </button>
              </div>
              {preview === s.id && (
                <div className="stv__preview">
                  {previewScene ? (
                    <ScenePreview scene={previewScene} data={data} quality="low" label={`Lo que muestra ahora ${s.name}`} />
                  ) : (
                    <p className="muted">La televisión aún no ha informado de su escena (o muestra una escena de reserva).</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

/* ====================== Televisiones ====================== */
function TvsView() {
  const { config, screens, pair, patchScreen, revoke, clockOffset, lastRefresh } = useSignage();
  const confirm = useConfirm();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const now = lastRefresh + clockOffset;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const s = await pair(code, name);
    setBusy(false);
    if (s) {
      setCode('');
      setName('');
    }
  };
  return (
    <>
      <PageHeader title="Televisiones" intro="Cada televisión (o portátil conectado por HDMI) se vincula una vez con un código temporal. Puedes revocar su acceso cuando quieras." />
      <Card title="Vincular televisión" description="1) En el portátil de la TV abre /pantalla y pulsa «Vincular esta pantalla». 2) Escribe aquí el código que aparece (caduca en 10 minutos).">
        <form className="spair" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Código de la pantalla</span>
            <input className="input spair__code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={8} autoComplete="off" autoCapitalize="characters" required />
          </label>
          <label className="field">
            <span className="field__label">Nombre</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="TV barra" maxLength={60} required />
          </label>
          <button className="abtn abtn--primary" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length !== 6 || !name.trim()}>
            {busy ? 'Vinculando…' : 'Vincular televisión'}
          </button>
        </form>
        <p className="field__hint">
          ¿No tienes la pantalla delante? Ábrela directamente en modo vinculación: <code>/pantalla?vincular=1</code>
        </p>
      </Card>

      {screens.length === 0 && <p className="muted">Todavía no hay televisiones vinculadas. Mientras tanto, cualquier /pantalla reproduce la programación general.</p>}
      <div className="stvlist">
        {screens.map((s) => (
          <Card
            key={s.id}
            title={
              <span className="stvlist__title">
                {s.name} <Badge tone={isOnline(s.status, config.settings.heartbeatSeconds, now) ? 'ok' : 'danger'}>{isOnline(s.status, config.settings.heartbeatSeconds, now) ? 'Conectada' : 'Sin conexión'}</Badge>
              </span>
            }
            description={`Última comunicación: ${ago(s.status?.lastSeen, now)} · Vinculada el ${new Date(s.createdAt).toLocaleDateString('es-ES')}`}
          >
            <div className="grid-3">
              <label className="field">
                <span className="field__label">Nombre</span>
                <input
                  className="input"
                  defaultValue={s.name}
                  maxLength={60}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== s.name) void patchScreen(s.id, { name: v });
                  }}
                />
              </label>
              <label className="field">
                <span className="field__label">Programación</span>
                <select className="input input--select" value={s.playlistId ?? ''} onChange={(e) => void patchScreen(s.id, { playlistId: e.target.value || null })}>
                  <option value="">Automática (según horarios)</option>
                  {config.playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      Siempre: {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Calidad gráfica</span>
                <select className="input input--select" value={s.quality ?? ''} onChange={(e) => void patchScreen(s.id, { quality: e.target.value || null })}>
                  <option value="">La general ({QUALITY_LABEL[config.settings.quality]})</option>
                  {QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {QUALITY_LABEL[q]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <dl className="stv__facts stv__facts--compact">
              <div>
                <dt>Resolución detectada</dt>
                <dd>{s.status?.resolution ?? '—'}</dd>
              </div>
              <div>
                <dt>Calidad en uso</dt>
                <dd>{s.status?.quality ?? '—'}</dd>
              </div>
              <div>
                <dt>Rendimiento</dt>
                <dd>{s.status?.fps ? `${s.status.fps} FPS` : '—'}{s.status?.memoryMb ? ` · ${s.status.memoryMb} MB` : ''}</dd>
              </div>
              <div>
                <dt>Encendida desde hace</dt>
                <dd>{s.status ? `${s.status.uptimeMin} min` : '—'}</dd>
              </div>
              <div>
                <dt>Errores recuperados</dt>
                <dd>{s.status?.errors ?? 0}</dd>
              </div>
              <div>
                <dt>Identificador</dt>
                <dd>
                  <code>{s.id}</code>
                </dd>
              </div>
            </dl>
            <div className="card__foot">
              <button
                type="button"
                className="abtn abtn--danger-ghost abtn--small"
                onClick={async () => {
                  if (
                    await confirm({
                      title: `¿Revocar «${s.name}»?`,
                      text: 'Su token deja de funcionar al instante: la televisión vuelve a la programación general y no recibirá órdenes hasta que la vincules de nuevo.',
                      confirmLabel: 'Revocar acceso',
                      danger: true,
                    })
                  )
                    void revoke(s.id);
                }}
              >
                Revocar acceso
              </button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ====================== Configuración ====================== */
function SettingsView() {
  const { config, update } = useSignage();
  const st = config.settings;
  const set = <K extends keyof typeof st>(k: K, v: (typeof st)[K]) => update((d) => void (d.settings[k] = v));
  const perDay = useMemo(() => Math.round(86400 / st.heartbeatSeconds), [st.heartbeatSeconds]);
  return (
    <>
      <PageHeader title="Configuración" intro="Ajustes generales de todas las televisiones." />
      <Card title="Reproducción">
        <div className="grid-3">
          <label className="field">
            <span className="field__label">Programación por defecto</span>
            <select className="input input--select" value={st.defaultPlaylistId} onChange={(e) => set('defaultPlaylistId', e.target.value)}>
              {config.playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="field__hint">Se reproduce cuando ningún horario está activo.</span>
          </label>
          <label className="field">
            <span className="field__label">Calidad gráfica</span>
            <select className="input input--select" value={st.quality} onChange={(e) => set('quality', e.target.value as typeof st.quality)}>
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {QUALITY_LABEL[q]}
                </option>
              ))}
            </select>
            <span className="field__hint">Automático ajusta la resolución de los efectos según el equipo y baja de nivel si no llega a ~35 FPS.</span>
          </label>
          <NumberField label="Ocultar el cursor tras" value={st.cursorHideSeconds} min={1} max={60} suffix="s" onChange={(v) => set('cursorHideSeconds', v)} />
        </div>
      </Card>
      <Card title="Comunicación con las televisiones" description="Las consultas de órdenes se sirven desde la caché de Netlify (no gastan ejecuciones salvo tras un cambio). El latido sí ejecuta una función.">
        <div className="grid-3">
          <NumberField label="Consultar órdenes cada" value={st.pollSeconds} min={5} max={120} suffix="s" onChange={(v) => set('pollSeconds', v)} hint="Menos segundos = el control remoto responde antes." />
          <NumberField label="Latido de estado cada" value={st.heartbeatSeconds} min={20} max={600} suffix="s" onChange={(v) => set('heartbeatSeconds', v)} hint={`≈ ${perDay.toLocaleString('es-ES')} ejecuciones al día por televisión.`} />
          <NumberField label="Recarga preventiva cada" value={st.reloadHours} min={0} max={72} suffix="h" onChange={(v) => set('reloadHours', v)} hint="0 = nunca. Solo recarga si hay conexión." />
        </div>
      </Card>
      <Card title="Instalación en el local">
        <ul className="slist">
          <li>
            Abre <a href="/pantalla" target="_blank" rel="noopener">/pantalla</a> en Chrome en el portátil conectado por HDMI y pulsa «Iniciar reproductor» (pantalla completa).
          </li>
          <li>Para que arranque solo y no se apague, sigue la guía <code>docs/PANTALLAS.md</code> (lanzadores para Windows y macOS incluidos).</li>
          <li>Con un divisor HDMI todas las televisiones muestran lo mismo; para contenidos distintos, usa un reproductor (portátil o mini PC) por televisión.</li>
        </ul>
      </Card>
    </>
  );
}
