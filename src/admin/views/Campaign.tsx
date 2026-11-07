import type { Draft } from 'immer';
import type { SiteContent, Theme } from '../../../shared/schema.ts';
import { THEME_PRESETS, checkThemeContrast } from '../../../shared/theme.ts';
import { interpolate } from '../../../shared/format.ts';
import { useStore } from '../store.tsx';
import { Card, PageHeader, TextArea, TextField, Toggle, useConfirm } from '../ui.tsx';
import { ImagePicker, thumbUrl } from '../media.tsx';

const COLOR_LABEL: Record<keyof Theme, string> = {
  carbon: 'Carbón (fondos oscuros)',
  burgundy: 'Burdeos (acento)',
  gold: 'Oro champán (detalles y botones)',
  ivory: 'Marfil (textos y fondos claros)',
};

export function CampaignView() {
  const { content, update, media, fieldErrors } = useStore();
  const confirm = useConfirm();
  const c = content.campaign;
  const set = (fn: (c: Draft<SiteContent['campaign']>) => void) => update((d) => fn(d.campaign));
  const contrast = checkThemeContrast(c.theme);
  const err = (p: string) => fieldErrors.find((e) => e.path === p)?.message;
  const ogAsset = content.seo.ogImage ? media.find((m) => m.id === content.seo.ogImage?.asset) : undefined;
  const title = interpolate(content.seo.title, content);
  const desc = interpolate(content.seo.description, content);

  return (
    <>
      <PageHeader title="Campaña, marca y SEO" intro="Configuración general de la campaña de Navidad y de cómo aparece la web en Google y en redes sociales." />

      <div className="grid-2">
        <Card title="Campaña">
          <div className="grid-2">
            <TextField label="Nombre de la campaña" value={c.name} max={80} onChange={(v) => set((x) => void (x.name = v))} />
            <TextField
              label="Año"
              value={String(c.year)}
              inputMode="numeric"
              onChange={(v) => /^\d{0,4}$/.test(v) && v.length === 4 && set((x) => void (x.year = Number(v)))}
              hint="Se usa en los textos con {año}."
              error={err('campaign.year')}
            />
          </div>
          <Toggle
            label="Campaña activa"
            checked={c.active}
            tone="warn"
            onChange={async (v) => {
              if (!v && !(await confirm({ title: '¿Desactivar la campaña?', text: 'Al publicar, la web mostrará solo el mensaje de campaña inactiva y los datos de contacto.', confirmLabel: 'Desactivar', danger: true }))) return;
              set((x) => void (x.active = v));
            }}
            hint="Desactivada: la web muestra el mensaje de abajo en lugar de los menús."
          />
          <TextField label="Título si la campaña está inactiva" value={c.inactiveTitle} max={120} onChange={(v) => set((x) => void (x.inactiveTitle = v))} />
          <TextArea label="Mensaje si la campaña está inactiva" value={c.inactiveMessage} max={500} onChange={(v) => set((x) => void (x.inactiveMessage = v))} />
          <Toggle label="Introducción animada en la primera visita" checked={c.introEnabled} onChange={(v) => set((x) => void (x.introEnabled = v))} hint="Dura unos 3 segundos, se puede saltar y no se repite durante 7 días." />
        </Card>

        <Card title="Mensaje destacado">
          <Toggle label="Mostrar franja de mensaje destacado bajo la portada" checked={c.announcement.enabled} onChange={(v) => set((x) => void (x.announcement.enabled = v))} />
          <TextField label="Mensaje" value={c.announcement.text} max={160} onChange={(v) => set((x) => void (x.announcement.text = v))} hint="Ej.: un aviso confirmado sobre las fechas. Admite {telefono}." />
        </Card>
      </div>

      <Card title="Colores" description="Elige una paleta o ajusta los colores. Solo se aceptan combinaciones con contraste suficiente (WCAG AA).">
        <div className="presets">
          {THEME_PRESETS.map((p) => (
            <button key={p.id} type="button" className="preset" onClick={() => set((x) => void (x.theme = { ...p.colors }))} aria-label={`Aplicar paleta ${p.name}`}>
              <span className="preset__sw">
                {(Object.keys(p.colors) as (keyof Theme)[]).map((k) => (
                  <span key={k} style={{ background: p.colors[k] }} />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <div className="colors">
          {(Object.keys(COLOR_LABEL) as (keyof Theme)[]).map((k) => (
            <label key={k} className="color">
              <input type="color" value={c.theme[k]} onChange={(e) => set((x) => void (x.theme[k] = e.target.value))} />
              <span>
                <strong>{COLOR_LABEL[k]}</strong>
                <code>{c.theme[k]}</code>
              </span>
            </label>
          ))}
        </div>
        <div className="theme-preview" style={{ background: c.theme.carbon, color: c.theme.ivory }}>
          <span style={{ color: c.theme.gold }}>✦ NAVIDAD {c.year}</span>
          <strong style={{ fontFamily: 'var(--font-serif)' }}>Cada encuentro merece algo especial</strong>
          <span className="theme-preview__btn" style={{ background: c.theme.gold, color: c.theme.carbon }}>
            Reservar mesa
          </span>
          <span className="theme-preview__card" style={{ background: c.theme.ivory, color: c.theme.burgundy }}>
            Menú · 36 €
          </span>
          <span className="theme-preview__card" style={{ background: c.theme.burgundy, color: c.theme.ivory }}>
            Burdeos
          </span>
        </div>
        {contrast.length > 0 ? (
          <ul className="issues" role="list">
            {contrast.map((x, i) => (
              <li key={i} className="issue issue--blocker">
                <span className="issue__dot" aria-hidden="true" />
                {x.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ok-note">✓ Contraste correcto en todas las combinaciones.</p>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Logotipo y favicon">
          <ImagePicker label="Logotipo (opcional)" value={c.logo} nullable folder="marca" onChange={(v) => set((x) => void (x.logo = v))} hint="Sin logotipo se usa el nombre con la tipografía de la campaña. Recomendado: PNG o WebP con fondo transparente, en tonos claros." />
          <ImagePicker label="Favicon (opcional)" value={c.favicon} nullable folder="marca" mode="icon" onChange={(v) => set((x) => void (x.favicon = v))} hint="Se recorta en cuadrado. Sin favicon se usa el monograma «T»." />
        </Card>
        <Card title="Imagen para compartir (redes y WhatsApp)">
          <ImagePicker
            label="Imagen social"
            value={content.seo.ogImage}
            nullable
            folder="marca"
            mode="social"
            onChange={(v) => update((d) => void (d.seo.ogImage = v))}
            hint="Ideal 1200×630 px. Las subidas desde aquí se recortan automáticamente. Sin imagen se usa la imagen social incluida."
          />
        </Card>
      </div>

      <Card
        title="Ornamentos de marca"
        description="Ilustraciones con fondo transparente (PNG o WebP) que decoran la web: se animan de forma individual. Mientras estén vacías no se muestra nada. Súbelas desde aquí o desde Imágenes (carpeta «Ornamentos»)."
      >
        <div className="grid-3">
          <ImagePicker label="Acento de la portada" value={c.decor.heroAccent} nullable folder="ornamentos" onChange={(v) => set((x) => void (x.decor.heroAccent = v))} hint="Composición vertical o cuadrada, se sitúa a la derecha del titular." />
          <ImagePicker label="Separador editorial" value={c.decor.divider} nullable folder="ornamentos" onChange={(v) => set((x) => void (x.decor.divider = v))} hint="Horizontal (aprox. 6:1). Sustituye a los filetes dorados." />
          <ImagePicker label="Rama botánica" value={c.decor.branch} nullable folder="ornamentos" onChange={(v) => set((x) => void (x.decor.branch = v))} hint="Cuadrada. Aparece en «La Navidad se comparte» y en el pie." />
        </div>
      </Card>

      <Card title="SEO" description="Cómo aparece la web en Google y al compartir el enlace.">
        <TextField label="Título de la página" value={content.seo.title} max={70} onChange={(v) => update((d) => void (d.seo.title = v))} error={err('seo.title')} />
        <TextArea label="Descripción" value={content.seo.description} max={170} rows={3} onChange={(v) => update((d) => void (d.seo.description = v))} error={err('seo.description')} />
        <TextField label="Nombre del sitio" value={content.seo.siteName} max={60} onChange={(v) => update((d) => void (d.seo.siteName = v))} />
        <div className="previews">
          <div className="gpreview" aria-label="Vista previa en Google">
            <span className="gpreview__url">{location.host} › </span>
            <span className="gpreview__title">{title}</span>
            <span className="gpreview__desc">{desc}</span>
          </div>
          <div className="spreview" aria-label="Vista previa al compartir">
            <img src={ogAsset ? thumbUrl(ogAsset) : '/og-default.jpg'} alt="" />
            <div>
              <span className="spreview__host">{location.host}</span>
              <strong>{title}</strong>
              <span>{desc}</span>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
