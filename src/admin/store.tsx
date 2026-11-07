import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { produce, type Draft } from 'immer';
import type { MediaAsset, SiteContent } from '../../shared/schema.ts';
import { siteContentSchema, formatIssues } from '../../shared/schema.ts';
import { contentIssues, type ContentIssue } from '../../shared/completeness.ts';
import { adminApi, HttpError, type AdminState, type PublishedMeta } from './api.ts';
import { useToast } from './ui.tsx';

export type SaveStatus = 'idle' | 'saving' | 'publishing' | 'error';

interface Store {
  content: SiteContent;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  published: PublishedMeta | null;
  media: MediaAsset[];
  user: AdminState['user'];
  dirty: boolean;
  status: SaveStatus;
  hasUnpublishedChanges: boolean;
  issues: ContentIssue[];
  fieldErrors: { path: string; message: string }[];
  conflict: boolean;
  update: (fn: (d: Draft<SiteContent>) => void) => void;
  save: () => Promise<boolean>;
  publish: () => Promise<boolean>;
  reload: () => Promise<void>;
  discard: () => void;
  setMedia: (fn: (m: MediaAsset[]) => MediaAsset[]) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ initial, children }: { initial: AdminState; children: ReactNode }) {
  const toast = useToast();
  const [content, setContent] = useState<SiteContent>(initial.draft.content);
  const [saved, setSaved] = useState<string>(() => JSON.stringify(initial.draft.content));
  const [meta, setMeta] = useState({ revision: initial.draft.revision, updatedAt: initial.draft.updatedAt, updatedBy: initial.draft.updatedBy });
  const [published, setPublished] = useState<PublishedMeta | null>(initial.published);
  const [media, setMediaState] = useState<MediaAsset[]>(initial.media);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [fieldErrors, setFieldErrors] = useState<{ path: string; message: string }[]>([]);
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);

  const dirty = useMemo(() => JSON.stringify(content) !== saved, [content, saved]);
  const knownIds = useMemo(() => new Set(media.map((m) => m.id)), [media]);
  const issues = useMemo(() => contentIssues(content, knownIds), [content, knownIds]);
  const hasUnpublishedChanges = dirty || !published || published.sourceRevision !== meta.revision;

  const update = useCallback((fn: (d: Draft<SiteContent>) => void) => {
    setContent((c) => produce(c, fn));
  }, []);

  const applyState = useCallback((s: AdminState) => {
    setContent(s.draft.content);
    setSaved(JSON.stringify(s.draft.content));
    setMeta({ revision: s.draft.revision, updatedAt: s.draft.updatedAt, updatedBy: s.draft.updatedBy });
    setPublished(s.published);
    setMediaState(s.media);
    setConflict(false);
    setFieldErrors([]);
  }, []);

  const reload = useCallback(async () => {
    applyState(await adminApi.state());
  }, [applyState]);

  /** Guarda y devuelve la nueva revisión (o null si no se pudo). */
  const saveRevision = useCallback(async (): Promise<number | null> => {
    if (busy.current) return null;
    if (!dirty) return meta.revision;
    const check = siteContentSchema.safeParse(content);
    if (!check.success) {
      const errs = formatIssues(check.error);
      setFieldErrors(errs);
      toast.show({ kind: 'error', title: 'Revisa los campos marcados', text: errs.slice(0, 3).map((e) => `${e.message} (${e.path})`).join(' · ') });
      return null;
    }
    busy.current = true;
    setStatus('saving');
    try {
      const res = await adminApi.saveDraft(content, meta.revision);
      setSaved(JSON.stringify(content));
      setMeta({ revision: res.draft.revision, updatedAt: res.draft.updatedAt, updatedBy: res.draft.updatedBy });
      setFieldErrors([]);
      setStatus('idle');
      toast.show({ kind: 'success', title: 'Borrador guardado', text: 'Los cambios aún no son públicos hasta que publiques.' });
      return res.draft.revision;
    } catch (e) {
      setStatus('error');
      const err = e as HttpError;
      if (err.status === 409) setConflict(true);
      if (err.status === 422 && Array.isArray(err.details)) setFieldErrors(err.details as { path: string; message: string }[]);
      toast.show({ kind: 'error', title: 'No se ha podido guardar', text: err.message });
      return null;
    } finally {
      busy.current = false;
    }
  }, [content, dirty, meta.revision, toast]);

  const save = useCallback(async () => (await saveRevision()) !== null, [saveRevision]);

  const publish = useCallback(async (): Promise<boolean> => {
    if (busy.current) return false;
    const revision = await saveRevision();
    if (revision === null) return false;
    busy.current = true;
    setStatus('publishing');
    try {
      const res = await adminApi.publish(revision);
      setPublished(res.published);
      setStatus('idle');
      toast.show({
        kind: 'success',
        title: '¡Publicado!',
        text: res.cachePurged ? 'La web ya muestra los cambios.' : 'Publicado. Puede tardar unos minutos en verse en todos los dispositivos.',
        action: { label: 'Ver la web', href: '/' },
      });
      return true;
    } catch (e) {
      setStatus('error');
      const err = e as HttpError;
      if (err.status === 409) setConflict(true);
      const extra = Array.isArray(err.details) ? (err.details as ContentIssue[]).map((d) => d.message).slice(0, 3).join(' · ') : '';
      toast.show({ kind: 'error', title: 'No se ha podido publicar', text: [err.message, extra].filter(Boolean).join(' ') });
      return false;
    } finally {
      busy.current = false;
    }
  }, [saveRevision, toast]);

  const discard = useCallback(() => {
    setContent(JSON.parse(saved) as SiteContent);
    setFieldErrors([]);
  }, [saved]);

  const setMedia = useCallback((fn: (m: MediaAsset[]) => MediaAsset[]) => setMediaState((m) => fn(m)), []);

  // Atajo Ctrl/Cmd + S y aviso al salir con cambios sin guardar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [save, dirty]);

  const value: Store = {
    content,
    revision: meta.revision,
    updatedAt: meta.updatedAt,
    updatedBy: meta.updatedBy,
    published,
    media,
    user: initial.user,
    dirty,
    status,
    hasUnpublishedChanges,
    issues,
    fieldErrors,
    conflict,
    update,
    save,
    publish,
    reload,
    discard,
    setMedia,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider ausente');
  return s;
}

/** Error de validación de un campo concreto (por ruta «texts.hero.subtitle»). */
export function useFieldError(path: string): string | undefined {
  const { fieldErrors } = useStore();
  return fieldErrors.find((e) => e.path === path)?.message;
}
