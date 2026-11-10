import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PublicPayload } from '../../shared/public.ts';
import type { MediaAsset, SiteContent } from '../../shared/schema.ts';
import { interpolate } from '../../shared/format.ts';

interface Ctx {
  content: SiteContent;
  media: Record<string, MediaAsset>;
  preview: boolean;
  t: (text: string) => string;
  /** Destino de los botones «Reservar»: el formulario de menús o la plataforma externa. */
  bookingUrl: string;
}

const ContentContext = createContext<Ctx | null>(null);

export function ContentProvider({ payload, children }: { payload: PublicPayload; children: ReactNode }) {
  const value = useMemo<Ctx>(
    () => ({
      content: payload.content,
      media: payload.media,
      preview: !!payload.preview,
      t: (text: string) => interpolate(text, payload.content),
      bookingUrl: payload.content.booking.preselect ? '/reservar' : payload.content.booking.url,
    }),
    [payload],
  );
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): Ctx {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('ContentProvider ausente');
  return ctx;
}
