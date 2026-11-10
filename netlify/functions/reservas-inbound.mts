// Correo entrante por webhook (protegido con INBOUND_EMAIL_SECRET) y vuelta de la autorización de Gmail.
import type { Config } from '@netlify/functions';
import { reservasDepsOf } from '../../server/api.ts';
import { createReservasPublicHandler } from '../../server/reservas/api.ts';
import { productionDeps } from '../../server/netlify-deps.ts';

export default async (req: Request) => createReservasPublicHandler(reservasDepsOf(productionDeps())!)(req);

export const config: Config = {
  path: ['/api/reservas/inbound', '/api/reservas/gmail/callback'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
