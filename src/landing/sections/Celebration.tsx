import { useContent } from '../ContentContext.tsx';
import { Picture } from '../components/Picture.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { Star } from '../components/Ornament.tsx';

export function Celebration() {
  const { content, t } = useContent();
  const c = content.texts.celebration;
  const [main, second, third] = c.images;
  const words = c.moments.length ? [...c.moments, ...c.moments] : [];
  return (
    <section className="celebration" id="celebrar" aria-labelledby="celebration-title">
      <div className="celebration__stage">
        <div className="celebration__bg">
          <Picture image={main} sizes="100vw" parallax={14} />
        </div>
        <div className="celebration__shade" aria-hidden="true" />
        <div className="container celebration__content">
          <p className="eyebrow" data-anim="fade-up">
            <Star size={10} /> {t(c.eyebrow)}
          </p>
          <h2 className="celebration__title" id="celebration-title" data-anim="lines">
            {t(c.title)}
          </h2>
        </div>
      </div>

      {words.length > 0 && (
        <div className="marquee" aria-hidden="true">
          <div className="marquee__track">
            {[0, 1].map((k) => (
              <div className="marquee__group" key={k}>
                {words.map((w, i) => (
                  <span key={`${k}-${i}`} className="marquee__item">
                    {w}
                    <Star size={14} className="marquee__star" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {c.moments.length > 0 && <p className="sr-only">{c.moments.join(', ')}</p>}

      <div className="container celebration__grid">
        <div className="celebration__text">
          <p className="celebration__body" data-anim="fade-up">
            {t(c.body)}
          </p>
          <div className="celebration__cta" data-anim="fade-up">
            <BookLink variant="primary" place="celebracion">
              {c.cta}
            </BookLink>
          </div>
        </div>
        {second && (
          <figure className="celebration__fig celebration__fig--a" data-anim="mask">
            <Picture image={second} sizes="(min-width: 900px) 34vw, 70vw" />
          </figure>
        )}
        {third && (
          <figure className="celebration__fig celebration__fig--b" data-anim="mask" data-dir="right">
            <Picture image={third} sizes="(min-width: 900px) 22vw, 50vw" />
          </figure>
        )}
      </div>
    </section>
  );
}
