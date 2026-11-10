import { Calendar } from './sections/Calendar.tsx';
import { hasCalendar } from '../../shared/calendar.ts';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicPayload } from '../../shared/public.ts';
import { themeToCssVars } from '../../shared/theme.ts';
import { ContentProvider, useContent } from './ContentContext.tsx';
import { setupScrollAnimations, prefersMotion } from './anim/choreography.ts';
import { Intro } from './sections/Intro.tsx';
import { Nav, type NavLink } from './sections/Nav.tsx';
import { Hero } from './sections/Hero.tsx';
import { Story } from './sections/Story.tsx';
import { Menus } from './sections/Menus.tsx';
import { Compare } from './sections/Compare.tsx';
import { Celebration } from './sections/Celebration.tsx';
import { HowTo } from './sections/HowTo.tsx';
import { Faq } from './sections/Faq.tsx';
import { About, Footer } from './sections/Footer.tsx';
import { MobileBar } from './sections/MobileBar.tsx';
import { PreviewBanner } from './sections/PreviewBanner.tsx';
import { Inactive } from './sections/Inactive.tsx';
import { Star } from './components/Ornament.tsx';
import { CustomBlock } from './sections/CustomBlock.tsx';
import { sectionAnchor } from '../../shared/layout.ts';
import type { LayoutSection } from '../../shared/schema.ts';

const INTRO_KEY = 'torero:intro-visto';
const INTRO_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function introAlreadySeen(): boolean {
  try {
    const v = Number(localStorage.getItem(INTRO_KEY) ?? 0);
    return Date.now() - v < INTRO_TTL_MS;
  } catch {
    return false;
  }
}
function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, String(Date.now()));
  } catch {
    /* almacenamiento no disponible: la intro podría repetirse */
  }
}

function Page({ preview }: { preview?: { includeDrafts: boolean; onToggle: () => void } }) {
  const { content, t } = useContent();
  const main = useRef<HTMLDivElement>(null);
  const announcement = content.campaign.announcement;
  const showIntro = useMemo(
    () => content.campaign.active && content.campaign.introEnabled && !preview && prefersMotion() && !introAlreadySeen(),
    [content.campaign.active, content.campaign.introEnabled, preview],
  );
  const [introMounted, setIntroMounted] = useState(showIntro);
  const [heroPlay, setHeroPlay] = useState(!showIntro);

  useEffect(() => {
    if (showIntro) markIntroSeen();
  }, [showIntro]);

  // Las animaciones de scroll se preparan en un momento ocioso para no bloquear la primera interacción.
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    let cleanup: (() => void) | undefined;
    const run = () => (cleanup = setupScrollAnimations(el));
    const hasIdle = 'requestIdleCallback' in window;
    const id = hasIdle ? window.requestIdleCallback(run, { timeout: 900 }) : window.setTimeout(run, 120);
    return () => {
      if (hasIdle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
      cleanup?.();
    };
  }, [content]);

  const n = content.texts.nav;
  const sections = content.layout.sections.filter((s) => s.visible);
  const links: NavLink[] = [
    ...sections
      .filter((s) => s.navLabel.trim() && !(s.type === 'compare' && content.menus.length < 2) && !(s.type === 'calendar' && !hasCalendar(content.calendar)))
      .map((s) => ({ href: `#${sectionAnchor(s)}`, label: s.navLabel })),
    { href: '#contacto', label: n.contact },
  ];

  const renderSection = (s: LayoutSection) => {
    switch (s.type) {
      case 'hero':
        return (
          <Fragment key={s.id}>
            <Hero play={heroPlay} />
            {announcement.enabled && announcement.text && (
              <div className="announce" role="note">
                <Star size={12} /> <span>{t(announcement.text)}</span>
              </div>
            )}
          </Fragment>
        );
      case 'story':
        return <Story key={s.id} />;
      case 'menus':
        return <Menus key={s.id} />;
      case 'calendar':
        return <Calendar key={s.id} />;
      case 'compare':
        return <Compare key={s.id} />;
      case 'celebration':
        return <Celebration key={s.id} />;
      case 'howTo':
        return <HowTo key={s.id} />;
      case 'faq':
        return <Faq key={s.id} />;
      case 'about':
        return <About key={s.id} />;
      default:
        return <CustomBlock key={s.id} section={s} />;
    }
  };


  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      {preview && <PreviewBanner includeDrafts={preview.includeDrafts} onToggle={preview.onToggle} />}
      {introMounted && <Intro onReveal={() => setHeroPlay(true)} onComplete={() => setIntroMounted(false)} />}
      <Nav links={content.campaign.active ? links : [{ href: '#contacto', label: n.contact }]} />
      <div className="grain" aria-hidden="true" />
      <main id="contenido" ref={main} tabIndex={-1}>
        {content.campaign.active ? (
          sections.map(renderSection)
        ) : (
          <Inactive />
        )}
      </main>
      <Footer />
      {content.campaign.active && <MobileBar />}
    </>
  );
}

export function LandingApp({
  payload,
  preview,
}: {
  payload: PublicPayload;
  preview?: { includeDrafts: boolean; onToggle: () => void };
}) {
  // Aplica la paleta configurada (por si no llegó inyectada en el HTML, p. ej. en la vista previa).
  useLayoutEffect(() => {
    const vars = themeToCssVars(payload.content.campaign.theme);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  }, [payload]);
  return (
    <ContentProvider payload={payload}>
      <Page preview={preview} />
    </ContentProvider>
  );
}
