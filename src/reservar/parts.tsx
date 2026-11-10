/** Piezas del formulario de menús: contador, tarjetas de menú, fichas de comensal y resumen. */
import { useId, type ReactNode } from 'react';
import type { Menu } from '../../shared/schema.ts';
import { formatPrice } from '../../shared/format.ts';
import { choiceSections, dinerLabel, type DinerInput, SERVICE_LABEL, type SelectionInput } from '../../shared/reservas.ts';

export function Counter({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="rs-counter">
      <div>
        <label htmlFor={id} className="rs-label">
          {label}
        </label>
        {hint && <p className="rs-hint">{hint}</p>}
      </div>
      <div className="rs-counter__ctl">
        <button type="button" aria-label={`Quitar uno (${label})`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
        <button type="button" aria-label={`Añadir uno (${label})`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

export function priceText(m: Menu): string {
  return m.price.amount != null ? `${formatPrice(m.price.amount)} ${m.price.unit || 'por persona'}` : 'Precio próximamente';
}

/** Tarjeta de menú con lo que incluye (datos del gestor de menús, nada fijo en el código). */
export function MenuCard({ menu, selected, onSelect, name }: { menu: Menu; selected: boolean; onSelect: () => void; name: string }) {
  const id = useId();
  return (
    <label className={`rs-menu rs-menu--${menu.theme} ${selected ? 'is-on' : ''}`} htmlFor={id}>
      <input id={id} type="radio" name={name} checked={selected} onChange={onSelect} />
      <span className="rs-menu__head">
        <span className="rs-menu__name">{menu.name}</span>
        <span className="rs-menu__price">{priceText(menu)}</span>
      </span>
      {menu.subtitle && <span className="rs-menu__sub">{menu.subtitle}</span>}
      <span className="rs-menu__secs">
        {menu.sections
          .filter((s) => !s.pending && s.items.length)
          .map((s) => (
            <span key={s.id} className="rs-menu__sec">
              <strong>
                {s.title}
                {s.kind === 'choice' ? ` · ${s.choose > 1 ? `elige ${s.choose}` : 'a elegir'}` : s.kind === 'shared' ? ' · para compartir' : ''}
              </strong>
              <span>{s.items.map((i) => i.name).join(s.kind === 'choice' ? ' / ' : ' · ')}</span>
            </span>
          ))}
      </span>
      <span className="rs-menu__check" aria-hidden="true">
        {selected ? 'Elegido' : 'Elegir'}
      </span>
    </label>
  );
}

export function pendingSections(d: DinerInput, menus: Menu[]): { id: string; title: string }[] {
  if (d.mode === 'carta') return [];
  const m = menus.find((x) => x.id === d.menuId);
  if (!m) return [{ id: '_menu', title: 'Menú' }];
  return choiceSections(m)
    .filter((s) => (d.choices[s.id] ?? []).filter((x) => s.items.some((i) => i.id === x)).length !== s.choose)
    .map((s) => ({ id: s.id, title: s.title }));
}

export function DinerCard({
  diner,
  menus,
  open,
  onToggle,
  onChange,
  onCopyPrev,
  canCopy,
}: {
  diner: DinerInput;
  menus: Menu[];
  open: boolean;
  onToggle: () => void;
  onChange: (d: DinerInput) => void;
  onCopyPrev?: () => void;
  canCopy: boolean;
}) {
  const id = useId();
  const menu = menus.find((m) => m.id === diner.menuId);
  const pending = pendingSections(diner, menus);
  const done = pending.length === 0;
  const picks = menu
    ? choiceSections(menu)
        .flatMap((s) => (diner.choices[s.id] ?? []).map((x) => s.items.find((i) => i.id === x)?.name))
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    <article className={`rs-diner ${done ? 'is-done' : 'is-pending'} ${open ? 'is-open' : ''}`} id={`diner-${diner.id}`}>
      <h3 className="rs-diner__title">
        <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
          <span className="rs-diner__badge" aria-hidden="true">
            {done ? '✓' : pending.length}
          </span>
          <span className="rs-diner__label">
            <strong>{dinerLabel(diner)}</strong>
            <span>
              {diner.mode === 'carta' ? 'Carta habitual — elección en el restaurante' : menu ? `${menu.name}${picks ? ` · ${picks}` : ''}` : 'Sin menú'}
            </span>
          </span>
          <span className="rs-diner__state">{done ? 'Completo' : `Falta ${pending.map((p) => p.title.toLowerCase()).join(', ')}`}</span>
        </button>
      </h3>
      {open && (
        <div className="rs-diner__body" id={`${id}-body`}>
          <div className="rs-field">
            <label className="rs-label" htmlFor={`${id}-name`}>
              Nombre <span className="rs-opt">(opcional)</span>
            </label>
            <input id={`${id}-name`} className="rs-input" value={diner.name} maxLength={60} placeholder={dinerLabel({ ...diner, name: '' })} onChange={(e) => onChange({ ...diner, name: e.target.value })} />
          </div>
          {menu &&
            choiceSections(menu).map((s) => {
              const sel = diner.choices[s.id] ?? [];
              const multi = s.choose > 1;
              return (
                <fieldset key={s.id} className="rs-choice">
                  <legend className="rs-label">
                    {s.title} <span className="rs-opt">{multi ? `elige ${s.choose}` : 'elige uno'}</span>
                  </legend>
                  <div className="rs-options">
                    {s.items.map((it) => {
                      const on = sel.includes(it.id);
                      return (
                        <label key={it.id} className={`rs-option ${on ? 'is-on' : ''}`}>
                          <input
                            type={multi ? 'checkbox' : 'radio'}
                            name={`${id}-${s.id}`}
                            checked={on}
                            onChange={() => {
                              const next = multi ? (on ? sel.filter((x) => x !== it.id) : [...sel, it.id].slice(-s.choose)) : [it.id];
                              onChange({ ...diner, choices: { ...diner.choices, [s.id]: next } });
                            }}
                          />
                          <span>
                            {it.name}
                            {it.detail && <small>{it.detail}</small>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          {canCopy && onCopyPrev && (
            <button type="button" className="rs-link" onClick={onCopyPrev}>
              Copiar las elecciones del comensal anterior
            </button>
          )}
          <div className="rs-grid2">
            <div className="rs-field">
              <label className="rs-label" htmlFor={`${id}-allergy`}>
                Alergias o intolerancias <span className="rs-opt">(opcional)</span>
              </label>
              <input id={`${id}-allergy`} className="rs-input" value={diner.allergy} maxLength={200} onChange={(e) => onChange({ ...diner, allergy: e.target.value })} />
            </div>
            <div className="rs-field">
              <label className="rs-label" htmlFor={`${id}-note`}>
                Nota <span className="rs-opt">(opcional)</span>
              </label>
              <input id={`${id}-note`} className="rs-input" value={diner.note} maxLength={200} onChange={(e) => onChange({ ...diner, note: e.target.value })} />
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export function Summary({ s, menus, showHolder = true, estimate }: { s: SelectionInput; menus: Menu[]; showHolder?: boolean; estimate: { amount: number; unknown: number } }) {
  const adultMenu = menus.find((m) => m.id === s.adultMenuId);
  const row = (k: string, v: ReactNode) => (
    <div className="rs-sum__row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <div className="rs-sum">
      <dl>
        {showHolder && row('Titular', s.holder.name)}
        {showHolder && row('Teléfono', s.holder.phone)}
        {showHolder && s.holder.email && row('Correo', s.holder.email)}
        {row('Servicio', SERVICE_LABEL[s.service])}
        {row('Adultos', s.adults)}
        {row('Niños', s.children)}
        {row('Total de personas', <strong>{s.adults + s.children}</strong>)}
        {s.adults > 0 && row('Menú de los adultos', adultMenu?.name ?? '—')}
      </dl>
      <h3 className="rs-sum__h">Comensales</h3>
      <ul className="rs-sum__list">
        {s.diners.map((d) => {
          const m = menus.find((x) => x.id === d.menuId);
          const picks = m ? choiceSections(m).map((sec) => `${sec.title}: ${(d.choices[sec.id] ?? []).map((x) => sec.items.find((i) => i.id === x)?.name).join(', ') || '—'}`) : [];
          return (
            <li key={d.id}>
              <strong>{dinerLabel(d)}</strong> — {d.mode === 'carta' ? 'Carta habitual — elección en el restaurante' : m?.name ?? '—'}
              {picks.length > 0 && <span className="rs-sum__picks">{picks.join(' · ')}</span>}
              {d.allergy && <span className="rs-sum__allergy">Alergias: {d.allergy}</span>}
              {d.note && <span className="rs-sum__note">Nota: {d.note}</span>}
            </li>
          );
        })}
      </ul>
      {(s.notes.allergies || s.notes.general || s.notes.special) && (
        <dl>
          {s.notes.allergies && row('Alergias e intolerancias', <span className="rs-sum__allergy">{s.notes.allergies}</span>)}
          {s.notes.general && row('Observaciones', s.notes.general)}
          {s.notes.special && row('Necesidades del servicio', s.notes.special)}
        </dl>
      )}
      <p className="rs-sum__total">
        Importe orientativo de los menús: <strong>{formatPrice(estimate.amount)}</strong>
        {estimate.unknown > 0 && <span> · {estimate.unknown} menú(s) sin precio publicado no incluidos</span>}
        <small>No incluye lo que se consuma de la carta habitual. El importe definitivo es el del restaurante.</small>
      </p>
    </div>
  );
}
