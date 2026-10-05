import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './smeta-studio';
import { imzola } from '../_shared/auth';

const KALIT = 'k'.repeat(32);
const UID = '3f2c1a9e-5b7d-4c1e-9a2b-1c3d5e7f9a0b', OP = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const doc = { schema: 'smeta-studio-v1', draftId: UID, sections: {}, occurrences: {}, rootOrder: [] };
afterEach(() => vi.unstubAllGlobals());
async function call(body: unknown, sess: Record<string, unknown> | null = { rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] },
  rpc: (url: string, args: Record<string, unknown>) => Response = () => Response.json({ ok: true, versiya: 1 })) {
  const calls: Array<{ url: string; args: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { const args = JSON.parse(String(init.body)); calls.push({ url, args }); return rpc(url, args); }));
  const cookie = sess ? 'sess=' + await imzola(sess as never, KALIT) : '';
  const request = new Request('https://x/api/smeta-studio', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(body) });
  const r = await onRequestPost({ request, env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KALIT } } as never);
  return { r, j: await r.json() as Record<string, unknown>, calls };
}
const save = { amal: 'saqla', kompaniya_id: 17, obyekt_id: 3, draft_uid: UID, expected_version: 0, operation_id: OP, hujjat: doc };

describe('/api/smeta-studio', () => {
  it('session required; nothing reaches the database', async () => {
    const { r, calls } = await call(save, null);
    expect(r.status).toBe(401); expect(calls).toEqual([]);
  });
  it('actor comes from the session, never from the body', async () => {
    const { r, calls } = await call({ ...save, p_actor_id: 999, actor_id: 999 });
    expect(r.status).toBe(200);
    expect(calls[0].url).toContain('/rest/v1/rpc/t2_smeta_studio_saqla_v1');
    expect(calls[0].args).toMatchObject({ p_actor_id: 5, p_kompaniya_id: 17, p_obyekt_id: 3, p_expected_version: 0, p_operation_id: OP });
  });
  it('company outside the session is refused before the RPC', async () => {
    const { r, calls } = await call({ ...save, kompaniya_id: 18 });
    expect(r.status).toBe(403); expect(calls).toEqual([]);
  });
  it.each([
    [{ operation_id: 'x' }, 'OPERATION_ID_REQUIRED'], [{ expected_version: -1 }, 'EXPECTED_VERSION_INVALID'],
    [{ draft_uid: 'nope' }, 'DRAFT_UID_INVALID'], [{ hujjat: { ...doc, draftId: OP } }, 'DOCUMENT_INVALID'], [{ amal: 'sql' }, 'AMAL_INVALID'],
  ])('rejects %o with %s', async (patch, code) => {
    const { j, calls } = await call({ ...save, ...patch });
    expect(j.code).toBe(code); expect(calls).toEqual([]);
  });
  it('version conflict maps to 409 and is not retried', async () => {
    const { r, j, calls } = await call(save, undefined, () => Response.json({ ok: false, code: 'VERSION_CONFLICT', versiya: 4 }));
    expect(r.status).toBe(409); expect(j.versiya).toBe(4); expect(calls).toHaveLength(1);
  });
  it('membership exception from the RPC → 403 without leaking Postgres text', async () => {
    const { r, j } = await call(save, undefined, () => new Response('{"code":"42501","message":"actor bu kompaniyaning faol a\'zosi emas"}', { status: 400 }));
    expect(r.status).toBe(403); expect(JSON.stringify(j)).not.toContain('a\'zosi');
  });
  it('rahbar is read-only', async () => {
    const { r } = await call(save, { rol: 'rahbar', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'rahbar' }] });
    expect(r.status).toBe(403);
  });
});
