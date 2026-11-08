// Vinculación de televisiones mediante código temporal (límite de peticiones más estricto).
import type { Config } from '@netlify/functions';
import { signageDepsOf } from '../../server/api.ts';
import { createScreenHandler } from '../../server/signage.ts';
import { productionDeps } from '../../server/netlify-deps.ts';

export default async (req: Request) => createScreenHandler(signageDepsOf(productionDeps()))(req);

export const config: Config = {
  path: ['/api/screen/pair/start', '/api/screen/pair/poll'],
  method: ['POST'],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
