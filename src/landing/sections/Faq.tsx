import { useId, useState } from 'react';
import { useContent } from '../ContentContext.tsx';
import { Plus } from '../components/Icons.tsx';
import { Star } from '../components/Ornament.tsx';

function FaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <li className={`faq__item ${open ? 'is-open' : ''}`}>
      <h3 className="faq__q">
        <button type="button" aria-expanded={open} aria-controls={`${id}-a`} id={`${id}-q`} onClick={() => setOpen((v) => !v)}>
          <span>{q}</span>
          <Plus className="faq__icon" />
        </button>
      </h3>
      <div className="faq__a" id={`${id}-a`} role="region" aria-labelledby={`${id}-q`}>
        <div className="faq__a-inner">
          <p>{a}</p>
        </div>
      </div>
    </li>
  );
}

export function Faq() {
  const { content, t } = useContent();
  const f = content.texts.faq;
  if (!f.items.length) return null;
  return (
    <section className="faq" id="preguntas" aria-labelledby="faq-title">
      <div className="container faq__grid">
        <div className="faq__head">
          <p className="eyebrow" data-anim="fade-up">
            <Star size={10} /> {t(f.eyebrow)}
          </p>
          <h2 className="faq__title" id="faq-title" data-anim="lines">
            {t(f.title)}
          </h2>
          {f.intro && (
            <p className="faq__intro" data-anim="fade-up">
              {t(f.intro)}
            </p>
          )}
        </div>
        <ul className="faq__list" role="list" data-anim="stagger">
          {f.items.map((item, i) => (
            <FaqItem key={item.id} q={t(item.question)} a={t(item.answer)} defaultOpen={i === 0} />
          ))}
        </ul>
      </div>
    </section>
  );
}
