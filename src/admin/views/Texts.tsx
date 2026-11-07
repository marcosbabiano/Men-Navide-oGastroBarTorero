import { useEffect, useRef, type ReactNode } from 'react';
import { useHashRoute } from '../router.ts';
import type { Draft } from 'immer';
import type { SiteContent } from '../../../shared/schema.ts';
import { newId } from '../../../shared/ids.ts';
import { useStore } from '../store.tsx';
import { PageHeader, SortableList, TextArea, TextField, useConfirm } from '../ui.tsx';
import { ImagePicker } from '../media.tsx';

type Texts = SiteContent['texts'];

function Group({ title, children, open = false, id }: { title: string; children: ReactNode; open?: boolean; id: string }) {
  const { query } = useHashRoute();
  const target = query.get('s') === id.replace(/^g-/, '');
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (target && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ block: 'start' });
    }
  }, [target]);
  return (
    <details className="group" open={open || target} id={id} ref={ref}>
      <summary className="group__summary">
        <span>{title}</span>
        <span className="group__chev" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="group__body">{children}</div>
    </details>
  );
}

const PLACEHOLDERS = (
  <>
    Puedes usar <code>{'{telefono}'}</code>, <code>{'{direccion}'}</code>, <code>{'{año}'}</code>, <code>{'{precioDesde}'}</code> y <code>{'{nombre}'}</code>: se sustituyen automáticamente.
  </>
);

export function TextsView() {
  const { content, update, fieldErrors } = useStore();
  const confirm = useConfirm();
  const t = content.texts;
  const set = (fn: (t: Draft<Texts>) => void) => update((d) => fn(d.texts));
  const err = (path: string) => fieldErrors.find((e) => e.path === path)?.message;

  const F = (label: string, path: string, value: string, apply: (t: Draft<Texts>, v: string) => void, max: number, area = false, hint?: ReactNode) =>
    area ? (
      <TextArea label={label} value={value} max={max} rows={3} onChange={(v) => set((x) => apply(x, v))} error={err(`texts.${path}`)} hint={hint} />
    ) : (
      <TextField label={label} value={value} max={max} onChange={(v) => set((x) => apply(x, v))} error={err(`texts.${path}`)} hint={hint} />
    );

  return (
    <>
      <PageHeader title="Textos de la web" intro={<>Edita cualquier texto sin tocar código. {PLACEHOLDERS}</>} />

      <Group title="Portada (hero)" id="g-hero" open>
        {F('Antetítulo', 'hero.eyebrow', t.hero.eyebrow, (x, v) => void (x.hero.eyebrow = v), 120)}
        <div className="grid-3">
          {F('Titular · inicio', 'hero.titleLead', t.hero.titleLead, (x, v) => void (x.hero.titleLead = v), 60)}
          {F('Titular · principal', 'hero.titleMain', t.hero.titleMain, (x, v) => void (x.hero.titleMain = v), 60)}
          {F('Titular · destacado', 'hero.titleAccent', t.hero.titleAccent, (x, v) => void (x.hero.titleAccent = v), 60)}
        </div>
        {F('Subtítulo', 'hero.subtitle', t.hero.subtitle, (x, v) => void (x.hero.subtitle = v), 320, true)}
        <div className="grid-3">
          {F('Botón principal', 'hero.primaryCta', t.hero.primaryCta, (x, v) => void (x.hero.primaryCta = v), 40)}
          {F('Botón secundario (reserva)', 'hero.secondaryCta', t.hero.secondaryCta, (x, v) => void (x.hero.secondaryCta = v), 40)}
          {F('Indicador de desplazamiento', 'hero.scrollHint', t.hero.scrollHint, (x, v) => void (x.hero.scrollHint = v), 30)}
        </div>
        {F('Texto lateral (escritorio)', 'hero.sideNote', t.hero.sideNote, (x, v) => void (x.hero.sideNote = v), 80)}
        <ImagePicker label="Imagen de portada" value={t.hero.image} folder="portada" onChange={(v) => v && set((x) => void (x.hero.image = v))} hint="Recomendado: horizontal, oscura y cálida, mínimo 2000 px de ancho." />
      </Group>

      <Group title="Introducción animada" id="g-intro">
        {F('Línea bajo el nombre', 'intro.line', t.intro.line, (x, v) => void (x.intro.line = v), 80)}
        {F('Botón «saltar»', 'intro.skip', t.intro.skip, (x, v) => void (x.intro.skip = v), 30)}
        <p className="muted small">La introducción se activa o desactiva en «Campaña».</p>
      </Group>

      <Group title="Navegación" id="g-nav">
        <div className="grid-3">
          {F('La Navidad', 'nav.story', t.nav.story, (x, v) => void (x.nav.story = v), 30)}
          {F('Menús', 'nav.menus', t.nav.menus, (x, v) => void (x.nav.menus = v), 30)}
          {F('Comparar', 'nav.compare', t.nav.compare, (x, v) => void (x.nav.compare = v), 30)}
          {F('Reservar', 'nav.howTo', t.nav.howTo, (x, v) => void (x.nav.howTo = v), 30)}
          {F('Preguntas', 'nav.faq', t.nav.faq, (x, v) => void (x.nav.faq = v), 30)}
          {F('Contacto', 'nav.contact', t.nav.contact, (x, v) => void (x.nav.contact = v), 30)}
        </div>
        {F('Botón de reserva (navegación y general)', 'nav.book', t.nav.book, (x, v) => void (x.nav.book = v), 30)}
        <div className="grid-2">
          {F('Barra móvil · texto', 'mobileBar.label', t.mobileBar.label, (x, v) => void (x.mobileBar.label = v), 40, false, 'Se muestra junto al precio más bajo.')}
          {F('Barra móvil · botón', 'mobileBar.cta', t.mobileBar.cta, (x, v) => void (x.mobileBar.cta = v), 30)}
        </div>
      </Group>

      <Group title="La Navidad se comparte" id="g-story">
        {F('Antetítulo', 'story.eyebrow', t.story.eyebrow, (x, v) => void (x.story.eyebrow = v), 60)}
        {F('Título', 'story.title', t.story.title, (x, v) => void (x.story.title = v), 140, true)}
        {F('Entradilla destacada', 'story.lead', t.story.lead, (x, v) => void (x.story.lead = v), 500, true)}
        {t.story.body.map((p, i) => (
          <div key={i} className="inline-row">
            <TextArea label={`Párrafo ${i + 1}`} value={p} max={800} rows={3} onChange={(v) => set((x) => void (x.story.body[i] = v))} />
            <button type="button" className="abtn abtn--small abtn--danger-ghost" onClick={() => set((x) => void x.story.body.splice(i, 1))}>
              Quitar
            </button>
          </div>
        ))}
        {t.story.body.length < 4 && (
          <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => set((x) => void x.story.body.push(''))}>
            + Añadir párrafo
          </button>
        )}
        {F('Frase destacada', 'story.quote', t.story.quote, (x, v) => void (x.story.quote = v), 200)}
        <div className="grid-2">
          {t.story.images.map((img, i) => (
            <ImagePicker key={i} label={`Imagen ${i + 1}`} value={img} nullable folder="ambiente" onChange={(v) => set((x) => (v ? void (x.story.images[i] = v) : void x.story.images.splice(i, 1)))} />
          ))}
          {t.story.images.length < 2 && <ImagePicker label="Añadir imagen" value={null} folder="ambiente" onChange={(v) => v && set((x) => void x.story.images.push(v))} />}
        </div>
      </Group>

      <Group title="Sección de menús" id="g-menus">
        {F('Antetítulo', 'menus.eyebrow', t.menus.eyebrow, (x, v) => void (x.menus.eyebrow = v), 60)}
        {F('Título', 'menus.title', t.menus.title, (x, v) => void (x.menus.title = v), 120)}
        {F('Introducción', 'menus.intro', t.menus.intro, (x, v) => void (x.menus.intro = v), 400, true)}
        <div className="grid-2">
          {F('Palabra entre platos a elegir', 'menus.choiceJoiner', t.menus.choiceJoiner, (x, v) => void (x.menus.choiceJoiner = v), 10, false, 'Normalmente «o».')}
          {F('Aviso de imágenes ilustrativas', 'menus.illustrativeNote', t.menus.illustrativeNote, (x, v) => void (x.menus.illustrativeNote = v), 120)}
        </div>
        {F('Mensaje si no hay menús publicados', 'menus.emptyMessage', t.menus.emptyMessage, (x, v) => void (x.menus.emptyMessage = v), 200, true)}
      </Group>

      <Group title="Comparativa" id="g-compare">
        <p className="muted small">
          Se genera automáticamente con los menús publicados (necesita al menos dos). Para mostrarla u ocultarla usa <a href="#/secciones">Secciones</a>.
        </p>
        {F('Antetítulo', 'compare.eyebrow', t.compare.eyebrow, (x, v) => void (x.compare.eyebrow = v), 60)}
        {F('Título', 'compare.title', t.compare.title, (x, v) => void (x.compare.title = v), 120)}
        {F('Introducción', 'compare.intro', t.compare.intro, (x, v) => void (x.compare.intro = v), 300, true)}
        <div className="grid-3">
          {F('Texto si falta un dato', 'compare.pendingLabel', t.compare.pendingLabel, (x, v) => void (x.compare.pendingLabel = v), 60)}
          {F('Leyenda de platos comunes', 'compare.commonLabel', t.compare.commonLabel, (x, v) => void (x.compare.commonLabel = v), 60)}
          {F('Etiqueta de precio', 'compare.priceLabel', t.compare.priceLabel, (x, v) => void (x.compare.priceLabel = v), 40)}
        </div>
      </Group>

      <Group title="Una celebración a tu medida" id="g-celebration">
        {F('Antetítulo', 'celebration.eyebrow', t.celebration.eyebrow, (x, v) => void (x.celebration.eyebrow = v), 60)}
        {F('Título', 'celebration.title', t.celebration.title, (x, v) => void (x.celebration.title = v), 140)}
        {F('Texto', 'celebration.body', t.celebration.body, (x, v) => void (x.celebration.body = v), 600, true, 'No menciones servicios o espacios que no estén confirmados.')}
        {F('Botón', 'celebration.cta', t.celebration.cta, (x, v) => void (x.celebration.cta = v), 40)}
        <p className="field__label">Palabras de la banda animada</p>
        <div className="chips">
          {t.celebration.moments.map((w, i) => (
            <span key={i} className="chip chip--edit">
              <input aria-label={`Palabra ${i + 1}`} value={w} maxLength={40} onChange={(e) => set((x) => void (x.celebration.moments[i] = e.target.value))} />
              <button type="button" aria-label={`Quitar ${w}`} onClick={() => set((x) => void x.celebration.moments.splice(i, 1))}>
                ×
              </button>
            </span>
          ))}
          {t.celebration.moments.length < 8 && (
            <button type="button" className="chip" onClick={() => set((x) => void x.celebration.moments.push('Nueva'))}>
              + Añadir
            </button>
          )}
        </div>
        <div className="grid-3">
          {t.celebration.images.map((img, i) => (
            <ImagePicker key={i} label={i === 0 ? 'Imagen de fondo' : `Imagen ${i + 1}`} value={img} nullable folder="ambiente" onChange={(v) => set((x) => (v ? void (x.celebration.images[i] = v) : void x.celebration.images.splice(i, 1)))} />
          ))}
          {t.celebration.images.length < 3 && <ImagePicker label="Añadir imagen" value={null} folder="ambiente" onChange={(v) => v && set((x) => void x.celebration.images.push(v))} />}
        </div>
      </Group>

      <Group title="Cómo reservar" id="g-howto">
        {F('Antetítulo', 'howTo.eyebrow', t.howTo.eyebrow, (x, v) => void (x.howTo.eyebrow = v), 60)}
        {F('Título', 'howTo.title', t.howTo.title, (x, v) => void (x.howTo.title = v), 120)}
        {F('Introducción', 'howTo.intro', t.howTo.intro, (x, v) => void (x.howTo.intro = v), 300, true)}
        <SortableList
          label="Pasos"
          items={t.howTo.steps}
          onReorder={(steps) => set((x) => void (x.howTo.steps = steps))}
          renderItem={(s, i, h) => (
            <div className="dish">
              {h}
              <div className="dish__fields">
                <TextField label={`Paso ${i + 1} · título`} value={s.title} max={80} onChange={(v) => set((x) => void (x.howTo.steps[i].title = v))} />
                <TextArea label="Texto" value={s.text} max={400} rows={2} onChange={(v) => set((x) => void (x.howTo.steps[i].text = v))} />
              </div>
              <button type="button" className="abtn abtn--small abtn--danger-ghost dish__remove" onClick={() => set((x) => void x.howTo.steps.splice(i, 1))}>
                Quitar
              </button>
            </div>
          )}
        />
        {t.howTo.steps.length < 6 && (
          <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => set((x) => void x.howTo.steps.push({ id: newId('paso'), title: '', text: '' }))}>
            + Añadir paso
          </button>
        )}
        {F('Botón', 'howTo.cta', t.howTo.cta, (x, v) => void (x.howTo.cta = v), 40)}
        <p className="muted small">El aviso sobre cómo indicar el menú al reservar se edita en «Establecimiento → Reservas».</p>
      </Group>

      <Group title="Preguntas frecuentes" id="g-faq">
        {F('Antetítulo', 'faq.eyebrow', t.faq.eyebrow, (x, v) => void (x.faq.eyebrow = v), 60)}
        {F('Título', 'faq.title', t.faq.title, (x, v) => void (x.faq.title = v), 120)}
        {F('Introducción', 'faq.intro', t.faq.intro, (x, v) => void (x.faq.intro = v), 300, true)}
        <p className="muted small">No incluyas políticas de cancelación, mínimos de comensales, fechas ni condiciones que no estén confirmadas.</p>
        <SortableList
          label="Preguntas"
          items={t.faq.items}
          onReorder={(items) => set((x) => void (x.faq.items = items))}
          renderItem={(q, i, h) => (
            <div className="dish">
              {h}
              <div className="dish__fields dish__fields--wide">
                <TextField label={`Pregunta ${i + 1}`} value={q.question} max={200} onChange={(v) => set((x) => void (x.faq.items[i].question = v))} />
                <TextArea label="Respuesta" value={q.answer} max={1200} rows={3} onChange={(v) => set((x) => void (x.faq.items[i].answer = v))} />
              </div>
              <button
                type="button"
                className="abtn abtn--small abtn--danger-ghost dish__remove"
                onClick={async () => {
                  if (await confirm({ title: '¿Eliminar esta pregunta?', text: q.question, confirmLabel: 'Eliminar', danger: true })) set((x) => void x.faq.items.splice(i, 1));
                }}
              >
                Quitar
              </button>
            </div>
          )}
        />
        <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => set((x) => void x.faq.items.push({ id: newId('faq'), question: '', answer: '' }))}>
          + Añadir pregunta
        </button>
      </Group>

      <Group title="Sobre nosotros y pie de página" id="g-about">
        {F('Antetítulo', 'about.eyebrow', t.about.eyebrow, (x, v) => void (x.about.eyebrow = v), 60)}
        {F('Título', 'about.title', t.about.title, (x, v) => void (x.about.title = v), 120)}
        {F('Texto', 'about.body', t.about.body, (x, v) => void (x.about.body = v), 900, true)}
        <ImagePicker label="Imagen" value={t.about.image} nullable folder="ambiente" onChange={(v) => set((x) => void (x.about.image = v))} />
        {F('Frase de cierre (pie)', 'footer.closing', t.footer.closing, (x, v) => void (x.footer.closing = v), 140)}
        {F('Texto legal (titular, NIF, etc.)', 'footer.legal', t.footer.legal, (x, v) => void (x.footer.legal = v), 500, true, 'Recomendado por la LSSI: nombre o razón social, NIF y datos de contacto del titular.')}
      </Group>
    </>
  );
}
