import { useMemo, useState } from 'react';
import { MEDIA_FOLDERS } from '../../../shared/schema.ts';
import { collectImageRefs } from '../../../shared/public.ts';
import { adminApi } from '../api.ts';
import { useStore } from '../store.tsx';
import { Badge, Card, PageHeader, useConfirm, useToast } from '../ui.tsx';
import { FOLDER_LABEL, UploadBox, thumbUrl } from '../media.tsx';
import { formatBytes } from '../image-processing.ts';

export function MediaView() {
  const { media, content, setMedia } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [folder, setFolder] = useState('todas');
  const [kind, setKind] = useState<'todas' | 'upload' | 'static'>('todas');
  const used = useMemo(() => new Set(collectImageRefs(content).map((r) => r.asset)), [content]);
  const list = media.filter((m) => (folder === 'todas' || m.folder === folder) && (kind === 'todas' || m.kind === kind));

  const saveMeta = async (id: string, patch: { alt?: string; folder?: string }) => {
    try {
      const { asset } = await adminApi.patchMedia(id, patch);
      setMedia((m) => m.map((x) => (x.id === id ? asset : x)));
      toast.show({ kind: 'success', title: 'Imagen actualizada' });
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se pudo actualizar', text: (e as Error).message });
    }
  };

  const remove = async (id: string, alt: string) => {
    if (used.has(id)) {
      toast.show({ kind: 'error', title: 'Imagen en uso', text: 'Sustitúyela en el contenido (y guarda) antes de eliminarla.' });
      return;
    }
    const ok = await confirm({ title: '¿Eliminar esta imagen?', text: `«${alt || id}» se borrará definitivamente del almacenamiento.`, confirmLabel: 'Eliminar imagen', danger: true });
    if (!ok) return;
    try {
      await adminApi.deleteMedia(id);
      setMedia((m) => m.filter((x) => x.id !== id));
      toast.show({ kind: 'success', title: 'Imagen eliminada' });
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se pudo eliminar', text: (e as Error).message });
    }
  };

  return (
    <>
      <PageHeader
        title="Imágenes"
        intro="Las imágenes subidas se optimizan en tu navegador y se guardan en Netlify Blobs: no se pierden con nuevos despliegues. Para usarlas, elígelas desde cada sección."
      />
      <Card title="Subir imagen">
        <UploadBox folder="platos" />
      </Card>
      <Card
        title={`Biblioteca (${list.length})`}
        actions={
          <div className="filters">
            <label>
              <span className="sr-only">Carpeta</span>
              <select className="input input--select input--small" value={folder} onChange={(e) => setFolder(e.target.value)}>
                <option value="todas">Todas las carpetas</option>
                {MEDIA_FOLDERS.map((f) => (
                  <option key={f} value={f}>
                    {FOLDER_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Origen</span>
              <select className="input input--select input--small" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="todas">Todas</option>
                <option value="upload">Subidas</option>
                <option value="static">Incluidas (ilustrativas)</option>
              </select>
            </label>
          </div>
        }
      >
        <ul className="mlib" role="list">
          {list.map((a) => (
            <li key={a.id} className="mlib__item">
              <div className="mlib__img">
                <img src={thumbUrl(a)} alt="" loading="lazy" style={{ objectPosition: a.position }} />
                <div className="mlib__badges">
                  {used.has(a.id) && <Badge tone="ok">En uso</Badge>}
                  {a.kind === 'static' && <Badge>Ilustrativa</Badge>}
                </div>
              </div>
              <div className="mlib__body">
                {a.kind === 'upload' ? (
                  <>
                    <label className="field__label" htmlFor={`alt-${a.id}`}>
                      Texto alternativo
                    </label>
                    <input id={`alt-${a.id}`} className="input input--small" defaultValue={a.alt} maxLength={240} onBlur={(e) => e.target.value !== a.alt && saveMeta(a.id, { alt: e.target.value })} />
                    <label className="field__label" htmlFor={`folder-${a.id}`}>
                      Carpeta
                    </label>
                    <select id={`folder-${a.id}`} className="input input--select input--small" value={a.folder} onChange={(e) => saveMeta(a.id, { folder: e.target.value })}>
                      {MEDIA_FOLDERS.map((f) => (
                        <option key={f} value={f}>
                          {FOLDER_LABEL[f]}
                        </option>
                      ))}
                    </select>
                    <p className="muted small">
                      {a.width}×{a.height}px · {formatBytes(a.bytes)}
                    </p>
                    <button type="button" className="abtn abtn--small abtn--danger-ghost" disabled={used.has(a.id)} onClick={() => remove(a.id, a.alt)} title={used.has(a.id) ? 'En uso: no se puede eliminar' : undefined}>
                      Eliminar
                    </button>
                  </>
                ) : (
                  <>
                    <p className="small">{a.alt}</p>
                    <p className="muted small">
                      {FOLDER_LABEL[a.folder] ?? a.folder} · {a.width}×{a.height}px · incluida en el proyecto
                    </p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
