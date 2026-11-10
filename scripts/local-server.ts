/**
 * Servidor local que reproduce el comportamiento de Netlify para desarrollo y pruebas:
 *  - Sirve dist/ con las cabeceras de public/_headers y las redirecciones de netlify.toml.
 *  - Ejecuta los MISMOS manejadores de API que las Netlify Functions.
 *  - Usa el cliente real de Netlify Blobs contra un BlobsServer local (persistente en .local-data/).
 *  - Inyecta SEO y contenido en «/» con el mismo código que la Edge Function.
 *  - Emula los endpoints de Netlify Identity (GoTrue) que usa @netlify/identity en el navegador,
 *    con usuarios de prueba locales. NUNCA se despliega: solo existe en scripts/.
 *
 * Uso:  npm run build && npm run local          (http://localhost:8888)
 * Usuarios: admin@torero.local / torero-local-2026  (rol admin)
 *           editor@torero.local / torero-local-2026 (sin rol admin → 403)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import { createAdminHandler, createPublicHandler, createSeoHandler, reservasDepsOf, signageDepsOf, type ApiDeps } from '../server/api.ts';
import { createReservasPublicHandler } from '../server/reservas/api.ts';
import { createScreenHandler } from '../server/signage.ts';
import type { KV } from '../server/repo.ts';
import type { BinaryKV } from '../server/media.ts';
import type { AuthUser } from '../server/auth.ts';
import { ContentRepo } from '../server/repo.ts';
import { buildPublicPayload } from '../shared/public.ts';
import { injectIntoHtml } from '../shared/head.ts';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const PORT = Number(process.env.PORT ?? 8888);
const DATA_DIR = path.resolve(process.env.LOCAL_DATA_DIR ?? path.join(root, '.local-data'));
const SECRET = process.env.LOCAL_JWT_SECRET ?? 'solo-para-desarrollo-local';
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD ?? 'torero-local-2026';

const USERS: Record<string, { id: string; roles: string[] }> = {
  'admin@torero.local': { id: 'local-admin', roles: ['admin'] },
  'editor@torero.local': { id: 'local-editor', roles: [] },
};

// ---------- JWT HS256 mínimo (emulación de GoTrue) ----------
const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
function signJwt(payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token: string): Record<string, unknown> | null {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) return null;
  const expected = createHmac('sha256', SECRET).update(`${h}.${b}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString()) as Record<string, unknown>;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  return payload;
}
function issueTokens(email: string) {
  const u = USERS[email];
  const now = Math.floor(Date.now() / 1000);
  const access = signJwt({
    sub: u.id,
    email,
    aud: '',
    exp: now + 3600,
    app_metadata: { provider: 'email', roles: u.roles },
    user_metadata: {},
  });
  return { access_token: access, token_type: 'bearer', expires_in: 3600, refresh_token: `refresh-${email}-${randomUUID()}` };
}
function userJson(email: string) {
  const u = USERS[email];
  return {
    id: u.id,
    aud: '',
    role: '',
    email,
    confirmed_at: '2026-11-01T00:00:00Z',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    app_metadata: { provider: 'email', roles: u.roles },
    user_metadata: {},
  };
}
function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const cookie = req.headers.get('cookie') ?? '';
  const m = /(?:^|;\s*)nf_jwt=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}
const localAuth = async (req: Request): Promise<AuthUser | null> => {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const p = verifyJwt(token);
  if (!p || typeof p.email !== 'string' || !USERS[p.email]) return null;
  return { id: String(p.sub), email: p.email, roles: USERS[p.email].roles };
};

async function identity(req: Request, sub: string): Promise<Response> {
  const j = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (sub === '/settings') return j(200, { autoconfirm: false, disable_signup: true, external: { email: true } });
  if (sub === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(await req.text());
    if (form.get('grant_type') === 'password') {
      const email = (form.get('username') ?? '').toLowerCase();
      if (!USERS[email] || form.get('password') !== PASSWORD) {
        return j(400, { error: 'invalid_grant', error_description: 'Invalid email or password' });
      }
      return j(200, issueTokens(email));
    }
    if (form.get('grant_type') === 'refresh_token') {
      const m = /^refresh-(.+?)-[0-9a-f-]{36}$/.exec(form.get('refresh_token') ?? '');
      if (!m || !USERS[m[1]]) return j(400, { error: 'invalid_grant' });
      return j(200, issueTokens(m[1]));
    }
    return j(400, { error: 'unsupported_grant_type' });
  }
  if (sub === '/user') {
    const u = await localAuth(req);
    if (!u) return j(401, { msg: 'Invalid token' });
    return j(200, userJson(u.email));
  }
  if (sub === '/logout') return new Response(null, { status: 204 });
  if (sub === '/recover') return j(200, {});
  return j(404, { msg: 'Not found (emulación local)' });
}

// ---------- Cabeceras de public/_headers ----------
type HeaderRule = { pattern: RegExp; headers: [string, string][] };
async function loadHeaderRules(): Promise<HeaderRule[]> {
  const text = await readFile(path.join(root, 'public', '_headers'), 'utf8');
  const rules: HeaderRule[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (!line.startsWith(' ')) {
      const glob = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      rules.push({ pattern: new RegExp(`^${glob}$`), headers: [] });
    } else {
      const idx = line.indexOf(':');
      rules[rules.length - 1].headers.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
    }
  }
  return rules;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

async function toWebRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const method = req.method ?? 'GET';
  return new Request(new URL(req.url ?? '/', origin), {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

async function send(res: ServerResponse, r: Response, extra: [string, string][] = []) {
  const headers: Record<string, string> = {};
  for (const [k, v] of extra) headers[k] = v;
  r.headers.forEach((v, k) => (headers[k] = v));
  res.writeHead(r.status, headers);
  res.end(Buffer.from(await r.arrayBuffer()));
}

export async function startLocalServer(port = PORT) {
  await mkdir(DATA_DIR, { recursive: true });
  const blobs = new BlobsServer({ directory: path.join(DATA_DIR, 'blobs'), token: 'local-token' });
  const { port: blobsPort } = await blobs.start();
  const edge = `http://localhost:${blobsPort}`;
  const store = (name: string) =>
    getStore({ name, siteID: 'local-site', token: 'local-token', edgeURL: edge, uncachedEdgeURL: edge, consistency: 'strong' });

  const purges: string[][] = [];
  const deps: ApiDeps = {
    content: store('torero-content') as unknown as KV,
    media: store('torero-media') as unknown as BinaryKV,
    auth: localAuth,
    adminEmails: [],
    purge: async (tags) => {
      purges.push(tags);
    },
    reservas: {
      store: store('torero-reservas') as unknown as KV,
      // Solo en local: secreto de prueba del webhook de correo (en Netlify, variable INBOUND_EMAIL_SECRET).
      inboundSecret: process.env.INBOUND_EMAIL_SECRET ?? 'local-inbound-secret',
      gmail: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
    },
  };
  const pub = createPublicHandler(deps);
  const admin = createAdminHandler(deps);
  const seo = createSeoHandler(deps);
  const screen = createScreenHandler(signageDepsOf(deps));
  const reservas = createReservasPublicHandler(reservasDepsOf(deps)!);
  const repo = new ContentRepo(deps.content);
  const rules = await loadHeaderRules();
  const origin = `http://localhost:${port}`;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', origin);
      const p = url.pathname;
      const headerFor = (pathname: string) =>
        rules.filter((r) => r.pattern.test(pathname)).flatMap((r) => r.headers)
          // En local (http) se omiten HSTS y upgrade-insecure-requests.
          .filter(([k]) => k !== 'Strict-Transport-Security')
          .map(([k, v]) => [k, k === 'Content-Security-Policy' ? v.replace('; upgrade-insecure-requests', '') : v] as [string, string]);

      if (p.startsWith('/.netlify/identity')) return send(res, await identity(await toWebRequest(req, origin), p.slice('/.netlify/identity'.length)));
      if (p.startsWith('/api/admin')) return send(res, await admin(await toWebRequest(req, origin)));
      if (p.startsWith('/api/screen/')) return send(res, await screen(await toWebRequest(req, origin)));
      if (p.startsWith('/api/reservas/')) return send(res, await reservas(await toWebRequest(req, origin)));
      if (p.startsWith('/api/')) return send(res, await pub(await toWebRequest(req, origin)));
      if (p === '/sitemap.xml' || p === '/robots.txt') return send(res, await seo(await toWebRequest(req, origin)));
      if (p === '/__local/purges') return send(res, Response.json(purges));

      let file = p;
      if (p === '/admin' || p.startsWith('/admin/')) file = '/admin.html';
      else if (p === '/' || p === '/preview') file = '/index.html';
      else if (p === '/pantalla' || p.startsWith('/pantalla/')) file = '/pantalla.html';
      else if (p === '/reservar' || p.startsWith('/reservar/')) file = '/reservar.html';
      const full = path.join(dist, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
      if (!full.startsWith(dist)) return send(res, new Response('Forbidden', { status: 403 }));
      let data: Buffer;
      try {
        if (!(await stat(full)).isFile()) throw new Error('dir');
        data = await readFile(full);
      } catch {
        return send(res, new Response('Not found', { status: 404 }), headerFor(p));
      }
      let body: Buffer | string = data;
      if (p === '/') {
        const { content, publishedAt } = await repo.readPublicContent();
        const uploads = await repo.readMediaIndex();
        body = injectIntoHtml(data.toString('utf8'), buildPublicPayload(content, uploads, publishedAt), origin);
      }
      const type = MIME[path.extname(full)] ?? 'application/octet-stream';
      return send(res, new Response(typeof body === "string" ? body : new Uint8Array(body), { headers: { "Content-Type": type } }), headerFor(p));
    } catch (err) {
      console.error(err);
      return send(res, new Response('Error', { status: 500 }));
    }
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`GastroBar Torero en local → ${origin}  (datos en ${DATA_DIR})`);
  return {
    origin,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await blobs.stop();
    },
  };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  startLocalServer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
