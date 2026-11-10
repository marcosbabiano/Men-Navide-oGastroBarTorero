import type { ReactNode } from 'react';
import { useContent } from '../ContentContext.tsx';
import { ArrowUpRight } from './Icons.tsx';

interface Props {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'nav' | 'link' | 'bar';
  className?: string;
  /** Contexto para analítica/QA (no se envía a terceros). */
  place: string;
  icon?: boolean;
}

/**
 * Botón «Reservar». Con la elección anticipada activada lleva a /reservar (misma pestaña); si no,
 * a la plataforma externa de reservas en una pestaña nueva (rel="noopener noreferrer").
 * No se añaden parámetros a la URL externa: la plataforma no documenta parámetros de precarga.
 */
export function BookLink({ children, variant = 'primary', className = '', place, icon = true }: Props) {
  const { bookingUrl } = useContent();
  const external = /^https?:/.test(bookingUrl);
  return (
    <a
      className={`btn btn--${variant} ${className}`}
      href={bookingUrl}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      data-book={place}
    >
      <span className="btn__label">{children}</span>
      {icon && <ArrowUpRight className="btn__icon" />}
      {external && <span className="sr-only"> (se abre en una pestaña nueva)</span>}
    </a>
  );
}
