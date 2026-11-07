/**
 * Dependencias de producción: Netlify Blobs (stores de sitio, persistentes entre despliegues),
 * Netlify Identity (validación del usuario en el servidor) y purga de caché de la CDN.
 */
import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';
import { purgeCache } from '@netlify/cache';
import type { ApiDeps } from './api.ts';
import type { KV } from './repo.ts';
import type { BinaryKV } from './media.ts';
import { parseAdminEmails } from './auth.ts';

export const CONTENT_STORE = 'torero-content';
export const MEDIA_STORE = 'torero-media';

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function productionDeps(): ApiDeps {
  return {
    content: getStore({ name: CONTENT_STORE, consistency: 'strong' }) as unknown as KV,
    media: getStore({ name: MEDIA_STORE, consistency: 'strong' }) as unknown as BinaryKV,
    auth: async () => {
      const user = await getUser();
      if (!user) return null;
      const roles = [...(user.roles ?? []), ...(user.role ? [user.role] : [])];
      return { id: user.id, email: user.email ?? '', roles };
    },
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
    allowedOrigins: [originOf(process.env.URL), originOf(process.env.DEPLOY_PRIME_URL), originOf(process.env.DEPLOY_URL)].filter(
      (o): o is string => !!o,
    ),
    purge: (tags) => purgeCache({ tags }),
  };
}
