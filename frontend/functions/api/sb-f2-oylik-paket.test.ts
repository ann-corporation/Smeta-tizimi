import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as oqish } from './sb';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { dataPermission } from '../_shared/permission-policy';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

async function sb(body: unknown, rol = 'boss') {
  const rpc: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol, faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: rol }] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push(url.pathname + url.search); return Response.json({ ok: true }); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const cookie = 'sess=' + await imzola({ rol: rol as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol }] }, env.SESSIYA_KALIT);
  const res = await oqish({ request: new Request('https://test/api/sb', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, q: rpc[0] ? new URL('https://x' + rpc[0]) : null };
}

describe('f2_oylik_paket_v1 (shartnoma oylik paketi: sahifa ochilishi, o‘qish shlyuzi)', () => {
  it('actor sessiyadan; shartnoma va oy tekshiriladi va RPC ga uzatiladi', async () => {
    const { res, q } = await sb({ soro: 'f2_oylik_paket_v1', kompaniya_id: 17, shartnoma_id: 26, oy: '2026-09', p_actor_id: 999 });
    expect(res.status).toBe(200);
    expect(q!.pathname).toBe('/rest/v1/rpc/t2_f2_oylik_paket_v1');
    expect(q!.searchParams.get('p_actor_id')).toBe('7');
    expect(q!.searchParams.get('p_kompaniya_id')).toBe('17');
    expect(q!.searchParams.get('p_shartnoma_id')).toBe('26');
    expect(q!.searchParams.get('p_oy')).toBe('2026-09-01');
    expect(dataPermission('f2_oylik_paket_v1', false)).toBe('f2.read');
  });
  it('noto‘g‘ri parametr RPC ga yetmaydi', async () => {
    for (const b of [
      { soro: 'f2_oylik_paket_v1', kompaniya_id: 17, oy: '2026-09' },
      { soro: 'f2_oylik_paket_v1', kompaniya_id: 17, shartnoma_id: -1, oy: '2026-09' },
      { soro: 'f2_oylik_paket_v1', kompaniya_id: 17, shartnoma_id: 3 },
      { soro: 'f2_oylik_paket_v1', kompaniya_id: 17, shartnoma_id: 3, oy: '2026/09' },
      { soro: 'f2_oylik_paket_v1', kompaniya_id: 17, shartnoma_id: 3, oy: '2026-13' },
    ]) {
      const { res, q } = await sb(b);
      expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
      expect(q).toBeNull();
    }
  });
});