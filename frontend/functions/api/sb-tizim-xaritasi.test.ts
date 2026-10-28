import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as oqish } from './sb';
import { onRequestGet as bGet, onRequestPost as bPost, yozishYuki } from './boshqaruv';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { requestPermission } from '../_shared/permission-policy';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
const OP = '11111111-1111-4111-8111-111111111111';
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

type Chaqiruv = { yol: string; body: unknown };
function upstream(rpc: Chaqiruv[], rol: string) {
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: rol === 'superadmin' ? 'superadmin' : 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol, faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: rol }] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push({ yol: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : null }); return Response.json({ ok: true, tugunlar: [], bogichlar: [], qatorlar: [] }); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
}
async function cookie(rol: string, foydalanuvchi = 7) {
  return 'sess=' + await imzola({ rol: rol as never, foydalanuvchi_id: foydalanuvchi, kompaniyalar: [{ kompaniya_id: 17, rol }] }, env.SESSIYA_KALIT);
}
async function sb(body: unknown, rol = 'boss') {
  const rpc: Chaqiruv[] = [];
  upstream(rpc, rol);
  const res = await oqish({ request: new Request('https://test/api/sb', { method: 'POST', headers: { Cookie: await cookie(rol), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc, q: rpc[0] ? new URL('https://x' + rpc[0].yol) : null };
}

describe('tizim_xaritasi_v1 (o‘qish): actor sessiyadan, ruxsat bazada', () => {
  it('p_actor_id faqat sessiyadan; mijoz yuborgan actor e’tiborsiz', async () => {
    const { res, q } = await sb({ soro: 'tizim_xaritasi_v1', actor_id: 999, p_actor_id: 999 });
    expect(res.status).toBe(200);
    expect(q!.pathname).toBe('/rest/v1/rpc/t2_tizim_xaritasi_v1');
    expect(q!.searchParams.get('p_actor_id')).toBe('7');
    expect(q!.searchParams.has('p_kompaniya_id')).toBe(false);
  });
  it('kompaniya_id — faqat filtr: a’zolik shlyuzda tekshirilmaydi (rad etishni baza qiladi)', async () => {
    const { q } = await sb({ soro: 'tizim_xaritasi_v1', kompaniya_id: 18 });
    expect(q!.searchParams.get('p_kompaniya_id')).toBe('18');
    expect(q!.searchParams.get('p_actor_id')).toBe('7');
  });
  it('noto‘g‘ri kompaniya_id RPC ga yetmaydi', async () => {
    const { rpc } = await sb({ soro: 'tizim_xaritasi_v1', kompaniya_id: 'x' });
    expect(rpc.length).toBe(0);
  });
  it('ruxsat tekshiruvi ham actor bilan', async () => {
    const { q } = await sb({ soro: 'tizim_xaritasi_ruxsat_tekshir_v1', p_actor_id: 1 });
    expect(q!.pathname).toBe('/rest/v1/rpc/t2_tizim_xaritasi_ruxsat_tekshir_v1');
    expect(q!.searchParams.get('p_actor_id')).toBe('7');
  });
  it('kompaniya capability si bilan berilmaydi va to‘silmaydi (platforma darajasi)', () => {
    expect(requestPermission('sb', 'POST', { soro: 'tizim_xaritasi_v1' }, new URLSearchParams())).toBeNull();
    expect(requestPermission('sb', 'POST', { soro: 'tizim_xaritasi_ruxsat_tekshir_v1' }, new URLSearchParams())).toBeNull();
    // Ruxsat boshqaruvi — platforma roli (middleware: superadmin bo'lmasa PLATFORM_ROLE_REQUIRED).
    expect(requestPermission('boshqaruv', 'GET', {}, new URLSearchParams('bolim=tizim_ruxsat'))).toBe('control.global.read');
    expect(requestPermission('boshqaruv', 'POST', { amal: 'tizim_ruxsat_ber' }, new URLSearchParams())).toBe('control.global.write');
  });
});

describe('tizim xaritasi ruxsatlari (boshqaruv shlyuzi)', () => {
  it('ber / ol: foydalanuvchi_id va operation_id majburiy', () => {
    expect(yozishYuki('tizim_ruxsat_ber', { foydalanuvchi_id: 5, izoh: 'audit', operation_id: OP, p_actor_id: 1 }))
      .toEqual({ p_foydalanuvchi_id: 5, p_izoh: 'audit', p_operation_id: OP });
    expect(yozishYuki('tizim_ruxsat_ol', { foydalanuvchi_id: 5, operation_id: OP })).toEqual({ p_foydalanuvchi_id: 5, p_izoh: null, p_operation_id: OP });
    expect(yozishYuki('tizim_ruxsat_ber', { foydalanuvchi_id: 5, operation_id: 'x' })).toMatch(/operation_id/);
    expect(yozishYuki('tizim_ruxsat_ol', { foydalanuvchi_id: 0, operation_id: OP })).toMatch(/foydalanuvchi_id/);
  });
  it('POST: actor sessiyadan RPC ga boradi', async () => {
    const rpc: Chaqiruv[] = [];
    upstream(rpc, 'superadmin');
    const res = await bPost({ request: new Request('https://test/api/boshqaruv', { method: 'POST', headers: { Cookie: await cookie('superadmin', 3), 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'tizim_ruxsat_ber', foydalanuvchi_id: 5, operation_id: OP, p_actor_id: 999 }) }), env, data: {} } as never);
    expect(res.status).toBe(200);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_tizim_xaritasi_ruxsat_ber_v1');
    expect(rpc[0].body).toEqual({ p_actor_id: 3, p_foydalanuvchi_id: 5, p_izoh: null, p_operation_id: OP });
  });
  it('GET bolim=tizim_ruxsat → ro‘yxat RPC si (actor sessiyadan)', async () => {
    const rpc: Chaqiruv[] = [];
    upstream(rpc, 'superadmin');
    await bGet({ request: new Request('https://test/api/boshqaruv?bolim=tizim_ruxsat', { headers: { Cookie: await cookie('superadmin', 3) } }), env, data: {} } as never);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_tizim_xaritasi_ruxsat_royxat_v1');
    expect(rpc[0].body).toEqual({ p_actor_id: 3 });
  });
});
