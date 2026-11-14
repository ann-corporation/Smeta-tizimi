import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yozish } from './sb-yoz';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { ilovaKeshTozala } from '../_shared/ilova-darvoza';
import { writeCommandPermission } from '../_shared/write-command-policy';
import { dataPermission } from '../_shared/permission-policy';

/** Buyurtma amallari (zayavka -> yetkazuvchi): shlyuz tekshiruvlari - actor sessiyadan, a'zolik, operation_id, egalik, ruxsat. */
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
const OP = '11111111-1111-4111-8111-111111111111';
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); ilovaKeshTozala(); });

async function chaqir(body: unknown, { rol = 'boss', rpcJavob = { ok: true, id: 9, versiya: 1, holat: 'yuborildi' } as unknown, modul = 'on' }: { rol?: string; rpcJavob?: unknown; modul?: 'on' | 'off' } = {}) {
  const rpc: { yol: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol, faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: rol }] });
    if (url.pathname.endsWith('/rpc/t2_modul_holat_v1')) return Response.json({ ok: true, modullar: [{ kod: 'module.xarid', holat: modul }] });
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ id: 5, kompaniya_id: 17 }]);
    if (url.pathname === '/rest/v1/t2_shartnoma') return Response.json([{ id: 31, kompaniya_id: 17 }]);   // shlyuz p_shartnoma_id egaligini tekshiradi
    if (url.pathname === '/rest/v1/t2_erp_taminot') {
      // 44 - o'z kompaniyasiniki, 55 - begona kompaniyaniki
      const idlar = (url.searchParams.get('id') ?? '').replace(/[^0-9,]/g, '').split(',').filter(Boolean).map(Number);
      return Response.json(idlar.filter((i) => i === 44 || i === 55).map((i) => ({ id: i, kompaniya_id: i === 44 ? 17 : 99 })));
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push({ yol: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : {} }); return Response.json(rpcJavob); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const token = await imzola({ rol: rol as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol }] }, env.SESSIYA_KALIT);
  const res = await yozish({ request: new Request('https://test/api/sb-yoz', { method: 'POST', headers: { Cookie: 'sess=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc, json: await res.json() as Record<string, unknown> };
}

const qator = { nom: 'Material', birlik: 'tonna', miqdor: 12.5, narx: 1000, zayavka_id: 44 };
const yarat = (ustiga: Record<string, unknown> = {}) => ({ amal: 'buyurtma_yarat_v1', kompaniya_id: 17, operation_id: OP, ijrochi_kompaniya_id: 31, obyekt_id: 5, qatorlar: [qator], ...ustiga });

describe('buyurtma_yarat_v1', () => {
  it('t2_buyurtma_yarat_v1 ga oq ro\'yxatdagi argumentlar bilan boradi; actor sessiyadan (mijoz yubora olmaydi)', async () => {
    const { res, rpc } = await chaqir(yarat({ p_actor_id: 999, actor_id: 999, ortiqcha: 'DROP', qatorlar: [{ ...qator, xavfli: 'x' }] }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveLength(1);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_buyurtma_yarat_v1');
    expect(rpc[0].body).toEqual({
      p_actor_id: 7, p_kompaniya_id: 17, p_operation_id: OP, p_tur: 'material', p_ijrochi_kompaniya_id: 31, p_aloqa_id: null, p_taklif_id: null, p_obyekt_id: 5,
      p_qatorlar: [{ nom: 'Material', birlik: 'tonna', miqdor: 12.5, narx: 1000, muddat_kun: null, resurs_kodi: null, zayavka_id: 44, izoh: null }], p_shart: {},
    });
  });
  it('narx kiritilmasa NULL yuboriladi (0 emas)', async () => {
    const { rpc } = await chaqir(yarat({ qatorlar: [{ nom: 'Material', birlik: 'dona', miqdor: 3 }] }));
    expect((rpc[0].body.p_qatorlar as { narx: unknown }[])[0].narx).toBeNull();
  });
  it('operation_id majburiy - RPC chaqirilmaydi', async () => {
    const { res, rpc } = await chaqir(yarat({ operation_id: 'uuid-emas' }));
    expect(res.status).toBe(400);
    expect(rpc).toHaveLength(0);
  });
  it.each([
    ['miqdor 0', { qatorlar: [{ ...qator, miqdor: 0 }] }],
    ['manfiy narx', { qatorlar: [{ ...qator, narx: -5 }] }],
    ['nomsiz qator', { qatorlar: [{ ...qator, nom: '' }] }],
    ['qatorlar yo\'q', { qatorlar: [] }],
    ['yetkazuvchi - o\'zi', { ijrochi_kompaniya_id: 17 }],
    ['yetkazuvchi yo\'q', { ijrochi_kompaniya_id: undefined }],
    ['tur noto\'g\'ri', { tur: 'Material!' }],
  ])('noto\'g\'ri yuk rad etiladi: %s', async (_nom, ustiga) => {
    const { res, rpc } = await chaqir(yarat(ustiga as Record<string, unknown>));
    expect(res.status).toBe(400);
    expect(rpc).toHaveLength(0);
  });
  it('a\'zo bo\'lmagan kompaniya - 403, RPC chaqirilmaydi', async () => {
    const { res, rpc } = await chaqir(yarat({ kompaniya_id: 18 }));
    expect(res.status).toBe(403);
    expect(rpc).toHaveLength(0);
  });
  it('begona kompaniyaning zayavkasi (zayavka_id) rad etiladi', async () => {
    const { res, rpc } = await chaqir(yarat({ qatorlar: [{ ...qator, zayavka_id: 55 }] }));
    expect(res.status).toBe(403);
    expect(rpc).toHaveLength(0);
  });
  it('rahbar (faqat ko\'ruvchi) rolida yozish - 403', async () => {
    const { res, rpc } = await chaqir(yarat(), { rol: 'rahbar' });
    expect(res.status).toBe(403);
    expect(rpc).toHaveLength(0);
  });
  it('baza biznes xatosi (ALOQA_KERAK) o\'zgarishsiz uzatiladi', async () => {
    const { json } = await chaqir(yarat(), { rpcJavob: { ok: false, code: 'ALOQA_KERAK' } });
    expect(json).toMatchObject({ ok: false, code: 'ALOQA_KERAK', amal: 'buyurtma_yarat_v1' });
  });
});

describe('ilova darvozasi', () => {
  it('Xarid moduli o\'chirilgan kompaniyada buyurtma amallari rad etiladi (RPC chaqirilmaydi)', async () => {
    const { res, rpc } = await chaqir(yarat(), { modul: 'off' });
    expect(res.status).toBe(403);
    expect(rpc).toHaveLength(0);
  });
});

describe('buyurtma_otish_v1 / olish_yoz / qabul', () => {
  it('otish: holat va versiya bilan t2_buyurtma_otish_v1 ga', async () => {
    const { res, rpc } = await chaqir({ amal: 'buyurtma_otish_v1', kompaniya_id: 17, operation_id: OP, buyurtma_id: 9, kutilgan_versiya: 3, holat: 'topshirildi' });
    expect(res.status).toBe(200);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_buyurtma_otish_v1');
    expect(rpc[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_operation_id: OP, p_buyurtma_id: 9, p_kutilgan_versiya: 3, p_holat: 'topshirildi', p_bosqich: null, p_izoh: null, p_dalil_hujjat_idlar: null });
  });
  it.each([
    [{ holat: 'hohlagan_holat' }], [{ kutilgan_versiya: undefined }], [{ buyurtma_id: 0 }], [{ bosqich: 'Yomon bosqich' }], [{ dalil_hujjat_idlar: ['x'] }],
  ])('otish: noto\'g\'ri yuk rad etiladi %j', async (ustiga) => {
    const asos = { amal: 'buyurtma_otish_v1', kompaniya_id: 17, operation_id: OP, buyurtma_id: 9, kutilgan_versiya: 3, holat: 'bajarilmoqda' };
    const { res, rpc } = await chaqir({ ...asos, ...ustiga });
    expect(res.status).toBe(400);
    expect(rpc).toHaveLength(0);
  });
  it('olish_yoz: koordinata tekshiriladi, bo\'sh olish rad etiladi', async () => {
    const asos = { amal: 'buyurtma_olish_yoz_v1', kompaniya_id: 17, operation_id: OP, buyurtma_id: 9, kutilgan_versiya: 3 };
    const yaxshi = await chaqir({ ...asos, olish: { manzil: 'Ombor 1', lat: 41.3, lng: 69.2, qoshimcha: 'x' } });
    expect(yaxshi.res.status).toBe(200);
    expect(yaxshi.rpc[0].body.p_olish).toEqual({ manzil: 'Ombor 1', lat: 41.3, lng: 69.2 });
    for (const olish of [{}, { manzil: '' }, { lat: 95, lng: 10, manzil: 'x' }, { lat: 10, manzil: 'x' }]) {
      const r = await chaqir({ ...asos, olish });
      expect(r.res.status, JSON.stringify(olish)).toBe(400);
      expect(r.rpc).toHaveLength(0);
    }
  });
  it('qabul_yakunla: faqat id lar RPC ga boradi (miqdor/narx mijozdan olinmaydi); operation_id va buyurtma_id majburiy', async () => {
    const asos = { amal: 'buyurtma_qabul_yakunla_v1', kompaniya_id: 17, operation_id: OP, buyurtma_id: 9 };
    const yaxshi = await chaqir({ ...asos, shartnoma_id: 31, qabul_miqdor: 999, narx: 1, p_actor_id: 1 });
    expect(yaxshi.res.status).toBe(200);
    expect(yaxshi.rpc[0].yol).toBe('/rest/v1/rpc/t2_buyurtma_qabul_yakunla_v1');
    expect(yaxshi.rpc[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_operation_id: OP, p_buyurtma_id: 9, p_shartnoma_id: 31 });
    const shartnomasiz = await chaqir(asos);
    expect(shartnomasiz.rpc[0].body.p_shartnoma_id).toBeNull();
    for (const buzuq of [{ operation_id: 'uuid-emas' }, { buyurtma_id: 0 }, { buyurtma_id: undefined }, { shartnoma_id: -3 }]) {
      const r = await chaqir({ ...asos, ...buzuq });
      expect(r.res.status, JSON.stringify(buzuq)).toBe(400);
      expect(r.rpc).toHaveLength(0);
    }
  });
  it('qabul: har qator uchun miqdor (0 mumkin) va holat; yaroqsiz holat rad etiladi', async () => {
    const asos = { amal: 'buyurtma_qabul_v1', kompaniya_id: 17, operation_id: OP, buyurtma_id: 9, kutilgan_versiya: 4 };
    const yaxshi = await chaqir({ ...asos, qatorlar: [{ buyurtma_qator_id: 21, qabul_miqdor: 0, holat: 'kam' }, { buyurtma_qator_id: 22, qabul_miqdor: 5 }] });
    expect(yaxshi.res.status).toBe(200);
    expect(yaxshi.rpc[0].yol).toBe('/rest/v1/rpc/t2_buyurtma_qabul_v1');
    expect(yaxshi.rpc[0].body.p_qatorlar).toEqual([
      { buyurtma_qator_id: 21, qabul_miqdor: 0, holat: 'kam', izoh: null }, { buyurtma_qator_id: 22, qabul_miqdor: 5, holat: 'butun', izoh: null }]);
    for (const qatorlar of [[], [{ buyurtma_qator_id: 21, qabul_miqdor: -1 }], [{ buyurtma_qator_id: 21, qabul_miqdor: 1, holat: 'buzuq' }], [{ qabul_miqdor: 1 }]]) {
      const r = await chaqir({ ...asos, qatorlar });
      expect(r.res.status, JSON.stringify(qatorlar)).toBe(400);
      expect(r.rpc).toHaveLength(0);
    }
  });
});

describe('buyurtma o\'qish amallari (RPC prodda VOLATILE - POST orqali, faqat o\'qiydi)', () => {
  it('royxat: t2_buyurtmalar_v1 ga actor sessiyadan; operation_id talab qilinmaydi', async () => {
    const { res, rpc } = await chaqir({ amal: 'buyurtma_royxat_v1', kompaniya_id: 17, yonalish: 'menga', holat: 'yuborildi', p_actor_id: 999 }, { rpcJavob: { ok: true, qatorlar: [], keyingi_id: null } });
    expect(res.status).toBe(200);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_buyurtmalar_v1');
    expect(rpc[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_yonalish: 'menga', p_tur: null, p_holat: 'yuborildi', p_limit: 50, p_keyin_id: null });
  });
  it('royxat: yonalish/holat/limit tekshiriladi', async () => {
    for (const ustiga of [{ yonalish: 'hammasi' }, { yonalish: 'meniki', holat: 'yomon' }, { yonalish: 'meniki', limit: 1000 }]) {
      const r = await chaqir({ amal: 'buyurtma_royxat_v1', kompaniya_id: 17, ...ustiga });
      expect(r.res.status, JSON.stringify(ustiga)).toBe(400);
      expect(r.rpc).toHaveLength(0);
    }
  });
  it('tafsilot: buyurtma_id majburiy, begona kompaniya - 403', async () => {
    const yaxshi = await chaqir({ amal: 'buyurtma_tafsilot_v1', kompaniya_id: 17, buyurtma_id: 9 });
    expect(yaxshi.rpc[0].yol).toBe('/rest/v1/rpc/t2_buyurtma_tafsilot_v1');
    expect(yaxshi.rpc[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_buyurtma_id: 9 });
    expect((await chaqir({ amal: 'buyurtma_tafsilot_v1', kompaniya_id: 17 })).res.status).toBe(400);
    expect((await chaqir({ amal: 'buyurtma_tafsilot_v1', kompaniya_id: 18, buyurtma_id: 9 })).res.status).toBe(403);
  });
});

describe('ruxsat siyosati (RPC dagi capability lar bilan)', () => {
  it('yetkazuvchi bosqichlari - supply.fulfil; xaridor bekori va yaratish/qabul - procurement.write; o\'qish - procurement.read', () => {
    for (const holat of ['qabul_qilindi', 'rad', 'bajarilmoqda', 'tayyor', 'topshirildi']) {
      expect(writeCommandPermission('buyurtma_otish_v1', { holat })).toBe('supply.fulfil');
      expect(dataPermission('buyurtma_otish_v1', true, { holat })).toBe('supply.fulfil');
    }
    expect(writeCommandPermission('buyurtma_otish_v1', { holat: 'bekor' })).toBe('procurement.write');
    expect(writeCommandPermission('buyurtma_olish_yoz_v1')).toBe('supply.fulfil');
    expect(writeCommandPermission('buyurtma_yarat_v1')).toBe('procurement.write');
    expect(writeCommandPermission('buyurtma_qabul_v1')).toBe('procurement.write');
    expect(writeCommandPermission('buyurtma_qabul_yakunla_v1')).toBe('procurement.write');
    expect(writeCommandPermission('buyurtma_royxat_v1')).toBe('procurement.read');
    expect(writeCommandPermission('buyurtma_tafsilot_v1')).toBe('procurement.read');
    expect(writeCommandPermission('buyurtma_nomalum')).toBe('command.unregistered');
  });
});

describe('buyurtma_tolov_holati_v1 (yetkazuvchi: to‘lov holati)', () => {
  it('t2_yet_tolov_holati_v1 ga faqat actor va kompaniya bilan boradi; operation_id kerak emas', async () => {
    const { res, rpc } = await chaqir({ amal: 'buyurtma_tolov_holati_v1', kompaniya_id: 17, p_actor_id: 999, ortiqcha: 'x' }, { rpcJavob: { ok: true, qatorlar: [] } });
    expect(res.status).toBe(200);
    expect(rpc).toHaveLength(1);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_yet_tolov_holati_v1');
    expect(rpc[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 17 });
  });
  it('ruxsat: procurement.read', () => {
    expect(writeCommandPermission('buyurtma_tolov_holati_v1')).toBe('procurement.read');
  });
});
