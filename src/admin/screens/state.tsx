/** Estado del Gestor de Pantallas: configuración editable (con guardado explícito) y televisiones en vivo. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { produce, type Draft } from 'immer';
import type { MediaAsset } from '../../../shared/schema.ts';
import { type SignageConfig, signageConfigSchema } from '../../../shared/signage.ts';
import { formatIssues } from '../../../shared/schema.ts';
import { toPublicContent } from '../../../shared/public.ts';
import type { SceneData } from '../../screen/engine.ts';
import { adminApi, HttpError, type CommandBody, type ScreenView } from '../api.ts';
import { useStore } from '../store.tsx';
import { useToast } from '../ui.tsx';

interface SignageCtx {
  loading: boolean;
  error: string | null;
  config: SignageConfig;
  revision: number;
  updatedAt: string;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  issues: { path: string; message: string }[];
  screens: ScreenView[];
  /** Diferencia entre el reloj del servidor y el del navegador (ms). */
  clockOffset: number;
  lastRefresh: number;
  update: (fn: (d: Draft<SignageConfig>) => void) => void;
  save: () => Promise<boolean>;
  discard: () => void;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  command: (body: CommandBody, okText?: string) => Promise<boolean>;
  pair: (code: string, name: string) => Promise<ScreenView | null>;
  patchScreen: (id: string, patch: { name?: string; playlistId?: string | null; quality?: string | null }) => Promise<boolean>;
  revoke: (id: string) => Promise<boolean>;
  data: SceneData;
}

const Ctx = createContext<SignageCtx | null>(null);

export function useSignage(): SignageCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSignage fuera de SignageProvider');
  return c;
}

export function SignageProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { content, media } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SignageConfig | null>(null);
  const [saved, setSaved] = useState('');
  const [meta, setMeta] = useState({ revision: 0, updatedAt: '' });
  const [screens, setScreens] = useState<ScreenView[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const dirtyRef = useRef(false);

  const dirty = config !== null && JSON.stringify(config) !== saved;
  useEffect(() => {
    dirtyRef.current = dirty;
  });

  const load = useCallback(async (full: boolean) => {
    try {
      const s = await adminApi.signage();
      setScreens(s.screens);
      setClockOffset(Date.parse(s.serverTime) - Date.now());
      setLastRefresh(Date.now());
      setMeta((m) => {
        if (full || (!dirtyRef.current && m.revision !== s.revision)) {
          setConfig(s.config);
          setSaved(JSON.stringify(s.config));
          return { revision: s.revision, updatedAt: s.updatedAt };
        }
        if (m.revision !== s.revision) setConflict(true);
        return m;
      });
      setError(null);
    } catch (e) {
      if (full) setError(e instanceof HttpError ? e.message : 'No se pudo cargar el Gestor de Pantallas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    // Estado de las televisiones en vivo: cada 5 s mientras la pestaña está visible.
    const id = window.setInterval(() => {
      if (!document.hidden) void load(false);
    }, 5000);
    return () => clearInterval(id);
  }, [load]);

  const issues = useMemo(() => {
    if (!config) return [];
    const r = signageConfigSchema.safeParse(config);
    return r.success ? [] : formatIssues(r.error);
  }, [config]);

  const update = useCallback((fn: (d: Draft<SignageConfig>) => void) => setConfig((c) => (c ? produce(c, fn) : c)), []);

  const save = useCallback(async () => {
    if (!config) return false;
    if (issues.length) {
      toast.show({ kind: 'error', title: 'Revisa los datos', text: issues[0].message });
      return false;
    }
    setSaving(true);
    try {
      const r = await adminApi.saveSignage(config, meta.revision);
      setSaved(JSON.stringify(config));
      setMeta({ revision: r.revision, updatedAt: r.updatedAt });
      toast.show({ kind: 'success', title: 'Pantallas actualizadas', text: 'Las televisiones recibirán los cambios en unos segundos.' });
      return true;
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) setConflict(true);
      toast.show({ kind: 'error', title: 'No se pudo guardar', text: (e as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [config, issues, meta.revision, toast]);

  const discard = useCallback(() => {
    if (saved) setConfig(JSON.parse(saved) as SignageConfig);
  }, [saved]);

  const reload = useCallback(async () => {
    setConflict(false);
    await load(true);
  }, [load]);

  const command = useCallback(
    async (body: CommandBody, okText?: string) => {
      try {
        await adminApi.command(body);
        toast.show({ kind: 'success', title: okText ?? 'Orden enviada', text: 'Pendiente de confirmación por la televisión.' });
        await load(false);
        return true;
      } catch (e) {
        toast.show({ kind: 'error', title: 'No se pudo enviar la orden', text: (e as Error).message });
        return false;
      }
    },
    [load, toast],
  );

  const pair = useCallback(
    async (code: string, name: string) => {
      try {
        const r = await adminApi.pairScreen(code, name);
        toast.show({ kind: 'success', title: 'Televisión vinculada', text: `«${r.screen.name}» aparecerá conectada en unos segundos.` });
        await load(false);
        return r.screen;
      } catch (e) {
        toast.show({ kind: 'error', title: 'No se pudo vincular', text: (e as Error).message });
        return null;
      }
    },
    [load, toast],
  );

  const patchScreen = useCallback(
    async (id: string, patch: { name?: string; playlistId?: string | null; quality?: string | null }) => {
      try {
        await adminApi.patchScreen(id, patch);
        await load(false);
        return true;
      } catch (e) {
        toast.show({ kind: 'error', title: 'No se pudo cambiar la televisión', text: (e as Error).message });
        return false;
      }
    },
    [load, toast],
  );

  const revoke = useCallback(
    async (id: string) => {
      try {
        await adminApi.revokeScreen(id);
        toast.show({ kind: 'success', title: 'Acceso revocado', text: 'Esa televisión ya no recibe órdenes y vuelve a la programación general.' });
        await load(false);
        return true;
      } catch (e) {
        toast.show({ kind: 'error', title: 'No se pudo revocar', text: (e as Error).message });
        return false;
      }
    },
    [load, toast],
  );

  // Datos para las vistas previas: menús publicados del borrador actual y toda la biblioteca de imágenes.
  const mediaMap = useMemo(() => Object.fromEntries(media.map((m) => [m.id, m])) as Record<string, MediaAsset>, [media]);
  const publicContent = useMemo(() => toPublicContent(content), [content]);
  const data = useMemo<SceneData>(() => ({ content: publicContent, media: mediaMap, events: config?.events ?? [] }), [publicContent, mediaMap, config?.events]);

  if (loading) return <p className="muted">Cargando el Gestor de Pantallas…</p>;
  if (error || !config) {
    return (
      <div className="card card--danger">
        <div className="card__body">
          <p>{error ?? 'No se pudo cargar.'}</p>
          <button type="button" className="abtn abtn--primary" onClick={() => void load(true)}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider
      value={{
        loading,
        error,
        config,
        revision: meta.revision,
        updatedAt: meta.updatedAt,
        dirty,
        saving,
        conflict,
        issues,
        screens,
        clockOffset,
        lastRefresh,
        update,
        save,
        discard,
        reload,
        refresh: () => load(false),
        command,
        pair,
        patchScreen,
        revoke,
        data,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
