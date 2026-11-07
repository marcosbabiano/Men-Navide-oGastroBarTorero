import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { acceptInvite, getUser, handleAuthCallback, login, logout, requestPasswordRecovery, updateUser } from '@netlify/identity';
import { adminApi, HttpError, type AdminState } from './api.ts';
import { ConfirmProvider, ToastProvider, useConfirm, useToast } from './ui.tsx';
import { StoreProvider, useStore } from './store.tsx';
import { useHashRoute } from './router.ts';
import { Dashboard } from './views/Dashboard.tsx';
import { MenusList } from './views/Menus.tsx';
import { MenuEditor } from './views/MenuEditor.tsx';
import { TextsView } from './views/Texts.tsx';
import { BusinessView } from './views/Business.tsx';
import { MediaView } from './views/Media.tsx';
import { CampaignView } from './views/Campaign.tsx';
import { PublishView } from './views/Publish.tsx';

type Gate =
  | { kind: 'checking' }
  | { kind: 'login'; message?: string }
  | { kind: 'invite'; token: string }
  | { kind: 'recovery' }
  | { kind: 'forbidden'; email: string }
  | { kind: 'ready'; state: AdminState }
  | { kind: 'error'; message: string };

function identityErrorMessage(e: unknown): string {
  const msg = (e as Error)?.message ?? '';
  if (/missing|not available|404|not found/i.test(msg)) {
    return 'Netlify Identity no responde. Comprueba que está activado en el panel de Netlify (Project configuration → Identity).';
  }
  if (/invalid|grant|password|credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/network|fetch/i.test(msg)) return 'No hay conexión con el servidor.';
  return msg || 'Ha ocurrido un error inesperado.';
}

function AuthShell({ title, children, intro }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__card">
        <p className="auth__brand">
          <span>GastroBar</span> Torero
        </p>
        <h1 className="auth__title">{title}</h1>
        {intro && <div className="auth__intro">{intro}</div>}
        {children}
      </div>
      <p className="auth__foot">Panel privado · Navidad · Acceso solo por invitación</p>
    </main>
  );
}

function PasswordForm({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    if (pw !== pw2) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError('');
    try {
      await onSubmit(pw);
    } catch (err) {
      setError(identityErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="auth__form" onSubmit={submit} noValidate>
      <label className="field__label" htmlFor="pw1">
        Nueva contraseña
      </label>
      <input id="pw1" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} />
      <label className="field__label" htmlFor="pw2">
        Repite la contraseña
      </label>
      <input id="pw2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <button className="abtn abtn--primary abtn--block" disabled={busy}>
        {busy ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}

function LoginForm({ onLoggedIn, message }: { onLoggedIn: () => void; message?: string }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState(message ?? '');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), pw);
      onLoggedIn();
    } catch (err) {
      setError(identityErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    if (!email.includes('@')) return setError('Escribe tu correo para enviarte el enlace de recuperación.');
    try {
      await requestPasswordRecovery(email.trim());
      setInfo('Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.');
      setError('');
    } catch (err) {
      setError(identityErrorMessage(err));
    }
  };
  return (
    <form className="auth__form" onSubmit={submit} noValidate>
      <label className="field__label" htmlFor="email">
        Correo electrónico
      </label>
      <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label className="field__label" htmlFor="password">
        Contraseña
      </label>
      <input id="password" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="ok-note" role="status">
          {info}
        </p>
      )}
      <button className="abtn abtn--primary abtn--block" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
      <button type="button" className="linkbtn" onClick={recover}>
        ¿Has olvidado tu contraseña?
      </button>
    </form>
  );
}

const NAV = [
  { href: '#/inicio', key: 'inicio', label: 'Inicio', icon: '◈' },
  { href: '#/menus', key: 'menus', label: 'Menús', icon: '❦' },
  { href: '#/textos', key: 'textos', label: 'Textos', icon: '¶' },
  { href: '#/establecimiento', key: 'establecimiento', label: 'Local', icon: '⌂' },
  { href: '#/multimedia', key: 'multimedia', label: 'Imágenes', icon: '▣' },
  { href: '#/campana', key: 'campana', label: 'Campaña', icon: '✦' },
  { href: '#/publicar', key: 'publicar', label: 'Publicar', icon: '↑' },
];

function Shell({ onLogout, reauth, onReauthed }: { onLogout: () => void; reauth: boolean; onReauthed: () => void }) {
  const store = useStore();
  const { dirty, status, save, publish, issues, user, conflict, reload, discard, hasUnpublishedChanges, updatedAt } = store;
  const route = useHashRoute();
  const confirm = useConfirm();
  const toast = useToast();
  const section = route.path[0] ?? 'inicio';
  const subsection = route.path[1];
  const blockers = issues.filter((i) => i.level === 'blocker').length;
  const pending = issues.filter((i) => i.level === 'warning').length;

  useEffect(() => {
    document.getElementById('admin-main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [section, subsection]);

  const openPreview = useCallback(async () => {
    const w = window.open('about:blank', '_blank');
    if (dirty && !(await save())) {
      w?.close();
      return;
    }
    if (w) w.location.href = '/preview';
    else toast.show({ kind: 'info', title: 'Abre la vista previa', text: 'Tu navegador bloqueó la ventana. Visita /preview.' });
  }, [dirty, save, toast]);

  const quickPublish = async () => {
    if (blockers) {
      location.hash = '#/publicar';
      return;
    }
    const ok = await confirm({ title: '¿Publicar los cambios?', text: 'La web pública mostrará el contenido actual del borrador.', confirmLabel: 'Publicar ahora' });
    if (ok) await publish();
  };

  let view: ReactNode;
  switch (section) {
    case 'menus':
      view = route.path[1] ? <MenuEditor id={route.path[1]} /> : <MenusList query={route.query} />;
      break;
    case 'textos':
      view = <TextsView />;
      break;
    case 'establecimiento':
      view = <BusinessView />;
      break;
    case 'multimedia':
      view = <MediaView />;
      break;
    case 'campana':
      view = <CampaignView />;
      break;
    case 'publicar':
      view = <PublishView onPreview={openPreview} />;
      break;
    default:
      view = <Dashboard onPreview={openPreview} />;
  }

  const statusText =
    status === 'saving'
      ? 'Guardando…'
      : status === 'publishing'
        ? 'Publicando…'
        : dirty
          ? 'Cambios sin guardar'
          : hasUnpublishedChanges
            ? 'Guardado · sin publicar'
            : 'Publicado';
  const statusTone = status === 'saving' || status === 'publishing' ? 'busy' : dirty ? 'dirty' : hasUnpublishedChanges ? 'saved' : 'live';

  return (
    <div className="admin">
      <a href="#admin-main" className="skip-link">
        Saltar al contenido
      </a>
      <aside className="side" aria-label="Secciones del panel">
        <a className="side__brand" href="#/inicio">
          <span>GastroBar</span> Torero
          <small>Panel de Navidad</small>
        </a>
        <nav>
          <ul role="list" className="side__nav">
            {NAV.map((n) => (
              <li key={n.key}>
                <a href={n.href} className={`side__link ${section === n.key ? 'is-active' : ''}`} aria-current={section === n.key ? 'page' : undefined}>
                  <span className="side__icon" aria-hidden="true">
                    {n.icon}
                  </span>
                  {n.label}
                  {n.key === 'publicar' && (blockers > 0 || pending > 0) && (
                    <span className={`side__count ${blockers ? 'is-danger' : ''}`} aria-label={`${blockers + pending} avisos`}>
                      {blockers + pending}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="side__user">
          <span className="side__email">{user.email}</span>
          <button type="button" className="linkbtn" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className={`savestate savestate--${statusTone}`} role="status" aria-live="polite" title={updatedAt}>
            <span className="savestate__dot" aria-hidden="true" />
            {statusText}
          </span>
          <div className="topbar__actions">
            {dirty && (
              <button
                type="button"
                className="abtn abtn--text abtn--small hide-sm"
                onClick={async () => {
                  if (await confirm({ title: '¿Descartar los cambios sin guardar?', confirmLabel: 'Descartar', danger: true })) discard();
                }}
              >
                Descartar
              </button>
            )}
            <button type="button" className="abtn abtn--ghost abtn--small" onClick={openPreview}>
              Vista previa
            </button>
            <button type="button" className="abtn abtn--ghost abtn--small" disabled={!dirty || status !== 'idle' && status !== 'error'} onClick={() => void save()} aria-keyshortcuts="Control+S">
              Guardar
            </button>
            <button type="button" className="abtn abtn--primary abtn--small" disabled={status === 'saving' || status === 'publishing' || (!dirty && !hasUnpublishedChanges)} onClick={quickPublish}>
              Publicar
            </button>
          </div>
        </header>
        {conflict && (
          <div className="banner banner--danger" role="alert">
            <span>Otra persona ha guardado cambios mientras editabas. Recarga para trabajar sobre la última versión (perderás tus cambios no guardados).</span>
            <button
              type="button"
              className="abtn abtn--small abtn--ghost"
              onClick={async () => {
                if (await confirm({ title: '¿Recargar la última versión?', text: 'Se perderán los cambios que no hayas guardado.', confirmLabel: 'Recargar', danger: true })) await reload();
              }}
            >
              Recargar
            </button>
          </div>
        )}
        <main id="admin-main" className="content" tabIndex={-1}>
          {view}
        </main>
      </div>

      <nav className="tabbar" aria-label="Secciones (móvil)">
        {NAV.map((n) => (
          <a key={n.key} href={n.href} className={`tabbar__link ${section === n.key ? 'is-active' : ''}`} aria-current={section === n.key ? 'page' : undefined}>
            <span aria-hidden="true">{n.icon}</span>
            {n.label}
          </a>
        ))}
      </nav>

      {reauth && (
        <div className="reauth" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
          <div className="auth__card">
            <h2 className="auth__title" id="reauth-title">
              Tu sesión ha caducado
            </h2>
            <p className="auth__intro">Vuelve a entrar para continuar. Tus cambios sin guardar se conservan en esta pestaña.</p>
            <LoginForm onLoggedIn={onReauthed} />
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminApp() {
  const [gate, setGate] = useState<Gate>({ kind: 'checking' });
  const [reauth, setReauth] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const state = await adminApi.state();
      setGate({ kind: 'ready', state });
    } catch (e) {
      const err = e as HttpError;
      if (err.status === 401) setGate({ kind: 'login' });
      else if (err.status === 403) {
        const u = await getUser().catch(() => null);
        setGate({ kind: 'forbidden', email: u?.email ?? '' });
      } else setGate({ kind: 'error', message: err.message });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cb = await handleAuthCallback();
        if (cb?.type === 'invite' && cb.token) return setGate({ kind: 'invite', token: cb.token });
        if (cb?.type === 'recovery') return setGate({ kind: 'recovery' });
        if (cb) history.replaceState(null, '', '/admin');
      } catch (e) {
        if (location.hash.includes('_token=')) {
          history.replaceState(null, '', '/admin');
          return setGate({ kind: 'login', message: `El enlace no es válido o ha caducado. ${identityErrorMessage(e)}` });
        }
      }
      const user = await getUser().catch(() => null);
      if (!user) return setGate({ kind: 'login' });
      await loadState();
    })();
  }, [loadState]);

  useEffect(() => {
    const on = () => setReauth(true);
    window.addEventListener('torero:unauthorized', on);
    return () => window.removeEventListener('torero:unauthorized', on);
  }, []);

  const doLogout = async () => {
    await logout().catch(() => undefined);
    setGate({ kind: 'login' });
  };

  switch (gate.kind) {
    case 'checking':
      return (
        <main className="auth" aria-busy="true">
          <p className="muted">Cargando el panel…</p>
        </main>
      );
    case 'login':
      return (
        <AuthShell title="Acceso al panel" intro="Introduce tus credenciales de administrador.">
          <LoginForm onLoggedIn={() => void loadState()} message={gate.message} />
        </AuthShell>
      );
    case 'invite':
      return (
        <AuthShell title="Activa tu cuenta" intro="Has recibido una invitación. Crea tu contraseña para acceder.">
          <PasswordForm
            submitLabel="Crear contraseña y entrar"
            onSubmit={async (pw) => {
              await acceptInvite(gate.token, pw);
              history.replaceState(null, '', '/admin');
              await loadState();
            }}
          />
          <p className="auth__note">Después, un responsable debe asignarte el rol «admin» en Netlify (si no lo ha hecho ya).</p>
        </AuthShell>
      );
    case 'recovery':
      return (
        <AuthShell title="Nueva contraseña" intro="Elige una contraseña nueva para tu cuenta.">
          <PasswordForm
            submitLabel="Guardar y entrar"
            onSubmit={async (pw) => {
              await updateUser({ password: pw });
              history.replaceState(null, '', '/admin');
              await loadState();
            }}
          />
        </AuthShell>
      );
    case 'forbidden':
      return (
        <AuthShell
          title="Sin permisos de administración"
          intro={
            <>
              <p>
                Has entrado como <strong>{gate.email}</strong>, pero tu usuario no tiene el rol <code>admin</code>.
              </p>
              <p>Pide a la persona responsable que te lo asigne en Netlify (Identity → usuario → Roles) y vuelve a entrar.</p>
            </>
          }
        >
          <button type="button" className="abtn abtn--ghost abtn--block" onClick={doLogout}>
            Cerrar sesión
          </button>
        </AuthShell>
      );
    case 'error':
      return (
        <AuthShell title="No se ha podido cargar el panel" intro={gate.message}>
          <button type="button" className="abtn abtn--primary abtn--block" onClick={() => void loadState()}>
            Reintentar
          </button>
        </AuthShell>
      );
    case 'ready':
      return (
        <StoreProvider initial={gate.state}>
          <Shell
            onLogout={doLogout}
            reauth={reauth}
            onReauthed={() => {
              setReauth(false);
            }}
          />
        </StoreProvider>
      );
  }
}

export function AdminRoot() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminApp />
      </ConfirmProvider>
    </ToastProvider>
  );
}
