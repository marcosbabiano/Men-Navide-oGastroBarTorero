import { useStore } from '../store.tsx';
import { Badge, Card, PageHeader, formatDateTime } from '../ui.tsx';
import { navigate } from '../router.ts';
import { formatPrice } from '../../../shared/format.ts';
import type { ContentIssue } from '../../../shared/completeness.ts';

const AREA_LINK: Record<ContentIssue['area'], string> = {
  menus: '#/menus',
  establecimiento: '#/establecimiento',
  campana: '#/campana',
  textos: '#/textos',
  multimedia: '#/multimedia',
  secciones: '#/secciones',
};

export function IssueList({ issues, empty }: { issues: ContentIssue[]; empty?: string }) {
  if (!issues.length) return <p className="muted">{empty ?? 'Nada pendiente.'}</p>;
  const order = { blocker: 0, warning: 1, info: 2 };
  return (
    <ul className="issues" role="list">
      {[...issues]
        .sort((a, b) => order[a.level] - order[b.level])
        .map((i, k) => (
          <li key={k} className={`issue issue--${i.level}`}>
            <span className="issue__dot" aria-hidden="true" />
            <span className="sr-only">{i.level === 'blocker' ? 'Obligatorio: ' : i.level === 'warning' ? 'Pendiente: ' : 'Aviso: '}</span>
            <a href={i.menuId ? `#/menus/${i.menuId}` : AREA_LINK[i.area]}>{i.message}</a>
          </li>
        ))}
    </ul>
  );
}

export function Dashboard({ onPreview }: { onPreview: () => void }) {
  const { content, issues, published, updatedAt, updatedBy, hasUnpublishedChanges, dirty, user } = useStore();
  const menus = [...content.menus].sort((a, b) => a.order - b.order);
  const pub = menus.filter((m) => m.status === 'published');
  const drafts = menus.filter((m) => m.status === 'draft');
  const hidden = menus.filter((m) => m.status === 'hidden');
  const blockers = issues.filter((i) => i.level === 'blocker');
  const warnings = issues.filter((i) => i.level !== 'info');

  return (
    <>
      <PageHeader
        title={`Hola${user.email ? `, ${user.email.split('@')[0]}` : ''}`}
        intro="Resumen de la web de Navidad. Edita, revisa la vista previa y publica cuando esté listo."
        actions={
          <>
            <button type="button" className="abtn abtn--ghost" onClick={onPreview}>
              Vista previa
            </button>
            <a className="abtn abtn--ghost" href="/" target="_blank" rel="noopener noreferrer">
              Ver web publicada ↗
            </a>
          </>
        }
      />

      <div className="stats">
        <a className="stat" href="#/menus">
          <span className="stat__num">{pub.length}</span>
          <span className="stat__label">Menús publicados</span>
          <span className="stat__list">{pub.map((m) => m.name).join(' · ') || '—'}</span>
        </a>
        <a className="stat" href="#/menus">
          <span className="stat__num">{drafts.length}</span>
          <span className="stat__label">En borrador</span>
          <span className="stat__list">{drafts.map((m) => m.name).join(' · ') || '—'}</span>
        </a>
        <a className="stat" href="#/menus">
          <span className="stat__num">{hidden.length}</span>
          <span className="stat__label">Ocultos</span>
          <span className="stat__list">{hidden.map((m) => m.name).join(' · ') || '—'}</span>
        </a>
        <a className={`stat ${warnings.length ? 'stat--warn' : 'stat--ok'}`} href="#/publicar">
          <span className="stat__num">{warnings.length}</span>
          <span className="stat__label">Datos pendientes</span>
          <span className="stat__list">{blockers.length ? `${blockers.length} impiden publicar` : 'Ninguno impide publicar'}</span>
        </a>
      </div>

      <div className="grid-2">
        <Card title="Estado de la página">
          <dl className="kv">
            <div>
              <dt>Campaña</dt>
              <dd>{content.campaign.active ? <Badge tone="ok">Activa</Badge> : <Badge tone="warn">Desactivada</Badge>}</dd>
            </div>
            <div>
              <dt>Última publicación</dt>
              <dd>{published ? `${formatDateTime(published.publishedAt)} · ${published.publishedBy}` : <Badge tone="warn">Aún no se ha publicado desde el panel</Badge>}</dd>
            </div>
            <div>
              <dt>Último guardado del borrador</dt>
              <dd>
                {formatDateTime(updatedAt)} · {updatedBy}
              </dd>
            </div>
            <div>
              <dt>Cambios</dt>
              <dd>
                {dirty ? (
                  <Badge tone="warn">Sin guardar</Badge>
                ) : hasUnpublishedChanges ? (
                  <Badge tone="info">Guardados, sin publicar</Badge>
                ) : (
                  <Badge tone="ok">Todo publicado</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt>Reservas</dt>
              <dd>
                <a href={content.booking.url} target="_blank" rel="noopener noreferrer" className="link">
                  {content.booking.url.replace(/^https:\/\//, '')} ↗
                </a>
              </dd>
            </div>
          </dl>
          <p className="muted small">El panel no muestra estadísticas de visitas ni de reservas: la web no usa analítica y las reservas se gestionan en la plataforma externa.</p>
        </Card>

        <Card title="Información pendiente de completar" description="Pulsa un aviso para ir a corregirlo.">
          <IssueList issues={issues} empty="¡Todo completo!" />
        </Card>
      </div>

      <Card title="Accesos rápidos">
        <div className="quick">
          {menus.map((m) => (
            <a key={m.id} className="quick__item" href={`#/menus/${m.id}`}>
              <strong>{m.name}</strong>
              <span>
                {m.price.amount !== null ? formatPrice(m.price.amount) : 'Sin precio'} · {m.status === 'published' ? 'Publicado' : m.status === 'draft' ? 'Borrador' : 'Oculto'}
              </span>
            </a>
          ))}
          <button type="button" className="quick__item quick__item--new" onClick={() => navigate('#/menus?nuevo=1')}>
            <strong>+ Nuevo menú</strong>
            <span>Crear el tercer menú u otros</span>
          </button>
          <a className="quick__item" href="#/textos">
            <strong>Textos</strong>
            <span>Titulares, secciones, FAQ</span>
          </a>
          <a className="quick__item" href="#/establecimiento">
            <strong>Establecimiento</strong>
            <span>Dirección, teléfono, horarios</span>
          </a>
          <a className="quick__item" href="#/multimedia">
            <strong>Imágenes</strong>
            <span>Subir y gestionar fotos</span>
          </a>
          <a className="quick__item" href="#/campana">
            <strong>Campaña y SEO</strong>
            <span>Colores, logo, redes sociales</span>
          </a>
        </div>
      </Card>
    </>
  );
}
