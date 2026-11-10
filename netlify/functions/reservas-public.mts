// Formulario público de menús (/reservar) y enlaces privados de modificación.
import type { Config } from '@netlify/functions';
import { reservasDepsOf } from '../../server/api.ts';
import { createReservasPublicHandler } from '../../server/reservas/api.ts';
import { productionDeps } from '../../server/netlify-deps.ts';

export default async (req: Request) => createReservasPublicHandler(reservasDepsOf(productionDeps())!)(req);

export const config: Config = {
  path: ['/api/reservas/form-config', '/api/reservas/preselect', '/api/reservas/link/*'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
