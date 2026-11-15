// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { onRequestGet, onRequestPost } from './modullarim';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3) };
let calls: { path: string; body: any }[] = [];
let reply: unknown = { ok: true, versiya: 1 };
beforeEach(() => {
  calls = []; reply = { ok: true, versiya: 1 };
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => { calls.push({ path: new URL(String(raw)).pathname, body: JSON.parse(String(init?.body ?? '{}')) }); return Response.json(reply); }));
});
afterEach(() => vi.unstubAllGlobals());
const cookie = async (uid = 7) => 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: uid }, env.SESSIYA_KALIT);
const call = async (fn: PagesFunction<any>, url: string, init: RequestInit & { cookie?: string | null } = {}) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const c = init.cookie === undefined ? await cookie() : init.cookie; if (c) headers.Cookie = c;
  return fn({ request: new Request(url, { method: init.method, body: init.body, headers }), env, data: {}, next: vi.fn() } as never);
};

describe('/api/modullarim', () => {
  it('requires a session and never calls the database without one', async () => {
    expect((await call(onRequestGet, 'https://s.test/api/modullarim?kompaniya_id=8', { cookie: null })).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it('GET reads with the session actor, not a client-supplied one', async () => {
    reply = { ok: true, tanlangan: ['pto'], tartib: ['pto'], versiya: 3 };
    const r = await call(onRequestGet, 'https://s.test/api/modullarim?kompaniya_id=8&actor_id=1');
    expect(r.status).toBe(200);
    expect(calls[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 8 });
  });
  it('POST validates codes and size, passes the version, maps STALE_VERSION to 409', async () => {
    const post = (b: unknown) => call(onRequestPost, 'https://s.test/api/modullarim', { method: 'POST', body: JSON.stringify(b) });
    expect((await post({ kompaniya_id: 8, tanlangan: ['BAD CODE'], tartib: [], expected_version: 0 })).status).toBe(400);
    expect((await post({ kompaniya_id: 8, tanlangan: [], tartib: Array(41).fill('pto'), expected_version: 0 })).status).toBe(400);
    expect((await post({ kompaniya_id: 8, tanlangan: ['pto'], tartib: ['pto'], expected_version: 2 })).status).toBe(200);
    expect(calls.at(-1)!.body).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 8, p_expected_version: 2, p_tanlangan: ['pto'] });
    reply = { ok: false, code: 'STALE_VERSION', versiya: 4 };
    expect((await post({ kompaniya_id: 8, tanlangan: [], tartib: [], expected_version: 2 })).status).toBe(409);
    reply = { ok: false, code: 'AZO_EMAS' };
    expect((await post({ kompaniya_id: 9, tanlangan: [], tartib: [], expected_version: 0 })).status).toBe(403);
  });
});
