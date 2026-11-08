import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { ORNAMENTS, ORNAMENT_IDS, type OrnamentId } from '../../../shared/brand.ts';
import { FORMATS, boundValue, type Design, type DesignElement, type TextElement } from '../../../shared/studio.ts';
import { createDesignFromTemplate, findTemplate } from '../../../shared/studio-templates.ts';
import type { MediaAsset } from '../../../shared/schema.ts';
import { slugify } from '../../../shared/format.ts';
import { newId } from '../../../shared/ids.ts';
import { adminApi } from '../api.ts';
import { useConfirm, useToast } from '../ui.tsx';
import { MediaDialog } from '../media.tsx';
import { navigate } from '../router.ts';
import { DesignCanvas, exportStage, waitForDesignAssets } from './DesignCanvas.tsx';
import { ColorField, ElementInspector, MenuDataPicker } from './Inspector.tsx';
import { useStudioData } from './useStudioData.ts';

const uid = () => newId('el').replace(/^el-/, 'el');

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportDesignFile(stage: Konva.Stage, design: Design, media: Map<string, MediaAsset>, kind: 'png' | 'jpg' | 'pdf') {
  await waitForDesignAssets(design, media);
  const base = `${slugify(design.name) || 'diseno'}-${design.width}x${design.height}`;
  if (kind === 'png') return download(await exportStage(stage, design, 'image/png'), `${base}.png`);
  if (kind === 'jpg') return download(await exportStage(stage, design, 'image/jpeg', 0.95), `${base}.jpg`);
  const { jsPDF } = await import('jspdf');
  const png = await exportStage(stage, design, 'image/png');
  const pdf = new jsPDF({ orientation: design.width > design.height ? 'landscape' : 'portrait', unit: 'px', format: [design.width, design.height], hotfixes: ['px_scaling'], compress: true });
  pdf.addImage(png, 'PNG', 0, 0, design.width, design.height);
  pdf.save(`${base}.pdf`);
}

/** Cambios de datos de menú respecto a lo guardado (no se aplican sin permiso). */
function outdatedBindings(design: Design, menus: ReturnType<typeof useStudioData>['menus']) {
  return design.elements.filter((e): e is TextElement => {
    if (e.type !== 'text' || !e.binding) return false;
    const v = boundValue(menus, e.binding);
    return v !== null && v !== e.text;
  });
}

export function StudioEditor({ id, query }: { id: string; query: URLSearchParams }) {
  const data = useStudioData();
  const toast = useToast();
  const confirm = useConfirm();
  const [design, setDesign] = useState<Design | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const [panel, setPanel] = useState<'add' | 'menu' | 'bg' | 'layers'>('add');
  const [picker, setPicker] = useState<null | 'element' | 'background'>(null);
  const [syncDismissed, setSyncDismissed] = useState(false);
  const [busy, setBusy] = useState('');
  const [scale, setScale] = useState(0.4);
  const stageRef = useRef<Konva.Stage>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isNew = id === 'nuevo';

  // Carga el diseño guardado o crea uno nuevo desde una plantilla.
  useEffect(() => {
    if (!data.ready || design) return;
    (async () => {
      if (!isNew) {
        try {
          const { design: d } = await adminApi.design(id);
          setDesign(d);
          setSaved(JSON.stringify(d));
        } catch (e) {
          toast.show({ kind: 'error', title: 'No se ha podido abrir el diseño', text: (e as Error).message });
          navigate('#/estudio');
        }
        return;
      }
      const tpl = findTemplate(query.get('t') ?? 'promo') ?? findTemplate('promo')!;
      const formatId = (query.get('f') as keyof typeof FORMATS) || tpl.format;
      const w = Number(query.get('w')) || undefined;
      const h = Number(query.get('h')) || undefined;
      const menu = data.menus.find((m) => m.id === query.get('m')) ?? undefined;
      const d = createDesignFromTemplate(tpl, data.ctx!, { formatId, width: w, height: h, menu, id: newId('diseno'), now: new Date().toISOString() });
      setDesign(d);
      setSaved('');
    })();
  }, [data.ready, data.ctx, data.menus, design, id, isNew, query, toast]);

  // Ajusta la escala del lienzo al espacio disponible.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !design) return;
    const fit = () => {
      const pad = 24;
      const s = Math.min((el.clientWidth - pad) / design.width, (Math.max(320, window.innerHeight - 220) - pad) / design.height);
      setScale(Math.max(0.12, Math.min(1, s)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [design?.width, design?.height, design]);

  const dirty = !!design && JSON.stringify(design) !== saved;

  const commit = useCallback((fn: (d: Design) => Design) => {
    setDesign((d) => {
      if (!d) return d;
      setPast((p) => [...p.slice(-49), d]);
      setFuture([]);
      return fn(d);
    });
  }, []);

  const patchEl = useCallback(
    (eid: string, patch: Partial<DesignElement>) => commit((d) => ({ ...d, elements: d.elements.map((e) => (e.id === eid ? ({ ...e, ...patch } as DesignElement) : e)) })),
    [commit],
  );

  const undo = () => {
    if (!past.length || !design) return;
    setFuture((f) => [design, ...f]);
    setDesign(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length || !design) return;
    setPast((p) => [...p, design]);
    setDesign(future[0]);
    setFuture((f) => f.slice(1));
  };

  const add = (el: DesignElement) => {
    commit((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelected(el.id);
  };
  const W = design?.width ?? 1080;
  const H = design?.height ?? 1350;
  const base = { rotation: 0, opacity: 1, locked: false };
  const addText = (kind: 'title' | 'body') =>
    add({
      ...base,
      id: uid(),
      type: 'text',
      x: W * 0.1,
      y: H * 0.4,
      width: W * 0.8,
      height: 120,
      text: kind === 'title' ? 'Nuevo titular' : 'Escribe aquí tu texto',
      font: kind === 'title' ? 'serif' : 'sans',
      size: kind === 'title' ? 96 : 36,
      weight: kind === 'title' ? 300 : 400,
      italic: false,
      color: data.theme.ivory,
      align: 'center',
      letterSpacing: 0,
      lineHeight: 1.2,
      uppercase: false,
      binding: null,
    });
  const addOrnament = (o: OrnamentId) => {
    const [bw, bh] = ORNAMENTS[o].box;
    const w = Math.min(W * 0.3, 320);
    add({ ...base, id: uid(), type: 'ornament', ornament: o, x: W / 2 - w / 2, y: H / 2 - (w * bh) / bw / 2, width: w, height: (w * bh) / bw, color: data.theme.gold, strokeWidth: 2 });
  };
  const addShape = (shape: 'rect' | 'ellipse' | 'line') =>
    add({ ...base, id: uid(), type: 'shape', shape, x: W * 0.25, y: H * 0.45, width: W * 0.5, height: shape === 'line' ? 1 : H * 0.12, fill: shape === 'line' ? '' : data.theme.burgundy, stroke: shape === 'line' ? data.theme.gold : '', strokeWidth: shape === 'line' ? 2 : 0, radius: 0 });
  const addLogo = () => add({ ...base, id: uid(), type: 'logo', x: W / 2 - 160, y: H - 200, width: 320, height: 96, color: data.theme.ivory, accent: data.theme.gold });

  const selectedEl = design?.elements.find((e) => e.id === selected) ?? null;

  const align = (how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    if (!selectedEl || !design) return;
    const node = stageRef.current?.findOne(`#${selectedEl.id}`);
    const h = node ? node.height() : selectedEl.height;
    const w = selectedEl.width;
    const m = 0;
    const p: Partial<DesignElement> =
      how === 'left' ? { x: m } : how === 'hcenter' ? { x: Math.round((W - w) / 2) } : how === 'right' ? { x: W - w - m } : how === 'top' ? { y: m } : how === 'vcenter' ? { y: Math.round((H - h) / 2) } : { y: Math.round(H - h - m) };
    patchEl(selectedEl.id, p);
  };

  const removeSelected = () => {
    if (!selectedEl) return;
    commit((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== selectedEl.id) }));
    setSelected(null);
  };
  const duplicateSelected = () => {
    if (!selectedEl) return;
    add({ ...selectedEl, id: uid(), x: selectedEl.x + 30, y: selectedEl.y + 30 } as DesignElement);
  };
  const moveLayer = (dir: 1 | -1 | 'top' | 'bottom') => {
    if (!selectedEl) return;
    commit((d) => {
      const list = d.elements.filter((e) => e.id !== selectedEl.id);
      const i = d.elements.findIndex((e) => e.id === selectedEl.id);
      const to = dir === 'top' ? list.length : dir === 'bottom' ? 0 : Math.max(0, Math.min(list.length, i + dir));
      list.splice(to, 0, selectedEl);
      return { ...d, elements: list };
    });
  };

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEl) {
        e.preventDefault();
        removeSelected();
      } else if (selectedEl && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const st = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0;
        const dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
        patchEl(selectedEl.id, { x: selectedEl.x + dx, y: selectedEl.y + dy });
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const save = async (asCopy = false): Promise<Design | null> => {
    if (!design || !stageRef.current) return null;
    setBusy('Guardando…');
    setSelected(null);
    try {
      const toSave: Design = asCopy ? { ...design, id: newId('diseno'), name: `${design.name} (copia)`, createdAt: new Date().toISOString() } : design;
      await waitForDesignAssets(toSave, data.mediaMap);
      const thumb = await exportStage(stageRef.current, design, 'image/jpeg', 0.72, 360);
      const { summary } = await adminApi.saveDesign(toSave, thumb);
      const stored = { ...toSave, updatedAt: summary.updatedAt };
      if (!asCopy) {
        setDesign(stored);
        setSaved(JSON.stringify(stored));
        if (isNew) history.replaceState(null, '', `/admin#/estudio/${stored.id}`);
      }
      toast.show({ kind: 'success', title: asCopy ? 'Copia guardada' : 'Diseño guardado', text: asCopy ? `«${toSave.name}» está en tus diseños.` : 'Puedes volver a editarlo cuando quieras.' });
      if (asCopy) navigate(`#/estudio/${toSave.id}`);
      return stored;
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se ha podido guardar', text: (e as Error).message });
      return null;
    } finally {
      setBusy('');
    }
  };

  const doExport = async (kind: 'png' | 'jpg' | 'pdf') => {
    if (!design || !stageRef.current) return;
    setBusy('Preparando archivo…');
    setSelected(null);
    try {
      await exportDesignFile(stageRef.current, design, data.mediaMap, kind);
      toast.show({ kind: 'success', title: `Exportado en ${kind.toUpperCase()}`, text: `${design.width} × ${design.height} px` });
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se ha podido exportar', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  const autoExport = query.get('exportar');
  useEffect(() => {
    if (!autoExport || !design || !stageRef.current || isNew) return;
    const t = window.setTimeout(() => void doExport(autoExport === 'pdf' ? 'pdf' : autoExport === 'jpg' ? 'jpg' : 'png'), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExport, !!design]);

  const outdated = useMemo(() => (design && !isNew ? outdatedBindings(design, data.menus) : []), [design, data.menus, isNew]);

  if (!data.ready || !design) return <p className="muted">Cargando el Estudio…</p>;

  return (
    <div className="studio">
      <header className="studio__bar">
        <a href="#/estudio" className="abtn abtn--text abtn--small" onClick={async (e) => {
          if (dirty) {
            e.preventDefault();
            if (await confirm({ title: '¿Salir sin guardar?', text: 'Perderás los cambios de este diseño.', confirmLabel: 'Salir', danger: true })) {
              setSaved(JSON.stringify(design));
              navigate('#/estudio');
            }
          }
        }}>
          ← Diseños
        </a>
        <label className="studio__name">
          <span className="sr-only">Nombre del diseño</span>
          <input className="input input--small" value={design.name} maxLength={80} onChange={(e) => setDesign({ ...design, name: e.target.value })} />
        </label>
        <span className="badge">{FORMATS[design.formatId].label} · {design.width}×{design.height}</span>
        <div className="studio__actions">
          <button type="button" className="abtn abtn--small abtn--ghost" onClick={undo} disabled={!past.length} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
            ↶
          </button>
          <button type="button" className="abtn abtn--small abtn--ghost" onClick={redo} disabled={!future.length} aria-label="Rehacer" title="Rehacer (Ctrl+Y)">
            ↷
          </button>
          <label className="scheck">
            <input type="checkbox" checked={design.showLogo} onChange={(e) => commit((d) => ({ ...d, showLogo: e.target.checked }))} /> Logotipo
          </label>
          <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => void save(true)} disabled={!!busy || isNew}>
            Duplicar
          </button>
          <details className="exportmenu">
            <summary className="abtn abtn--small abtn--ghost">Exportar</summary>
            <div className="exportmenu__list">
              {(
                [
                  ['png', 'PNG alta resolución'],
                  ['jpg', 'JPG alta calidad'],
                  ['pdf', 'PDF'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={(e) => {
                    const d = e.currentTarget.closest('details');
                    if (d) d.open = false;
                    void doExport(k);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
          <button type="button" className="abtn abtn--small abtn--primary" onClick={() => void save()} disabled={!!busy || (!dirty && !isNew)}>
            {busy || (dirty || isNew ? 'Guardar' : 'Guardado')}
          </button>
        </div>
      </header>

      {outdated.length > 0 && !syncDismissed && (
        <div className="banner banner--info" role="status">
          <span>
            {outdated.length} texto{outdated.length > 1 ? 's' : ''} vinculado{outdated.length > 1 ? 's' : ''} a los menús ha{outdated.length > 1 ? 'n' : ''} cambiado desde que se guardó este diseño. ¿Qué prefieres?
          </span>
          <span className="banner__actions">
            <button
              type="button"
              className="abtn abtn--small abtn--primary"
              onClick={() => {
                commit((d) => ({
                  ...d,
                  elements: d.elements.map((e) => {
                    if (e.type !== 'text' || !e.binding) return e;
                    const v = boundValue(data.menus, e.binding);
                    return v !== null ? { ...e, text: v } : e;
                  }),
                }));
                setSyncDismissed(true);
              }}
            >
              Actualizar con los datos actuales
            </button>
            <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => setSyncDismissed(true)}>
              Conservar el diseño tal cual
            </button>
          </span>
        </div>
      )}

      <div className="studio__body">
        <aside className="studio__tools" aria-label="Herramientas">
          <div className="tabs" role="tablist">
            {(
              [
                ['add', 'Añadir'],
                ['menu', 'Menús'],
                ['bg', 'Fondo'],
                ['layers', 'Capas'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} role="tab" type="button" aria-selected={panel === k} className={`tab ${panel === k ? 'is-on' : ''}`} onClick={() => setPanel(k)}>
                {l}
              </button>
            ))}
          </div>
          {panel === 'add' && (
            <div className="toolgroup">
              <p className="inspector__title">Texto</p>
              <div className="toolrow">
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => addText('title')}>
                  + Titular
                </button>
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => addText('body')}>
                  + Párrafo
                </button>
              </div>
              <p className="inspector__title">Imagen</p>
              <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => setPicker('element')}>
                + Fotografía o ilustración
              </button>
              <p className="inspector__title">Ornamentos de marca</p>
              <div className="ornaments">
                {ORNAMENT_IDS.map((o) => (
                  <button key={o} type="button" className="ornbtn" onClick={() => addOrnament(o)} title={ORNAMENTS[o].label} aria-label={`Añadir ${ORNAMENTS[o].label}`}>
                    <svg viewBox={`0 0 ${ORNAMENTS[o].box[0]} ${ORNAMENTS[o].box[1]}`} aria-hidden="true">
                      {ORNAMENTS[o].paths.map((p, i) => (
                        <path key={i} d={p.d} fill={p.mode === 'fill' ? 'currentColor' : 'none'} stroke={p.mode === 'stroke' ? 'currentColor' : 'none'} strokeWidth={ORNAMENTS[o].box[0] / 30} strokeLinecap="round" />
                      ))}
                    </svg>
                  </button>
                ))}
              </div>
              <p className="inspector__title">Formas</p>
              <div className="toolrow">
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => addShape('rect')}>
                  ▭ Rectángulo
                </button>
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => addShape('ellipse')}>
                  ◯ Círculo
                </button>
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => addShape('line')}>
                  ― Línea
                </button>
              </div>
              <button type="button" className="abtn abtn--small abtn--ghost" onClick={addLogo}>
                + Logotipo
              </button>
            </div>
          )}
          {panel === 'menu' && (
            <MenuDataPicker
              menus={data.menus}
              onInsert={(menu, field, value, sectionId) =>
                add({
                  ...base,
                  id: uid(),
                  type: 'text',
                  x: W * 0.1,
                  y: H * 0.45,
                  width: W * 0.8,
                  height: 100,
                  text: value,
                  font: field === 'price' ? 'serif' : field === 'priceUnit' ? 'sans' : 'serif',
                  size: field === 'price' ? 110 : field === 'nameMain' || field === 'name' ? 96 : 40,
                  weight: 400,
                  italic: field === 'subtitle',
                  color: field === 'price' ? data.theme.gold : data.theme.ivory,
                  align: 'center',
                  letterSpacing: 0,
                  lineHeight: 1.25,
                  uppercase: field === 'priceUnit',
                  binding: sectionId ? { menuId: menu.id, field, sectionId } : { menuId: menu.id, field },
                })
              }
            />
          )}
          {panel === 'bg' && (
            <div className="toolgroup">
              <ColorField label="Color de fondo" value={design.background.color} theme={data.theme} onChange={(color) => commit((d) => ({ ...d, background: { ...d.background, color } }))} />
              <label className="scheck">
                <input
                  type="checkbox"
                  checked={!!design.background.gradient}
                  onChange={(e) => commit((d) => ({ ...d, background: { ...d.background, gradient: e.target.checked ? { to: data.theme.burgundy, angle: 160 } : null } }))}
                />{' '}
                Degradado
              </label>
              {design.background.gradient && (
                <>
                  <ColorField label="Color final" value={design.background.gradient.to} theme={data.theme} onChange={(to) => commit((d) => ({ ...d, background: { ...d.background, gradient: { ...d.background.gradient!, to } } }))} />
                  <label className="sfield">
                    <span>Ángulo: {design.background.gradient.angle}°</span>
                    <input type="range" min={0} max={360} value={design.background.gradient.angle} onChange={(e) => commit((d) => ({ ...d, background: { ...d.background, gradient: { ...d.background.gradient!, angle: Number(e.target.value) } } }))} />
                  </label>
                </>
              )}
              <p className="inspector__title">Imagen de fondo</p>
              <div className="toolrow">
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => setPicker('background')}>
                  {design.background.image ? 'Cambiar imagen' : 'Elegir imagen'}
                </button>
                {design.background.image && (
                  <button type="button" className="abtn abtn--small abtn--text" onClick={() => commit((d) => ({ ...d, background: { ...d.background, image: null } }))}>
                    Quitar
                  </button>
                )}
              </div>
              {design.background.image && (
                <label className="sfield">
                  <span>Opacidad de la imagen: {Math.round(design.background.image.opacity * 100)}%</span>
                  <input type="range" min={5} max={100} value={Math.round(design.background.image.opacity * 100)} onChange={(e) => commit((d) => ({ ...d, background: { ...d.background, image: { ...d.background.image!, opacity: Number(e.target.value) / 100 } } }))} />
                </label>
              )}
            </div>
          )}
          {panel === 'layers' && (
            <ol className="layers" reversed>
              {[...design.elements].reverse().map((e) => (
                <li key={e.id}>
                  <button type="button" className={`layer ${selected === e.id ? 'is-on' : ''}`} onClick={() => setSelected(e.id)}>
                    <span className="layer__type">{{ text: 'T', image: '▣', ornament: '✦', shape: '◇', logo: 'Ⓛ' }[e.type]}</span>
                    <span className="layer__name">{e.type === 'text' ? e.text.split('\n')[0].slice(0, 28) : e.type === 'ornament' ? ORNAMENTS[e.ornament].label : e.type === 'shape' ? 'Forma' : e.type === 'logo' ? 'Logotipo' : 'Imagen'}</span>
                    {e.locked && <span aria-label="bloqueado">🔒</span>}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <div className="studio__stage" ref={wrapRef}>
          <div className="studio__canvas" style={{ width: Math.round(design.width * scale), height: Math.round(design.height * scale) }}>
            <DesignCanvas
              design={design}
              media={data.mediaMap}
              logo={data.logo}
              scale={scale}
              interactive
              selectedId={selected}
              onSelect={setSelected}
              onChange={patchEl}
              stageRef={stageRef}
              showSafeArea={design.formatId === 'story'}
            />
          </div>
          <p className="muted small studio__hint">Arrastra para mover · tiradores para redimensionar y girar · flechas para ajustar (Mayús = 10 px) · Supr para borrar · Ctrl+D duplicar</p>
        </div>

        <aside className="studio__props" aria-label="Propiedades">
          {selectedEl ? (
            <>
              <div className="toolrow">
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={duplicateSelected}>
                  Duplicar
                </button>
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => moveLayer('top')} title="Traer al frente">
                  ⤒ Frente
                </button>
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => moveLayer('bottom')} title="Enviar al fondo">
                  ⤓ Fondo
                </button>
                <button type="button" className="abtn abtn--small abtn--danger-ghost" onClick={removeSelected}>
                  Eliminar
                </button>
              </div>
              <ElementInspector el={selectedEl} design={design} theme={data.theme} menus={data.menus} onChange={(p) => patchEl(selectedEl.id, p)} onAlign={align} />
            </>
          ) : (
            <div className="inspector">
              <p className="muted small">Selecciona un elemento del lienzo para editarlo, o añade uno nuevo desde «Añadir».</p>
              {data.error && <p className="field__error">{data.error}</p>}
            </div>
          )}
        </aside>
      </div>
      <MediaDialog
        open={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={(a) => {
          if (picker === 'background') commit((d) => ({ ...d, background: { ...d.background, image: { asset: a.id, opacity: 1 } } }));
          else {
            const ratio = a.height / a.width;
            const w = W * 0.6;
            add({ ...base, id: uid(), type: 'image', asset: a.id, fit: 'cover', x: W * 0.2, y: H * 0.2, width: w, height: Math.round(w * ratio), radius: 0 });
          }
          setPicker(null);
        }}
      />
    </div>
  );
}
