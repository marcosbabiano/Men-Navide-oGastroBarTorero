import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/base.css';
import './landing.css';
import type { PublicPayload } from '../../shared/public.ts';
import { HttpError, loadPreviewPayload, loadPublicPayload } from '../lib/api.ts';
import { LandingApp } from './LandingApp.tsx';

// Los correos de Netlify Identity (invitación, recuperación, confirmación) enlazan a la raíz del sitio:
// se reenvían al panel conservando el token.
if (/(?:invite|recovery|confirmation|email_change)_token=/.test(window.location.hash)) {
  window.location.replace(`/admin${window.location.hash}`);
}

const isPreview = window.location.pathname.replace(/\/+$/, '') === '/preview';

function Message({ title, text, link }: { title: string; text: string; link?: { href: string; label: string } }) {
  return (
    <main className="state-screen">
      <h1>{title}</h1>
      <p>{text}</p>
      {link && (
        <a className="btn btn--primary" href={link.href}>
          <span className="btn__label">{link.label}</span>
        </a>
      )}
    </main>
  );
}

function Root() {
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [error, setError] = useState<HttpError | Error | null>(null);
  const [includeDrafts, setIncludeDrafts] = useState(() => new URLSearchParams(location.search).get('drafts') === '1');

  const load = useCallback(async () => {
    try {
      setPayload(isPreview ? await loadPreviewPayload(includeDrafts) : await loadPublicPayload());
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, [includeDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    if (isPreview && error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      return (
        <Message
          title="Vista previa protegida"
          text="Inicia sesión en el panel de administración con un usuario autorizado para ver el borrador."
          link={{ href: '/admin', label: 'Ir al panel' }}
        />
      );
    }
    return (
      <Message
        title="No hemos podido cargar la página"
        text="Comprueba tu conexión y vuelve a intentarlo en unos instantes."
        link={{ href: isPreview ? '/preview' : '/', label: 'Reintentar' }}
      />
    );
  }
  if (!payload) return <div className="loading-screen" aria-busy="true" aria-label="Cargando" />;
  return (
    <LandingApp
      key={isPreview ? `preview-${includeDrafts}` : 'live'}
      payload={payload}
      preview={
        isPreview
          ? {
              includeDrafts,
              onToggle: () => {
                const next = !includeDrafts;
                const url = new URL(location.href);
                if (next) url.searchParams.set('drafts', '1');
                else url.searchParams.delete('drafts');
                history.replaceState(null, '', url);
                setIncludeDrafts(next);
              },
            }
          : undefined
      }
    />
  );
}

if (isPreview) document.title = 'Vista previa · GastroBar Torero';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
