import { useMemo, type CSSProperties } from 'react';
import { buildComparison } from '../../../shared/comparison.ts';
import { formatPrice } from '../../../shared/format.ts';
import { useContent } from '../ContentContext.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { Star } from '../components/Ornament.tsx';
import { roman, splitMenuName } from '../brand.ts';

/** Comparativa generada a partir de los menús publicados (sin añadir nada). */
export function Compare() {
  const { content, t } = useContent();
  const c = content.texts.compare;
  const menus = content.menus;
  const rows = useMemo(() => buildComparison(menus), [menus]);
  if (!c.enabled || menus.length < 2) return null;
  const hasCommon = rows.some((r) => r.cells.some((cell) => cell.items.some((i) => i.common)));
  const cols = { '--cols': menus.length } as CSSProperties;

  return (
    <section className="compare" id="comparar" aria-labelledby="compare-title">
      <div className="container">
        <div className="compare__head">
          <p className="eyebrow" data-anim="fade-up">
            <Star size={10} /> {t(c.eyebrow)}
          </p>
          <h2 className="compare__title" id="compare-title" data-anim="lines">
            {t(c.title)}
          </h2>
          {c.intro && (
            <p className="compare__intro" data-anim="fade-up">
              {t(c.intro)}
            </p>
          )}
        </div>

        <div className={`compare__scroller ${menus.length > 2 ? 'compare__scroller--wide' : ''}`} tabIndex={menus.length > 2 ? 0 : undefined} role={menus.length > 2 ? 'region' : undefined} aria-label={menus.length > 2 ? 'Comparativa (desplázate horizontalmente)' : undefined}>
          <table className="ctable" style={cols}>
            <caption className="sr-only">{t(c.title)}</caption>
            <thead>
              <tr>
                <td className="ctable__corner" />
                {menus.map((m, i) => (
                  <th key={m.id} scope="col" className={`ctable__menu ctable__menu--${m.theme}`}>
                    <span className="ctable__num" aria-hidden="true">
                      {roman(i)}
                    </span>
                    <span className="ctable__name">{splitMenuName(m.name).main}</span>
                    <span className="sr-only"> ({m.name})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="ctable__row ctable__row--price">
                <th scope="row" className="ctable__label">
                  {c.priceLabel}
                </th>
                {menus.map((m) => (
                  <td key={m.id} className="ctable__cell">
                    {m.price.amount !== null ? (
                      <>
                        <span className="ctable__price">{formatPrice(m.price.amount)}</span>
                        <span className="ctable__unit">{m.price.unit}</span>
                      </>
                    ) : (
                      <span className="ctable__pending">{c.pendingLabel}</span>
                    )}
                  </td>
                ))}
              </tr>
              {rows.map((row) => (
                <tr key={row.key} className="ctable__row">
                  <th scope="row" className="ctable__label">
                    {row.label}
                    {row.hint && <span className="ctable__hint">{row.hint}</span>}
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.menuId} className="ctable__cell">
                      {cell.pending ? (
                        <span className="ctable__pending">{c.pendingLabel}</span>
                      ) : (
                        <ul role="list" className="ctable__items">
                          {cell.items.map((it, i) => (
                            <li key={i} className={it.common ? 'is-common' : ''}>
                              {it.common && <span className="ctable__dot" aria-hidden="true" />}
                              <span>{it.name}</span>
                              {it.quantity && <span className="ctable__qty"> · {it.quantity}</span>}
                              {it.common && <span className="sr-only"> ({c.commonLabel})</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="ctable__row ctable__row--cta">
                <td />
                {menus.map((m) => (
                  <td key={m.id} className="ctable__cell">
                    <BookLink variant="link" place={`comparativa-${m.id}`}>
                      {content.texts.nav.book}
                    </BookLink>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {hasCommon && (
          <p className="compare__legend">
            <span className="ctable__dot" aria-hidden="true" /> {c.commonLabel}
          </p>
        )}
      </div>
    </section>
  );
}
