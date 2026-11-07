import { useContent } from '../ContentContext.tsx';
import { Picture } from './Picture.tsx';

/** Estrella de ocho puntas: detalle navideño discreto. */
export function Star({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path
        d="M20 0l2.6 13.7L33.1 6.9l-6.8 10.5L40 20l-13.7 2.6 6.8 10.5-10.5-6.8L20 40l-2.6-13.7-10.5 6.8 6.8-10.5L0 20l13.7-2.6L6.9 6.9l10.5 6.8z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Filete dorado con rombo central (o el ornamento de marca asignado en Campaña → Ornamentos). */
export function Rule({ className }: { className?: string }) {
  const { content } = useContent();
  const divider = content.campaign.decor.divider;
  if (divider) {
    return (
      <div className={`rule rule--art ${className ?? ''}`} aria-hidden="true" data-anim="fade-up">
        <Picture image={divider} sizes="(min-width: 900px) 420px, 70vw" decorative className="pic--contain" />
      </div>
    );
  }
  return (
    <div className={`rule ${className ?? ''}`} aria-hidden="true" data-anim="rule">
      <span className="rule__line" />
      <span className="rule__diamond" />
      <span className="rule__line" />
    </div>
  );
}

/** Ornamento de marca opcional (rama, acento…). No se muestra si no se ha asignado. */
export function DecorArt({ slot, className }: { slot: 'heroAccent' | 'branch'; className: string }) {
  const { content } = useContent();
  const img = content.campaign.decor[slot];
  if (!img) return null;
  return (
    <div className={`decor ${className}`} aria-hidden="true">
      <Picture image={img} sizes="(min-width: 900px) 34vw, 60vw" decorative className="pic--contain" />
    </div>
  );
}
