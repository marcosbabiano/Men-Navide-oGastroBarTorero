/** Utilidades HTTP comunes para las funciones. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const BASE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function noStore(): Record<string, string> {
  return { 'Cache-Control': 'no-store, max-age=0', Vary: 'Cookie, Authorization' };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json(err.status, { error: { code: err.code, message: err.message, details: err.details ?? null } }, noStore());
  }
  console.error('[api] Error inesperado', err);
  return json(500, { error: { code: 'internal', message: 'Error interno del servidor. Inténtalo de nuevo.' } }, noStore());
}

/** Lee JSON con límite de tamaño y tipo de contenido obligatorio. */
export async function readJson<T = unknown>(req: Request, maxBytes = 600_000): Promise<T> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Se esperaba un cuerpo JSON.');
  }
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new ApiError(413, 'payload_too_large', 'El contenido enviado es demasiado grande.');
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'payload_too_large', 'El contenido enviado es demasiado grande.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, 'invalid_json', 'El cuerpo de la petición no es JSON válido.');
  }
}

export function methodNotAllowed(allowed: string[]): ApiError {
  return new ApiError(405, 'method_not_allowed', `Método no permitido. Usa: ${allowed.join(', ')}`);
}
