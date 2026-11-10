/**
 * Lectura de un buzón de Gmail mediante OAuth 2.0 (permiso mínimo: gmail.readonly).
 *
 * - Credenciales de la aplicación OAuth en variables de entorno de Netlify (nunca en el repositorio):
 *   GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.
 * - El token de actualización se guarda en Netlify Blobs (secret/gmail) y nunca se envía al navegador.
 * - La consulta la hace una función programada en el servidor (cada 10 minutos) o el botón
 *   «Sincronizar ahora». No es tiempo real.
 */
import type { RawEmail } from './parse.ts';
import { ReservasRepo, randomToken } from './repo.ts';
import { ingestEmail } from './ingest.ts';
import type { ReservasConfig } from '../../shared/reservas.ts';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export interface GmailSecret {
  refreshToken: string;
  email: string;
  connectedAt: string;
  connectedBy: string;
}
export interface GmailEnv {
  clientId: string | undefined;
  clientSecret: string | undefined;
  fetch?: typeof fetch;
}

export const gmailConfigured = (env: GmailEnv) => !!env.clientId && !!env.clientSecret;
export const redirectUri = (origin: string) => `${origin}/api/reservas/gmail/callback`;

export async function authUrl(repo: ReservasRepo, env: GmailEnv, origin: string, who: string): Promise<string> {
  if (!gmailConfigured(env)) throw new Error('not_configured');
  const state = randomToken(24);
  await repo.kv.setJSON(`oauth/${state}`, { who, at: repo.iso() });
  const p = new URLSearchParams({
    client_id: env.clientId!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function handleCallback(repo: ReservasRepo, env: GmailEnv, origin: string, url: URL): Promise<{ ok: boolean; message: string }> {
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  if (!/^[\w-]{20,80}$/.test(state)) return { ok: false, message: 'Solicitud no válida.' };
  const st = (await repo.kv.get(`oauth/${state}`, { type: 'json', consistency: 'strong' })) as { who: string; at: string } | null;
  await repo.kv.delete(`oauth/${state}`);
  if (!st || Date.now() - Date.parse(st.at) > 15 * 60_000) return { ok: false, message: 'La solicitud ha caducado. Vuelve a pulsar «Conectar Gmail».' };
  if (url.searchParams.get('error')) return { ok: false, message: 'Se canceló la autorización en Google.' };
  const f = env.fetch ?? fetch;
  const tok = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.clientId!, client_secret: env.clientSecret!, redirect_uri: redirectUri(origin), grant_type: 'authorization_code' }),
  });
  const body = (await tok.json()) as { refresh_token?: string; access_token?: string; scope?: string };
  if (!tok.ok || !body.refresh_token || !body.access_token) return { ok: false, message: 'Google no devolvió un permiso de lectura persistente. Inténtalo de nuevo.' };
  if (body.scope && !body.scope.split(' ').includes(GMAIL_SCOPE)) return { ok: false, message: 'No se concedió el permiso de lectura del correo.' };
  const prof = await f('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${body.access_token}` } });
  const email = prof.ok ? (((await prof.json()) as { emailAddress?: string }).emailAddress ?? '') : '';
  await repo.setSecret('gmail', { refreshToken: body.refresh_token, email, connectedAt: repo.iso(), connectedBy: st.who } satisfies GmailSecret);
  const s = await repo.sync();
  await repo.saveSync({ ...s, provider: 'gmail', lastError: null });
  return { ok: true, message: `Buzón conectado: ${email || 'Gmail'}.` };
}

async function accessToken(env: GmailEnv, secret: GmailSecret): Promise<string> {
  const f = env.fetch ?? fetch;
  const r = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.clientId!, client_secret: env.clientSecret!, refresh_token: secret.refreshToken, grant_type: 'refresh_token' }),
  });
  const b = (await r.json()) as { access_token?: string; error?: string };
  if (!r.ok || !b.access_token) throw new Error(b.error === 'invalid_grant' ? 'El permiso de Gmail se ha revocado o caducado: vuelve a conectar el buzón.' : 'No se pudo renovar el acceso a Gmail.');
  return b.access_token;
}

interface GPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GPart[];
  headers?: { name: string; value: string }[];
}
const b64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function gmailToRaw(msg: { id: string; internalDate?: string; payload?: GPart }): RawEmail {
  const headers = msg.payload?.headers ?? [];
  const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? '';
  let text = '';
  let html = '';
  const walk = (p: GPart | undefined) => {
    if (!p) return;
    if (p.body?.data) {
      if (p.mimeType === 'text/plain') text += b64(p.body.data);
      else if (p.mimeType === 'text/html') html += b64(p.body.data);
    }
    p.parts?.forEach(walk);
  };
  walk(msg.payload);
  const date = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : h('date') ? new Date(h('date')).toISOString() : new Date().toISOString();
  return { messageId: h('message-id') || `gmail:${msg.id}`, from: h('from'), subject: h('subject'), date, text, html };
}

/** Revisa el buzón y procesa los correos nuevos (máx. 25 por ejecución por el límite de tiempo). */
export async function syncGmail(repo: ReservasRepo, env: GmailEnv, cfg: ReservasConfig): Promise<{ ok: boolean; processed: number; message: string }> {
  const s = await repo.sync();
  const now = repo.iso();
  const secret = await repo.secret<GmailSecret>('gmail');
  if (!gmailConfigured(env) || !secret) {
    await repo.saveSync({ ...s, lastRunAt: now, lastError: gmailConfigured(env) ? 'Buzón no conectado.' : 'Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Netlify.' });
    return { ok: false, processed: 0, message: 'Gmail no está conectado.' };
  }
  const f = env.fetch ?? fetch;
  let processed = 0;
  let errors = 0;
  try {
    const token = await accessToken(env, secret);
    const auth = { Authorization: `Bearer ${token}` };
    const list = await f(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: cfg.email.gmailQuery, maxResults: '25' })}`, { headers: auth });
    if (!list.ok) throw new Error(`Gmail respondió ${list.status} al listar mensajes.`);
    const ids = (((await list.json()) as { messages?: { id: string }[] }).messages ?? []).map((m) => m.id);
    for (const id of ids) {
      const seen = await repo.kv.get(`gmid/${id}`, { type: 'json', consistency: 'strong' });
      if (seen) continue;
      const r = await f(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: auth });
      if (!r.ok) {
        errors++;
        continue;
      }
      const res = await ingestEmail(repo, cfg, gmailToRaw((await r.json()) as { id: string; payload?: GPart; internalDate?: string }), 'gmail');
      if (res.status === 'error') errors++;
      else processed++;
      await repo.kv.setJSON(`gmid/${id}`, { at: now });
    }
    await repo.saveSync({ provider: 'gmail', lastRunAt: now, lastOkAt: now, lastError: errors ? `${errors} correo(s) con errores (ver registro).` : null, processed: s.processed + processed, errors: s.errors + errors, lastBatch: processed });
    return { ok: true, processed, message: `${processed} correo(s) nuevo(s) procesado(s).` };
  } catch (e) {
    await repo.saveSync({ ...s, provider: 'gmail', lastRunAt: now, lastError: (e as Error).message, errors: s.errors + 1, lastBatch: 0 });
    return { ok: false, processed, message: (e as Error).message };
  }
}
