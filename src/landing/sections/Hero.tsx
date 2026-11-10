import { PeriodBadge } from './Calendar.tsx';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useContent } from '../ContentContext.tsx';
import { Picture } from '../components/Picture.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { ArrowDown } from '../components/Icons.tsx';
import { DecorArt, Star } from '../components/Ornament.tsx';
import { gsap, prefersMotion, SplitText } from '../anim/choreography.ts';

const DUST = Array.from({ length: 16 }, (_, i) => i);

/** Portada a pantalla completa con titular editorial y entrada coreografiada. */
export function Hero({ play }: { play: boolean }) {
  const { content, t } = useContent();
  const h = content.texts.hero;
  const root = useRef<HTMLElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  // El titular se compone (y se anima) cuando las fuentes están listas: evita saltos de maquetación (CLS).
  const [fontsReady, setFontsReady] = useState(() => typeof document === 'undefined' || document.fonts?.status === 'loaded');
  useEffect(() => {
    if (fontsReady) return;
    let done = false;
    const ready = () => {
      if (!done) setFontsReady(true);
      done = true;
    };
    const t = window.setTimeout(ready, 2500);
    document.fonts?.ready.then(ready).catch(ready);
    return () => window.clearTimeout(t);
  }, [fontsReady]);

  // Prepara la entrada (estado inicial oculto) y el efecto al salir del hero con el scroll.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !fontsReady || !prefersMotion()) return;
    const ctx = gsap.context(() => {
      const split = SplitText.create(el.querySelectorAll('.hero__title-line'), {
        aria: 'none',
        type: 'words',
        wordsClass: 'hero__word',
        mask: 'words',
      });
      const tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
      tl.fromTo('.hero__media .pic', { scale: 1.16 }, { scale: 1, duration: 2.6, ease: 'power3.out' }, 0)
        .from('.hero__shade', { opacity: 0.4, duration: 1.6 }, 0)
        .from('.hero__frame-line', { scaleX: 0, scaleY: 0, duration: 1.6, ease: 'expo.inOut', stagger: 0.08 }, 0.1)
        .from('.hero__eyebrow', { y: 18, opacity: 0, duration: 1 }, 0.35)
        .from(split.words, { yPercent: 115, duration: 1.25, stagger: 0.07 }, 0.45)
        .from('.hero__subtitle', { y: 24, opacity: 0, duration: 1.1 }, 0.95)
        .from('.hero__ctas > *', { y: 24, opacity: 0, duration: 1, stagger: 0.1 }, 1.1)
        .from('.hero__side, .hero__scroll', { opacity: 0, duration: 1.2, stagger: 0.1 }, 1.35)
        .from('.hero__star', { scale: 0, rotate: -120, duration: 1.2, ease: 'back.out(1.6)' }, 1.2)
        .from('.hero__accent', { opacity: 0, y: 40, scale: 0.94, duration: 2, ease: 'power3.out' }, 0.6);
      tlRef.current = tl;

      // Al hacer scroll: el contenido sube y se desvanece; la imagen se desplaza más despacio.
      gsap.to('.hero__content', {
        yPercent: -14,
        opacity: 0.15,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('.hero__media', {
        yPercent: 18,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });
    }, el);
    return () => {
      tlRef.current = null;
      ctx.revert();
    };
  }, [fontsReady]);

  useLayoutEffect(() => {
    if (play && fontsReady) tlRef.current?.play();
  }, [play, fontsReady]);

  // Brillo sutil que sigue al puntero (solo escritorio con ratón).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !prefersMotion() || !window.matchMedia('(pointer: fine)').matches) return;
    const glow = el.querySelector<HTMLElement>('.hero__glow');
    if (!glow) return;
    const xTo = gsap.quickTo(glow, 'x', { duration: 1.2, ease: 'power3' });
    const yTo = gsap.quickTo(glow, 'y', { duration: 1.2, ease: 'power3' });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo(e.clientX - r.left - r.width / 2);
      yTo(e.clientY - r.top - r.height / 2);
    };
    el.addEventListener('pointermove', move);
    return () => el.removeEventListener('pointermove', move);
  }, []);

  return (
    <section className={`hero ${fontsReady ? '' : 'is-fonts-pending'}`} id="inicio" ref={root} aria-labelledby="hero-title">
      <div className="hero__media">
        <Picture image={h.image} sizes="100vw" priority className="hero__pic" />
      </div>
      <div className="hero__shade" aria-hidden="true" />
      <div className="hero__glow" aria-hidden="true" />
      <div className="hero__dust" aria-hidden="true">
        {DUST.map((i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <DecorArt slot="heroAccent" className="hero__accent" />
      <div className="hero__frame" aria-hidden="true">
        <span className="hero__frame-line hero__frame-line--t" />
        <span className="hero__frame-line hero__frame-line--r" />
        <span className="hero__frame-line hero__frame-line--b" />
        <span className="hero__frame-line hero__frame-line--l" />
      </div>

      <div className="hero__content">
        <p className="hero__eyebrow">
          <Star className="hero__star" size={12} />
          <span>{t(h.eyebrow)}</span>
        </p>
        <h1 className="hero__title" id="hero-title">
          {h.titleLead && <span className="hero__title-line hero__title-lead">{t(h.titleLead)}</span>}
          <span className="hero__title-line hero__title-main">{t(h.titleMain)}</span>
          {h.titleAccent && <span className="hero__title-line hero__title-accent">{t(h.titleAccent)}</span>}
        </h1>
        <p className="hero__subtitle">{t(h.subtitle)}</p>
        <PeriodBadge className="hero__period" />
        <div className="hero__ctas">
          <a className="btn btn--primary" href="#menus" data-cta="descubrir">
            <span className="btn__label">{h.primaryCta}</span>
            <ArrowDown className="btn__icon" />
          </a>
          <BookLink variant="ghost" place="hero">
            {h.secondaryCta}
          </BookLink>
        </div>
      </div>

      {h.sideNote && (
        <p className="hero__side" aria-hidden="true">
          {t(h.sideNote)}
        </p>
      )}
      <a className="hero__scroll" href="#la-navidad">
        <span className="hero__scroll-label">{h.scrollHint}</span>
        <span className="hero__scroll-line" aria-hidden="true" />
      </a>
    </section>
  );
}
