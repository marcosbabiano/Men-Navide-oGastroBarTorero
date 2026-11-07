import type { LayoutSection } from '../../../shared/schema.ts';
import { sectionAnchor } from '../../../shared/layout.ts';
import { useContent } from '../ContentContext.tsx';
import { Picture } from '../components/Picture.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { ArrowUpRight } from '../components/Icons.tsx';
import { Rule, Star } from '../components/Ornament.tsx';

/** Botón de un bloque: sin enlace → reservas (mismo componente seguro que el resto de la web). */
function BlockCta({ label, href, place }: { label: string; href: string; place: string }) {
  if (!label) return null;
  if (!href) return <BookLink place={place}>{label}</BookLink>;
  const external = href.startsWith('https://');
  return (
    <a className="btn btn--primary" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <span className="btn__label">{label}</span>
      {external && <ArrowUpRight className="btn__icon" />}
      {external && <span className="sr-only"> (se abre en una pestaña nueva)</span>}
    </a>
  );
}

/** Secciones creadas desde el panel con plantillas prediseñadas. */
export function CustomBlock({ section }: { section: LayoutSection }) {
  const { t } = useContent();
  const b = section.block;
  if (!b) return null;
  const id = sectionAnchor(section);
  const titleId = `${id}-title`;
  const hasTitle = !!b.title.trim();
  const text = (
    <div className="cblock__text">
      {b.eyebrow && (
        <p className="eyebrow" data-anim="fade-up">
          <Star size={10} /> {t(b.eyebrow)}
        </p>
      )}
      {hasTitle && (
        <h2 className="cblock__title" id={titleId} data-anim="lines">
          {t(b.title)}
        </h2>
      )}
      {b.subtitle && (
        <p className="cblock__subtitle" data-anim="fade-up">
          {t(b.subtitle)}
        </p>
      )}
      {b.body && (
        <div className="cblock__body" data-anim="fade-up">
          {t(b.body)
            .split(/\n{2,}/)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </div>
      )}
      {b.cta.label && (
        <div className="cblock__cta" data-anim="fade-up">
          <BlockCta label={t(b.cta.label)} href={b.cta.href} place={`bloque-${section.id}`} />
        </div>
      )}
    </div>
  );
  const cls = `cblock cblock--${b.template} cblock--${b.tone}`;
  const labelled = hasTitle ? { 'aria-labelledby': titleId } : { 'aria-label': section.label };

  switch (b.template) {
    case 'image-text':
    case 'text-image':
      return (
        <section className={cls} id={id} {...labelled}>
          <div className="container cblock__split">
            <figure className="cblock__fig" data-anim="mask" data-dir={b.template === 'image-text' ? 'right' : 'left'}>
              <Picture image={b.images[0]} sizes="(min-width: 900px) 45vw, 92vw" parallax={8} />
            </figure>
            {text}
          </div>
        </section>
      );
    case 'fullbleed':
      return (
        <section className={cls} id={id} {...labelled}>
          <div className="cblock__bg">
            <Picture image={b.images[0]} sizes="100vw" parallax={14} />
          </div>
          <div className="cblock__shade" aria-hidden="true" />
          <div className="container">{text}</div>
        </section>
      );
    case 'gallery':
      return (
        <section className={cls} id={id} {...labelled}>
          <div className="container">
            {text}
            <ul className={`cblock__gallery cblock__gallery--${Math.min(b.images.length, 6)}`} role="list">
              {b.images.map((img, i) => (
                <li key={`${img.asset}-${i}`} className="cblock__gitem" data-anim="mask" data-dir={i % 2 ? 'left' : 'up'}>
                  <Picture image={img} sizes="(min-width: 900px) 33vw, 50vw" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    case 'quote':
      return (
        <section className={cls} id={id} {...labelled}>
          <div className="container cblock__quote">
            <Star className="cblock__quote-star spin-slow" size={22} />
            {hasTitle && (
              <h2 className="cblock__quote-text" id={titleId} data-anim="lines">
                {t(b.title)}
              </h2>
            )}
            {b.subtitle && <p className="cblock__quote-sign">— {t(b.subtitle)}</p>}
            {b.cta.label && <BlockCta label={t(b.cta.label)} href={b.cta.href} place={`bloque-${section.id}`} />}
          </div>
        </section>
      );
    case 'divider':
      return (
        <div className={cls} id={id} role="separator" aria-label={b.title || section.label}>
          <div className="container">
            {b.images[0] ? (
              <div className="cblock__ornament" data-anim="fade-up">
                <Picture image={b.images[0]} sizes="(min-width: 900px) 40vw, 80vw" decorative className="pic--contain" />
              </div>
            ) : (
              <Rule />
            )}
            {b.title && <p className="cblock__divider-text">{t(b.title)}</p>}
          </div>
        </div>
      );
    case 'cta':
      return (
        <section className={cls} id={id} {...labelled}>
          <div className="container cblock__ctawrap">{text}</div>
        </section>
      );
    case 'info':
    default:
      return (
        <section className={cls} id={id} {...labelled}>
          <div className="container">
            <div className="cblock__card">{text}</div>
          </div>
        </section>
      );
  }
}
