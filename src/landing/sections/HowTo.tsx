import { useContent } from '../ContentContext.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { Info, Phone } from '../components/Icons.tsx';
import { Star } from '../components/Ornament.tsx';
import { telLink } from '../../../shared/format.ts';

export function HowTo() {
  const { content, t } = useContent();
  const h = content.texts.howTo;
  const notice = content.booking.notice;
  return (
    <section className="howto" id="reservar" aria-labelledby="howto-title">
      <div className="container">
        <div className="howto__head">
          <p className="eyebrow eyebrow--ink" data-anim="fade-up">
            <Star size={10} /> {t(h.eyebrow)}
          </p>
          <h2 className="howto__title" id="howto-title" data-anim="lines">
            {t(h.title)}
          </h2>
          {h.intro && (
            <p className="howto__intro" data-anim="fade-up">
              {t(h.intro)}
            </p>
          )}
        </div>
        <div className="howto__steps-wrap">
          <span className="howto__track" aria-hidden="true">
            <span className="howto__track-fill" data-anim="draw" />
          </span>
          <ol className="howto__steps" role="list" data-anim="stagger">
            {h.steps.map((s, i) => (
              <li key={s.id} className="howto__step">
                <span className="howto__num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="howto__step-title">
                  <span className="sr-only">Paso {i + 1}: </span>
                  {t(s.title)}
                </h3>
                <p className="howto__step-text">{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="howto__actions" data-anim="fade-up">
          <BookLink variant="primary" place="como-reservar" className="btn--large">
            {h.cta}
          </BookLink>
          {content.business.phone && (
            <a className="link-underline howto__phone" href={telLink(content.business.phone)}>
              <Phone /> {content.business.phone}
            </a>
          )}
        </div>
        {notice.enabled && notice.text && (
          <p className="howto__notice" data-anim="fade-up">
            <Info /> <span>{t(notice.text)}</span>
          </p>
        )}
      </div>
    </section>
  );
}
