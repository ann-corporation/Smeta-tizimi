import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yozish } from './sb-yoz';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { ilovaKeshTozala } from '../_shared/ilova-darvoza';

/**
 * AUDIT 121 (2026-11-11): «Yangi zayavka» -> «Ma'lumotni yuklab bo'lmadi». Sabablar:
 *  1) prodda t2_erp_amal ikki nusxada (p_payload text va jsonb) — satr yuborilganda PostgREST nusxani tanlay olmasdi (PGRST203);
 *  2) har RAISE EXCEPTION (masalan «requested_by is required») umumiy UPSTREAM xabariga aylanardi.
 * Endi: p_payload OBYEKT sifatida ketadi va har baza xatosi o'zbekcha sabab bilan qaytadi.
 */
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); ilovaKeshTozala(); });

async function chaqir(rpcJavob: { status: number; body: unknown }, sessiya: { email?: string } = {}) {
  const rpc: { yol: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('console', { ...console, error: () => undefined });
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'boss', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'boss' }] });
    if (url.pathname.endsWith('/rpc/t2_modul_holat_v1')) return Response.json({ ok: true, modullar: [{ kod: 'module.xarid', holat: 'on' }] });
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ id: 5, kompaniya_id: 17 }]);
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push({ yol: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : {} }); return Response.json(rpcJavob.body, { status: rpcJavob.status }); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const token = await imzola({ rol: 'boss' as never, foydalanuvchi_id: 7, ...sessiya, kompaniyalar: [{ kompaniya_id: 17, rol: 'boss' }] } as never, env.SESSIYA_KALIT);
  const body = { amal: 'erp_amal', kompaniya_id: 17, operatsiya: 'zayavka_yarat', payload: { obyekt_id: 5, item_text: 'Sement', requested_qty: 2, unit: 'tonna', priority: 'orta', operation_id: '11111111-1111-4111-8111-111111111111' } };
  const res = await yozish({ request: new Request('https://test/api/sb-yoz', { method: 'POST', headers: { Cookie: 'sess=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc, json: await res.json() as Record<string, unknown> };
}

describe('zayavka_yarat (erp_amal)', () => {
  it('p_payload OBYEKT sifatida yuboriladi (satr emas) va p_kim bo\'sh qolmaydi', async () => {
    const { rpc, json } = await chaqir({ status: 200, body: { ok: true, id: 3 } });
    expect(json.ok).toBe(true);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_erp_amal');
    expect(typeof rpc[0].body.p_payload).toBe('object');
    expect((rpc[0].body.p_payload as Record<string, unknown>).item_text).toBe('Sement');
    expect(String(rpc[0].body.p_kim)).toMatch(/\S/);
  });
  it('«requested_by is required» — sababi bilan, umumiy «yuklab bo\'lmadi» emas', async () => {
    const { res, json } = await chaqir({ status: 400, body: { code: 'P0001', message: 'requested_by is required' } });
    expect(res.status).toBe(409);
    expect(json.code).toBe('ZAYAVKA_KIM_YOQ');
    expect(String(json.error)).not.toMatch(/yuklab/);
  });
  it('miqdor/nom xatosi o\'zbekcha sabab bilan', async () => {
    const { json } = await chaqir({ status: 400, body: { code: 'P0001', message: 'item_text and requested_qty (> 0) are required' } });
    expect(json.code).toBe('ZAYAVKA_MIQDOR');
  });
  it('ikki nusxali funksiya (PGRST203) — «server sozlamasi» sababi, ichki matn chiqmaydi', async () => {
    const { json } = await chaqir({ status: 300, body: { code: 'PGRST203', message: 'Could not choose the best candidate function between: public.t2_erp_amal(...)' } });
    expect(json.code).toBe('BAZA_SOZLAMA');
    expect(JSON.stringify(json)).not.toContain('t2_erp_amal');
  });
});
