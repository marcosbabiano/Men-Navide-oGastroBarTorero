import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Menu, MenuSection } from '../../../shared/schema.ts';
import { formatPrice } from '../../../shared/format.ts';
import { useContent } from '../ContentContext.tsx';
import { Picture } from '../components/Picture.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { ChoiceGlyph, Info, ShareGlyph } from '../components/Icons.tsx';
import { Rule, Star } from '../components/Ornament.tsx';
import { roman, splitMenuName } from '../brand.ts';
import { ScrollTrigger } from '../anim/choreography.ts';

const THEME_BG: Record<Menu['theme'], string> = {
  ivory: 'var(--c-wine-deep)',
  noir: 'var(--c-night)',
  burgundy: 'var(--c-carbon)',
  forest: 'var(--c-carbon)',
};

function SectionBlock({ section, joiner }: { section: MenuSection; joiner: string }) {
  const isShared = section.kind === 'shared';
  const isChoice = section.kind === 'choice';
  return (
    <div className={`msec msec--${section.kind}`}>
      <div className="msec__head">
        <h4 className="msec__title">
          {isShared && <ShareGlyph className="msec__glyph" />}
          {isChoice && <ChoiceGlyph className="msec__glyph" />}
          {section.title}
        </h4>
        {section.hint && <p className="msec__hint">{section.hint}</p>}
      </div>
      {isChoice ? (
        <ol className="msec__choices" role="list">
          {section.items.map((item, i) => (
            <li key={item.id} className="msec__choice">
              {i > 0 && (
                <span className="msec__or" aria-hidden="true">
                  {joiner}
                </span>
              )}
              <span className="msec__name">{item.name}</span>
              {(item.detail || item.quantity || item.note) && (
                <span className="msec__meta">{[item.quantity, item.detail, item.note].filter(Boolean).join(' · ')}</span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <ul className="msec__items" role="list">
          {section.items.map((item) => (
            <li key={item.id} className="msec__item">
              <span className="msec__bullet" aria-hidden="true" />
              <span className="msec__name">{item.name}</span>
              {(item.quantity || item.detail || item.note) && (
                <span className="msec__meta">{[item.quantity, item.detail, item.note].filter(Boolean).join(' · ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MenuShowcase({ menu, index }: { menu: Menu; index: number }) {
  const { content, t } = useContent();
  const name = splitMenuName(menu.name);
  const notice = content.booking.notice;
  const flip = index % 2 === 1;
  const anyIllustrative = !!menu.image;
  return (
    <article
      className={`menu menu--${menu.theme} ${flip ? 'menu--flip' : ''}`}
      id={`menu-${menu.id}`}
      aria-labelledby={`menu-title-${menu.id}`}
      data-menu-bg={THEME_BG[menu.theme]}
      data-menu-id={menu.id}
    >
      <div className="menu__visual">
        <div className="menu__sticky">
          <div className="menu__pic-wrap" data-anim="mask">
            <Picture image={menu.image} sizes="(min-width: 1024px) 42vw, 100vw" className="menu__pic" parallax={8} />
          </div>
          <span className="menu__numeral" aria-hidden="true">
            {roman(index)}
          </span>
          {menu.gallery.length > 0 && (
            <div className="menu__gallery" aria-hidden="true">
              {menu.gallery.slice(0, 2).map((g, i) => (
                <div key={`${g.asset}-${i}`} className={`menu__thumb menu__thumb--${i}`} data-anim="mask" data-dir={i ? 'left' : 'right'}>
                  <Picture image={g} sizes="(min-width: 1024px) 14vw, 30vw" decorative />
                </div>
              ))}
            </div>
          )}
          {anyIllustrative && <p className="menu__credit">{content.texts.menus.illustrativeNote}</p>}
        </div>
      </div>

      <div className="menu__card">
        <div className="menu__card-inner">
          <header className="menu__head" data-anim="stagger">
            <p className="menu__index">
              <span>Menú {roman(index)}</span>
              {menu.tag && <span className="menu__tag">{menu.tag}</span>}
            </p>
            <h3 className="menu__title" id={`menu-title-${menu.id}`}>
              {name.prefix && <span className="menu__title-prefix">{name.prefix} </span>}
              <span className="menu__title-main">{name.main}</span>
            </h3>
            {menu.subtitle && <p className="menu__subtitle">{menu.subtitle}</p>}
          </header>

          {menu.price.amount !== null && (
            <div className="menu__price" data-anim="fade-up">
              <span className="menu__price-amount">{formatPrice(menu.price.amount)}</span>
              <span className="menu__price-unit">{menu.price.unit}</span>
              {menu.price.note && <span className="menu__price-note">{menu.price.note}</span>}
            </div>
          )}

          {menu.description && (
            <p className="menu__desc" data-anim="fade-up">
              {menu.description}
            </p>
          )}

          <Rule className="menu__rule" />

          <div className="menu__sections" data-anim="stagger">
            {menu.sections.map((s) => (
              <SectionBlock key={s.id} section={s} joiner={content.texts.menus.choiceJoiner} />
            ))}
          </div>

          {menu.conditions.length > 0 && (
            <ul className="menu__conditions" role="list">
              {menu.conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}

          <div className="menu__cta" data-anim="fade-up">
            <BookLink variant="primary" place={`menu-${menu.id}`}>
              {menu.cta.label || content.texts.nav.book}
            </BookLink>
            {menu.cta.helper && <p className="menu__helper">{t(menu.cta.helper)}</p>}
            {notice.enabled && notice.text && (
              <p className="menu__notice">
                <Info className="menu__notice-icon" />
                <span>{t(notice.text)}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Selector fijo de menús en móvil: salto directo y estado activo. */
function MenuSwitcher({ menus }: { menus: Menu[] }) {
  const [active, setActive] = useState<string | undefined>(menus[0]?.id);
  useEffect(() => {
    const els = menus.map((m) => document.getElementById(`menu-${m.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.getAttribute('data-menu-id') ?? undefined);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [menus]);
  if (menus.length < 2) return null;
  return (
    <nav className="mswitch" aria-label="Ir a un menú">
      <ul role="list" className="mswitch__list">
        {menus.map((m, i) => (
          <li key={m.id}>
            <a href={`#menu-${m.id}`} className={`mswitch__chip ${active === m.id ? 'is-active' : ''}`} aria-current={active === m.id ? 'true' : undefined}>
              <span className="mswitch__num" aria-hidden="true">
                {roman(i)}
              </span>
              <span className="mswitch__name">{splitMenuName(m.name).main}</span>
              {m.price.amount !== null && <span className="mswitch__price">{formatPrice(m.price.amount)}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Menus() {
  const { content, t } = useContent();
  const s = content.texts.menus;
  const menus = content.menus;
  const root = useRef<HTMLElement>(null);

  // El fondo de la sección cambia de color al pasar de un menú a otro (transición CSS sobre @property).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const triggers = Array.from(el.querySelectorAll<HTMLElement>('[data-menu-bg]')).map((m) =>
      ScrollTrigger.create({
        trigger: m,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => {
          if (self.isActive) el.style.setProperty('--menus-bg', m.dataset.menuBg ?? '');
        },
      }),
    );
    return () => triggers.forEach((t) => t.kill());
  }, [menus.length]);

  return (
    <section className={`menus menus--count-${Math.min(menus.length, 4)}`} id="menus" ref={root} aria-labelledby="menus-title">
      <div className="container menus__header">
        <p className="eyebrow" data-anim="fade-up">
          <Star size={10} /> {t(s.eyebrow)}
        </p>
        <h2 className="menus__title" id="menus-title" data-anim="lines">
          {t(s.title)}
        </h2>
        <p className="menus__intro" data-anim="fade-up">
          {t(s.intro)}
        </p>
      </div>
      {menus.length === 0 ? (
        <div className="container">
          <p className="menus__empty">{t(s.emptyMessage)}</p>
        </div>
      ) : (
        <>
          <MenuSwitcher menus={menus} />
          <div className="menus__list">
            {menus.map((m, i) => (
              <MenuShowcase key={m.id} menu={m} index={i} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
