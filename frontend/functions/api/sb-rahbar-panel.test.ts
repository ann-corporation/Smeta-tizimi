import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as oqish } from './sb';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { dataPermission, requestPermission } from '../_shared/permission-policy';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

type Chaqiruv = { yol: string };
async function sb(body: unknown, rol = 'boss') {
  const rpc: Chaqiruv[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol, faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: rol }] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push({ yol: url.pathname + url.search }); return Response.json({ ok: true }); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const cookie = 'sess=' + await imzola({ rol: rol as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol }] }, env.SESSIYA_KALIT);
  const res = await oqish({ request: new Request('https://test/api/sb', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc, q: rpc[0] ? new URL('https://x' + rpc[0].yol) : null };
}

describe('rahbar_panel_v1 (o‘qish shlyuzi)', () => {
  it('actor sessiyadan; kompaniya a’zolik bilan; davr oy → oy boshi', async () => {
    const { res, q } = await sb({ soro: 'rahbar_panel_v1', kompaniya_id: 17, davr_dan: '2026-01', davr_gacha: '2026-06-30', obyekt_id: 4, p_actor_id: 999 });
    expect(res.status).toBe(200);
    expect(q!.pathname).toBe('/rest/v1/rpc/t2_rahbar_panel_v1');
    expect(q!.searchParams.get('p_actor_id')).toBe('7');
    expect(q!.searchParams.get('p_kompaniya_id')).toBe('17');
    expect(q!.searchParams.get('p_obyekt_id')).toBe('4');
    expect(q!.searchParams.get('p_davr_dan')).toBe('2026-01-01');
    expect(q!.searchParams.get('p_davr_gacha')).toBe('2026-06-30');
  });
  it('a’zo bo‘lmagan kompaniya va noto‘g‘ri davr/obyekt RPC ga yetmaydi', async () => {
    for (const body of [
      { soro: 'rahbar_panel_v1', kompaniya_id: 18 },
      { soro: 'rahbar_panel_v1', kompaniya_id: 17, davr_dan: '2026/01' },
      { soro: 'rahbar_panel_v1', kompaniya_id: 17, obyekt_id: -1 },
    ]) {
      const { rpc } = await sb(body);
      expect(rpc.length).toBe(0);
    }
  });
  it('rahbar_pult_v1: actor sessiyadan, kompaniya a’zolik bilan', async () => {
    const { res, q } = await sb({ soro: 'rahbar_pult_v1', kompaniya_id: 17, p_actor_id: 999 });
    expect(res.status).toBe(200);
    expect(q!.pathname).toBe('/rest/v1/rpc/t2_rahbar_pult_v1');
    expect(q!.searchParams.get('p_actor_id')).toBe('7');
    expect(q!.searchParams.get('p_kompaniya_id')).toBe('17');
    const { rpc } = await sb({ soro: 'rahbar_pult_v1', kompaniya_id: 18 });
    expect(rpc.length).toBe(0);
    expect(dataPermission('rahbar_pult_v1', false)).toBe('financial.read');
  });
  it('ruxsat — financial.read', () => {
    expect(dataPermission('rahbar_panel_v1', false)).toBe('financial.read');
    expect(requestPermission('sb', 'POST', { soro: 'rahbar_panel_v1' }, new URLSearchParams())).toBe('financial.read');
  });
});
