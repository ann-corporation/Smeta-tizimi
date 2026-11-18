// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './ai-salomatlik';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());
async function get(opts: { superadmin: boolean; hisobot?: Response }) {
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    const nom = String(u).split('/rpc/')[1];
    if (nom === 't2_boshqaruv_umumiy_v1') return opts.superadmin ? Response.json({ foydalanuvchi: { id: 7 } }) : new Response('SUPERADMIN_KERAK', { status: 400 });
    return opts.hisobot ?? Response.json({ ok: true, d7: { yuzalar: [{ yuza: 'jarvis', soni: 3, xato_foiz: 33.3, p50_ms: 800, p95_ms: 2100 }] }, d30: {}, ishchilar: { yoqilgan: 0, ish_24s: 0 } });
  }));
  const sess = await imzola({ rol: 'superadmin', foydalanuvchi_id: 7, kompaniyalar: [] }, KEY);
  const res = await onRequestGet({ request: new Request('https://x/api/ai-salomatlik', { headers: { Cookie: 'sess=' + sess } }), env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY } } as never);
  return { res, json: await res.json() as Record<string, unknown> };
}
describe('ai-salomatlik (superadmin)', () => {
  it('superadmin bo\'lmasa 403', async () => { expect((await get({ superadmin: false })).res.status).toBe(403); });
  it('superadmin: hisobot qaytadi', async () => {
    const { res, json } = await get({ superadmin: true });
    expect(res.status).toBe(200); expect(json.ok).toBe(true);
    expect((json.d7 as { yuzalar: Array<{ yuza: string }> }).yuzalar[0].yuza).toBe('jarvis');
  });
  it('migratsiya yo\'q (404) -> 503 MIGRATSIYA_YOQ', async () => {
    const { res, json } = await get({ superadmin: true, hisobot: new Response('{}', { status: 404 }) });
    expect(res.status).toBe(503); expect(json.code).toBe('MIGRATSIYA_YOQ');
  });
});