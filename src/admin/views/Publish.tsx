import { useEffect, useState } from 'react';
import { adminApi, type HistoryEntry } from '../api.ts';
import { useStore } from '../store.tsx';
import { Badge, Card, PageHeader, formatDateTime, useConfirm, useToast } from '../ui.tsx';
import { IssueList } from './Dashboard.tsx';

export function PublishView({ onPreview }: { onPreview: () => void }) {
  const { issues, dirty, hasUnpublishedChanges, published, revision, updatedAt, updatedBy, status, save, publish, reload } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const blockers = issues.filter((i) => i.level === 'blocker');
  const warnings = issues.filter((i) => i.level === 'warning');

  const loadHistory = () =>
    adminApi
      .history()
      .then((r) => setHistory(r.versions))
      .catch(() => setHistory([]));
  useEffect(() => {
    void loadHistory();
  }, [published?.publishedAt]);

  const doPublish = async () => {
    const ok = await confirm({
      title: 'Publicar los cambios',
      text: (
        <>
          <p>La web pública se actualizará con el contenido actual del borrador.</p>
          {warnings.length > 0 && (
            <p>
              Hay {warnings.length} dato{warnings.length > 1 ? 's' : ''} pendiente{warnings.length > 1 ? 's' : ''} (no bloquean: lo pendiente no se muestra en la web).
            </p>
          )}
        </>
      ),
      confirmLabel: 'Publicar ahora',
    });
    if (ok) await publish();
  };

  const restore = async (h: HistoryEntry) => {
    if (dirty) {
      toast.show({ kind: 'error', title: 'Tienes cambios sin guardar', text: 'Guárdalos o descártalos antes de restaurar una versión.' });
      return;
    }
    const ok = await confirm({
      title: 'Restaurar versión anterior',
      text: `El borrador se sustituirá por la versión publicada el ${formatDateTime(h.publishedAt)}. La web no cambiará hasta que vuelvas a publicar.`,
      confirmLabel: 'Restaurar en el borrador',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.restore(h.key, revision);
      await reload();
      toast.show({ kind: 'success', title: 'Versión restaurada en el borrador', text: 'Revísala con la vista previa y publica si es correcta.' });
    } catch (e) {
      toast.show({ kind: 'error', title: 'No se pudo restaurar', text: (e as Error).message });
    }
  };

  return (
    <>
      <PageHeader title="Revisar y publicar" intro="1. Edita · 2. Guarda · 3. Revisa la vista previa · 4. Publica · 5. Comprueba la web." />
      <div className="steps-flow">
        <div className={`flow ${dirty ? 'flow--todo' : 'flow--done'}`}>
          <span className="flow__n">1</span>
          <div>
            <strong>Guardar borrador</strong>
            <p>{dirty ? 'Tienes cambios sin guardar.' : `Guardado ${formatDateTime(updatedAt)} por ${updatedBy}.`}</p>
          </div>
          <button type="button" className="abtn abtn--ghost" disabled={!dirty || status === 'saving'} onClick={() => void save()}>
            {status === 'saving' ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        <div className="flow">
          <span className="flow__n">2</span>
          <div>
            <strong>Vista previa</strong>
            <p>Comprueba el borrador tal y como se verá en la web (en una pestaña nueva).</p>
          </div>
          <button type="button" className="abtn abtn--ghost" onClick={onPreview}>
            Abrir vista previa
          </button>
        </div>
        <div className={`flow ${blockers.length ? 'flow--blocked' : hasUnpublishedChanges ? 'flow--todo' : 'flow--done'}`}>
          <span className="flow__n">3</span>
          <div>
            <strong>Publicar</strong>
            <p>
              {blockers.length
                ? 'Corrige lo obligatorio para poder publicar.'
                : hasUnpublishedChanges
                  ? 'Hay cambios pendientes de publicar.'
                  : `Todo publicado (${formatDateTime(published?.publishedAt)}).`}
            </p>
          </div>
          <button type="button" className="abtn abtn--primary" disabled={!!blockers.length || status === 'publishing' || (!hasUnpublishedChanges && !dirty)} onClick={doPublish}>
            {status === 'publishing' ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
        <div className="flow">
          <span className="flow__n">4</span>
          <div>
            <strong>Ver la web publicada</strong>
            <p>Los cambios aparecen sin nuevo despliegue.</p>
          </div>
          <a className="abtn abtn--ghost" href="/" target="_blank" rel="noopener noreferrer">
            Abrir web ↗
          </a>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Obligatorio para publicar">
          <IssueList issues={blockers} empty="Nada bloquea la publicación." />
        </Card>
        <Card title="Pendiente (no se muestra en la web)">
          <IssueList issues={warnings} empty="No hay datos pendientes." />
        </Card>
      </div>

      <Card title="Historial de versiones publicadas" description="Se guardan las 30 últimas publicaciones. Restaurar copia la versión al borrador; la web no cambia hasta que publiques.">
        {history === null ? (
          <p className="muted">Cargando…</p>
        ) : history.length === 0 ? (
          <p className="muted">Todavía no hay versiones anteriores (aparecen a partir de la segunda publicación).</p>
        ) : (
          <ul className="history" role="list">
            {published && (
              <li className="history__row">
                <span>
                  <strong>{formatDateTime(published.publishedAt)}</strong> · {published.publishedBy}
                </span>
                <Badge tone="ok">Versión actual</Badge>
              </li>
            )}
            {history.map((h) => (
              <li key={h.key} className="history__row">
                <span>
                  <strong>{formatDateTime(h.publishedAt)}</strong> · {h.publishedBy}
                </span>
                <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => restore(h)}>
                  Restaurar en el borrador
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
