import { useEffect } from 'react';
import type { Menu, MenuStatus } from '../../../shared/schema.ts';
import { formatPrice } from '../../../shared/format.ts';
import { menuIssues } from '../../../shared/completeness.ts';
import { useStore } from '../store.tsx';
import { Badge, PageHeader, SortableList, useConfirm, useToast } from '../ui.tsx';
import { navigate } from '../router.ts';
import { duplicateMenu, newMenu } from '../menu-factory.ts';

export const STATUS_LABEL: Record<MenuStatus, string> = { published: 'Publicado', draft: 'Borrador', hidden: 'Oculto' };
export const STATUS_TONE: Record<MenuStatus, 'ok' | 'draft' | 'neutral'> = { published: 'ok', draft: 'draft', hidden: 'neutral' };

export function MenusList({ query }: { query: URLSearchParams }) {
  const { content, update } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const menus = [...content.menus].sort((a, b) => a.order - b.order);

  const create = () => {
    const m = newMenu(menus.length);
    update((d) => {
      d.menus.push(m);
    });
    toast.show({ kind: 'info', title: 'Menú creado en borrador', text: 'Complétalo y cámbialo a «Publicado» cuando esté listo.' });
    navigate(`#/menus/${m.id}`);
  };

  useEffect(() => {
    if (query.get('nuevo') === '1') create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reorder = (list: Menu[]) =>
    update((d) => {
      const pos = new Map(list.map((m, i) => [m.id, i]));
      d.menus.forEach((m) => (m.order = pos.get(m.id) ?? m.order));
      d.menus.sort((a, b) => a.order - b.order);
    });

  const setStatus = (id: string, status: MenuStatus) =>
    update((d) => {
      const m = d.menus.find((x) => x.id === id);
      if (m) m.status = status;
    });

  const duplicate = (m: Menu) => {
    const copy = duplicateMenu(m, menus.length);
    update((d) => {
      d.menus.push(copy);
    });
    toast.show({ kind: 'success', title: 'Menú duplicado', text: `«${copy.name}» se ha creado en borrador.` });
  };

  const remove = async (m: Menu) => {
    const ok = await confirm({
      title: `¿Eliminar «${m.name}»?`,
      text: 'Se quitará del borrador. No afectará a la web hasta que publiques, y podrás recuperar versiones publicadas anteriores desde «Publicar → Historial».',
      confirmLabel: 'Eliminar menú',
      danger: true,
    });
    if (!ok) return;
    update((d) => {
      d.menus = d.menus.filter((x) => x.id !== m.id);
      d.menus.forEach((x, i) => (x.order = i));
    });
    toast.show({ kind: 'info', title: 'Menú eliminado del borrador' });
  };

  return (
    <>
      <PageHeader
        title="Menús"
        intro="Crea, ordena y publica los menús. Arrastra para cambiar el orden en la web. Los cambios se aplican al publicar."
        actions={
          <button type="button" className="abtn abtn--primary" onClick={create}>
            + Nuevo menú
          </button>
        }
      />
      {menus.length === 0 ? (
        <p className="empty">Todavía no hay menús. Crea el primero.</p>
      ) : (
        <SortableList
          label="Orden de los menús"
          items={menus}
          onReorder={reorder}
          renderItem={(m, i, handle) => {
            const iss = menuIssues(m).filter((x) => x.level !== 'info');
            return (
              <div className="mrow">
                {handle}
                <span className="mrow__num">{i + 1}</span>
                <div className="mrow__main">
                  <a className="mrow__name" href={`#/menus/${m.id}`}>
                    {m.name || 'Sin nombre'}
                  </a>
                  <div className="mrow__meta">
                    <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                    <span>{m.price.amount !== null ? `${formatPrice(m.price.amount)} ${m.price.unit}` : 'Sin precio'}</span>
                    {!m.price.confirmed && m.price.amount !== null && <Badge tone="warn">Precio por confirmar</Badge>}
                    {iss.length > 0 && <Badge tone="warn">{iss.length} pendiente{iss.length > 1 ? 's' : ''}</Badge>}
                  </div>
                </div>
                <div className="mrow__actions">
                  <a className="abtn abtn--small abtn--primary" href={`#/menus/${m.id}`}>
                    Editar
                  </a>
                  <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => duplicate(m)}>
                    Duplicar
                  </button>
                  {m.status === 'hidden' ? (
                    <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => setStatus(m.id, 'published')}>
                      Mostrar
                    </button>
                  ) : (
                    <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => setStatus(m.id, 'hidden')}>
                      Ocultar
                    </button>
                  )}
                  <button type="button" className="abtn abtn--small abtn--danger-ghost" onClick={() => remove(m)}>
                    Eliminar
                  </button>
                </div>
              </div>
            );
          }}
        />
      )}
      <p className="muted small">
        Estados: <strong>Publicado</strong> aparece en la web · <strong>Borrador</strong> solo en la vista previa (opción «incluir borradores») · <strong>Oculto</strong> no aparece.
      </p>
    </>
  );
}
