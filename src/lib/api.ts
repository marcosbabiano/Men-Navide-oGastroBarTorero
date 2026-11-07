import type { PublicPayload } from '../../shared/public.ts';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function parseError(res: Response): Promise<HttpError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    return new HttpError(res.status, body.error?.code ?? 'error', body.error?.message ?? `Error ${res.status}`, body.error?.details);
  } catch {
    return new HttpError(res.status, 'error', res.status === 429 ? 'Demasiadas peticiones. Espera un momento.' : `Error ${res.status}`);
  }
}

/** Contenido inicial: el inyectado en el HTML (Edge Function) o, si no existe, la API pública. */
export async function loadPublicPayload(): Promise<PublicPayload> {
  const el = document.getElementById('torero-data');
  if (el?.textContent) {
    try {
      return JSON.parse(el.textContent) as PublicPayload;
    } catch {
      /* continúa con la API */
    }
  }
  try {
    const res = await fetch('/api/content', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as PublicPayload;
  } catch (err) {
    // Solo en `npm run dev` (Vite sin API): se usa el contenido inicial para poder diseñar.
    if (import.meta.env.DEV) {
      const [{ createSeedContent }, { buildPublicPayload }] = await Promise.all([import('../../shared/seed.ts'), import('../../shared/public.ts')]);
      return buildPublicPayload(createSeedContent(), [], null);
    }
    throw err;
  }
}

/** Vista previa del borrador (requiere sesión de administrador en este navegador). */
export async function loadPreviewPayload(includeDrafts: boolean): Promise<PublicPayload> {
  const res = await fetch(`/api/admin/preview${includeDrafts ? '?drafts=1' : ''}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Torero-Admin': '1' },
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PublicPayload;
}
