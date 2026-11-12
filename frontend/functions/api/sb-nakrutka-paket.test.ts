import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as oqish } from './sb';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

/** obyektEgasi: t2_obyekt.id -> kompaniya (gateway tenant tekshiruvi shundan oladi). */
async function chaqir(body: unknown, obyektEgasi: Record<number, number>) {
  const rpc: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'boss', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'boss' }] });
    if (url.pathname === '/rest/v1/t2_obyekt') { const id = Number(url.searchParams.get('id')?.replace('eq.', '')); return Response.json(obyektEgasi[id] ? [{ id, kompaniya_id: obyektEgasi[id] }] : []); }
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push(url.pathname + url.search); return Response.json({ ok: true, natijalar: [] }); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const token = await imzola({ rol: 'boss' as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'boss' }] }, env.SESSIYA_KALIT);
  const res = await oqish({ request: new Request('https://test/api/sb', { method: 'POST', headers: { Cookie: 'sess=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc };
}

describe('obyekt_nakrutka_paket_v1 (o\'qish): tenant va actor', () => {
  it('actor sessiyadan; juftlar JSON sifatida; bitta RPC chaqiruvi', async () => {
    const { res, rpc } = await chaqir({ soro: 'obyekt_nakrutka_paket_v1', kompaniya_id: 17, p_actor_id: 999, juftlar: [{ obyekt_id: 5 }, { obyekt_id: 6, shartnoma_id: 9 }] }, { 5: 17, 6: 17 });
    expect(res.status).toBe(200);
    expect(rpc).toHaveLength(1);
    const q = new URL('https://x' + rpc[0]);
    expect(q.pathname).toBe('/rest/v1/rpc/t2_obyekt_nakrutka_paket_v1');
    expect(q.searchParams.get('p_actor_id')).toBe('7');
    expect(JSON.parse(q.searchParams.get('p_juftlar')!)).toEqual([{ obyekt_id: 5, shartnoma_id: null }, { obyekt_id: 6, shartnoma_id: 9 }]);
  });
  it('a\'zo bo\'lmagan kompaniya rad etiladi', async () => {
    const { res, rpc } = await chaqir({ soro: 'obyekt_nakrutka_paket_v1', kompaniya_id: 18, juftlar: [{ obyekt_id: 5 }] }, { 5: 18 });
    expect(res.status).toBe(403);
    expect(rpc).toHaveLength(0);
  });
  it('boshqa kompaniya obyekti aralashsa - butun paket rad etiladi', async () => {
    const { res, rpc } = await chaqir({ soro: 'obyekt_nakrutka_paket_v1', kompaniya_id: 17, juftlar: [{ obyekt_id: 5 }, { obyekt_id: 6 }] }, { 5: 17, 6: 18 });
    expect(res.status).toBe(403);
    expect(rpc).toHaveLength(0);
  });
  it('mavjud bo\'lmagan obyekt rad etiladi', async () => {
    const { res, rpc } = await chaqir({ soro: 'obyekt_nakrutka_paket_v1', kompaniya_id: 17, juftlar: [{ obyekt_id: 404 }] }, {});
    expect(res.status).toBe(403);
    expect(rpc).toHaveLength(0);
  });
  it.each([
    [undefined], [[]], ['x'], [[{ obyekt_id: 0 }]], [[{ obyekt_id: 5, shartnoma_id: -1 }]], [[{ obyekt_id: 'a' }]],
    [Array.from({ length: 61 }, (_, i) => ({ obyekt_id: i + 1 }))],
  ])('noto\'g\'ri juftlar RPC ga yetmaydi %#', async (juftlar) => {
    const { rpc } = await chaqir({ soro: 'obyekt_nakrutka_paket_v1', kompaniya_id: 17, juftlar }, { 5: 17 });
    expect(rpc).toHaveLength(0);
  });
});