import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ImageRef, MediaAsset } from '../../shared/schema.ts';
import { MEDIA_FOLDERS } from '../../shared/schema.ts';
import { adminApi } from './api.ts';
import { useStore } from './store.tsx';
import { Field, TextField, useToast } from './ui.tsx';
import { processImage } from './image-processing.ts';

export const FOLDER_LABEL: Record<string, string> = {
  portada: 'Portada',
  platos: 'Platos',
  ambiente: 'Ambiente',
  marca: 'Marca',
  texturas: 'Texturas',
  otros: 'Otros',
};

export function thumbUrl(a: MediaAsset): string {
  return a.kind === 'static' ? `${a.src}-640.webp` : `${a.src}?v=sm`;
}

/** Subida con procesamiento previo en el navegador. */
export function useUpload() {
  const { setMedia } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File, opts: { alt: string; folder: string; mode?: 'photo' | 'social' | 'icon' }): Promise<MediaAsset | null> => {
    setBusy(true);
    try {
      const p = await processImage(file, opts.mode ?? 'photo');
      const ext = p.type === 'image/png' ? 'png' : p.type === 'image/jpeg' ? 'jpg' : 'webp';
      const form = new FormData();
      form.append('file', p.full, `imagen.${ext}`);
      form.append('small', p.small, `imagen-sm.${ext}`);
      form.append('alt', opts.alt);
      form.append('folder', opts.folder);
      form.append('name', file.name.replace(/\.[^.]+$/, ''));
      const { asset } = await adminApi.upload(form);
      setMedia((m) => [asset, ...m]);
      toast.show({ kind: 'success', title: 'Imagen subida', text: `${asset.width}×${asset.height}px · guardada de forma permanente.` });
      return asset;
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se ha podido subir la imagen', text: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

export function UploadBox({
  folder: initialFolder = 'otros',
  mode = 'photo',
  onUploaded,
  label = 'Subir imagen',
  compact = false,
}: {
  folder?: string;
  mode?: 'photo' | 'social' | 'icon';
  onUploaded?: (a: MediaAsset) => void;
  label?: string;
  compact?: boolean;
}) {
  const { upload, busy } = useUpload();
  const [alt, setAlt] = useState('');
  const [folder, setFolder] = useState(initialFolder);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const choose = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  };
  const submit = async () => {
    if (!file) return;
    const asset = await upload(file, { alt: alt.trim(), folder, mode });
    if (asset) {
      setFile(null);
      setAlt('');
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      onUploaded?.(asset);
    }
  };

  return (
    <div className={`upload ${compact ? 'upload--compact' : ''}`}>
      <div
        className={`upload__drop ${drag ? 'is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          choose(e.dataTransfer.files?.[0]);
        }}
      >
        {preview ? (
          <img src={preview} alt="" className="upload__preview" />
        ) : (
          <p>
            Arrastra una imagen aquí o
            <br />
          </p>
        )}
        <button type="button" className="abtn abtn--ghost" onClick={() => input.current?.click()}>
          {preview ? 'Elegir otra' : 'Seleccionar archivo'}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" hidden onChange={(e) => choose(e.target.files?.[0])} />
        <p className="upload__note">
          {mode === 'social'
            ? 'Se recortará a 1200×630 px (JPG) para compartir en redes.'
            : mode === 'icon'
              ? 'Se recortará en cuadrado (512×512 px, PNG).'
              : 'JPG, PNG, WebP o AVIF. Se optimiza automáticamente (máx. 2000 px).'}
        </p>
      </div>
      {file && (
        <div className="upload__meta">
          <TextField label="Texto alternativo (describe la imagen)" value={alt} onChange={setAlt} max={240} hint="Ayuda a personas con discapacidad visual y al SEO. Ej.: «Mesa navideña con copas de vino»." />
          <Field label="Carpeta">
            {(id) => (
              <select id={id} className="input input--select" value={folder} onChange={(e) => setFolder(e.target.value)}>
                {MEDIA_FOLDERS.map((f) => (
                  <option key={f} value={f}>
                    {FOLDER_LABEL[f]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <button type="button" className="abtn abtn--primary" disabled={busy || !alt.trim()} onClick={submit}>
            {busy ? 'Optimizando y subiendo…' : label}
          </button>
          {!alt.trim() && <p className="field__hint">Escribe el texto alternativo para poder subirla.</p>}
        </div>
      )}
    </div>
  );
}

export function MediaDialog({
  open,
  onClose,
  onSelect,
  folder,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (a: MediaAsset) => void;
  folder?: string;
  mode?: 'photo' | 'social' | 'icon';
}) {
  const { media } = useStore();
  const [filter, setFilter] = useState<string>('todas');
  const ref = useRef<HTMLDialogElement>(null);
  const list = useMemo(() => media.filter((m) => filter === 'todas' || m.folder === filter), [media, filter]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog dialog--wide" onCancel={onClose} onClose={onClose} aria-label="Biblioteca de imágenes">
      {open && (
        <div className="dialog__inner">
          <div className="dialog__bar">
            <h2 className="dialog__title">Elegir imagen</h2>
            <button type="button" className="abtn abtn--ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
          <div className="chips" role="group" aria-label="Filtrar por carpeta">
            {['todas', ...MEDIA_FOLDERS].map((f) => (
              <button key={f} type="button" className={`chip ${filter === f ? 'is-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'todas' ? 'Todas' : FOLDER_LABEL[f]}
              </button>
            ))}
          </div>
          <details className="dialog__upload">
            <summary>Subir una imagen nueva</summary>
            <UploadBox folder={folder} mode={mode} onUploaded={(a) => onSelect(a)} label="Subir y usar" compact />
          </details>
          <ul className="mgrid" role="list">
            {list.map((a) => (
              <li key={a.id}>
                <button type="button" className="mgrid__item" onClick={() => onSelect(a)}>
                  <img src={thumbUrl(a)} alt="" loading="lazy" style={{ objectPosition: a.position }} />
                  <span className="mgrid__alt">{a.alt || a.id}</span>
                  {a.kind === 'static' && <span className="mgrid__tag">Ilustrativa</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </dialog>
  );
}

/** Selector de imagen + texto alternativo para un campo de contenido. */
export function ImagePicker({
  label,
  value,
  onChange,
  nullable = false,
  folder,
  mode,
  hint,
}: {
  label: string;
  value: ImageRef | null;
  onChange: (v: ImageRef | null) => void;
  nullable?: boolean;
  folder?: string;
  mode?: 'photo' | 'social' | 'icon';
  hint?: ReactNode;
}) {
  const { media } = useStore();
  const [open, setOpen] = useState(false);
  const asset = value ? media.find((m) => m.id === value.asset) : undefined;
  return (
    <div className="ipicker">
      <p className="field__label">{label}</p>
      <div className="ipicker__row">
        <div className="ipicker__thumb">
          {asset ? <img src={thumbUrl(asset)} alt="" style={{ objectPosition: asset.position }} /> : <span>{value ? 'Imagen no encontrada' : 'Sin imagen'}</span>}
        </div>
        <div className="ipicker__side">
          {value && (
            <TextField
              label="Texto alternativo"
              value={value.alt}
              max={240}
              onChange={(alt) => onChange({ ...value, alt })}
              error={!value.alt.trim() ? 'Describe brevemente la imagen' : undefined}
            />
          )}
          <div className="ipicker__actions">
            <button type="button" className="abtn abtn--ghost" onClick={() => setOpen(true)}>
              {value ? 'Cambiar imagen' : 'Elegir imagen'}
            </button>
            {nullable && value && (
              <button type="button" className="abtn abtn--text" onClick={() => onChange(null)}>
                Quitar
              </button>
            )}
          </div>
          {hint && <p className="field__hint">{hint}</p>}
        </div>
      </div>
      <MediaDialog
        open={open}
        folder={folder}
        mode={mode}
        onClose={() => setOpen(false)}
        onSelect={(a) => {
          onChange({ asset: a.id, alt: value?.alt && value.asset === a.id ? value.alt : a.alt });
          setOpen(false);
        }}
      />
    </div>
  );
}
