/**
 * T2-AUTH-PASSWORD-MIGRATION-001 -- `member_password_set` action proof.
 * Same actor-from-session law as every other action here: p_actor_id NEVER
 * comes from the request body, only from the verified session cookie.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { onRequestGet, onRequestPost } from './company';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32) };

async function ctxOf(body: unknown, actorId = 3) {
  const token = await imzola({ rol: 'boss', email: 'boss@sinov', foydalanuvchi_id: actorId }, ENV.SESSIYA_KALIT);
  return {
    request: new Request('http://x/api/company', {
      method: 'POST', headers: { Cookie: `sess=${token}` }, body: JSON.stringify(body),
    }),
    env: ENV,
  } as any;
}

async function getCtxOf(qs: string, actorId = 3) {
  const token = await imzola({ rol: 'boss', email: 'boss@sinov', foydalanuvchi_id: actorId }, ENV.SESSIYA_KALIT);
  return {
    request: new Request('http://x/api/company' + qs, { headers: { Cookie: `sess=${token}` } }),
    env: ENV,
  } as any;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('company — versioned individual permission constructor',()=>{
  it('uses session actor and sends explicit complete policy/version/operation to the named RPC',async()=>{
    const f=vi.fn(async (_u:string,init:RequestInit)=>{
      expect(_u).toContain('/rpc/t2_azolik_ruxsat_set_v2');
      expect(JSON.parse(init.body as string)).toMatchObject({p_actor_id:3,p_kompaniya_id:17,p_azolik_id:12,p_expected_version:4,p_permissions:{'f2.approve':false}});
      return Response.json({ok:true,versiya:5});
    });vi.stubGlobal('fetch',f);
    const r=await onRequestPost(await ctxOf({action:'azolik_ruxsat_set',kompaniya_id:17,azolik_id:12,expected_version:4,permissions:{'f2.approve':false},p_actor_id:999}));
    expect(r.status).toBe(200);expect(f).toHaveBeenCalledTimes(1);
  });
  it.each(['STALE_VERSION','OPERATION_CONFLICT'])('%s is a conflict, not success',async code=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:false,code})));
    const r=await onRequestPost(await ctxOf({action:'azolik_ruxsat_set',kompaniya_id:17,azolik_id:12,expected_version:4,permissions:{}}));expect(r.status).toBe(409);
  });
  it.each(['PROTECTED_AUTHORITY','MANAGEMENT_ROLE_REQUIRED'])('%s cannot alter protected management authority',async code=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:false,code})));
    const r=await onRequestPost(await ctxOf({action:'azolik_ruxsat_set',kompaniya_id:17,azolik_id:12,expected_version:4,permissions:{}}));expect(r.status).toBe(403);
  });
  it('missing version is refused before RPC',async()=>{
    const f=vi.fn();vi.stubGlobal('fetch',f);
    const r=await onRequestPost(await ctxOf({action:'azolik_ruxsat_set',kompaniya_id:17,azolik_id:12,permissions:{}}));expect(r.status).toBe(400);expect(f).not.toHaveBeenCalled();
  });
});

describe('company -- member_password_set', () => {
  it('actor sessiyadan olinadi (so\'rov tanasidan EMAS), to\'g\'ri RPC chaqiriladi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_parol_belgila_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_kompaniya_id: 1, p_foydalanuvchi_id: 42, p_yangi_parol: 'yetarlicha-uzun-1' });
      return { ok: true, text: async () => JSON.stringify({ ok: true, foydalanuvchi_id: 42 }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(await ctxOf({
      action: 'member_password_set', kompaniya_id: 1, foydalanuvchi_id: 42,
      yangi_parol: 'yetarlicha-uzun-1',
      // Buzg'unchi urinish: boshqa aktyorni yubormoqchi -- e'tiborsiz qoldirilishi SHART.
      p_actor_id: 999,
    }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, foydalanuvchi_id: 42 });
  });

  it('PAROL_QISQA -> 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code: 'PAROL_QISQA' }) } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'member_password_set', kompaniya_id: 1, foydalanuvchi_id: 42, yangi_parol: 'qisqa' }));
    expect(res.status).toBe(400);
  });

  it('AZOLIK_TOPILMADI -> 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code: 'AZOLIK_TOPILMADI' }) } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'member_password_set', kompaniya_id: 1, foydalanuvchi_id: 999999, yangi_parol: 'yetarlicha-uzun-1' }));
    expect(res.status).toBe(404);
  });

  it('direktor emas aktyor -> 403 (42501 RPC dan)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'faqat direktor (boss) yoki superadmin' } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'member_password_set', kompaniya_id: 1, foydalanuvchi_id: 42, yangi_parol: 'yetarlicha-uzun-1' }));
    expect(res.status).toBe(403);
  });
});

/**
 * T2-COMPANY-CREATE-GATE-001 — real hodisa: a'zoligi yo'q foydalanuvchi
 * ("prorab") o'zi uchun kompaniya ochib, uning direktori bo'lib olgan.
 * Transport qatlami bu RPC'larni RPC nomiga TO'G'RI moslashtirishi va
 * `royxat_royxat` ni POST orqali ishlatib bo'lmasligi shart (u FAQAT
 * o'qish uchun, GET yo'lidan).
 */
describe('company -- kompaniya yaratish/so\'rov (T2-COMPANY-CREATE-GATE-001)', () => {
  it('"create" -> t2_kompaniya_yarat_v1 ga aktyor sessiyadan bilan boradi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_kompaniya_yarat_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_nom: 'Mening firmam' });
      return { ok: true, text: async () => JSON.stringify({ ok: true, kompaniya_id: 7, kod: 'MF', rol: 'boss' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(await ctxOf({ action: 'create', nom: 'Mening firmam' }));
    expect(res.status).toBe(200);
  });

  it('RPC SUPERADMIN_REQUIRED qaytarsa -> 403 (oddiy foydalanuvchi to‘g‘ridan-to‘g‘ri yarata olmaydi)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code: 'SUPERADMIN_REQUIRED' }) } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'create', nom: 'Mening firmam' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'SUPERADMIN_REQUIRED' });
  });

  it('"royxat_soraw" -> t2_kompaniya_royxat_soraw_v1 ga to‘g‘ri parametrlar bilan boradi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_kompaniya_royxat_soraw_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_nom: 'Mening firmam' });
      return { ok: true, text: async () => JSON.stringify({ ok: true, royxat_id: 11, holat: 'kutilmoqda' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(await ctxOf({ action: 'royxat_soraw', nom: 'Mening firmam' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, royxat_id: 11, holat: 'kutilmoqda' });
  });

  it('"royxat_tasdiqla" faqat royxat_id va aktyor sessiyadan uzatadi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_kompaniya_royxat_tasdiqla_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_royxat_id: 11 });
      return { ok: true, text: async () => JSON.stringify({ ok: true, kompaniya_id: 7, royxat_id: 11 }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(await ctxOf({ action: 'royxat_tasdiqla', royxat_id: 11 }));
    expect(res.status).toBe(200);
  });

  it('"royxat_tasdiqla" superadmin bo‘lmagan aktyordan -> 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code: 'SUPERADMIN_REQUIRED' }) } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'royxat_tasdiqla', royxat_id: 11 }));
    expect(res.status).toBe(403);
  });

  it('REQUEST_NOT_PENDING (qayta tasdiqlash/rad etish) -> 409', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code: 'REQUEST_NOT_PENDING', holat: 'tasdiqlandi' }) } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'royxat_tasdiqla', royxat_id: 11 }));
    expect(res.status).toBe(409);
  });

  it('"royxat_rad_et" sabab bilan to‘g‘ri RPC ga boradi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_kompaniya_royxat_rad_et_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_royxat_id: 11, p_sabab: 'STIR noto‘g‘ri' });
      return { ok: true, text: async () => JSON.stringify({ ok: true, royxat_id: 11, holat: 'rad_etildi' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(await ctxOf({ action: 'royxat_rad_et', royxat_id: 11, sabab: 'STIR noto‘g‘ri' }));
    expect(res.status).toBe(200);
  });

  it('"royxat_royxat" (faqat o‘qish) POST orqali RAD ETILADI — 400', async () => {
    const res = await onRequestPost(await ctxOf({ action: 'royxat_royxat' }));
    expect(res.status).toBe(400);
  });

  it('nom bo‘lmasa RPC BAD payloadni qaytaradi (transport buni majburlamaydi, RPC o‘zi tekshiradi)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code: 'COMPANY_NAME_REQUIRED' }) } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'royxat_soraw' }));
    expect(res.status).toBe(400);
  });
});

/**
 * T2-RUXSAT-QOSHIMCHA-001 — a'zoning rolini o'zgartirmasdan qo'shimcha
 * ruxsat berish/olib tashlash. Bir xil aktyor-sessiyadan-olinadi qonuni.
 */
describe('company -- a\'zoga qo\'shimcha ruxsat (T2-RUXSAT-QOSHIMCHA-001)', () => {
  it('GET ?azolik_ruxsatlari=<id> -> t2_azolik_ruxsat_qoshimcha_royxat_v1 ga aktyor sessiyadan boradi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_azolik_ruxsat_qoshimcha_royxat_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_kompaniya_id: 1 });
      return { ok: true, text: async () => JSON.stringify({ ok: true, azolar: [] }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestGet(await getCtxOf('?azolik_ruxsatlari=1'));
    expect(res.status).toBe(200);
  });

  it('"azolik_ruxsat_ber" -> t2_azolik_ruxsat_qoshimcha_ber_v1 ga to‘g‘ri parametrlar bilan boradi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_azolik_ruxsat_qoshimcha_ber_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_kompaniya_id: 1, p_azolik_id: 32, p_ruxsat: 'financial.read' });
      return { ok: true, text: async () => JSON.stringify({ ok: true, azolik_id: 32, ruxsat: 'financial.read' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(await ctxOf({ action: 'azolik_ruxsat_ber', kompaniya_id: 1, azolik_id: 32, ruxsat: 'financial.read' }));
    expect(res.status).toBe(200);
  });

  it('"azolik_ruxsat_olib_tashla" -> t2_azolik_ruxsat_qoshimcha_olib_tashla_v1 ga boradi', async () => {
    const fetchSpy = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_azolik_ruxsat_qoshimcha_olib_tashla_v1');
      const sent = JSON.parse(init.body);
      expect(sent).toMatchObject({ p_actor_id: 3, p_azolik_id: 32, p_ruxsat: 'financial.read' });
      return { ok: true, text: async () => JSON.stringify({ ok: true, azolik_id: 32, ruxsat: 'financial.read' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(await ctxOf({ action: 'azolik_ruxsat_olib_tashla', kompaniya_id: 1, azolik_id: 32, ruxsat: 'financial.read' }));
    expect(res.status).toBe(200);
  });

  it('MANAGE_ROLE_REQUIRED -> 403 (boss/admin bo‘lmagan aktyor)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code: 'MANAGE_ROLE_REQUIRED' }) } as Response)));
    const res = await onRequestPost(await ctxOf({ action: 'azolik_ruxsat_ber', kompaniya_id: 1, azolik_id: 32, ruxsat: 'financial.read' }));
    expect(res.status).toBe(403);
  });

  it('"azolik_ruxsat_royxat" (faqat o‘qish) POST orqali RAD ETILADI — 400', async () => {
    const res = await onRequestPost(await ctxOf({ action: 'azolik_ruxsat_royxat', kompaniya_id: 1 }));
    expect(res.status).toBe(400);
  });
});
