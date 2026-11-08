/**
 * Escenas de la cartelería. Cada una tiene su propia dirección de arte y anima su contenido solo
 * cuando la capa está visible («live»). Todas se dibujan sobre un lienzo lógico de 1920×1080.
 */
import { Component, type ReactNode, useMemo } from 'react';
import { formatPrice } from '../../shared/format.ts';
import { PARTY_PRESETS } from '../../shared/signage.ts';
import type { Scene } from '../../shared/signage.ts';
import { eventDateParts, menuPages, upcomingEvents } from './engine.ts';
import { Letters, Logo, Photo, Qr, type SceneProps, Sparkles, Star } from './common.tsx';
import { LogoLight, PartyLights } from './lights.tsx';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function splitMenuName(name: string): { prefix: string; main: string } {
  const m = /^(men[uú])\s+(.+)$/i.exec(name.trim());
  return m ? { prefix: m[1], main: m[2] } : { prefix: '', main: name.trim() };
}

/* ---------------- Menús ---------------- */
function MenusScene({ scene, data, step, at }: SceneProps<'menus'>) {
  const pages = useMemo(() => menuPages(scene, data.content), [scene, data.content]);
  const page = pages[step % Math.max(1, pages.length)];
  if (!page) return null;
  const { menu } = page;
  const { prefix, main } = splitMenuName(menu.name);
  const price = menu.price.amount !== null ? formatPrice(menu.price.amount) : null;
  const has = (k: string) => menu.sections.some((s) => s.kind === k);
  const includes = [has('drink') && 'bebida', has('dessert') && 'postre'].filter(Boolean) as string[];
  const booking = data.content.booking.url;
  void at;
  return (
    <div className={`sc sc-menus sc-menus--${menu.theme}`}>
      {page.kind === 'cover' ? (
        <div className="sc-menus__cover" key={`c-${menu.id}`}>
          <div className="sc-menus__media">
            <Photo image={menu.image} data={data} className="kb" />
          </div>
          <div className="sc-menus__shade" />
          <div className="sc-menus__coverText">
            <p className="sc-eyebrow anim-up" style={{ animationDelay: '.2s' }}>
              <Star size={22} /> Navidad {data.content.campaign.year} · Menú {ROMAN[page.index] ?? page.index + 1}
            </p>
            {prefix && <p className="sc-menus__prefix anim-up" style={{ animationDelay: '.35s' }}>{prefix}</p>}
            <h1 className="sc-menus__name anim-mask" style={{ animationDelay: '.45s' }}>{main}</h1>
            {menu.subtitle && <p className="sc-menus__subtitle anim-up" style={{ animationDelay: '.8s' }}>{menu.subtitle}</p>}
            <div className="sc-menus__priceRow anim-up" style={{ animationDelay: '1s' }}>
              {price ? (
                <>
                  <span className="sc-menus__price">{price}</span>
                  <span className="sc-menus__unit">{menu.price.unit || 'por persona'}</span>
                </>
              ) : (
                <span className="sc-menus__unit">Precio próximamente</span>
              )}
            </div>
            {includes.length > 0 && <p className="sc-menus__includes anim-up" style={{ animationDelay: '1.2s' }}>Incluye {includes.join(' y ')}</p>}
          </div>
          {scene.showQr && booking && (
            <div className="sc-menus__qr anim-fade" style={{ animationDelay: '1.6s' }}>
              <Qr value={booking} size={170} label="Código QR para reservar" />
              <span>Reserva</span>
            </div>
          )}
        </div>
      ) : (
        <div className="sc-menus__dishes" key={`d-${menu.id}-${page.part}`}>
          <header className="sc-menus__head anim-up">
            <span className="sc-menus__headName">{menu.name}</span>
            {price && <span className="sc-menus__headPrice">{price} <small>{menu.price.unit || 'por persona'}</small></span>}
          </header>
          <div className={`sc-menus__grid ${page.sections.length >= 5 ? 'is-flow' : `cols-${page.sections.length}`}`}>
            {page.sections.map((s, i) => (
              <section className="sc-msec anim-up" key={s.id} style={{ animationDelay: `${0.25 + i * 0.18}s` }}>
                <h2 className="sc-msec__title">{s.title}</h2>
                {s.kind === 'choice' && <p className="sc-msec__hint">{s.choose > 1 ? `Elige ${s.choose}` : 'A elegir uno'}</p>}
                {s.kind === 'shared' && <p className="sc-msec__hint">Para compartir</p>}
                <ul>
                  {s.items.map((it, k) => (
                    <li key={it.id} className="anim-up" style={{ animationDelay: `${0.45 + i * 0.18 + k * 0.07}s` }}>
                      <span className="sc-msec__item">{it.name}</span>
                      {it.quantity && <span className="sc-msec__qty">{it.quantity}</span>}
                      {it.detail && <span className="sc-msec__detail">{it.detail}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {page.parts > 1 && <p className="sc-menus__part">{page.part} / {page.parts}</p>}
        </div>
      )}
      <div className="sc-progress" aria-hidden="true">
        {pages.map((_, i) => (
          <span key={i} className={i === step % pages.length ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

/* ---------------- Evento ---------------- */
function EventScene({ scene, data }: SceneProps<'event'>) {
  const e = data.events.find((x) => x.id === scene.eventId);
  if (!e) return null;
  const d = eventDateParts(e.date);
  return (
    <div className={`sc sc-event sc-event--${e.style}`}>
      <div className="sc-event__bg">
        {e.backgroundImage ? <Photo image={e.backgroundImage} data={data} className="kb" /> : <div className="sc-event__gradient" />}
      </div>
      <div className="sc-event__shade" />
      {e.style === 'celebration' && <Sparkles count={36} seed={7} />}
      <div className="sc-event__text">
        {e.highlight && <p className="sc-event__highlight anim-up" style={{ animationDelay: '.2s' }}>{e.highlight}</p>}
        <h1 className="sc-event__name anim-mask" style={{ animationDelay: '.35s' }}>{e.name}</h1>
        {d && (
          <div className="sc-event__date anim-up" style={{ animationDelay: '.75s' }}>
            <span className="sc-event__day">{d.day}</span>
            <span className="sc-event__dm">
              <span>{d.weekday}</span>
              <span>{d.month}</span>
            </span>
            {e.time && <span className="sc-event__time">{e.time} h</span>}
          </div>
        )}
        {!d && e.time && <p className="sc-event__time anim-up">{e.time} h</p>}
        {e.description && <p className="sc-event__desc anim-up" style={{ animationDelay: '1s' }}>{e.description}</p>}
      </div>
      {e.artistImage && (
        <div className="sc-event__artist anim-reveal" style={{ animationDelay: '.5s' }}>
          <Photo image={e.artistImage} data={data} width={1280} className="kb-slow" />
        </div>
      )}
      <Logo content={data.content} data={data} scale={0.32} className="sc-event__logo anim-fade" />
    </div>
  );
}

/* ---------------- Próximos eventos ---------------- */
function EventsScene({ scene, data, at }: SceneProps<'events'>) {
  const list = upcomingEvents(data.events, at, scene.max);
  return (
    <div className="sc sc-events">
      <Sparkles count={18} seed={3} />
      <header className="sc-events__head">
        <p className="sc-eyebrow anim-up"><Star size={20} /> Agenda</p>
        <h1 className="anim-mask" style={{ animationDelay: '.2s' }}>Próximos eventos</h1>
      </header>
      <div className={`sc-events__list n-${list.length}`}>
        {list.map((e, i) => {
          const d = eventDateParts(e.date);
          return (
            <article className="sc-events__card anim-up" key={e.id} style={{ animationDelay: `${0.5 + i * 0.25}s` }}>
              <div className="sc-events__img">
                <Photo image={e.artistImage ?? e.backgroundImage} data={data} width={640} />
              </div>
              <div className="sc-events__body">
                {d && <p className="sc-events__date">{d.weekday} {d.day} de {d.month}{e.time ? ` · ${e.time} h` : ''}</p>}
                <h2>{e.name}</h2>
                {e.highlight && <p className="sc-events__hl">{e.highlight}</p>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Fotografías ---------------- */
function PhotosScene({ scene, data, step }: SceneProps<'photos'>) {
  const images = scene.images.filter((i) => data.media[i.asset]);
  if (!images.length) return null;
  const idx = step % images.length;
  const prev = (idx - 1 + images.length) % images.length;
  return (
    <div className={`sc sc-photos sc-photos--${scene.effect}`}>
      {images.length > 1 && step > 0 && (
        <div className="sc-photos__frame is-prev" key={`p-${step}`}>
          <Photo image={images[prev]} data={data} />
        </div>
      )}
      <div className="sc-photos__frame is-cur" key={`c-${step}`} style={{ ['--dur' as string]: `${scene.duration + 2}s` }}>
        <Photo image={images[idx]} data={data} className={`fx-${scene.effect} fx-dir-${step % 4}`} />
      </div>
      <div className="sc-photos__shade" />
      <div className="sc-photos__caption anim-up" key={`t-${step}`}>
        <Logo content={data.content} data={data} scale={0.28} />
        {scene.caption && <p>{scene.caption}</p>}
      </div>
    </div>
  );
}

/* ---------------- Mensaje ---------------- */
function MessageScene({ scene, data }: SceneProps<'message'>) {
  const Title = scene.animation === 'letters' ? <Letters text={scene.text} baseDelay={0.4} /> : scene.text;
  return (
    <div className={`sc sc-message sc-message--${scene.style} sc-anim--${scene.animation}`} style={{ ['--accent' as string]: scene.accent }}>
      <div className="sc-message__bg">{scene.background && <Photo image={scene.background} data={data} className="kb" />}</div>
      <div className="sc-message__shade" />
      {(scene.style === 'christmas' || scene.style === 'elegant') && <Sparkles count={scene.style === 'christmas' ? 40 : 16} seed={scene.text.length + 2} />}
      <div className="sc-message__inner">
        {scene.showLogo && <Logo content={data.content} data={data} scale={0.45} className="sc-message__logo anim-fade" />}
        {scene.style === 'christmas' && <Star className="sc-message__star anim-fade" size={46} />}
        <h1 className={`sc-message__text ${scene.animation === 'reveal' ? 'anim-mask' : scene.animation === 'fade' ? 'anim-fade' : ''}`} style={{ animationDelay: '.3s' }}>
          {Title}
        </h1>
        <span className="sc-message__rule anim-line" style={{ animationDelay: '1.1s' }} aria-hidden="true" />
        {scene.subtext && <p className="sc-message__sub anim-up" style={{ animationDelay: '1.3s' }}>{scene.subtext}</p>}
      </div>
    </div>
  );
}

/* ---------------- Reservas ---------------- */
function BookingScene({ scene, data }: SceneProps<'booking'>) {
  const c = data.content;
  const url = c.booking.url;
  const phone = c.business.verified.phone ? c.business.phone : '';
  let host = '';
  try {
    host = new URL(url).host.replace(/^www\./, '');
  } catch {
    host = '';
  }
  return (
    <div className="sc sc-booking">
      <Sparkles count={20} seed={11} />
      <div className="sc-booking__text">
        <p className="sc-eyebrow anim-up"><Star size={20} /> {c.business.name}</p>
        <h1 className="anim-mask" style={{ animationDelay: '.25s' }}>{scene.title}</h1>
        {scene.subtext && <p className="sc-booking__sub anim-up" style={{ animationDelay: '.7s' }}>{scene.subtext}</p>}
        {phone && <p className="sc-booking__phone anim-up" style={{ animationDelay: '.9s' }}>{phone}</p>}
      </div>
      {scene.showQr && url && (
        <div className="sc-booking__qr anim-reveal" style={{ animationDelay: '.6s' }}>
          <Qr value={url} size={440} label="Código QR de reservas" />
          {host && <span>{host}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------- Logotipo y fiesta ---------------- */
function LogoScene(props: SceneProps<'logo'>) {
  const { scene, data } = props;
  return (
    <div className={`sc sc-logoScene sc-logoScene--${scene.mood}`}>
      <LogoLight mood={scene.mood} particles={scene.particles} running={props.live && !props.paused} quality={props.quality} />
      <div className="sc-logoScene__center">
        <Logo content={data.content} data={data} scale={1} className="anim-logo" />
        {scene.tagline && <p className="sc-logoScene__tagline anim-up" style={{ animationDelay: '1.4s' }}>{scene.tagline}</p>}
      </div>
    </div>
  );
}

function PartyScene(props: SceneProps<'party'>) {
  const { scene, data } = props;
  const p = scene.party ?? PARTY_PRESETS['gold-night'].config;
  return (
    <div className="sc sc-party" style={{ background: p.background }}>
      <PartyLights party={p} running={props.live && !props.paused} quality={props.quality} />
      <div className="sc-party__center" style={{ transform: `translateY(${-p.logoY * 1080}px)` }}>
        <Logo content={data.content} data={data} scale={p.logoScale} className="sc-party__logo anim-logo" />
        {p.text && <p className="sc-party__text anim-up" style={{ animationDelay: '1.2s' }}>{p.text}</p>}
      </div>
    </div>
  );
}

/* ---------------- Despachador ---------------- */
export function SceneView(props: Omit<SceneProps, 'scene'> & { scene: Scene }) {
  const s = props.scene;
  switch (s.type) {
    case 'menus':
      return <MenusScene {...props} scene={s} />;
    case 'event':
      return <EventScene {...props} scene={s} />;
    case 'events':
      return <EventsScene {...props} scene={s} />;
    case 'photos':
      return <PhotosScene {...props} scene={s} />;
    case 'message':
      return <MessageScene {...props} scene={s} />;
    case 'booking':
      return <BookingScene {...props} scene={s} />;
    case 'logo':
      return <LogoScene {...props} scene={s} />;
    case 'party':
      return <PartyScene {...props} scene={s} />;
  }
}

/** Si una escena falla, no se queda la pantalla en blanco: se informa y se salta. */
export class SceneBoundary extends Component<{ onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? <div className="sc sc-failed" /> : this.props.children;
  }
}
