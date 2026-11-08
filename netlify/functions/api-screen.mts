// Reproductores de /pantalla: programación publicada, órdenes por televisión (cacheadas en la CDN)
// y latido con el token del dispositivo. Nunca dan acceso al panel de administración.
import type { Config } from '@netlify/functions';
import { signageDepsOf } from '../../server/api.ts';
import { createScreenHandler } from '../../server/signage.ts';
import { productionDeps } from '../../server/netlify-deps.ts';

export default async (req: Request) => createScreenHandler(signageDepsOf(productionDeps()))(req);

export const config: Config = {
  path: ['/api/screen/config', '/api/screen/d/*', '/api/screen/heartbeat'],
  rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
