import { useState } from 'react';
import type { MediaAsset, Menu } from '../../../shared/schema.ts';
import { ORNAMENTS, ORNAMENT_IDS, brandSwatches, type OrnamentId } from '../../../shared/brand.ts';
import { BINDING_FIELDS, BINDING_LABEL, bindingValue, boundValue, type BindingField, type Design, type DesignElement, type TextElement } from '../../../shared/studio.ts';
import type { ThemeColors } from '../../../shared/theme.ts';
import { MediaDialog } from '../media.tsx';

type Patch = Partial<DesignElement>;

function Num({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="sfield">
      <span>{label}</span>
      <input
        type="number"
        className="input input--small"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

export function ColorField({ label, value, onChange, theme, allowEmpty = false }: { label: string; value: string; onChange: (v: string) => void; theme: ThemeColors; allowEmpty?: boolean }) {
  return (
    <div className="sfield sfield--color">
      <span>{label}</span>
      <div className="swatches" role="group" aria-label={label}>
        {brandSwatches(theme).map((s) => (
          <button
            key={s.name}
            type="button"
            className={`swatch ${value.toLowerCase() === s.value.toLowerCase() ? 'is-on' : ''}`}
            style={{ background: s.value }}
            title={s.name}
            aria-label={s.name}
            aria-pressed={value.toLowerCase() === s.value.toLowerCase()}
            onClick={() => onChange(s.value)}
          />
        ))}
        <input type="color" aria-label={`${label}: color personalizado`} value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
        {allowEmpty && (
          <button type="button" className={`swatch swatch--none ${value === '' ? 'is-on' : ''}`} title="Sin color" aria-label="Sin color" onClick={() => onChange('')}>
            ⌀
          </button>
        )}
      </div>
    </div>
  );
}

export function ElementInspector({
  el,
  design,
  theme,
  menus,
  onChange,
  onAlign,
}: {
  el: DesignElement;
  design: Design;
  theme: ThemeColors;
  menus: Menu[];
  onChange: (p: Patch) => void;
  onAlign: (how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void;
}) {
  const [picker, setPicker] = useState(false);
  return (
    <div className="inspector">
      <div className="inspector__group">
        <p className="inspector__title">Posición y tamaño</p>
        <div className="sgrid">
          <Num label="X" value={el.x} onChange={(x) => onChange({ x })} />
          <Num label="Y" value={el.y} onChange={(y) => onChange({ y })} />
          <Num label="Ancho" value={el.width} min={1} onChange={(width) => onChange({ width })} />
          {el.type !== 'text' && <Num label="Alto" value={el.height} min={1} onChange={(height) => onChange({ height })} />}
          <Num label="Giro (°)" value={el.rotation} onChange={(rotation) => onChange({ rotation })} />
          <Num label="Opacidad %" value={el.opacity * 100} min={0} max={100} onChange={(v) => onChange({ opacity: Math.min(1, Math.max(0, v / 100)) })} />
        </div>
        <div className="aligns" role="group" aria-label="Alinear en el lienzo">
          {(
            [
              ['left', '⇤', 'Alinear a la izquierda'],
              ['hcenter', '↔', 'Centrar horizontalmente'],
              ['right', '⇥', 'Alinear a la derecha'],
              ['top', '⤒', 'Alinear arriba'],
              ['vcenter', '↕', 'Centrar verticalmente'],
              ['bottom', '⤓', 'Alinear abajo'],
            ] as const
          ).map(([k, g, l]) => (
            <button key={k} type="button" className="abtn abtn--small abtn--ghost" title={l} aria-label={l} onClick={() => onAlign(k)}>
              {g}
            </button>
          ))}
        </div>
        <label className="scheck">
          <input type="checkbox" checked={el.locked} onChange={(e) => onChange({ locked: e.target.checked })} /> Bloquear posición
        </label>
      </div>

      {el.type === 'text' && <TextProps el={el} theme={theme} menus={menus} onChange={onChange} />}

      {el.type === 'image' && (
        <div className="inspector__group">
          <p className="inspector__title">Imagen</p>
          <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => setPicker(true)}>
            Cambiar imagen
          </button>
          <label className="sfield">
            <span>Encaje</span>
            <select className="input input--small" value={el.fit} onChange={(e) => onChange({ fit: e.target.value as 'cover' | 'contain' })}>
              <option value="cover">Rellenar (recorta)</option>
              <option value="contain">Ajustar (completa)</option>
            </select>
          </label>
          <Num label="Esquinas redondeadas" value={el.radius} min={0} onChange={(radius) => onChange({ radius })} />
          <MediaDialog open={picker} onClose={() => setPicker(false)} onSelect={(a: MediaAsset) => (onChange({ asset: a.id }), setPicker(false))} />
        </div>
      )}

      {el.type === 'ornament' && (
        <div className="inspector__group">
          <p className="inspector__title">Ornamento</p>
          <label className="sfield">
            <span>Dibujo</span>
            <select className="input input--small" value={el.ornament} onChange={(e) => onChange({ ornament: e.target.value as OrnamentId })}>
              {ORNAMENT_IDS.map((o) => (
                <option key={o} value={o}>
                  {ORNAMENTS[o].label}
                </option>
              ))}
            </select>
          </label>
          <ColorField label="Color" value={el.color} theme={theme} onChange={(color) => onChange({ color })} />
          <Num label="Grosor de línea" value={el.strokeWidth} step={0.5} min={0.2} max={20} onChange={(strokeWidth) => onChange({ strokeWidth })} />
        </div>
      )}

      {el.type === 'shape' && (
        <div className="inspector__group">
          <p className="inspector__title">Forma</p>
          {el.shape !== 'line' && <ColorField label="Relleno" value={el.fill} theme={theme} allowEmpty onChange={(fill) => onChange({ fill })} />}
          <ColorField label="Borde / línea" value={el.stroke} theme={theme} allowEmpty onChange={(stroke) => onChange({ stroke })} />
          <Num label="Grosor" value={el.strokeWidth} min={0} onChange={(strokeWidth) => onChange({ strokeWidth })} />
          {el.shape === 'rect' && <Num label="Esquinas redondeadas" value={el.radius} min={0} onChange={(radius) => onChange({ radius })} />}
        </div>
      )}

      {el.type === 'logo' && (
        <div className="inspector__group">
          <p className="inspector__title">Logotipo</p>
          <p className="muted small">Usa el logotipo de Campaña; si no hay, el nombre con la tipografía de la marca.</p>
          <ColorField label="Color del nombre" value={el.color} theme={theme} onChange={(color) => onChange({ color })} />
          <ColorField label="Color de «GastroBar»" value={el.accent} theme={theme} onChange={(accent) => onChange({ accent })} />
        </div>
      )}
      <p className="muted small">Lienzo: {design.width} × {design.height} px</p>
    </div>
  );
}

function TextProps({ el, theme, menus, onChange }: { el: TextElement; theme: ThemeColors; menus: Menu[]; onChange: (p: Partial<TextElement>) => void }) {
  const boundMenu = el.binding ? menus.find((m) => m.id === el.binding!.menuId) : undefined;
  const current = el.binding ? boundValue(menus, el.binding) : null;
  const sectionTitle = el.binding?.field === 'section' ? boundMenu?.sections.find((x) => x.id === el.binding!.sectionId)?.title : undefined;
  return (
    <div className="inspector__group">
      <p className="inspector__title">Texto</p>
      <label className="sfield sfield--wide">
        <span>Contenido</span>
        <textarea className="input input--area" rows={3} value={el.text} maxLength={1200} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      {el.binding && (
        <div className="bindinfo">
          <span>
            Vinculado a <strong>{boundMenu?.name ?? 'un menú que ya no existe'}</strong> · {sectionTitle ?? BINDING_LABEL[el.binding.field]}
          </span>
          {current !== null && current !== el.text && (
            <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => onChange({ text: current })}>
              Usar dato actual
            </button>
          )}
          <button type="button" className="linkbtn" onClick={() => onChange({ binding: null })}>
            Desvincular
          </button>
        </div>
      )}
      <div className="sgrid">
        <label className="sfield">
          <span>Tipografía</span>
          <select className="input input--small" value={el.font} onChange={(e) => onChange({ font: e.target.value as 'serif' | 'sans' })}>
            <option value="serif">Fraunces (titulares)</option>
            <option value="sans">Manrope (textos)</option>
          </select>
        </label>
        <Num label="Tamaño" value={el.size} min={6} max={600} onChange={(size) => onChange({ size })} />
        <label className="sfield">
          <span>Grosor</span>
          <select className="input input--small" value={el.weight} onChange={(e) => onChange({ weight: Number(e.target.value) as TextElement['weight'] })}>
            <option value={300}>Fino</option>
            <option value={400}>Normal</option>
            <option value={500}>Medio</option>
            <option value={600}>Seminegrita</option>
            <option value={700}>Negrita</option>
          </select>
        </label>
        <label className="sfield">
          <span>Alineación</span>
          <select className="input input--small" value={el.align} onChange={(e) => onChange({ align: e.target.value as TextElement['align'] })}>
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </label>
        <Num label="Espaciado letras" value={el.letterSpacing} step={0.5} onChange={(letterSpacing) => onChange({ letterSpacing })} />
        <Num label="Interlineado" value={el.lineHeight} step={0.05} min={0.6} max={3} onChange={(lineHeight) => onChange({ lineHeight })} />
      </div>
      <div className="schecks">
        <label className="scheck">
          <input type="checkbox" checked={el.italic} onChange={(e) => onChange({ italic: e.target.checked })} /> Cursiva
        </label>
        <label className="scheck">
          <input type="checkbox" checked={el.uppercase} onChange={(e) => onChange({ uppercase: e.target.checked })} /> Mayúsculas
        </label>
      </div>
      <ColorField label="Color" value={el.color} theme={theme} onChange={(color) => onChange({ color })} />
    </div>
  );
}

export function MenuDataPicker({
  menus,
  onInsert,
}: {
  menus: Menu[];
  onInsert: (menu: Menu, field: BindingField, value: string, sectionId?: string) => void;
}) {
  const [menuId, setMenuId] = useState(menus[0]?.id ?? '');
  const menu = menus.find((m) => m.id === menuId);
  if (!menus.length) return <p className="muted small">No hay menús.</p>;
  return (
    <div className="menudata">
      <label className="sfield">
        <span>Menú</span>
        <select className="input input--small" value={menuId} onChange={(e) => setMenuId(e.target.value)}>
          {menus.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.status === 'published' ? '' : m.status === 'draft' ? ' (borrador)' : ' (oculto)'}
            </option>
          ))}
        </select>
      </label>
      <p className="inspector__title">Datos generales</p>
      <div className="menudata__fields">
        {BINDING_FIELDS.filter((f) => f !== 'section').map((f) => {
          const v = bindingValue(menu, f);
          return (
            <button key={f} type="button" className="chip" disabled={!v} title={v ?? 'Sin dato confirmado'} onClick={() => menu && v && onInsert(menu, f, v)}>
              + {BINDING_LABEL[f]}
            </button>
          );
        })}
      </div>
      <p className="inspector__title">Grupos de platos</p>
      <div className="menudata__fields">
        {menu?.sections
          .filter((sec) => !sec.pending)
          .map((sec) => {
            const v = bindingValue(menu, 'section', 'o', sec.id);
            return (
              <button key={sec.id} type="button" className="chip" disabled={!v} title={v ?? 'Sin platos'} onClick={() => v && onInsert(menu, 'section', v, sec.id)}>
                + {sec.title}
              </button>
            );
          })}
      </div>
      <p className="muted small">Datos actuales del panel (sin lo marcado como pendiente). Los textos quedan vinculados al menú.</p>
    </div>
  );
}
