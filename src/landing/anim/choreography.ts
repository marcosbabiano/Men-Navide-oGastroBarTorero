/**
 * Coreografía de animaciones de scroll.
 *
 * Los componentes declaran la intención con atributos `data-anim` y este módulo la ejecuta con GSAP:
 *   lines       Titular revelado por líneas con máscara.
 *   words-scrub Párrafo que se «enciende» palabra a palabra al hacer scroll.
 *   fade-up     Aparición suave desde abajo.
 *   stagger     Hijos directos en cascada.
 *   mask        Imagen revelada con máscara (data-dir: up | left | right).
 *   rule        Filete que se dibuja.
 *   draw        Línea que se dibuja siguiendo el scroll (data-axis: x | y).
 *   chars       Letras que suben (palabra de marca del pie).
 *   [data-parallax]  Parallax suave (solo escritorio).
 *
 * Principios: solo transform/opacity/clip-path, nada bloquea el scroll, todo es visible sin JS,
 * `prefers-reduced-motion` desactiva el movimiento y en móvil se reducen los efectos pesados.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger, SplitText };

export const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

export function prefersMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOTION_QUERY).matches;
}

// Reproduce una sola vez sin `once: true` (que destruye el trigger durante un refresh y rompe GSAP).
const ONCE = (trigger: Element, start = 'top 86%') => ({ trigger, start, toggleActions: 'play none none none' });

export function setupScrollAnimations(root: HTMLElement): () => void {
  const mm = gsap.matchMedia(root);
  const splits: SplitText[] = [];

  mm.add(
    {
      motion: MOTION_QUERY,
      desktop: '(min-width: 900px)',
      fine: '(pointer: fine)',
    },
    (ctx) => {
      const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean; fine: boolean };
      if (!motion) return;
      const q = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T & HTMLElement>(sel)).filter((el) => !el.closest('.hero'));

      q('[data-anim="lines"]').forEach((el) => {
        const split = SplitText.create(el, {
          aria: 'none',
          type: 'lines',
          mask: 'lines',
          linesClass: 'split-line',
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.lines, {
              yPercent: 112,
              duration: 1.15,
              ease: 'expo.out',
              stagger: 0.085,
              scrollTrigger: ONCE(el, 'top 88%'),
            }),
        });
        splits.push(split);
      });

      q('[data-anim="words-scrub"]').forEach((el) => {
        const split = SplitText.create(el, { aria: 'none', type: 'words', wordsClass: 'split-word' });
        splits.push(split);
        gsap.fromTo(
          split.words,
          { opacity: 0.16 },
          {
            opacity: 1,
            ease: 'none',
            stagger: 0.06,
            scrollTrigger: { trigger: el, start: 'top 82%', end: desktop ? 'bottom 48%' : 'bottom 62%', scrub: 0.6 },
          },
        );
      });

      q('[data-anim="fade-up"]').forEach((el) => {
        gsap.from(el, { y: 36, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: ONCE(el) });
      });

      q('[data-anim="stagger"]').forEach((el) => {
        gsap.from(el.children, {
          y: 28,
          opacity: 0,
          duration: 0.95,
          ease: 'power3.out',
          stagger: 0.075,
          scrollTrigger: ONCE(el),
        });
      });

      q('[data-anim="mask"]').forEach((el) => {
        const dir = el.dataset.dir ?? 'up';
        const from =
          dir === 'left' ? 'inset(0% 100% 0% 0%)' : dir === 'right' ? 'inset(0% 0% 0% 100%)' : 'inset(100% 0% 0% 0%)';
        const img = el.querySelector('img');
        const tl = gsap.timeline({ scrollTrigger: ONCE(el, 'top 90%') });
        tl.fromTo(el, { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.45, ease: 'expo.inOut' });
        if (img && !img.dataset.parallax) tl.from(img, { scale: 1.28, duration: 1.9, ease: 'expo.out' }, 0.1);
      });

      q('[data-anim="rule"]').forEach((el) => {
        const lines = el.querySelectorAll('.rule__line');
        const diamond = el.querySelector('.rule__diamond');
        const tl = gsap.timeline({ scrollTrigger: ONCE(el, 'top 92%') });
        tl.from(lines, { scaleX: 0, duration: 1.2, ease: 'expo.inOut', stagger: 0 });
        if (diamond) tl.from(diamond, { scale: 0, rotate: 135, duration: 0.8, ease: 'back.out(2)' }, 0.5);
      });

      q('[data-anim="draw"]').forEach((el) => {
        const axis = el.dataset.axis ? (el.dataset.axis === 'y' ? 'scaleY' : 'scaleX') : desktop ? 'scaleX' : 'scaleY';
        gsap.fromTo(
          el,
          { [axis]: 0 },
          {
            [axis]: 1,
            ease: 'none',
            scrollTrigger: { trigger: el.parentElement ?? el, start: 'top 75%', end: 'bottom 60%', scrub: 0.5 },
          },
        );
      });

      q('[data-anim="chars"]').forEach((el) => {
        const split = SplitText.create(el, { aria: 'none', type: 'chars', charsClass: 'split-char' });
        splits.push(split);
        gsap.from(split.chars, {
          yPercent: 100,
          opacity: 0,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.05,
          scrollTrigger: ONCE(el, 'top 95%'),
        });
      });

      if (desktop) {
        q<HTMLImageElement>('[data-parallax]').forEach((img) => {
          const amount = Number(img.dataset.parallax) || 12;
          gsap.set(img, { scale: 1 + amount / 50 });
          gsap.fromTo(
            img,
            { yPercent: -amount / 2 },
            {
              yPercent: amount / 2,
              ease: 'none',
              scrollTrigger: { trigger: img.closest('.pic') ?? img, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          );
        });
      }
    },
  );

  // Recalcular posiciones cuando terminan de cargar fuentes e imágenes.
  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener('load', refresh);
  document.fonts?.ready.then(refresh).catch(() => undefined);

  return () => {
    window.removeEventListener('load', refresh);
    splits.forEach((s) => s.revert());
    mm.revert();
  };
}
