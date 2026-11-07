import { useContent } from '../ContentContext.tsx';
import { Picture } from '../components/Picture.tsx';
import { BookLink } from '../components/BookLink.tsx';
import { ArrowUpRight, Clock, Facebook, Globe, Instagram, Phone, Pin, TikTok, WhatsApp } from '../components/Icons.tsx';
import { Rule, Star } from '../components/Ornament.tsx';
import { Brand } from './Nav.tsx';
import { formatAddress, formatDateEs, formatRanges, groupWeekly, mapsLink, telLink } from '../../../shared/format.ts';
import { splitBrand } from '../brand.ts';

const SOCIAL = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'tiktok', label: 'TikTok', Icon: TikTok },
  { key: 'whatsapp', label: 'WhatsApp', Icon: WhatsApp },
  { key: 'google', label: 'Google', Icon: Globe },
  { key: 'tripadvisor', label: 'Tripadvisor', Icon: Globe },
] as const;

export function About() {
  const { content, t } = useContent();
  const a = content.texts.about;
  return (
    <section className="about" id="nosotros" aria-labelledby="about-title">
      <div className="container about__grid">
        {a.image && (
          <figure className="about__fig" data-anim="mask">
            <Picture image={a.image} sizes="(min-width: 900px) 44vw, 92vw" parallax={10} />
          </figure>
        )}
        <div className="about__text">
          <p className="eyebrow" data-anim="fade-up">
            <Star size={10} /> {t(a.eyebrow)}
          </p>
          <h2 className="about__title" id="about-title" data-anim="lines">
            {t(a.title)}
          </h2>
          <p className="about__body" data-anim="fade-up">
            {t(a.body)}
          </p>
        </div>
      </div>
    </section>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Hours() {
  const { content, t } = useContent();
  const h = content.business.hours;
  if (!h.verified) return <p className="foot__muted">{t(h.unverifiedMessage)}</p>;
  const weekly = groupWeekly(h.weekly);
  const today = todayIso();
  const specials = [...h.specials].filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="hours">
      {weekly.length > 0 && (
        <dl className="hours__list">
          {weekly.map((w) => (
            <div key={w.label} className="hours__row">
              <dt>{w.label}</dt>
              <dd>{w.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {specials.length > 0 && (
        <>
          <p className="hours__special-title">Horarios especiales</p>
          <dl className="hours__list hours__list--special">
            {specials.map((s) => (
              <div key={s.id} className="hours__row">
                <dt>
                  {s.label || formatDateEs(s.date)}
                  {s.label && <span className="hours__date"> · {formatDateEs(s.date)}</span>}
                </dt>
                <dd>
                  {s.closed ? 'Cerrado' : formatRanges(s.ranges)}
                  {s.note && <span className="hours__note">{s.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {h.note && <p className="foot__muted">{t(h.note)}</p>}
    </div>
  );
}

export function Footer() {
  const { content, t } = useContent();
  const b = content.business;
  const socials = SOCIAL.filter((s) => b.social[s.key]);
  const brand = splitBrand(b.name);
  const year = content.campaign.year;
  return (
    <footer className="foot" id="contacto" aria-labelledby="foot-title">
      <div className="foot__glow" aria-hidden="true" />
      <div className="container">
        <div className="foot__closing">
          <h2 className="foot__title" id="foot-title" data-anim="lines">
            {t(content.texts.footer.closing)}
          </h2>
          <BookLink variant="primary" place="footer" className="btn--large">
            {content.texts.nav.book}
          </BookLink>
        </div>
        <Rule />
        <div className="foot__grid" data-anim="stagger">
          <div className="foot__col">
            <h3 className="foot__label">
              <Pin /> Visítanos
            </h3>
            <address className="foot__address">
              <span>{b.address.street}</span>
              <span>
                {[b.address.postalCode, b.address.locality].filter(Boolean).join(' ')}
                {b.address.region ? ` (${b.address.region})` : ''}
              </span>
            </address>
            <a className="link-underline foot__link" href={mapsLink(content)} target="_blank" rel="noopener noreferrer">
              Cómo llegar en Google Maps <ArrowUpRight />
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </div>
          <div className="foot__col">
            <h3 className="foot__label">
              <Phone /> Llámanos
            </h3>
            {b.phone && (
              <a className="foot__phone" href={telLink(b.phone)}>
                {b.phone}
              </a>
            )}
            {b.email && (
              <a className="link-underline foot__link" href={`mailto:${b.email}`}>
                {b.email}
              </a>
            )}
            {b.contactMessage && <p className="foot__muted">{t(b.contactMessage)}</p>}
          </div>
          <div className="foot__col">
            <h3 className="foot__label">
              <Clock /> Horario
            </h3>
            <Hours />
          </div>
          <div className="foot__col">
            <h3 className="foot__label">
              <Star size={14} /> Reservas
            </h3>
            <p className="foot__muted">{t(content.texts.howTo.intro)}</p>
            <BookLink variant="link" place="footer-reservas">
              Reservar online
            </BookLink>
            {socials.length > 0 && (
              <ul className="foot__social" role="list" aria-label="Redes sociales">
                {socials.map(({ key, label, Icon }) => (
                  <li key={key}>
                    <a href={b.social[key]} target="_blank" rel="noopener noreferrer" aria-label={`${label} (se abre en una pestaña nueva)`}>
                      <Icon />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="foot__word" aria-hidden="true">
        <span data-anim="chars">{brand.big}</span>
      </div>
      <div className="container foot__bottom">
        <a href="#inicio" className="foot__brand">
          <Brand compact />
          <span className="sr-only">, volver al inicio</span>
        </a>
        <p>
          © {year} {b.name} · {formatAddress(content)}
        </p>
        <p>Fotografías ilustrativas (Unsplash): no representan exactamente los platos servidos.</p>
        {content.texts.footer.legal && <p className="foot__legal">{t(content.texts.footer.legal)}</p>}
        <p>Esta web no utiliza cookies de seguimiento ni analítica.</p>
      </div>
    </footer>
  );
}
