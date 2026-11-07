/**
 * Autenticación y autorización del panel.
 *
 * - La identidad la resuelve Netlify Identity en el servidor (`@netlify/identity` → getUser()),
 *   que valida el JWT contra la API de Identity (cabecera Authorization o cookie nf_jwt).
 * - Solo pueden modificar contenidos los usuarios con rol `admin` (app_metadata.roles), o cuyo
 *   correo esté en la variable de entorno del servidor ADMIN_EMAILS (opción de arranque).
 * - Protección CSRF: todas las peticiones de administración deben llevar la cabecera
 *   personalizada `X-Torero-Admin: 1` (fuerza preflight CORS, que no se concede a otros orígenes)
 *   y las que modifican datos deben tener un `Origin` igual al del sitio.
 */
import { ApiError } from './http.ts';

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

export type AuthResolver = (req: Request) => Promise<AuthUser | null>;

export const ADMIN_HEADER = 'x-torero-admin';

export function parseAdminEmails(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
}

export function isAdmin(user: AuthUser, adminEmails: string[]): boolean {
  if (user.roles.map((r) => r.toLowerCase()).includes('admin')) return true;
  return !!user.email && adminEmails.includes(user.email.toLowerCase());
}

export function assertCsrf(req: Request, allowedOrigins: string[] = []): void {
  if (req.headers.get(ADMIN_HEADER) !== '1') {
    throw new ApiError(403, 'csrf', 'Petición rechazada por seguridad (falta la cabecera de administración).');
  }
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return;
  const origin = req.headers.get('origin');
  const own = new URL(req.url).origin;
  if (!origin || (origin !== own && !allowedOrigins.includes(origin))) {
    throw new ApiError(403, 'csrf', 'Petición rechazada por seguridad (origen no permitido).');
  }
}

export async function requireAdmin(
  req: Request,
  resolve: AuthResolver,
  adminEmails: string[],
  allowedOrigins: string[] = [],
): Promise<AuthUser> {
  assertCsrf(req, allowedOrigins);
  let user: AuthUser | null = null;
  try {
    user = await resolve(req);
  } catch {
    user = null;
  }
  if (!user) throw new ApiError(401, 'unauthorized', 'Tu sesión no es válida o ha caducado. Vuelve a iniciar sesión.');
  if (!isAdmin(user, adminEmails)) {
    throw new ApiError(403, 'forbidden', 'Tu usuario no tiene permisos de administración (rol «admin»).');
  }
  return user;
}
