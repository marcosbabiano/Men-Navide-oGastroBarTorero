import { useLayoutEffect, useRef } from 'react';
import { gsap, SplitText } from '../anim/choreography.ts';
import { useContent } from '../ContentContext.tsx';
import { Star } from '../components/Ornament.tsx';
import { splitBrand } from '../brand.ts';

/**
 * Entrada cinematográfica (≈2,8 s). Solo en la primera visita y con movimiento permitido.
 * Se puede saltar con el botón, Escape, rueda, gesto táctil o teclado: nunca bloquea el scroll.
 */
export function Intro({ onReveal, onComplete }: { onReveal: () => void; onComplete: () => void }) {
  const { content, t, media } = useContent();
  const root = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onReveal, onComplete });
  cbs.current = { onReveal, onComplete };
  const brand = splitBrand(content.business.name);
  const logo = content.campaign.logo ? media[content.campaign.logo.asset] : undefined;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      cbs.current.onReveal();
    };
    const finish = () => {
      reveal();
      cbs.current.onComplete();
    };
    const word = el.querySelector('.intro__word');
    const split = word ? SplitText.create(word, { aria: 'none', type: 'chars', charsClass: 'intro__char' }) : null;
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish });
    tl.set(el, { autoAlpha: 1 })
      .from('.intro__line', { scaleX: 0, duration: 0.9, ease: 'expo.inOut' }, 0.1)
      .from('.intro__eyebrow', { y: 14, opacity: 0, duration: 0.8 }, 0.45)
      .from(split?.chars ?? [], { yPercent: 110, opacity: 0, duration: 1.1, stagger: 0.045 }, 0.5)
      .from('.intro__logo', { opacity: 0, scale: 0.94, duration: 1 }, 0.5)
      .from('.intro__sub', { y: 10, opacity: 0, duration: 0.8 }, 1.05)
      .from('.intro__star', { scale: 0, rotate: -180, opacity: 0, duration: 1.1, ease: 'back.out(1.8)' }, 1.0)
      .to('.intro__content', { opacity: 0, y: -18, duration: 0.55, ease: 'power2.in' }, 2.05)
      .to('.intro__panel--top', { yPercent: -100, duration: 1.05, ease: 'expo.inOut' }, 2.25)
      .to('.intro__panel--bottom', { yPercent: 100, duration: 1.05, ease: 'expo.inOut' }, 2.25)
      .call(reveal, [], 2.35)
      .to('.intro__skip', { opacity: 0, duration: 0.3 }, 2.25);

    const skip = () => {
      if (tl.progress() < 0.8) tl.timeScale(4.5);
    };
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'Enter', ' ', 'ArrowDown', 'PageDown', 'Tab'].includes(e.key)) skip();
    };
    window.addEventListener('wheel', skip, { passive: true });
    window.addEventListener('touchmove', skip, { passive: true });
    window.addEventListener('keydown', onKey);
    el.addEventListener('pointerdown', skip);
    el.querySelector('.intro__skip')?.addEventListener('click', skip);
    return () => {
      window.removeEventListener('wheel', skip);
      window.removeEventListener('touchmove', skip);
      window.removeEventListener('keydown', onKey);
      tl.kill();
      split?.revert();
    };
  }, []);

  return (
    <div className="intro" ref={root}>
      <div className="intro__panel intro__panel--top" aria-hidden="true" />
      <div className="intro__panel intro__panel--bottom" aria-hidden="true" />
      <div className="intro__content" aria-hidden="true">
        {logo ? (
          <img className="intro__logo" src={logo.src.startsWith('/api') ? logo.src : `${logo.src}-640.webp`} alt="" />
        ) : (
          <>
            <span className="intro__eyebrow">{brand.small}</span>
            <span className="intro__word">{brand.big}</span>
          </>
        )}
        <span className="intro__line" />
        <span className="intro__sub">{t(content.texts.intro.line)}</span>
        <Star className="intro__star" size={16} />
      </div>
      <button type="button" className="intro__skip">
        {content.texts.intro.skip}
      </button>
    </div>
  );
}
