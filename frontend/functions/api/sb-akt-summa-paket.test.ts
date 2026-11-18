import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as oqish } from './sb';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

async function chaqir(body: unknown) {
  const rpc: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'boss', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'boss' }] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push(url.pathname + url.search); return Response.json({ ok: true, akt_id: 5, paket: { qqs_bilan: 112, ustamali: 100, ustamasiz: 80 } }); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const token = await imzola({ rol: 'boss' as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'boss' }] }, env.SESSIYA_KALIT);
  const res = await oqish({ request: new Request('https://test/api/sb', { method: 'POST', headers: { Cookie: 'sess=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc };
}

describe('akt_summa_paket_v1 (o\'qish): akt summa paketi, actor sessiyadan', () => {
  it('nomli RPC; p_akt_id so\'rovdan, p_actor_id doim sessiyadan (mijoz yuborganiga e\'tibor yo\'q)', async () => {
    const { res, rpc } = await chaqir({ soro: 'akt_summa_paket_v1', akt_id: 5, p_actor_id: 999 });
    expect(res.status).toBe(200);
    expect(rpc).toHaveLength(1);
    const q = new URL('https://x' + rpc[0]);
    expect(q.pathname).toBe('/rest/v1/rpc/t2_akt_summa_paket_v1');
    expect(q.searchParams.get('p_akt_id')).toBe('5');
    expect(q.searchParams.get('p_actor_id')).toBe('7');
  });
  it.each([[0], [-3], ['x'], [undefined]])('noto\'g\'ri akt_id RPC ga yetmaydi %#', async (akt_id) => {
    const { rpc } = await chaqir({ soro: 'akt_summa_paket_v1', akt_id });
    expect(rpc).toHaveLength(0);
  });
});