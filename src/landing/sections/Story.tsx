import { useContent } from '../ContentContext.tsx';
import { Picture } from '../components/Picture.tsx';
import { Star } from '../components/Ornament.tsx';

export function Story() {
  const { content, t } = useContent();
  const s = content.texts.story;
  const [img1, img2] = s.images;
  return (
    <section className="story" id="la-navidad" aria-labelledby="story-title">
      <div className="story__grain" aria-hidden="true" />
      <div className="container story__grid">
        <div className="story__head">
          <p className="eyebrow eyebrow--ink" data-anim="fade-up">
            <Star size={10} /> {t(s.eyebrow)}
          </p>
          <h2 className="story__title" id="story-title" data-anim="lines">
            {t(s.title)}
          </h2>
        </div>
        <p className="story__lead" data-anim="words-scrub">
          {t(s.lead)}
        </p>
        <div className="story__body" data-anim="stagger">
          {s.body.map((p, i) => (
            <p key={i}>{t(p)}</p>
          ))}
        </div>
        {img1 && (
          <figure className="story__fig story__fig--a" data-anim="mask">
            <Picture image={img1} sizes="(min-width: 900px) 40vw, 86vw" parallax={10} />
          </figure>
        )}
        {img2 && (
          <figure className="story__fig story__fig--b" data-anim="mask" data-dir="left">
            <Picture image={img2} sizes="(min-width: 900px) 24vw, 56vw" />
          </figure>
        )}
        {s.quote && (
          <blockquote className="story__quote" data-anim="fade-up">
            <Star className="story__quote-star spin-slow" size={22} />
            <p>{t(s.quote)}</p>
          </blockquote>
        )}
      </div>
    </section>
  );
}
