import { useContent } from '../ContentContext.tsx';
import { Picture } from '../components/Picture.tsx';
import { Star } from '../components/Ornament.tsx';
import { telLink } from '../../../shared/format.ts';

/** Se muestra cuando la campaña está desactivada desde el panel. */
export function Inactive() {
  const { content, t } = useContent();
  const c = content.campaign;
  return (
    <section className="hero hero--inactive" id="inicio" aria-labelledby="inactive-title">
      <div className="hero__media">
        <Picture image={content.texts.hero.image} sizes="100vw" priority />
      </div>
      <div className="hero__shade" aria-hidden="true" />
      <div className="hero__content">
        <p className="hero__eyebrow">
          <Star size={12} /> <span>{content.business.name}</span>
        </p>
        <h1 className="hero__title hero__title--small" id="inactive-title">
          {t(c.inactiveTitle)}
        </h1>
        <p className="hero__subtitle">{t(c.inactiveMessage)}</p>
        {content.business.phone && (
          <div className="hero__ctas">
            <a className="btn btn--primary" href={telLink(content.business.phone)}>
              <span className="btn__label">Llamar al {content.business.phone}</span>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
