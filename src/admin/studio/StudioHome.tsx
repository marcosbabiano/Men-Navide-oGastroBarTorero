import { useEffect, useMemo, useState } from 'react';
import { FORMATS, FORMAT_IDS, type DesignSummary, type FormatId } from '../../../shared/studio.ts';
import { TEMPLATES, createDesignFromTemplate, type TemplateDef } from '../../../shared/studio-templates.ts';
import { newId } from '../../../shared/ids.ts';
import { adminApi } from '../api.ts';
import { Card, PageHeader, formatDateTime, useConfirm, useToast } from '../ui.tsx';
import { navigate } from '../router.ts';
import { DesignCanvas } from './DesignCanvas.tsx';
import { useStudioData } from './useStudioData.ts';
import { StudioEditor } from './StudioEditor.tsx';

function TemplateCard({ tpl, onUse, data }: { tpl: TemplateDef; onUse: (tpl: TemplateDef) => void; data: ReturnType<typeof useStudioData> }) {
  const preview = useMemo(
    () => (data.ctx ? createDesignFromTemplate(tpl, data.ctx, { id: `preview-${tpl.id}`, now: '' }) : null),
    [data.ctx, tpl],
  );
  const f = FORMATS[tpl.format];
  const scale = 170 / f.height;
  return (
    <li className="tcard">
      <button type="button" className="tcard__btn" onClick={() => onUse(tpl)} aria-label={`Usar plantilla ${tpl.name}`}>
        <span className="tcard__preview" style={{ width: Math.round(f.width * scale), height: 170 }}>
          {preview && data.ready && <DesignCanvas design={preview} media={data.mediaMap} logo={data.logo} scale={scale} />}
        </span>
        <strong>{tpl.name}</strong>
        <span className="muted small">{f.label}</span>
      </button>
    </li>
  );
}

export function StudioHome() {
  const data = useStudioData();
  const toast = useToast();
  const confirm = useConfirm();
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
  const [chosen, setChosen] = useState<TemplateDef | null>(null);
  const [format, setFormat] = useState<FormatId>('post');
  const [menuId, setMenuId] = useState('');
  const [custom, setCustom] = useState({ w: 1200, h: 628 });

  const load = () =>
    adminApi
      .designs()
      .then((r) => setDesigns(r.designs))
      .catch((e) => {
        setDesigns([]);
        toast.show({ kind: 'error', title: 'No se han podido cargar los diseños', text: (e as Error).message });
      });
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (tpl: TemplateDef | null) => {
    const q = new URLSearchParams();
    q.set('t', tpl?.id ?? 'promo');
    q.set('f', format);
    if (format === 'custom') {
      q.set('w', String(custom.w));
      q.set('h', String(custom.h));
    }
    if (menuId) q.set('m', menuId);
    navigate(`#/estudio/nuevo?${q.toString()}`);
  };

  const duplicate = async (d: DesignSummary) => {
    try {
      const { design } = await adminApi.design(d.id);
      const copy = { ...design, id: newId('diseno'), name: `${design.name} (copia)`, createdAt: new Date().toISOString() };
      await adminApi.saveDesign(copy, d.thumb);
      toast.show({ kind: 'success', title: 'Diseño duplicado' });
      await load();
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se ha podido duplicar', text: (e as Error).message });
    }
  };

  const remove = async (d: DesignSummary) => {
    if (!(await confirm({ title: `¿Eliminar «${d.name}»?`, text: 'El diseño se borrará definitivamente.', confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await adminApi.deleteDesign(d.id);
      setDesigns((list) => (list ?? []).filter((x) => x.id !== d.id));
      toast.show({ kind: 'success', title: 'Diseño eliminado' });
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se ha podido eliminar', text: (e as Error).message });
    }
  };

  const needsMenu = chosen?.menuIndex !== undefined;

  return (
    <>
      <PageHeader
        title="Estudio Creativo — Redes Sociales"
        intro="Diseña publicaciones, historias y carruseles con la identidad de la campaña. Los datos de los menús se toman de lo publicado; las imágenes, de la biblioteca del panel."
      />

      <Card title="Crear un diseño" description="Elige una plantilla (o empieza en blanco) y el formato.">
        {!data.ready ? (
          <p className="muted">Cargando plantillas…</p>
        ) : (
          <ul className="tgallery" role="list">
            {TEMPLATES.map((t) => (
              <TemplateCard
                key={t.id}
                tpl={t}
                data={data}
                onUse={(tpl) => {
                  setChosen(tpl);
                  setFormat(tpl.format);
                  setMenuId(tpl.menuIndex !== undefined ? (data.menus[tpl.menuIndex]?.id ?? data.menus[0]?.id ?? '') : '');
                }}
              />
            ))}
          </ul>
        )}
        <div className="newdesign">
          <p className="field__label">{chosen ? `Plantilla: ${chosen.name}` : 'Diseño en blanco o plantilla seleccionada'}</p>
          <div className="newdesign__row">
            <label className="sfield">
              <span>Formato</span>
              <select className="input input--small" value={format} onChange={(e) => setFormat(e.target.value as FormatId)}>
                {FORMAT_IDS.map((f) => (
                  <option key={f} value={f}>
                    {FORMATS[f].label}
                    {f !== 'custom' ? ` (${FORMATS[f].width}×${FORMATS[f].height})` : ''}
                  </option>
                ))}
              </select>
            </label>
            {format === 'custom' && (
              <>
                <label className="sfield">
                  <span>Ancho (px)</span>
                  <input className="input input--small" type="number" min={200} max={4000} value={custom.w} onChange={(e) => setCustom({ ...custom, w: Math.min(4000, Math.max(200, Number(e.target.value) || 200)) })} />
                </label>
                <label className="sfield">
                  <span>Alto (px)</span>
                  <input className="input input--small" type="number" min={200} max={4000} value={custom.h} onChange={(e) => setCustom({ ...custom, h: Math.min(4000, Math.max(200, Number(e.target.value) || 200)) })} />
                </label>
              </>
            )}
            {needsMenu && (
              <label className="sfield">
                <span>Menú</span>
                <select className="input input--small" value={menuId} onChange={(e) => setMenuId(e.target.value)}>
                  {data.menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.status === 'published' ? '' : ' (borrador)'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="abtn abtn--primary" onClick={() => start(chosen)} disabled={!data.ready}>
              {chosen ? 'Crear con esta plantilla' : 'Empezar en blanco'}
            </button>
            {chosen && (
              <button type="button" className="abtn abtn--text abtn--small" onClick={() => setChosen(null)}>
                Quitar plantilla
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card title={`Diseños guardados${designs ? ` (${designs.length})` : ''}`}>
        {designs === null ? (
          <p className="muted">Cargando…</p>
        ) : designs.length === 0 ? (
          <p className="muted">Aún no has guardado ningún diseño.</p>
        ) : (
          <ul className="dlist" role="list">
            {designs.map((d) => (
              <li key={d.id} className="dcard">
                <a href={`#/estudio/${d.id}`} className="dcard__thumb" aria-label={`Editar ${d.name}`}>
                  <img src={d.thumb} alt="" style={{ aspectRatio: `${d.width} / ${d.height}` }} />
                </a>
                <div className="dcard__body">
                  <strong className="dcard__name">{d.name}</strong>
                  <span className="muted small">
                    {FORMATS[d.formatId]?.label ?? d.formatId} · {d.width}×{d.height}
                  </span>
                  <span className="muted small">{formatDateTime(d.updatedAt)}</span>
                  <div className="dcard__actions">
                    <a className="abtn abtn--small abtn--primary" href={`#/estudio/${d.id}`}>
                      Editar
                    </a>
                    <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => void duplicate(d)}>
                      Duplicar
                    </button>
                    <details className="exportmenu">
                      <summary className="abtn abtn--small abtn--ghost">Exportar</summary>
                      <div className="exportmenu__list">
                        <a href={`#/estudio/${d.id}?exportar=png`}>PNG</a>
                        <a href={`#/estudio/${d.id}?exportar=jpg`}>JPG</a>
                        <a href={`#/estudio/${d.id}?exportar=pdf`}>PDF</a>
                      </div>
                    </details>
                    <button type="button" className="abtn abtn--small abtn--danger-ghost" onClick={() => void remove(d)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function StudioRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  if (path[1]) {
    return <StudioEditor key={`${path[1]}?${query.toString()}`} id={path[1]} query={query} />;
  }
  return <StudioHome />;
}

