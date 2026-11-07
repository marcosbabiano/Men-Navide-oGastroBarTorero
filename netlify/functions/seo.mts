// sitemap.xml y robots.txt generados con el dominio real del sitio.
import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { createSeoHandler } from '../../server/api.ts';
import type { KV } from '../../server/repo.ts';
import { CONTENT_STORE } from '../../server/netlify-deps.ts';

export default async (req: Request) =>
  createSeoHandler({ content: getStore({ name: CONTENT_STORE, consistency: 'strong' }) as unknown as KV })(req);

export const config: Config = { path: ['/sitemap.xml', '/robots.txt'], method: ['GET'] };
