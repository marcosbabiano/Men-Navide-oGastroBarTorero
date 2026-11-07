// Endpoints públicos de solo lectura: contenido publicado e imágenes subidas.
import type { Config } from '@netlify/functions';
import { createPublicHandler } from '../../server/api.ts';
import { productionDeps } from '../../server/netlify-deps.ts';

export default async (req: Request) => createPublicHandler(productionDeps())(req);

export const config: Config = {
  path: ['/api/content', '/api/media/*', '/api/health'],
  method: ['GET'],
  rateLimit: { windowLimit: 400, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
