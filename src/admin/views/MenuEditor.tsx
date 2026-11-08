import type { ReactNode } from 'react';
import type { Draft } from 'immer';
import type { Menu, MenuSection, MenuTheme, SectionKind, SiteContent } from '../../../shared/schema.ts';
import { menuIssues } from '../../../shared/completeness.ts';
import { useStore } from '../store.tsx';
import { Card, Field, PageHeader, PriceField, Segmented, Select, SortableList, TextArea, TextField, Toggle, useConfirm, useToast } from '../ui.tsx';
import { ImagePicker } from '../media.tsx';
import { IssueList } from './Dashboard.tsx';
import { KIND_OPTIONS, duplicateMenu, newItem, newSection } from '../menu-factory.ts';
import { navigate } from '../router.ts';

const THEMES: { value: MenuTheme; label: string }[] = [
  { value: 'ivory', label: 'Marfil (papel claro)' },
  { value: 'noir', label: 'Noche (oscuro con oro)' },
  { value: 'burgundy', label: 'Burdeos' },
  { value: 'forest', label: 'Verde abeto' },
  { value: 'gourmet', label: 'Gourmet (burdeos noche con oro)' },
];

function SectionEditor({
  section,
  menuIdx,
  secIdx,
  handle,
  onRemove,
}: {
  section: MenuSection;
  menuIdx: number;
  secIdx: number;
  handle: ReactNode;
  onRemove: () => void;
}) {
  const { update } = useStore();
  const set = (fn: (s: Draft<MenuSection>) => void) =>
    update((d) => {
      fn(d.menus[menuIdx].sections[secIdx]);
    });
  const kindInfo = KIND_OPTIONS.find((k) => k.value === section.kind);
  return (
    <div className={`sec ${section.pending ? 'sec--pending' : ''}`}>
      <div className="sec__head">
        {handle}
        <strong className="sec__title">{section.title || kindInfo?.title}</strong>
        <span className="sec__kind">{kindInfo?.label}</span>
        <button type="button" className="abtn abtn--small abtn--danger-ghost sec__remove" onClick={onRemove}>
          Quitar grupo
        </button>
      </div>
      <div className="sec__grid">
        <Select<SectionKind>
          label="Tipo de sección"
          value={section.kind}
          options={KIND_OPTIONS.map((k) => ({ value: k.value, label: k.label }))}
          onChange={(v) => set((s) => void (s.kind = v))}
          hint={
            section.kind === 'shared'
              ? 'Se muestran como platos para el centro de la mesa, nunca como alternativas.'
              : section.kind === 'choice'
                ? 'Se muestran como opciones: cada comensal elige una.'
                : undefined
          }
        />
        <TextField label="Título" value={section.title} max={80} onChange={(v) => set((s) => void (s.title = v))} />
        <TextField label="Indicación" value={section.hint} max={160} onChange={(v) => set((s) => void (s.hint = v))} hint="Ej.: «Para compartir en el centro de la mesa»." />
      </div>
      {section.kind === 'choice' && (
        <Field label="Opciones que elige cada comensal" hint="Normalmente 1. Si es más de 1, la web lo indica («Elige 2»).">
          {(fid, d) => (
            <input
              id={fid}
              aria-describedby={d}
              className="input input--small"
              type="number"
              min={1}
              max={Math.max(1, Math.min(10, section.items.length || 1))}
              value={section.choose}
              onChange={(e) => set((s) => void (s.choose = Math.min(10, Math.max(1, Math.round(Number(e.target.value) || 1)))))}
              style={{ maxWidth: '8rem' }}
            />
          )}
        </Field>
      )}
      <Toggle
        label="Pendiente de confirmar"
        tone="warn"
        checked={section.pending}
        onChange={(v) => set((s) => void (s.pending = v))}
        hint="Mientras esté activado, esta sección NO aparece en la web (ni en la comparativa)."
      />
      <SortableList
        label={`Platos de ${section.title}`}
        items={section.items}
        onReorder={(items) => set((s) => void (s.items = items))}
        renderItem={(item, i, h) => (
          <div className="dish">
            {h}
            <div className="dish__fields">
              <TextField label={`Plato ${i + 1}`} value={item.name} max={120} onChange={(v) => set((s) => void (s.items[i].name = v))} placeholder="Nombre del plato" />
              <TextField label="Cantidad" value={item.quantity} max={80} onChange={(v) => set((s) => void (s.items[i].quantity = v))} placeholder="Ej.: 3 por persona" />
              <TextField label="Descripción" value={item.detail} max={300} onChange={(v) => set((s) => void (s.items[i].detail = v))} placeholder="Solo datos confirmados" />
              <TextField label="Observación" value={item.note} max={200} onChange={(v) => set((s) => void (s.items[i].note = v))} />
              <Toggle
                label="Cantidad pendiente de confirmar"
                tone="warn"
                checked={item.quantityPending}
                onChange={(v) => set((s) => void (s.items[i].quantityPending = v))}
                hint="La cantidad no se mostrará en la web hasta desactivarlo."
              />
            </div>
            <button type="button" className="abtn abtn--small abtn--danger-ghost dish__remove" aria-label={`Quitar ${item.name || 'plato'}`} onClick={() => set((s) => void s.items.splice(i, 1))}>
              Quitar
            </button>
          </div>
        )}
      />
      <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => set((s) => void s.items.push(newItem()))}>
        + Añadir plato
      </button>
    </div>
  );
}

export function MenuEditor({ id }: { id: string }) {
  const { content, update } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const idx = content.menus.findIndex((m) => m.id === id);
  if (idx < 0) {
    return (
      <>
        <PageHeader title="Menú no encontrado" />
        <a className="abtn abtn--ghost" href="#/menus">
          Volver a menús
        </a>
      </>
    );
  }
  const menu = content.menus[idx];
  const set = (fn: (m: Draft<Menu>, d: Draft<SiteContent>) => void) => update((d) => fn(d.menus[idx], d));
  const issues = menuIssues(menu);

  const removeSection = async (sIdx: number) => {
    const s = menu.sections[sIdx];
    const ok = await confirm({ title: `¿Quitar el grupo «${s.title}»?`, text: `Se eliminarán sus ${s.items.length} platos del borrador.`, confirmLabel: 'Quitar grupo', danger: true });
    if (ok) set((m) => void m.sections.splice(sIdx, 1));
  };

  return (
    <>
      <PageHeader
        title={menu.name || 'Menú sin nombre'}
        intro={<a href="#/menus">← Todos los menús</a>}
        actions={
          <>
            <button
              type="button"
              className="abtn abtn--ghost"
              onClick={() => {
                const copy = duplicateMenu(menu, content.menus.length);
                update((d) => void d.menus.push(copy));
                toast.show({ kind: 'success', title: 'Menú duplicado', text: 'Editando la copia (en borrador).' });
                navigate(`#/menus/${copy.id}`);
              }}
            >
              Duplicar
            </button>
            <button
              type="button"
              className="abtn abtn--danger-ghost"
              onClick={async () => {
                if (await confirm({ title: `¿Eliminar «${menu.name}»?`, text: 'Se quitará del borrador. La web no cambia hasta que publiques.', confirmLabel: 'Eliminar', danger: true })) {
                  update((d) => {
                    d.menus = d.menus.filter((m) => m.id !== id);
                    d.menus.forEach((m, i) => (m.order = i));
                  });
                  navigate('#/menus');
                }
              }}
            >
              Eliminar
            </button>
          </>
        }
      />

      <Card title="Visibilidad" tone={issues.some((i) => i.level === 'blocker') ? 'warn' : undefined}>
        <Segmented
          label="Estado del menú"
          value={menu.status}
          onChange={(v) => set((m) => void (m.status = v))}
          options={[
            { value: 'draft', label: 'Borrador', tone: 'draft' },
            { value: 'published', label: 'Publicado', tone: 'ok' },
            { value: 'hidden', label: 'Oculto' },
          ]}
        />
        <p className="muted small">«Publicado» hace que el menú aparezca en la web la próxima vez que pulses «Publicar».</p>
        <h3 className="subhead">Antes de publicar</h3>
        <IssueList issues={issues} empty="Este menú está completo." />
      </Card>

      <div className="grid-2">
        <Card title="Datos del menú">
          <TextField label="Nombre comercial" value={menu.name} max={80} onChange={(v) => set((m) => void (m.name = v))} hint="Ej.: «Menú Esencia». Si empieza por «Menú», la web lo destaca tipográficamente." />
          <TextField label="Nombre interno / original" value={menu.originalName} max={80} onChange={(v) => set((m) => void (m.originalName = v))} hint="Solo para el equipo (no se muestra)." />
          <TextField label="Subtítulo" value={menu.subtitle} max={160} onChange={(v) => set((m) => void (m.subtitle = v))} />
          <TextArea label="Descripción" value={menu.description} max={700} rows={4} onChange={(v) => set((m) => void (m.description = v))} />
          <TextField label="Etiqueta opcional" value={menu.tag} max={40} onChange={(v) => set((m) => void (m.tag = v))} hint="Ej.: «Novedad». Vacío = sin etiqueta." />
          <Select<MenuTheme> label="Identidad visual" value={menu.theme} options={THEMES} onChange={(v) => set((m) => void (m.theme = v))} />
        </Card>
        <Card title="Precio">
          <PriceField label="Precio" value={menu.price.amount} onChange={(v) => set((m) => void (m.price.amount = v))} hint="Vacío = sin precio (no se puede publicar)." />
          <TextField label="Unidad" value={menu.price.unit} max={40} onChange={(v) => set((m) => void (m.price.unit = v))} hint="Ej.: «por persona»." />
          <Toggle label="Precio confirmado" checked={menu.price.confirmed} onChange={(v) => set((m) => void (m.price.confirmed = v))} hint="Control interno: mientras no esté confirmado aparecerá como pendiente en el panel." />
          <TextField label="Nota del precio" value={menu.price.note} max={160} onChange={(v) => set((m) => void (m.price.note = v))} hint="Solo información confirmada (p. ej. sobre IVA)." />
        </Card>
      </div>

      <Card title="Imágenes">
        <ImagePicker label="Imagen principal" value={menu.image} nullable folder="platos" onChange={(v) => set((m) => void (m.image = v))} />
        <h3 className="subhead">Galería (opcional, hasta 8)</h3>
        <div className="gallery-edit">
          {menu.gallery.map((g, i) => (
            <div key={`${g.asset}-${i}`} className="gallery-edit__item">
              <ImagePicker label={`Imagen ${i + 1}`} value={g} nullable folder="platos" onChange={(v) => set((m) => (v ? void (m.gallery[i] = v) : void m.gallery.splice(i, 1)))} />
            </div>
          ))}
        </div>
        {menu.gallery.length < 8 && (
          <ImagePicker label="Añadir imagen a la galería" value={null} folder="platos" onChange={(v) => v && set((m) => void m.gallery.push(v))} />
        )}
      </Card>

      <Card title="Platos" description="Cada grupo es «para compartir» o «a elegir» (por ejemplo, Primer plato y Segundo plato como grupos distintos). Arrastra grupos y platos para reordenarlos. No añadas ingredientes, cantidades ni acompañamientos sin confirmar.">
        <SortableList
          label="Secciones del menú"
          items={menu.sections}
          onReorder={(sections) => set((m) => void (m.sections = sections))}
          renderItem={(s, sIdx, handle) => <SectionEditor section={s} menuIdx={idx} secIdx={sIdx} handle={handle} onRemove={() => removeSection(sIdx)} />}
        />
        <div className="add-row">
          <span className="muted small">Añadir grupo de platos:</span>
          {KIND_OPTIONS.map((k) => (
            <button key={k.value} type="button" className="abtn abtn--ghost abtn--small" onClick={() => set((m) => void m.sections.push(newSection(k.value)))}>
              + {k.add}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Condiciones adicionales" description="Solo condiciones confirmadas por el establecimiento.">
          {menu.conditions.map((c, i) => (
            <div key={i} className="inline-row">
              <TextField label={`Condición ${i + 1}`} value={c} max={240} onChange={(v) => set((m) => void (m.conditions[i] = v))} />
              <button type="button" className="abtn abtn--small abtn--danger-ghost" onClick={() => set((m) => void m.conditions.splice(i, 1))}>
                Quitar
              </button>
            </div>
          ))}
          <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => set((m) => void m.conditions.push(''))}>
            + Añadir condición
          </button>
        </Card>
        <Card title="Botón de reserva">
          <TextField label="Texto del botón" value={menu.cta.label} max={60} onChange={(v) => set((m) => void (m.cta.label = v))} />
          <TextArea label="Texto auxiliar" value={menu.cta.helper} max={200} rows={2} onChange={(v) => set((m) => void (m.cta.helper = v))} hint="Opcional. Admite {telefono}." />
        </Card>
      </div>

      <Card title="Notas internas" description="Solo visibles en el panel. Nunca se publican.">
        <TextArea label="Notas" value={menu.adminNotes} max={1500} rows={4} onChange={(v) => set((m) => void (m.adminNotes = v))} />
      </Card>
      <p className="muted small">Identificador interno: {menu.id}</p>
    </>
  );
}
