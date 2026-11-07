import { useEffect, useId, useRef, useState } from 'react';
import { useContent } from '../ContentContext.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { splitBrand } from '../brand.ts';
import { gsap, prefersMotion } from '../anim/choreography.ts';
import { Phone } from '../components/Icons.tsx';
import { telLink } from '../../../shared/format.ts';

export interface NavLink {
  href: string;
  label: string;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const { content, media } = useContent();
  const logo = content.campaign.logo ? media[content.campaign.logo.asset] : undefined;
  if (logo) {
    const src = logo.kind === 'upload' ? `${logo.src}?v=sm` : `${logo.src}-640.webp`;
    return <img className="brand__logo" src={src} alt={content.campaign.logo?.alt || content.business.name} height={40} />;
  }
  const b = splitBrand(content.business.name);
  return (
    <span className={`brand ${compact ? 'brand--compact' : ''}`}>
      {b.small && <span className="brand__small">{b.small}</span>}{' '}
      <span className="brand__big">{b.big}</span>
    </span>
  );
}

export function Nav({ links }: { links: NavLink[] }) {
  const { content } = useContent();
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // Fondo sólido tras el hero; se oculta al bajar y reaparece al subir.
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setSolid(y > 40);
        setHidden(y > 520 && y > last + 4);
        if (y < last - 4) setHidden(false);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Menú móvil: animación de apertura, bloqueo de scroll del fondo, foco atrapado y Escape.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (!open) return;
    document.documentElement.classList.add('menu-open');
    const motion = prefersMotion();
    const rect = toggle.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 40;
    const y = rect ? rect.top + rect.height / 2 : 32;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const tl = gsap.timeline();
    if (motion) {
      tl.fromTo(el, { clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${r}px at ${x}px ${y}px)`, duration: 0.85, ease: 'expo.inOut' })
        .from(el.querySelectorAll('.mnav__link'), { yPercent: 120, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, 0.3)
        .from(el.querySelectorAll('.mnav__foot > *'), { y: 20, opacity: 0, duration: 0.7, stagger: 0.08 }, 0.55);
    }
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('a, button')).filter((n) => !n.hasAttribute('disabled'));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
      if (e.key === 'Tab') {
        const f = [toggle.current!, ...focusables()];
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      tl.kill();
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('menu-open');
    };
  }, [open]);

  return (
    <header className={`nav ${solid ? 'is-solid' : ''} ${hidden && !open ? 'is-hidden' : ''} ${open ? 'is-open' : ''}`}>
      <div className="nav__inner">
        <a className="nav__brand" href="#inicio" onClick={() => setOpen(false)}>
          <Brand compact />
          <span className="sr-only">, ir al inicio</span>
        </a>
        <nav className="nav__links" aria-label="Principal">
          <ul role="list">
            {links.map((l) => (
              <li key={l.href}>
                <a className="nav__link" href={l.href}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav__actions">
          <BookLink variant="nav" place="nav" className="nav__book">
            {content.texts.nav.book}
          </BookLink>
          <button
            ref={toggle}
            type="button"
            className="nav__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
            <span className="nav__toggle-lines" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>
      <div
        id={panelId}
        ref={panel}
        className="mnav"
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        <nav aria-label="Móvil">
          <ul role="list" className="mnav__list">
            {links.map((l, i) => (
              <li key={l.href} className="mnav__item">
                <a className="mnav__link" href={l.href} onClick={() => setOpen(false)}>
                  <span className="mnav__num" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mnav__foot">
          <BookLink variant="primary" place="menu-movil">
            {content.texts.nav.book}
          </BookLink>
          {content.business.phone && (
            <a className="mnav__phone" href={telLink(content.business.phone)}>
              <Phone /> {content.business.phone}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
