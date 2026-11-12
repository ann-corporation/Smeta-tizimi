// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola, SESSIYA_MUDDAT_MS } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestGet, onRequestPost, parolUrinish, yozUrinish } from './imzo';
import { onRequestGet as ochiqGet, ochiqUrinish } from './imzo-ochiq';
import { IMZO_BOSH_XESH, b64uKodla, imzoXabar, imzoXeshi, tasodifiyToken, type ImzoMazmun } from '../../src/lib/imzo/yadro';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key' };
const MEN = { ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto' }] };
const KALIT_ID = '0b9d1c5e-3a47-4f60-9d4e-2a7c5e8f1b30';
const SHA = 'a'.repeat(64);

type Rpcs = Record<string, unknown | ((body: any) => unknown)>;
function mockFetch(rpcs: Rpcs) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const nom = String(url).split('/rpc/')[1];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (nom === 't2_men_v1') return Response.json(MEN);
    if (!(nom in rpcs)) throw new Error('kutilmagan rpc: ' + nom);
    const v = rpcs[nom];
    return Response.json(typeof v === 'function' ? (v as (b: unknown) => unknown)(body) : v);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const calls = (f: ReturnType<typeof mockFetch>, nom: string) => f.mock.calls.filter((c) => String(c[0]).endsWith('/rpc/' + nom));
const J = (r: Response): Promise<any> => r.json();
async function cookie(hozir = Date.now()) {
  return 'sess=' + await imzola({ rol: 'pto', email: 'anvar', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] } as never, ENV.SESSIYA_KALIT, hozir);
}
const post = async (body: unknown, c?: string | null, headers: Record<string, string> = {}) => {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  const ck = c === undefined ? await cookie() : c;
  if (ck) h.Cookie = ck;
  return onRequestPost({ request: new Request('https://t.example/api/imzo', { method: 'POST', headers: h, body: JSON.stringify(body) }), env: ENV, data: {} } as never);
};
const get = async (qs: string, c?: string | null) => {
  const ck = c === undefined ? await cookie() : c;
  return onRequestGet({ request: new Request('https://t.example/api/imzo?' + qs, { headers: ck ? { Cookie: ck } : {} }), env: ENV, data: {} } as never);
};

async function kalit() {
  const j = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as CryptoKeyPair;
  return { j, ochiq: b64uKodla(new Uint8Array(await crypto.subtle.exportKey('raw', j.publicKey) as ArrayBuffer)) };
}
const imzolash = async (k: CryptoKey, x: Uint8Array) => b64uKodla(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, x as BufferSource)));

const manba = (ochiq: string, over: Record<string, unknown> = {}) => ({
  ok: true, kompaniya_id: 17, obyekt_id: null, hujjat_id: 42, hujjat_sha256: SHA, foydalanuvchi_id: 7, imzolovchi: 'Test Imzochi', rol: 'pto', usul: 'tizim', tomon: 'texnadzor', imzolovchi_kompaniya_id: 21, imzolovchi_kompaniya: 'Texnadzor MChJ',
  nomidan_kompaniya_id: 22, nomidan_kompaniya: 'Buyurtmachi MChJ', oldingi_xesh: IMZO_BOSH_XESH, ochiq_kalit: ochiq, r2_obyekt: 'k/1', mime_type: 'application/pdf', fayl_nomi: 'a.pdf', hajm: 10, ...over,
});

beforeEach(() => { vakolatKeshTozala(); parolUrinish.tozala(); yozUrinish.tozala(); ochiqUrinish.tozala(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('/api/imzo - kirish va origin', () => {
  it('sessiyasiz GET/POST -> 401, RPC chaqirilmaydi', async () => {
    const f = mockFetch({});
    expect((await get('amal=kalitlar', null)).status).toBe(401);
    expect((await post({ amal: 'tayyorla' }, null)).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
  it('boshqa saytdan POST -> 403', async () => {
    const f = mockFetch({});
    expect((await post({ amal: 'kalit_yarat' }, undefined, { Origin: 'https://evil.example' })).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('/api/imzo - kalit', () => {
  it('actor faqat sessiyadan: tanadagi foydalanuvchi_id/actor e\'tiborga olinmaydi', async () => {
    const f = mockFetch({ t2_imzo_kalit_royxat_v1: { ok: true, kalitlar: [] }, t2_imzo_kalit_bekor_v1: { ok: true } });
    await get('amal=kalitlar&foydalanuvchi_id=99');
    expect(calls(f, 't2_imzo_kalit_royxat_v1')[0][1]!.body).toContain('"p_actor_id":7');
    await post({ amal: 'kalit_bekor', kalit_id: KALIT_ID, sabab: 'yo\'qoldi', foydalanuvchi_id: 99, p_actor_id: 99 });
    expect(JSON.parse(String(calls(f, 't2_imzo_kalit_bekor_v1')[0][1]!.body)).p_actor_id).toBe(7);
  });
  it('yaroqsiz ochiq kalit RPC ga yetmaydi; to\'g\'ri kalit + yangi sessiya -> yangi_kirish true', async () => {
    const f = mockFetch({ t2_imzo_kalit_yarat_v1: { ok: true, id: KALIT_ID } });
    expect((await post({ amal: 'kalit_yarat', qurilma: 'PC', ochiq_kalit: 'A'.repeat(87) })).status).toBe(400);
    expect(calls(f, 't2_imzo_kalit_yarat_v1')).toHaveLength(0);
    const k = await kalit();
    const r = await post({ amal: 'kalit_yarat', qurilma: 'PC', ochiq_kalit: k.ochiq, parol: 'sinov' });
    expect(r.status).toBe(200);
    const body = JSON.parse(String(calls(f, 't2_imzo_kalit_yarat_v1')[0][1]!.body));
    expect(body).toMatchObject({ p_actor_id: 7, p_ochiq_kalit: k.ochiq, p_parol: 'sinov', p_yangi_kirish: true });
  });
  it('eski sessiya (3 soat) -> yangi_kirish false (parolsiz hisob uchun qayta kirish talab qilinadi)', async () => {
    const f = mockFetch({ t2_imzo_kalit_yarat_v1: { ok: false, code: 'QAYTA_KIRISH_KERAK' } });
    const k = await kalit();
    const r = await post({ amal: 'kalit_yarat', qurilma: 'PC', ochiq_kalit: k.ochiq }, await cookie(Date.now() - 3 * 3600_000));
    expect(r.status).toBe(400); expect((await J(r)).code).toBe('QAYTA_KIRISH_KERAK');
    expect(JSON.parse(String(calls(f, 't2_imzo_kalit_yarat_v1')[0][1]!.body)).p_yangi_kirish).toBe(false);
    expect(SESSIYA_MUDDAT_MS).toBeGreaterThan(3 * 3600_000);
  });
  it('parol urinishlari cheklanadi (5 dan keyin 429, RPC ga yetmaydi)', async () => {
    const f = mockFetch({ t2_imzo_kalit_yarat_v1: { ok: false, code: 'PAROL_XATO' } });
    const k = await kalit();
    for (let i = 0; i < 5; i++) expect((await post({ amal: 'kalit_yarat', qurilma: 'PC', ochiq_kalit: k.ochiq, parol: 'x' })).status).toBe(400);
    expect((await post({ amal: 'kalit_yarat', qurilma: 'PC', ochiq_kalit: k.ochiq, parol: 'x' })).status).toBe(429);
    expect(calls(f, 't2_imzo_kalit_yarat_v1')).toHaveLength(5);
  });
});

describe('/api/imzo - imzo qo\'yish', () => {
  async function tayyor() {
    const k = await kalit();
    const rpcs: Rpcs = { t2_imzo_manba_v1: manba(k.ochiq), t2_imzo_yoz_v1: { ok: true, id: 1, token: 'T'.repeat(22) } };
    const f = mockFetch(rpcs);
    const t = await J(await post({ amal: 'tayyorla', hujjat_id: 42, kalit_id: KALIT_ID, tomon: 'texnadzor', imzo_kompaniya_id: 21, nomidan_kompaniya_id: 22 }));
    expect(t.ok).toBe(true);
    const m: ImzoMazmun = t.mazmun;
    return { k, f, m };
  }
  const yoz = (m: ImzoMazmun, imzo: string, over: Record<string, unknown> = {}) => post({ amal: 'yoz', hujjat_id: m.hujjat_id, kalit_id: m.kalit_id, tomon: m.tomon, imzo_kompaniya_id: 21, nomidan_kompaniya_id: 22, vaqt: m.vaqt, nonce: m.nonce, oldingi_xesh: m.oldingi_xesh, mazmun_xesh: m.mazmun_xesh, imzo, ...over });

  it('tayyorla: xabar serverdagi manbalardan (ism/rol/xesh/zanjir/vaqt/nonce), actor sessiyadan', async () => {
    const { m } = await tayyor();
    expect(m).toMatchObject({ kompaniya_id: 17, hujjat_id: 42, hujjat_sha256: SHA, mazmun_xesh: SHA, foydalanuvchi_id: 7, imzolovchi: 'Test Imzochi', rol: 'pto', usul: 'tizim', tomon: 'texnadzor', imzolovchi_kompaniya: 'Texnadzor MChJ', nomidan_kompaniya: 'Buyurtmachi MChJ', oldingi_xesh: IMZO_BOSH_XESH });
    expect(m.vaqt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('to\'g\'ri imzo: tekshirilgach RPC ga yoziladi (xesh = xabar xeshi)', async () => {
    const { k, f, m } = await tayyor();
    const r = await yoz(m, await imzolash(k.j.privateKey, imzoXabar(m)));
    expect(r.status).toBe(200);
    const b = JSON.parse(String(calls(f, 't2_imzo_yoz_v1')[0][1]!.body));
    expect(b).toMatchObject({ p_actor_id: 7, p_hujjat_id: 42, p_vaqt: m.vaqt, p_nonce: m.nonce, p_xesh: await imzoXeshi(m), p_oldingi_xesh: IMZO_BOSH_XESH });
    expect(b.p_token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('boshqa kalit imzosi, o\'zgargan imzo, o\'zgargan vaqt - rad, RPC ga yozilmaydi', async () => {
    const { k, f, m } = await tayyor();
    const boshqa = await kalit();
    const imzo = await imzolash(k.j.privateKey, imzoXabar(m));
    for (const [nom, javob] of [
      ['boshqa kalit', await yoz(m, await imzolash(boshqa.j.privateKey, imzoXabar(m)))],
      ['imzo buzildi', await yoz(m, imzo.slice(0, 20) + (imzo[20] === 'A' ? 'B' : 'A') + imzo.slice(21))],
      ['vaqt o\'zgardi', await yoz(m, imzo, { vaqt: new Date(Date.parse(m.vaqt) + 1).toISOString() })],
      ['nonce o\'zgardi', await yoz(m, imzo, { nonce: tasodifiyToken() })],
    ] as const) { expect(javob.status, nom).toBe(400); expect((await J(javob)).code, nom).toBe('IMZO_YAROQSIZ'); }
    expect(calls(f, 't2_imzo_yoz_v1')).toHaveLength(0);
  });

  it('hujjat xeshi/zanjir mijoz aytgandan farq qilsa - qayta urinish kodi; eski vaqt - VAQT_OYNASI', async () => {
    const { k, f, m } = await tayyor();
    const imzo = await imzolash(k.j.privateKey, imzoXabar(m));
    expect((await J(await yoz(m, imzo, { mazmun_xesh: 'b'.repeat(64) }))).code).toBe('MALUMOT_ESKIRGAN');
    expect((await J(await yoz(m, imzo, { oldingi_xesh: 'c'.repeat(64) }))).code).toBe('ZANJIR_YANGILANDI');
    const eski = { ...m, vaqt: new Date(Date.now() - 600_000).toISOString() };
    expect((await J(await yoz(eski, await imzolash(k.j.privateKey, imzoXabar(eski))))).code).toBe('VAQT_OYNASI');
    expect(calls(f, 't2_imzo_yoz_v1')).toHaveLength(0);
  });

  it('manba rad etsa (begona kalit/hujjat) - yozilmaydi; xato kodi sizib chiqmaydi', async () => {
    const f = mockFetch({ t2_imzo_manba_v1: { ok: false, code: 'HUJJAT_TOPILMADI' }, t2_imzo_yoz_v1: { ok: true } });
    const r = await post({ amal: 'tayyorla', hujjat_id: 42, kalit_id: KALIT_ID, tomon: 'texnadzor', imzo_kompaniya_id: 21, nomidan_kompaniya_id: 22 });
    expect(r.status).toBe(403); expect((await J(r)).code).toBe('HUJJAT_TOPILMADI');
    expect(calls(f, 't2_imzo_yoz_v1')).toHaveLength(0);
  });

  it('tomon/kompaniya/nomidan RPC ga aynan sessiya actor bilan uzatiladi; noto\'g\'ri id - 400, RPC chaqirilmaydi', async () => {
    const { f } = await tayyor();
    const b = JSON.parse(String(calls(f, 't2_imzo_manba_v1')[0][1]!.body));
    expect(b).toMatchObject({ p_actor_id: 7, p_imzo_kompaniya_id: 21, p_tomon: 'texnadzor', p_nomidan_id: 22 });
    const n = calls(f, 't2_imzo_manba_v1').length;
    expect((await post({ amal: 'tayyorla', hujjat_id: 42, kalit_id: KALIT_ID, tomon: 'texnadzor', nomidan_kompaniya_id: 'x' })).status).toBe(400);
    expect((await post({ amal: 'tayyorla', hujjat_id: 42, kalit_id: KALIT_ID })).status).toBe(400);
    expect(calls(f, 't2_imzo_manba_v1')).toHaveLength(n);
  });

  it('vakolat yo\'q (aloqasiz kompaniya nomidan) - 400 VAKOLAT_YOQ', async () => {
    mockFetch({ t2_imzo_manba_v1: { ok: false, code: 'VAKOLAT_YOQ' } });
    const r = await post({ amal: 'tayyorla', hujjat_id: 42, kalit_id: KALIT_ID, tomon: 'texnadzor', nomidan_kompaniya_id: 99 });
    expect(r.status).toBe(400); expect((await J(r)).code).toBe('VAKOLAT_YOQ');
  });

  it('replay: bir imzo ikkinchi marta - SQL IMZO_TAKROR qaytaradi va 400 bo\'ladi', async () => {
    const { k, f, m } = await tayyor();
    mockFetch({ t2_imzo_manba_v1: manba(k.ochiq), t2_imzo_yoz_v1: { ok: false, code: 'IMZO_TAKROR' } });
    const r = await yoz(m, await imzolash(k.j.privateKey, imzoXabar(m)));
    expect(r.status).toBe(400); expect((await J(r)).code).toBe('IMZO_TAKROR');
    expect(f).toBeTruthy();
  });
});

describe('/api/imzo-ochiq - kirmasdan tekshiruv', () => {
  const T = 'T'.repeat(22);
  const so = (token: string | null, ip = '1.1.1.1') => ochiqGet({ request: new Request('https://t.example/api/imzo-ochiq' + (token ? '?token=' + token : ''), { headers: { 'CF-Connecting-IP': ip } }), env: ENV, data: {} } as never);

  async function qator(k: Awaited<ReturnType<typeof kalit>>, o: Partial<ImzoMazmun> = {}, extra: Record<string, unknown> = {}) {
    const m: ImzoMazmun = { kompaniya_id: 17, hujjat_id: 42, hujjat_sha256: SHA, mazmun_xesh: SHA, kalit_id: KALIT_ID, foydalanuvchi_id: 7, imzolovchi: 'Test Imzochi', rol: 'pto', usul: 'tizim', tomon: 'texnadzor', imzolovchi_kompaniya_id: 21, imzolovchi_kompaniya: 'Texnadzor MChJ',
      nomidan_kompaniya_id: 22, nomidan_kompaniya: 'Buyurtmachi MChJ', vaqt: '2026-12-18T09:30:00.123Z', nonce: tasodifiyToken(), oldingi_xesh: IMZO_BOSH_XESH, ...o };
    return { ...m, id: 1, token: T, xesh: await imzoXeshi(m), imzo: await imzolash(k.j.privateKey, imzoXabar(m)), ochiq_kalit: k.ochiq, kalit_bekor_vaqt: null, shubhali_dan: null,
      hujjat_holat: 'ozgarmagan', fayl_nomi: 'maxfiy-fayl.xlsx', summa: 123456789, r2_obyekt: 'k/1', ...extra };
  }
  const javob = (q: unknown) => ({ ok: true, token: T, hujjat: { turi: 'f2', tahrir: '1', sana: '2026-12-18T00:00:00Z', kompaniya: 'Test MChJ', fayl_nomi: 'maxfiy.xlsx', summa: 5 }, imzolar: [q] });

  it('haqiqiy imzo: holat haqiqiy; ochiq javobda ochiq kalit/imzo/id/fayl nomi/summa YO\'Q', async () => {
    const k = await kalit();
    mockFetch({ t2_imzo_ochiq_v1: javob(await qator(k)) });
    const r = await so(T);
    expect(r.status).toBe(200);
    const j = await J(r);
    expect(j.imzolar[0]).toMatchObject({ imzolovchi: 'Test Imzochi', rol: 'pto', holat: 'haqiqiy', imzo_haqiqiy: true, zanjir_ok: true, joriy: true });
    expect(Object.keys(j.hujjat).sort()).toEqual(['kompaniya', 'sana', 'tahrir', 'turi']);
    const matn = JSON.stringify(j);
    expect(j.imzolar[0]).toMatchObject({ usul: 'tizim', tomon: 'texnadzor', imzolovchi_kompaniya: 'Texnadzor MChJ', nomidan_kompaniya: 'Buyurtmachi MChJ' });
    expect(j.imzolar[0].kod).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    for (const taqiq of ['ochiq_kalit', '"imzo":', 'foydalanuvchi_id', 'fayl_nomi', 'maxfiy', 'summa', '123456789', 'r2_obyekt', 'kalit_id', 'hujjat_id', k.ochiq]) expect(matn, taqiq).not.toContain(taqiq);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('ustun o\'zgartirilgan (rol/ism/vaqt/xesh) yoki boshqa kalit - imzo yaroqsiz', async () => {
    const k = await kalit(); const q = await qator(k);
    for (const o of [{ rol: 'boss' }, { imzolovchi: 'Boshqa' }, { tomon: 'buyurtmachi' }, { usul: 'eri' }, { nomidan_kompaniya: 'Soxta MChJ' }, { imzolovchi_kompaniya: 'Soxta' }, { vaqt: '2026-12-18T09:30:00.124Z' }, { hujjat_sha256: 'c'.repeat(64) }, { xesh: 'd'.repeat(64) }, { ochiq_kalit: (await kalit()).ochiq }]) {
      mockFetch({ t2_imzo_ochiq_v1: javob({ ...q, ...o }) });
      const j = await J(await so(T, 'ip-' + JSON.stringify(o).length + Math.random()));
      expect(j.imzolar[0].holat, JSON.stringify(Object.keys(o))).toBe('imzo_yaroqsiz');
    }
  });

  it('hujjat o\'zgarsa - hujjat_ozgargan; kalit bekor/shubhali belgilari; zanjir uzilsa - yaroqsiz', async () => {
    const k = await kalit();
    mockFetch({ t2_imzo_ochiq_v1: javob(await qator(k, {}, { hujjat_holat: 'ozgargan' })) });
    expect((await J(await so(T, '2.2.2.2'))).imzolar[0].holat).toBe('hujjat_ozgargan');
    mockFetch({ t2_imzo_ochiq_v1: javob(await qator(k, {}, { kalit_bekor_vaqt: '2026-12-20T00:00:00Z', shubhali_dan: '2026-12-18T09:00:00.000Z' })) });
    const j = await J(await so(T, '3.3.3.3'));
    expect(j.imzolar[0]).toMatchObject({ holat: 'shubhali', kalit_bekor: true, shubhali: true });
    const a = await qator(k); const b = await qator(k, { oldingi_xesh: 'f'.repeat(64) }, { id: 2, token: 'U'.repeat(22) });
    mockFetch({ t2_imzo_ochiq_v1: { ...javob(a), imzolar: [a, b] } });
    const z = await J(await so(T, '4.4.4.4'));
    expect(z.imzolar[1]).toMatchObject({ zanjir_ok: false, holat: 'imzo_yaroqsiz', joriy: false });
  });

  it('topilmagan / noto\'g\'ri shakldagi token - bir xil 404; RPC noto\'g\'ri shaklga chaqirilmaydi', async () => {
    const f = mockFetch({ t2_imzo_ochiq_v1: { ok: false, code: 'TOPILMADI' }, t2_nashr_ochiq_v1: { ok: false, code: 'TOPILMADI' } });
    const a = await so('Z'.repeat(22), '5.5.5.5'); const b = await so('qisqa', '5.5.5.5'); const c = await so(null, '5.5.5.5');
    for (const r of [a, b, c]) expect(r.status).toBe(404);
    const [ja, jb, jc] = [await J(a), await J(b), await J(c)];
    expect(ja).toEqual(jb); expect(jb).toEqual(jc);
    expect(calls(f, 't2_imzo_ochiq_v1')).toHaveLength(1);
  });

  it('token sanash: IP bo\'yicha 30/daqiqadan keyin 429', async () => {
    mockFetch({ t2_imzo_ochiq_v1: { ok: false, code: 'TOPILMADI' }, t2_nashr_ochiq_v1: { ok: false, code: 'TOPILMADI' } });
    for (let i = 0; i < 30; i++) expect((await so('Z'.repeat(22), '9.9.9.9')).status).toBe(404);
    const r = await so('Z'.repeat(22), '9.9.9.9');
    expect(r.status).toBe(429);
  });
});
