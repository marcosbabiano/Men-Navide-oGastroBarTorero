import { useEffect, useState } from 'react';
import { useContent } from '../ContentContext.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { formatPrice, minPrice } from '../../../shared/format.ts';

/**
 * Barra de reserva persistente en móvil: aparece tras el hero y se oculta al llegar al pie
 * (donde ya hay un botón grande). Altura contenida (56 px + zona segura).
 */
export function MobileBar() {
  const { content } = useContent();
  const [visible, setVisible] = useState(false);
  const from = minPrice(content.menus);

  useEffect(() => {
    const hero = document.getElementById('inicio');
    const foot = document.getElementById('contacto');
    let pastHero = false;
    let atFoot = false;
    const update = () => setVisible(pastHero && !atFoot);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) pastHero = !e.isIntersecting;
        if (e.target === foot) atFoot = e.isIntersecting;
      }
      update();
    });
    if (hero) io.observe(hero);
    if (foot) io.observe(foot);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`mbar ${visible ? 'is-visible' : ''}`} aria-hidden={!visible} inert={!visible}>
      <div className="mbar__text">
        {from !== null ? (
          <>
            <span className="mbar__label">{content.texts.mobileBar.label}</span>
            <span className="mbar__price">{formatPrice(from)}</span>
          </>
        ) : (
          <span className="mbar__label">{content.business.name}</span>
        )}
      </div>
      <BookLink variant="bar" place="barra-movil">
        {content.texts.mobileBar.cta}
      </BookLink>
    </div>
  );
}
