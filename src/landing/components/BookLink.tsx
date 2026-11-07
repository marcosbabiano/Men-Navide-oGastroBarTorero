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
 * Enlace a la plataforma externa de reservas.
 * Se abre en una pestaña nueva con rel="noopener noreferrer" y se anuncia a lectores de pantalla.
 * No se añaden parámetros a la URL: la plataforma no admite preseleccionar menús.
 */
export function BookLink({ children, variant = 'primary', className = '', place, icon = true }: Props) {
  const { bookingUrl } = useContent();
  return (
    <a
      className={`btn btn--${variant} ${className}`}
      href={bookingUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-book={place}
    >
      <span className="btn__label">{children}</span>
      {icon && <ArrowUpRight className="btn__icon" />}
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}
