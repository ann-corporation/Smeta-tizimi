/**
 * smeta-mcp-remote — Cloudflare Worker: masofaviy MCP (Streamable HTTP) + OAuth 2.1 avtorizatsiya serveri
 * (@cloudflare/workers-oauth-provider: dinamik mijoz ro'yxati, PKCE, /token, discovery). Login — Smeta tizimi hisobi.
 *   /mcp         — MCP endpoint (Bearer token majburiy; anonim kirish yo'q)
 *   /authorize   — login sahifasi; /token, /register, /.well-known/* — provider o'zi
 */
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import type { Env } from './env';
import { authorizeGet, authorizePost } from './kirish';
import { mcpFetch, VERSIYA, type McpCtx } from './mcp';
import { resursUrl } from './url';

const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const u = new URL(request.url);
    if (u.pathname === '/authorize') {
      if (request.method === 'GET') return authorizeGet(request, env);
      if (request.method === 'POST') return authorizePost(request, env);
      return new Response('Method Not Allowed', { status: 405 });
    }
    if (u.pathname === '/' || u.pathname === '/health') {
      return Response.json({ ok: true, nom: 'smeta-mcp-remote', versiya: VERSIYA, mcp: `${u.origin}/mcp`, izoh: 'AI chatda «custom connector» sifatida /mcp URL ni qo\'shing.' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response('Not found', { status: 404 });
  },
};

let kesh: { resurs: string; p: OAuthProvider<Env> } | null = null;
function provider(env: Env): OAuthProvider<Env> {
  const resurs = resursUrl(env);
  if (kesh?.resurs === resurs) return kesh.p;
  const p = new OAuthProvider<Env>({
    apiRoute: '/mcp',
    apiHandler: { fetch: (req: Request, e: Env, ctx: unknown) => mcpFetch(req, e, ctx as McpCtx) } as never,
    defaultHandler: defaultHandler as never,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    scopesSupported: ['smeta'],
    resourceMetadata: { resource: resurs, resource_name: 'Smeta tizimi MCP' },
    accessTokenTTL: 3600,
    refreshTokenTTL: 30 * 24 * 3600,
  });
  kesh = { resurs, p };
  return p;
}

export default {
  fetch: (request: Request, env: Env, ctx: never) => provider(env).fetch(request, env, ctx),
  /** Kunlik: muddati o'tgan OAuth yozuvlarini tozalash (wrangler.toml [triggers]). */
  scheduled: (_e: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) => { ctx.waitUntil(provider(env).purgeExpiredData(env)); },
};
