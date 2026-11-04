// @vitest-environment node
/** Ilova darvozasi gateway'da: o'chirilgan ilova amali/o'qishi ILOVA_YOQILMAGAN bilan rad etiladi; yadro amallari ta'sirlanmaydi. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { ilovaKeshTozala } from '../_shared/ilova-darvoza';
import { onRequestPost as yoz } from './sb-yoz';
import { onRequestPost as oqish } from './sb';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
beforeEach(() => ilovaKeshTozala());
afterEach(() => vi.unstubAllGlobals());

async function chaqir(fn: typeof yoz | typeof oqish, url: string, body: Record<string, unknown>, off: string[]) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const u = new URL(String(raw)); calls.push(u.pathname);
    if (u.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'boss' }] });
    if (u.pathname.endsWith('/rpc/t2_modul_holat_v1')) return Response.json({ ok: true, modullar: ['module.sotuv', 'module.moliya'].map((kod) => ({ kod, holat: off.includes(kod) ? 'off' : 'on' })) });
    if (u.pathname.endsWith('/rpc/t2_actor_kompaniya_azo_tekshir')) return Response.json('boss');
    if (u.pathname.startsWith('/rest/v1/rpc/')) return Response.json({ ok: true });
    if (u.pathname.startsWith('/rest/v1/')) return Response.json([{ id: 9, kompaniya_id: 17 }]);
    throw new Error('Unexpected upstream ' + u.pathname);
  }));
  const token = await imzola({ rol: 'boss', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'boss' }] }, env.SESSIYA_KALIT);
  const res = await fn({ request: new Request(url, { method: 'POST', headers: { Cookie: 'sess=' + token }, body: JSON.stringify(body) }), env } as never);
  return { res, json: await res.json().catch(() => null) as Record<string, unknown> | null, calls };
}

describe('sb-yoz: ilova darvozasi', () => {
  const op = '11111111-1111-4111-8111-111111111111';
  it('o\'chirilgan Uy sotish — sotuv amali 403 ILOVA_YOQILMAGAN, yozuv RPC si chaqirilmaydi', async () => {
    const { res, json, calls } = await chaqir(yoz, 'https://t/api/sb-yoz', { amal: 'sotuv_bron_v1', kompaniya_id: 17, operation_id: op }, ['module.sotuv']);
    expect(res.status).toBe(403);
    expect(json).toMatchObject({ ok: false, code: 'ILOVA_YOQILMAGAN', ilova: 'sotuv' });
    expect(calls.some((p) => p.endsWith('/rpc/t2_sotuv_bron_v1'))).toBe(false);
  });
  it('o\'chirilgan Moliya — tolov_yoz rad etiladi', async () => {
    const { res, json } = await chaqir(yoz, 'https://t/api/sb-yoz', { amal: 'tolov_yoz', kompaniya_id: 17, operation_id: op }, ['module.moliya']);
    expect(res.status).toBe(403); expect(json?.code).toBe('ILOVA_YOQILMAGAN');
  });
  it('PTO yadrosi (qator_tahrir) ilova o\'chirilganda ham ishlaydi', async () => {
    const { res, calls } = await chaqir(yoz, 'https://t/api/sb-yoz', { amal: 'qator_tahrir', qator_id: 9, maydon: 'hajm', qiymat: '1.25', kutilgan_versiya: 1, kompaniya_id: 17 }, ['module.sotuv', 'module.moliya']);
    expect(res.status).toBe(200);
    expect(calls).toContain('/rest/v1/rpc/t2_qator_tahrir');
  });
  it('ilova yoqiq — o\'tadi (darvoza to\'smaydi)', async () => {
    const { json } = await chaqir(yoz, 'https://t/api/sb-yoz', { amal: 'sotuv_bron_v1', kompaniya_id: 17, operation_id: op }, []);
    expect(json?.code).not.toBe('ILOVA_YOQILMAGAN');
  });
});

describe('sb: ilova darvozasi (o\'qish)', () => {
  it('o\'chirilgan Uy sotish — sotuv_panel_v1 403 ILOVA_YOQILMAGAN', async () => {
    const { res, json } = await chaqir(oqish, 'https://t/api/sb', { soro: 'sotuv_panel_v1', kompaniya_id: 17 }, ['module.sotuv']);
    expect(res.status).toBe(403);
    expect(json).toMatchObject({ code: 'ILOVA_YOQILMAGAN', ilova: 'sotuv' });
  });
  it('modul_holat_v1 (menyu uchun) har doim ochiq', async () => {
    const { json } = await chaqir(oqish, 'https://t/api/sb', { soro: 'modul_holat_v1', kompaniya_id: 17 }, ['module.sotuv']);
    expect(json?.code).not.toBe('ILOVA_YOQILMAGAN');
  });
});