import type { Draft } from 'immer';
import type { BlockTemplate, BuiltinSection, LayoutSection, SiteContent } from '../../../shared/schema.ts';
import { BLOCK_TEMPLATES, BUILTIN_SECTIONS } from '../../../shared/schema.ts';
import { BUILTIN_INFO, TEMPLATE_INFO, builtinEntry, newCustomBlock, sectionAnchor } from '../../../shared/layout.ts';
import { newId } from '../../../shared/ids.ts';
import { useStore } from '../store.tsx';
import { Badge, Card, PageHeader, Select, SortableList, TextArea, TextField, Toggle, useConfirm, useToast } from '../ui.tsx';
import { ImagePicker } from '../media.tsx';
import { navigate } from '../router.ts';

type Layout = SiteContent['layout'];

/** Dónde se editan los textos de cada sección del sistema. */
function editHref(s: LayoutSection): string {
  if (s.type === 'custom') return `#/secciones/${s.id}`;
  if (s.type === 'menus') return '#/menus';
  return `#/textos?s=${s.type.toLowerCase()}`;
}

const TEMPLATE_GLYPH: Record<BlockTemplate, string> = {
  'image-text': '▣ ≡',
  'text-image': '≡ ▣',
  fullbleed: '▦',
  gallery: '▣▣▣',
  quote: '“ ”',
  divider: '— ✦ —',
  cta: '[ → ]',
  info: 'ⓘ',
};

export function SectionsView() {
  const { content, update } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const sections = content.layout.sections;
  const setLayout = (fn: (l: Draft<Layout>) => void) => update((d) => fn(d.layout));
  const missing = BUILTIN_SECTIONS.filter((t) => !sections.some((s) => s.type === t));

  const toggleVisible = async (s: LayoutSection) => {
    if (s.type !== 'custom' && BUILTIN_INFO[s.type].protection === 'locked') return;
    if (s.visible && s.type === 'howTo') {
      const ok = await confirm({
        title: '¿Ocultar el proceso de reservas?',
        text: 'Los botones de reserva del resto de la web seguirán funcionando, pero desaparecerá la explicación de cómo reservar.',
        confirmLabel: 'Ocultar',
      });
      if (!ok) return;
    }
    setLayout((l) => {
      const x = l.sections.find((y) => y.id === s.id);
      if (x) x.visible = !x.visible;
    });
  };

  const remove = async (s: LayoutSection) => {
    if (s.type !== 'custom' && BUILTIN_INFO[s.type].protection !== 'none') return;
    const ok = await confirm({
      title: `¿Eliminar «${s.label}»?`,
      text:
        s.type === 'custom'
          ? 'El bloque y su contenido se quitarán del borrador. Si solo quieres que no se vea, usa «Ocultar». Podrás recuperarlo desde el historial si ya estaba publicado.'
          : 'La sección se quitará de la web. Sus textos se conservan y podrás volver a añadirla desde «Secciones del sistema eliminadas».',
      confirmLabel: 'Eliminar sección',
      danger: true,
    });
    if (!ok) return;
    setLayout((l) => {
      l.sections = l.sections.filter((x) => x.id !== s.id);
    });
    toast.show({ kind: 'info', title: 'Sección eliminada del borrador', text: 'Guarda y publica para aplicarlo en la web.' });
  };

  const addBlock = (template: BlockTemplate) => {
    const id = newId('bloque');
    const label = `${TEMPLATE_INFO[template].label} ${sections.filter((s) => s.type === 'custom').length + 1}`;
    setLayout((l) => {
      const aboutIdx = l.sections.findIndex((x) => x.type === 'about');
      const entry: LayoutSection = { id, type: 'custom', visible: true, label, navLabel: '', block: newCustomBlock(template) };
      if (aboutIdx >= 0) l.sections.splice(aboutIdx, 0, entry);
      else l.sections.push(entry);
    });
    navigate(`#/secciones/${id}`);
  };

  const restore = (type: BuiltinSection) =>
    setLayout((l) => {
      l.sections.push(builtinEntry(type, content));
    });

  return (
    <>
      <PageHeader
        title="Secciones de la web"
        intro="Ordena las secciones arrastrándolas, muéstralas u ocúltalas y entra a editarlas. «Ocultar» conserva el contenido; «Eliminar» lo quita. Los cambios se aplican al guardar y publicar."
        actions={
          <a className="abtn abtn--ghost" href="#/textos">
            Editar textos
          </a>
        }
      />
      <Card title="Orden y visibilidad" description="🔒 = sección esencial para las reservas: no se puede eliminar.">
        <SortableList
          label="Secciones de la landing"
          items={sections}
          onReorder={(items) => setLayout((l) => void (l.sections = items))}
          renderItem={(s, i, handle) => {
            const info = s.type === 'custom' ? null : BUILTIN_INFO[s.type];
            const locked = info?.protection === 'locked';
            const noDelete = !!info && info.protection !== 'none';
            return (
              <div className={`srow ${s.visible ? '' : 'srow--hidden'}`} data-section={s.type}>
                {handle}
                <span className="mrow__num">{i + 1}</span>
                <div className="srow__main">
                  <a className="mrow__name" href={editHref(s)}>
                    {noDelete && (
                      <span aria-label="Sección protegida" title="Sección protegida">
                        🔒{' '}
                      </span>
                    )}
                    {s.label}
                  </a>
                  <div className="mrow__meta">
                    {s.type === 'custom' ? <Badge tone="info">{TEMPLATE_INFO[s.block!.template].label}</Badge> : <Badge>Sistema</Badge>}
                    {s.visible ? <Badge tone="ok">Visible</Badge> : <Badge tone="warn">Oculta</Badge>}
                    <span className="small muted">{info ? info.description : `#${sectionAnchor(s)}`}</span>
                  </div>
                  <details className="srow__more">
                    <summary>Ajustes</summary>
                    <div className="grid-2">
                      <TextField
                        label="Nombre en el panel"
                        value={s.label}
                        max={60}
                        onChange={(v) => setLayout((l) => void (l.sections[i].label = v))}
                      />
                      <TextField
                        label="Texto en el menú de navegación"
                        value={s.navLabel}
                        max={30}
                        onChange={(v) => setLayout((l) => void (l.sections[i].navLabel = v))}
                        hint="Vacío = no aparece en la navegación."
                      />
                    </div>
                  </details>
                </div>
                <div className="srow__actions">
                  <Toggle
                    label={s.visible ? 'Visible' : 'Oculta'}
                    checked={s.visible}
                    onChange={() => void toggleVisible(s)}
                    hint={locked ? 'Siempre visible' : undefined}
                    disabled={locked}
                  />
                  <a className="abtn abtn--small abtn--primary" href={editHref(s)}>
                    Editar
                  </a>
                  <button
                    type="button"
                    className="abtn abtn--small abtn--danger-ghost"
                    disabled={noDelete}
                    title={noDelete ? 'Sección esencial: no se puede eliminar' : undefined}
                    onClick={() => void remove(s)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          }}
        />
        {missing.length > 0 && (
          <div className="restore">
            <p className="field__label">Secciones del sistema eliminadas</p>
            <div className="chips">
              {missing.map((t) => (
                <button key={t} type="button" className="chip" onClick={() => restore(t)}>
                  + Restaurar «{BUILTIN_INFO[t].label}»
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="Añadir un bloque" description="Plantillas prediseñadas con la estética de la campaña. Se añaden antes de «Información del gastrobar» y puedes moverlas después.">
        <ul className="templates" role="list">
          {BLOCK_TEMPLATES.map((tpl) => (
            <li key={tpl}>
              <button type="button" className="template" onClick={() => addBlock(tpl)}>
                <span className="template__glyph" aria-hidden="true">
                  {TEMPLATE_GLYPH[tpl]}
                </span>
                <strong>{TEMPLATE_INFO[tpl].label}</strong>
                <span>{TEMPLATE_INFO[tpl].description}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function BlockEditor({ id }: { id: string }) {
  const { content, update, fieldErrors } = useStore();
  const confirm = useConfirm();
  const idx = content.layout.sections.findIndex((s) => s.id === id);
  const section = content.layout.sections[idx];
  if (!section || section.type !== 'custom' || !section.block) {
    return (
      <>
        <PageHeader title="Bloque no encontrado" />
        <a className="abtn abtn--ghost" href="#/secciones">
          Volver a secciones
        </a>
      </>
    );
  }
  const b = section.block;
  const set = (fn: (s: Draft<LayoutSection>) => void) => update((d) => fn(d.layout.sections[idx]));
  const err = (p: string) => fieldErrors.find((e) => e.path === `layout.sections.${idx}.${p}`)?.message;
  const maxImages = TEMPLATE_INFO[b.template].images;

  return (
    <>
      <PageHeader
        title={section.label || 'Bloque'}
        intro={<a href="#/secciones">← Todas las secciones</a>}
        actions={
          <button
            type="button"
            className="abtn abtn--danger-ghost"
            onClick={async () => {
              if (await confirm({ title: `¿Eliminar «${section.label}»?`, text: 'Para que deje de verse sin perder el contenido, usa «Visible».', confirmLabel: 'Eliminar', danger: true })) {
                update((d) => void (d.layout.sections = d.layout.sections.filter((s) => s.id !== id)));
                navigate('#/secciones');
              }
            }}
          >
            Eliminar bloque
          </button>
        }
      />
      <div className="grid-2">
        <Card title="Bloque">
          <TextField label="Nombre en el panel" value={section.label} max={60} onChange={(v) => set((s) => void (s.label = v))} />
          <Toggle label="Visible en la web" checked={section.visible} onChange={(v) => set((s) => void (s.visible = v))} />
          <TextField label="Texto en el menú de navegación" value={section.navLabel} max={30} onChange={(v) => set((s) => void (s.navLabel = v))} hint="Vacío = no aparece en la navegación." />
          <Select<BlockTemplate>
            label="Plantilla"
            value={b.template}
            options={BLOCK_TEMPLATES.map((t) => ({ value: t, label: TEMPLATE_INFO[t].label }))}
            onChange={(v) => set((s) => void (s.block!.template = v))}
            hint={TEMPLATE_INFO[b.template].description}
          />
          <Select
            label="Ambiente de color"
            value={b.tone}
            options={[
              { value: 'dark', label: 'Carbón (oscuro)' },
              { value: 'light', label: 'Marfil (claro)' },
              { value: 'burgundy', label: 'Burdeos' },
            ]}
            onChange={(v) => set((s) => void (s.block!.tone = v))}
          />
        </Card>
        <Card title="Botón">
          <TextField label="Texto del botón" value={b.cta.label} max={40} onChange={(v) => set((s) => void (s.block!.cta.label = v))} hint="Vacío = sin botón." />
          <TextField
            label="Enlace"
            value={b.cta.href}
            max={600}
            onChange={(v) => set((s) => void (s.block!.cta.href = v.trim()))}
            error={err('block.cta.href')}
            hint="Vacío = plataforma de reservas. También: https://…, #menus, tel:+34… o mailto:…"
          />
        </Card>
      </div>
      <Card title="Textos" description="Admite {telefono}, {direccion}, {año}, {precioDesde} y {nombre}. Separa párrafos con una línea en blanco.">
        <TextField label="Antetítulo" value={b.eyebrow} max={60} onChange={(v) => set((s) => void (s.block!.eyebrow = v))} />
        <TextArea label={b.template === 'quote' ? 'Frase destacada' : 'Título'} value={b.title} max={160} rows={2} onChange={(v) => set((s) => void (s.block!.title = v))} />
        <TextField label={b.template === 'quote' ? 'Firma' : 'Subtítulo'} value={b.subtitle} max={240} onChange={(v) => set((s) => void (s.block!.subtitle = v))} />
        {!['quote', 'divider'].includes(b.template) && (
          <TextArea label="Texto" value={b.body} max={1500} rows={5} onChange={(v) => set((s) => void (s.block!.body = v))} />
        )}
      </Card>
      {maxImages > 0 && (
        <Card title="Imágenes" description="Usa la biblioteca de imágenes del panel (o sube nuevas desde aquí mismo).">
          <div className="gallery-edit">
            {b.images.slice(0, maxImages).map((img, i) => (
              <ImagePicker
                key={`${img.asset}-${i}`}
                label={`Imagen ${i + 1}`}
                value={img}
                nullable
                folder={b.template === 'divider' ? 'ornamentos' : 'ilustraciones'}
                onChange={(v) => set((s) => (v ? void (s.block!.images[i] = v) : void s.block!.images.splice(i, 1)))}
              />
            ))}
            {b.images.length < maxImages && (
              <ImagePicker
                label={b.images.length ? 'Añadir imagen' : b.template === 'divider' ? 'Ornamento (opcional)' : 'Imagen'}
                value={null}
                folder={b.template === 'divider' ? 'ornamentos' : 'ilustraciones'}
                onChange={(v) => v && set((s) => void s.block!.images.push(v))}
              />
            )}
          </div>
        </Card>
      )}
    </>
  );
}
