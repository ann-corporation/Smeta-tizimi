// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestGet, onRequestPost, nashrUrinish } from './imzo';
import { onRequestGet as ochiqGet, ochiqUrinish } from './imzo-ochiq';
import { IMZO_BOSH_XESH, b64uKodla, imzoXabar, imzoXeshi, tasodifiyToken, type ImzoMazmun } from '../../src/lib/imzo/yadro';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key' };
const MEN = { ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto' }] };
const SHA = 'a'.repeat(64);
const T = 'N'.repeat(22);

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
const cookie = async () => 'sess=' + await imzola({ rol: 'pto', email: 'anvar', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] } as never, ENV.SESSIYA_KALIT);
const post = async (body: unknown) => onRequestPost({ request: new Request('https://t.example/api/imzo', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await cookie() }, body: JSON.stringify(body) }), env: ENV, data: {} } as never);
const get = async (qs: string) => onRequestGet({ request: new Request('https://t.example/api/imzo?' + qs, { headers: { Cookie: await cookie() } }), env: ENV, data: {} } as never);
const so = (token: string) => ochiqGet({ request: new Request('https://t.example/api/imzo-ochiq?token=' + token, { headers: { 'CF-Connecting-IP': '7.7.7.7' } }), env: ENV, data: {} } as never);

beforeEach(() => { vakolatKeshTozala(); nashrUrinish.tozala(); ochiqUrinish.tozala(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('manba QR nashri', () => {
  it('nashr_tayyor: actor sessiyadan, token serverda yaratiladi; noto\'g\'ri talab - 400', async () => {
    const f = mockFetch({ t2_nashr_tayyor_v1: (b: any) => ({ ok: true, token: b.p_token, yangi: true, hujjat_id: null }) });
    const j = await J(await post({ amal: 'nashr_tayyor', kompaniya_id: 17, turi: 'f2', atama: 'F2 sinov', mazmun_xesh: SHA, p_actor_id: 99, chiqargan_id: 99 }));
    expect(j).toMatchObject({ ok: true, yangi: true, hujjat_id: null }); expect(j.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(JSON.parse(String(calls(f, 't2_nashr_tayyor_v1')[0][1]!.body))).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17, p_turi: 'f2', p_xesh: SHA });
    expect((await post({ amal: 'nashr_tayyor', kompaniya_id: 17, mazmun_xesh: SHA })).status).toBe(400);
    expect(calls(f, 't2_nashr_tayyor_v1')).toHaveLength(1);
  });

  it('nashr_nusxa: faqat token + hujjat id; begona - 403', async () => {
    mockFetch({ t2_nashr_nusxa_v1: { ok: false, code: 'RUXSAT_YOQ' } });
    expect((await post({ amal: 'nashr_nusxa', token: T, hujjat_id: 5 })).status).toBe(403);
    expect((await post({ amal: 'nashr_nusxa', token: 'x', hujjat_id: 5 })).status).toBe(400);
  });

  it('ochish: imzo tokeni bo\'lmasa nashr ruxsati tekshiriladi; ruxsat yo\'q - 403', async () => {
    mockFetch({ t2_imzo_hujjat_ruxsat_v1: { ok: false, code: 'RUXSAT_YOQ' }, t2_nashr_ruxsat_v1: { ok: true, hujjat_id: 5, turi: 'f2', atama: 'F2 sinov', joriy: false, joriy_token: 'M'.repeat(22) } });
    expect(await J(await get('amal=ochish&token=' + T))).toMatchObject({ ok: true, tur: 'nashr', hujjat_id: 5, joriy: false, joriy_token: 'M'.repeat(22) });
    mockFetch({ t2_imzo_hujjat_ruxsat_v1: { ok: false, code: 'RUXSAT_YOQ' }, t2_nashr_ruxsat_v1: { ok: false, code: 'RUXSAT_YOQ' } });
    expect((await get('amal=ochish&token=' + T)).status).toBe(403);
  });

  it('ochiq: tur nashr, joriy/eskirgan; atama/fayl nomi/mazmun/id YO\'Q; nusxa imzolangan bo\'lsa imzolar tekshiriladi', async () => {
    const kj = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as CryptoKeyPair;
    const ochiq = b64uKodla(new Uint8Array(await crypto.subtle.exportKey('raw', kj.publicKey) as ArrayBuffer));
    const m: ImzoMazmun = { kompaniya_id: 17, hujjat_id: 42, hujjat_sha256: SHA, mazmun_xesh: SHA, kalit_id: '0b9d1c5e-3a47-4f60-9d4e-2a7c5e8f1b30', foydalanuvchi_id: 7, imzolovchi: 'Test Imzochi', rol: 'pto',
      usul: 'tizim', tomon: 'pudratchi', imzolovchi_kompaniya_id: 17, imzolovchi_kompaniya: 'Pudrat MChJ', nomidan_kompaniya_id: null, nomidan_kompaniya: null,
      vaqt: '2026-12-18T09:30:00.123Z', nonce: tasodifiyToken(), oldingi_xesh: IMZO_BOSH_XESH };
    const imzo = b64uKodla(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kj.privateKey, imzoXabar(m) as BufferSource)));
    const q = { ...m, id: 1, token: 'T'.repeat(22), xesh: await imzoXeshi(m), imzo, ochiq_kalit: ochiq, kalit_bekor_vaqt: null, shubhali_dan: null, hujjat_holat: 'ozgarmagan' };
    mockFetch({ t2_imzo_ochiq_v1: { ok: false, code: 'TOPILMADI' }, t2_nashr_ochiq_v1: { ok: true, token: T, nashr: { turi: 'f2', sana: '2026-12-18T00:00:00Z', kompaniya: 'Pudrat MChJ', joriy: false, joriy_token: 'M'.repeat(22), mazmun_xesh: SHA, atama: 'MAXFIY-ATAMA' }, imzolar: [q] } });
    const r = await so(T); const j = await J(r);
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ tur: 'nashr', nashr: { turi: 'f2', kompaniya: 'Pudrat MChJ', joriy: false, joriy_token: 'M'.repeat(22) } });
    expect(Object.keys(j.nashr).sort()).toEqual(['joriy', 'joriy_token', 'kompaniya', 'mazmun_xesh', 'sana', 'turi']);
    expect(j.imzolar[0]).toMatchObject({ holat: 'haqiqiy', tomon: 'pudratchi' });
    for (const taqiq of ['MAXFIY', 'atama', 'ochiq_kalit', 'hujjat_id', 'foydalanuvchi_id', ochiq]) expect(JSON.stringify(j), taqiq).not.toContain(taqiq);
  });
});

describe('token serverda majburlanadi (imzolash)', () => {
  async function tayyor(sarf: unknown, yoz: unknown = { ok: true, id: 1, token: 'T'.repeat(22) }) {
    const kj = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as CryptoKeyPair;
    const ochiq = b64uKodla(new Uint8Array(await crypto.subtle.exportKey('raw', kj.publicKey) as ArrayBuffer));
    const KALIT = '0b9d1c5e-3a47-4f60-9d4e-2a7c5e8f1b30';
    const manba = { ok: true, kompaniya_id: 17, obyekt_id: null, hujjat_id: 42, hujjat_sha256: SHA, foydalanuvchi_id: 7, imzolovchi: 'Test Imzochi', rol: 'pto', usul: 'tizim', tomon: 'pudratchi',
      imzolovchi_kompaniya_id: 17, imzolovchi_kompaniya: 'Pudrat MChJ', nomidan_kompaniya_id: null, nomidan_kompaniya: null, oldingi_xesh: IMZO_BOSH_XESH, ochiq_kalit: ochiq, r2_obyekt: 'k/1', mime_type: 'application/pdf', fayl_nomi: 'a.pdf', hajm: 10 };
    const f = mockFetch({ t2_imzo_manba_v1: manba, t2_token_sarfla_v1: sarf, t2_token_qaytar_v1: { ok: true }, t2_imzo_yoz_v1: yoz });
    const t = await J(await post({ amal: 'tayyorla', hujjat_id: 42, kalit_id: KALIT, tomon: 'pudratchi' }));
    const m: ImzoMazmun = t.mazmun;
    const imzo = b64uKodla(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kj.privateKey, imzoXabar(m) as BufferSource)));
    const javob = await post({ amal: 'yoz', hujjat_id: 42, kalit_id: KALIT, tomon: 'pudratchi', vaqt: m.vaqt, nonce: m.nonce, oldingi_xesh: m.oldingi_xesh, mazmun_xesh: m.mazmun_xesh, imzo });
    return { f, javob, m };
  }

  it('token yechiladi (imzolovchi kompaniyasidan), imzo yoziladi; sarf operation_id deterministik', async () => {
    const { f, javob } = await tayyor({ ok: true, sarflandi: 3 });
    expect(javob.status).toBe(200); expect((await J(javob)).sarflandi).toBe(3);
    const s = JSON.parse(String(calls(f, 't2_token_sarfla_v1')[0][1]!.body));
    expect(s).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17, p_amal: 'hujjat', p_birlik_soni: 1 });
    expect(s.p_operation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(calls(f, 't2_token_qaytar_v1')).toHaveLength(0);
  });

  it('token yetmasa - 402, imzo YOZILMAYDI', async () => {
    const { f, javob } = await tayyor({ ok: false, code: 'TOKEN_YETMAYDI', kerak: 3, balans: 0 });
    expect(javob.status).toBe(402); expect(await J(javob)).toMatchObject({ code: 'TOKEN_YETMAYDI', kerak: 3, balans: 0 });
    expect(calls(f, 't2_imzo_yoz_v1')).toHaveLength(0);
  });

  it('imzo yozilmasa token qaytariladi (shu sarf operatsiyasi bo\'yicha)', async () => {
    const { f, javob } = await tayyor({ ok: true, sarflandi: 3 }, { ok: false, code: 'ZANJIR_YANGILANDI' });
    expect(javob.status).toBe(400);
    const q = JSON.parse(String(calls(f, 't2_token_qaytar_v1')[0][1]!.body));
    const s = JSON.parse(String(calls(f, 't2_token_sarfla_v1')[0][1]!.body));
    expect(q).toMatchObject({ p_sarf_operation_id: s.p_operation_id, p_kompaniya_id: 17, p_actor_id: 7 });
  });

  it('shu nonce bilan avvalgi urinish bo\'lgan (takror) - qayta to\'lovsiz yozilmaydi', async () => {
    const { f, javob } = await tayyor({ ok: true, takror: true, sarflandi: 3 });
    expect(javob.status).toBe(400); expect((await J(javob)).code).toBe('MALUMOT_ESKIRGAN');
    expect(calls(f, 't2_imzo_yoz_v1')).toHaveLength(0);
  });
});