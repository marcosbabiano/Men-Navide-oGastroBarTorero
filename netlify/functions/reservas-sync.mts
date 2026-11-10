// Revisión programada del buzón de Gmail conectado (cada 10 minutos; no es tiempo real).
// Las funciones programadas solo se ejecutan en el despliegue publicado y tienen un límite de 30 s.
import type { Config } from '@netlify/functions';
import { reservasDepsOf } from '../../server/api.ts';
import { runScheduledSync } from '../../server/reservas/api.ts';
import { productionDeps } from '../../server/netlify-deps.ts';

export default async () => {
  const deps = reservasDepsOf(productionDeps());
  if (!deps) return;
  const r = await runScheduledSync(deps);
  console.log(`[reservas-sync] ${r.message}`);
};

export const config: Config = { schedule: '*/10 * * * *' };
