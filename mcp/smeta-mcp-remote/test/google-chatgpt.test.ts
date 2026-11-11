import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMuhit, type Javobchi } from '../../smeta-mcp/test/mock';
import { OB_ID, obyektUrl, olish, qidir } from '../src/chatgpt';
import { GOOGLE_AUTH, GOOGLE_TOKEN, googleBoshlash, googleQaytish, googleRedirectUri, googleMavjud, pkceChallenge, tokenNonce } from '../src/google';
import { authorizeGet, formManba, googleSozlangan, sahifa } from '../src/kirish';
import { masofaviyServer } from '../src/mcp';
import { vakolatOl } from '../src/vakolat';

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {}, env: {} })); // provider (workerd moduli) Node'da
vi.mock('../src/vakolat', async (orig) => ({ ...(await orig<typeof import('../src/vakolat')>()), vakolatOl: vi.fn() }));

const UUID = '11111111-2222-4333-8444-555555555555';
const CID = 'test-client.apps.googleusercontent.com';
const CHATGPT_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';

// ---- Google id_token (haqiqiy RS256 imzo; kalitlar sinov uchun yaratiladi) ----
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jb = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
let imzoKalit: CryptoKeyPair; let jwk: JsonWebKey & { kid: string };
async function kalitTayyor() {
  if (imzoKalit) return;
  imzoKalit = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = { ...(await crypto.subtle.exportKey('jwk', imzoKalit.publicKey)), kid: 'k1' } as typeof jwk;
}
async function idToken(p: Record<string, unknown>): Promise<string> {
  await kalitTayyor();
  const h = jb({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = jb({ iss: 'https://accounts.google.com', aud: CID, exp: Math.floor(Date.now() / 1000) + 600, sub: 'g-sub-1', email: 'foydalanuvchi@example.test', email_verified: true, name: 'Test', ...p });
  const s = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', imzoKalit.privateKey, new TextEncoder().encode(`${h}.${body}`));
  return `${h}.${body}.${b64u(s)}`;
}

// ---- Worker muhiti (soxta KV, provider, tezlik) ----
function yasaEnv(extra: Record<string, unknown> = {}) {
  const kv = new Map<string, string>();
  const complete = vi.fn(async () => ({ redirectTo: `${CHATGPT_REDIRECT}?code=abc&iss=https%3A%2F%2Fmcp.example.uz` }));
  const env = {
    OAUTH_KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v); }, delete: async (k: string) => { kv.delete(k); } },
    LOGIN_RATE: { limit: async () => ({ success: true }) },
    OAUTH_PROVIDER: { completeAuthorization: complete, parseAuthRequest: vi.fn(), lookupClient: vi.fn() },
    GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: 'sinov-sir', MCP_PUBLIC_URL: 'https://mcp.example.uz', SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_KEY: 'k', ...extra,
  };
  kv.set(`mcp_login:${UUID}`, JSON.stringify({ soriq: { responseType: 'code', clientId: 'c', redirectUri: CHATGPT_REDIRECT, scope: ['smeta'], state: 's' }, klient: 'ChatGPT', redirectHost: 'chatgpt.com' }));
  return { env: env as never, kv, complete };
}
const bosh = (env: never) => googleBoshlash(new Request(`https://mcp.example.uz/authorize/google?holat=${UUID}`, { headers: { Cookie: `mcp_holat=${UUID}` } }), env);
const boshlaVaOl = async (env: never) => {
  const r = await bosh(env);
  const loc = new URL(r.headers.get('Location')!);
  return { r, state: loc.searchParams.get('state')!, nonce: loc.searchParams.get('nonce')! };
};
const qaytish = (env: never, state: string, f: typeof fetch, q = 'code=abc', cookie = `mcp_holat=${UUID}`) =>
  googleQaytish(new Request(`https://mcp.example.uz/authorize/google/callback?state=${state}&${q}`, { headers: { Cookie: cookie } }), env, f, async () => [jwk]);

/** Soxta fetch: Google token endpoint + Supabase RPC. */
function soxtaFetch(o: { idToken?: string; tokenOk?: boolean; rpc?: unknown }) {
  const chaqiruvlar: Array<{ url: string; body: string }> = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url); chaqiruvlar.push({ url: u, body: String(init?.body ?? '') });
    if (u === GOOGLE_TOKEN) return o.tokenOk === false ? new Response('{}', { status: 400 }) : Response.json({ id_token: o.idToken });
    if (u.includes('/rest/v1/rpc/t2_google_mcp_kirish_v1')) return Response.json(o.rpc);
    throw new Error('kutilmagan fetch ' + u);
  });
  return { f: f as unknown as typeof fetch, chaqiruvlar };
}

beforeEach(() => { vi.mocked(vakolatOl).mockReset(); });

describe('login sahifasi: Google tugmasi', () => {
  it('Google faqat sozlangan bo\'lsa ko\'rinadi; yangi hisob ochilmasligi aytiladi', () => {
    expect(sahifa({ klient: 'K', redirectHost: 'h', holat: UUID })).not.toContain('/authorize/google');
    const h = sahifa({ klient: 'K', redirectHost: 'h', holat: UUID, google: true });
    expect(h).toContain(`/authorize/google?holat=${UUID}`);
    expect(h).toContain('yangi hisob ochilmaydi');
    expect(googleSozlangan({ GOOGLE_CLIENT_ID: 'a' })).toBe(false);
    expect(googleSozlangan({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: ' ' })).toBe(false);
    expect(googleSozlangan({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toBe(true);
  });
});

describe('Google yo\'naltirish (PKCE + state + nonce)', () => {
  it('Google URL: S256 challenge, state, nonce, redirect_uri; sir URLda yo\'q; KV holati yoziladi', async () => {
    const { env, kv } = yasaEnv();
    const { r, state, nonce } = await boshlaVaOl(env);
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get('Location')!);
    expect(`${loc.origin}${loc.pathname}`).toBe(GOOGLE_AUTH);
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('response_type')).toBe('code');
    expect(loc.searchParams.get('scope')).toBe('openid email profile');
    expect(loc.searchParams.get('client_id')).toBe(CID);
    expect(loc.searchParams.get('redirect_uri')).toBe('https://mcp.example.uz/authorize/google/callback');
    expect(r.headers.get('Location')).not.toContain('sinov-sir');
    const rec = JSON.parse(kv.get(`mcp_google:${state}`)!) as { holat: string; nonce: string; verifier: string };
    expect(rec.holat).toBe(UUID);
    expect(rec.nonce).toBe(nonce);
    expect(loc.searchParams.get('code_challenge')).toBe(await pkceChallenge(rec.verifier));
    expect(state.length).toBeGreaterThanOrEqual(43);
    expect(googleRedirectUri({ MCP_PUBLIC_URL: 'https://mcp.example.uz/' })).toBe('https://mcp.example.uz/authorize/google/callback');
  });

  it('cookie mos kelmasa / sessiya yo\'q / Google sozlanmagan — yo\'naltirilmaydi', async () => {
    const { env } = yasaEnv();
    expect((await googleBoshlash(new Request(`https://x/authorize/google?holat=${UUID}`, { headers: { Cookie: 'mcp_holat=boshqa' } }), env)).status).toBe(400);
    expect((await googleBoshlash(new Request(`https://x/authorize/google?holat=${UUID}`), env)).status).toBe(400);
    const { env: e2, kv } = yasaEnv(); kv.delete(`mcp_login:${UUID}`);
    expect((await bosh(e2)).status).toBe(400);
    const { env: e3 } = yasaEnv({ GOOGLE_CLIENT_SECRET: undefined });
    expect((await bosh(e3)).status).toBe(404);
  });
});

describe('Google qaytish: tekshiruvlar va faqat MAVJUD foydalanuvchi', () => {
  it('muvaffaqiyat: mavjud ulangan foydalanuvchi → grant (props faqat id/login), PKCE verifier va secret Google\'ga ketadi', async () => {
    const { env, complete, kv } = yasaEnv();
    vi.mocked(vakolatOl).mockResolvedValue({ foydalanuvchiId: 7, superadmin: false, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }], sess: {} as never });
    const { state, nonce } = await boshlaVaOl(env);
    const { f, chaqiruvlar } = soxtaFetch({ idToken: await idToken({ nonce }), rpc: { ok: true, foydalanuvchi_id: 7, login: 'pto7' } });
    const r = await qaytish(env, state, f);
    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toContain('chatgpt.com/connector_platform_oauth_redirect');
    expect(complete).toHaveBeenCalledTimes(1);
    const arg = complete.mock.calls[0] as unknown as [{ userId: string; props: { foydalanuvchi_id: number; login: string } }];
    expect(arg[0].userId).toBe('7');
    expect(arg[0].props).toMatchObject({ foydalanuvchi_id: 7, login: 'pto7' });
    const tok = new URLSearchParams(chaqiruvlar.find((c) => c.url === GOOGLE_TOKEN)!.body);
    expect(tok.get('code_verifier')).toBeTruthy();
    expect(tok.get('client_secret')).toBe('sinov-sir');
    expect(tok.get('grant_type')).toBe('authorization_code');
    const rpc = JSON.parse(chaqiruvlar.find((c) => c.url.includes('t2_google_mcp_kirish_v1'))!.body) as Record<string, string>;
    expect(rpc).toEqual({ p_email: 'foydalanuvchi@example.test', p_sub: 'g-sub-1' });
    expect(kv.has(`mcp_login:${UUID}`)).toBe(false); // login holati sarflandi
  });

  it('ulanmagan email (RPC GOOGLE_ULANMAGAN) — 403, grant YO\'Q, foydalanuvchi yaratilmaydi', async () => {
    const { env, complete } = yasaEnv();
    const { state, nonce } = await boshlaVaOl(env);
    const { f, chaqiruvlar } = soxtaFetch({ idToken: await idToken({ nonce }), rpc: { ok: false, code: 'GOOGLE_ULANMAGAN' } });
    const r = await qaytish(env, state, f);
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('ulanmagan');
    expect(complete).not.toHaveBeenCalled();
    expect(chaqiruvlar.every((c) => !/t2_google_kirish_v1|ozi_royxat/.test(c.url))).toBe(true); // yaratuvchi RPC chaqirilmaydi
  });

  it('Google OK, lekin kompaniya a\'zoligi yo\'q / hisob faol emas — grant YO\'Q', async () => {
    const { env, complete } = yasaEnv();
    const { state, nonce } = await boshlaVaOl(env);
    const rpc = { ok: true, foydalanuvchi_id: 7, login: 'u' };
    vi.mocked(vakolatOl).mockResolvedValueOnce({ foydalanuvchiId: 7, superadmin: false, kompaniyalar: [], sess: {} as never });
    expect((await qaytish(env, state, soxtaFetch({ idToken: await idToken({ nonce }), rpc }).f)).status).toBe(403);
    const b = await boshlaVaOl(env);
    vi.mocked(vakolatOl).mockResolvedValueOnce(null);
    expect((await qaytish(env, b.state, soxtaFetch({ idToken: await idToken({ nonce: b.nonce }), rpc }).f)).status).toBe(403);
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ['nonce mos emas', (n: string) => ({ nonce: n + 'x' })],
    ['aud boshqa', (n: string) => ({ nonce: n, aud: 'boshqa-client' })],
    ['iss boshqa', (n: string) => ({ nonce: n, iss: 'https://evil.example' })],
    ['muddati o\'tgan', (n: string) => ({ nonce: n, exp: Math.floor(Date.now() / 1000) - 10 })],
    ['email tasdiqlanmagan', (n: string) => ({ nonce: n, email_verified: false })],
    ['nonce yo\'q', () => ({ nonce: undefined })],
  ])('id_token rad: %s — RPC chaqirilmaydi, grant yo\'q', async (_nom, yasa) => {
    const { env, complete } = yasaEnv();
    const { state, nonce } = await boshlaVaOl(env);
    const { f, chaqiruvlar } = soxtaFetch({ idToken: await idToken(yasa(nonce)), rpc: { ok: true, foydalanuvchi_id: 7, login: 'u' } });
    const r = await qaytish(env, state, f);
    expect(r.status).toBe(401);
    expect(complete).not.toHaveBeenCalled();
    expect(chaqiruvlar.some((c) => c.url.includes('t2_google_mcp_kirish_v1'))).toBe(false);
  });

  it('imzo noto\'g\'ri (boshqa kalit) — rad', async () => {
    const { env, complete } = yasaEnv();
    const { state, nonce } = await boshlaVaOl(env);
    const t = (await idToken({ nonce })).split('.');
    const { f } = soxtaFetch({ idToken: `${t[0]}.${t[1]}.${b64u(new Uint8Array(256))}`, rpc: { ok: true, foydalanuvchi_id: 7, login: 'u' } });
    expect((await qaytish(env, state, f)).status).toBe(401);
    expect(complete).not.toHaveBeenCalled();
  });

  it('state bir martalik; cookie mos kelmasa va noma\'lum state — 400, Google\'ga so\'rov ketmaydi', async () => {
    const { env } = yasaEnv();
    const { state, nonce } = await boshlaVaOl(env);
    const s = soxtaFetch({ idToken: await idToken({ nonce }), rpc: { ok: false, code: 'GOOGLE_ULANMAGAN' } });
    expect((await qaytish(env, state, s.f, 'code=abc', 'mcp_holat=boshqa')).status).toBe(400);
    expect(s.f).not.toHaveBeenCalled();
    expect((await qaytish(env, state, s.f)).status).toBe(400); // state allaqachon sarflangan (1-urinishda o'chirilgan)
    expect((await qaytish(env, 'A'.repeat(43), s.f)).status).toBe(400);
    expect((await qaytish(env, 'qisqa', s.f)).status).toBe(400);
    expect(s.f).not.toHaveBeenCalled();
  });

  it('Google xato qaytarsa (error=access_denied) yoki token almashuvi rad etilsa — login sahifasi, grant yo\'q', async () => {
    const { env, complete } = yasaEnv();
    const a = await boshlaVaOl(env);
    const r1 = await qaytish(env, a.state, soxtaFetch({}).f, 'error=access_denied');
    expect(r1.status).toBe(401);
    const b = await boshlaVaOl(env);
    const r2 = await qaytish(env, b.state, soxtaFetch({ tokenOk: false }).f);
    expect(r2.status).toBe(401);
    expect(complete).not.toHaveBeenCalled();
  });

  it('googleMavjud: RPC xatosi/tarmoq — null; tokenNonce buzuq token — null', async () => {
    const env = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_KEY: 'k' } as never;
    expect(await googleMavjud(env, 'a@b.test', 's', (async () => { throw new Error('x'); }) as never)).toBeNull();
    expect(await googleMavjud(env, 'a@b.test', 's', (async () => new Response('{}', { status: 500 })) as never)).toBeNull();
    expect(tokenNonce('x.y.z')).toBeNull();
  });
});

describe('ChatGPT moslik', () => {
  it('CSP form-action: ChatGPT redirect origin (chatgpt.com) login sahifasida ruxsat etilgan', async () => {
    expect(formManba(CHATGPT_REDIRECT)).toBe('https://chatgpt.com');
    expect(formManba('https://chatgpt.com/connector/oauth/abc123')).toBe('https://chatgpt.com');
    expect(formManba('http://evil.example/cb')).toBeUndefined();
    const { env } = yasaEnv();
    (env as { OAUTH_PROVIDER: { parseAuthRequest: ReturnType<typeof vi.fn>; lookupClient: ReturnType<typeof vi.fn> } }).OAUTH_PROVIDER.parseAuthRequest.mockResolvedValue({ clientId: 'https://chatgpt.com/oauth/client.json', redirectUri: CHATGPT_REDIRECT, scope: ['smeta'], state: 's', responseType: 'code' });
    (env as { OAUTH_PROVIDER: { lookupClient: ReturnType<typeof vi.fn> } }).OAUTH_PROVIDER.lookupClient.mockResolvedValue({ clientId: 'c', clientName: 'ChatGPT', redirectUris: [CHATGPT_REDIRECT] });
    const r = await authorizeGet(new Request('https://mcp.example.uz/authorize?x=1'), env);
    const csp = r.headers.get('Content-Security-Policy')!;
    expect(csp).toContain("form-action 'self' https://chatgpt.com");
    expect(await r.text()).toContain('/authorize/google?holat=');
  });

  const OBYEKT_KOMP: Record<number, number> = { 153: 17, 900: 99 };
  const javobchi: Javobchi = (sql, params) => {
    if (sql.includes('from public.t2_obyekt o where o.id = any')) return (params[0] as number[]).filter((id) => OBYEKT_KOMP[id]).map((id) => ({ id, kompaniya_id: OBYEKT_KOMP[id] }));
    if (sql.includes('from public.t2_obyekt o left join public.t2_kompaniya k')) {
      const q = params[1] as string | null;
      const hammasi = [{ id: 153, nom: 'Navoiy bog\'', kompaniya: 'K17', kompaniya_id: 17 }];
      return q && !'navoiy bog\''.includes(q.toLowerCase()) ? [] : hammasi;
    }
    return undefined;
  };
  const PTO17 = { foydalanuvchiId: 7, superadmin: false, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }], sess: { rol: 'pto', exp: Date.now() + 1e6, jti: 'x', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] } } as never;

  it('tools/list: search va fetch bor — faqat o\'qish, outputSchema, securitySchemes; to\'liq tool to\'plami saqlanadi', async () => {
    const { mu } = mockMuhit(() => undefined);
    const server = masofaviyServer(mu, PTO17);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const c = new Client({ name: 't', version: '1' });
    await c.connect(b);
    const { tools } = await c.listTools();
    for (const n of ['search', 'fetch']) {
      const t = tools.find((x) => x.name === n)!;
      expect(t).toBeTruthy();
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.outputSchema).toBeTruthy();
      expect((t._meta as { securitySchemes: Array<{ type: string }> }).securitySchemes[0].type).toBe('oauth2');
    }
    expect(tools.find((x) => x.name === 'fakt_yoz')!.annotations?.readOnlyHint).toBe(false); // yozuvchilar o'zgarishsiz
    expect(tools.find((x) => x.name === 'sql_yozish')).toBeUndefined();
    await c.close();
  });

  it('search: structuredContent + JSON matn, har natijada bo\'sh bo\'lmagan url; mos kelmasa foydalanuvchi obyektlari', async () => {
    const { mu } = mockMuhit(javobchi);
    const server = masofaviyServer(mu, PTO17, 'https://sayt.example.uz/');
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const c = new Client({ name: 't', version: '1' });
    await c.connect(b);
    const r = await c.callTool({ name: 'search', arguments: { query: 'navoiy' } });
    const sc = r.structuredContent as { results: Array<{ id: string; title: string; url: string }> };
    expect(sc.results).toEqual([{ id: 'obyekt:153', title: 'Navoiy bog\' (K17)', url: 'https://sayt.example.uz/?obyekt=153' }]);
    expect(JSON.parse((r.content as Array<{ text: string }>)[0].text)).toEqual(sc);
    const r2 = await c.callTool({ name: 'search', arguments: { query: 'umuman boshqa savol' } });
    expect((r2.structuredContent as { results: unknown[] }).results.length).toBe(1);
    await c.close();
  });

  it('fetch: begona kompaniya obyekti va noto\'g\'ri id — rad (RUXSAT_YOQ / format), ma\'lumot yo\'q', async () => {
    const { mu } = mockMuhit(javobchi);
    const j = await olish('obyekt:900', mu, PTO17);
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toContain('RUXSAT_YOQ');
    expect(j.structuredContent).toBeUndefined();
    const k = await olish('../etc/passwd', mu, PTO17);
    expect(k.isError).toBe(true);
    expect(OB_ID.test('obyekt:12')).toBe(true);
    expect(OB_ID.test('obyekt:12; drop')).toBe(false);
    expect((await qidir('x', mockMuhit(() => { throw new Error('baza'); }).mu, PTO17)).isError).toBe(true);
    expect(obyektUrl(undefined, 5)).toBe('https://smeta-tizimi.pages.dev/?obyekt=5');
  });
});

describe('OAuth discovery (ChatGPT talablari)', () => {
  it('authorization-server metadata: S256, DCR, RFC 9207 iss, resource metadata scope', async () => {
    const worker = (await import('../src/worker')).default;
    const { env } = yasaEnv();
    const as = await worker.fetch(new Request('https://mcp.example.uz/.well-known/oauth-authorization-server'), env, { waitUntil() {} } as never);
    expect(as.status).toBe(200);
    const m = await as.json() as Record<string, unknown>;
    expect(m.code_challenge_methods_supported).toContain('S256');
    expect(m.registration_endpoint).toBe('https://mcp.example.uz/register');
    expect(m.authorization_response_iss_parameter_supported).toBe(true);
    expect(m.issuer).toBeTruthy();
    expect(m.token_endpoint_auth_methods_supported).toContain('none');
    const pr = await worker.fetch(new Request('https://mcp.example.uz/.well-known/oauth-protected-resource/mcp'), env, { waitUntil() {} } as never);
    expect(pr.status).toBe(200);
    const p = await pr.json() as { resource: string; authorization_servers: string[] };
    expect(p.resource).toBe('https://mcp.example.uz/mcp');
    expect(p.authorization_servers.length).toBeGreaterThan(0);
    const anon = await worker.fetch(new Request('https://mcp.example.uz/mcp', { method: 'POST', body: '{}' }), env, { waitUntil() {} } as never);
    expect(anon.status).toBe(401);
    expect(anon.headers.get('WWW-Authenticate')).toMatch(/resource_metadata/);
  });
});
