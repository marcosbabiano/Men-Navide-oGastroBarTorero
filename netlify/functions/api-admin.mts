// Endpoints privados del panel /admin. Cada petición exige Netlify Identity + rol «admin».
import type { Config } from '@netlify/functions';
import { createAdminHandler } from '../../server/api.ts';
import { productionDeps } from '../../server/netlify-deps.ts';

export default async (req: Request) => createAdminHandler(productionDeps())(req);

export const config: Config = {
  path: ['/api/admin', '/api/admin/*'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
