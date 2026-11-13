/* /api/profil — yagona akkaunt amallari (usullar, usul_uz, birlashtir_email_kod, birlashtir_google). SINTETIK; tarmoq soxta. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola, tekshir, SESSIYA_MUDDAT_MS } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { kodXesh } from './kirish-email';
import { onRequestPost, urinishlarTozala, URINISH_LIMIT } from './profil';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key' };
const MEN = { ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto' }] };
const TID = '11111111-1111-4111-8111-111111111111';
type Rpcs = Record<string, unknown | ((b: any) => unknown)>;
function mockFetch(rpcs: Rpcs) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const nom = String(url).split('/rpc/')[1]; const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (nom === 't2_men_v1') return Response.json(MEN);
    if (!(nom in rpcs)) throw new Error('kutilmagan rpc: ' + nom);
    const v = rpcs[nom]; return Response.json(typeof v === 'function' ? (v as (b: unknown) => unknown)(body) : v);
  });
  vi.stubGlobal('fetch', f); return f;
}
const calls = (f: ReturnType<typeof mockFetch>, nom: string) => f.mock.calls.filter((c) => String(c[0]).endsWith('/rpc/' + nom)).map((c) => JSON.parse(String((c[1] as RequestInit).body)));
const cookie = async (hozir = Date.now()) => 'sess=' + await imzola({ rol: 'pto', email: 'anvar', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] } as never, ENV.SESSIYA_KALIT, hozir);
const post = async (body: unknown, c?: string | null, headers: Record<string, string> = {}) => {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers }; const ck = c === undefined ? await cookie() : c; if (ck) h.Cookie = ck;
  return onRequestPost({ request: new Request('https://t.example/api/profil', { method: 'POST', headers: h, body: JSON.stringify(body) }), env: ENV, data: {} } as never);
};
beforeEach(() => { vakolatKeshTozala(); urinishlarTozala(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('usullar / usul_uz', () => {
  it('usullar: actor sessiyadan', async () => {
    const f = mockFetch({ t2_kirish_usullari_v1: { ok: true, usullar: [{ id: 1, tur: 'google' }] } });
    const r = await post({ amal: 'usullar', p_actor_id: 999 });
    expect(await r.json()).toEqual({ ok: true, usullar: [{ id: 1, tur: 'google' }] });
    expect(calls(f, 't2_kirish_usullari_v1')).toEqual([{ p_actor_id: 7 }]);
  });
  it('usul_uz: eski sessiya + parol yo‘q → 401 QAYTA_KIRISH_KERAK (RPC chaqirilmaydi)', async () => {
    const f = mockFetch({});
    const eski = await cookie(Date.now() - SESSIYA_MUDDAT_MS / 2);
    const r = await post({ amal: 'usul_uz', usul_id: 5 }, eski);
    expect(r.status).toBe(401);
    expect(((await r.json()) as { code: string }).code).toBe('QAYTA_KIRISH_KERAK');
    expect(calls(f, 't2_usul_uz_v1')).toHaveLength(0);
  });
  it('usul_uz: eski sessiya + noto‘g‘ri parol → 401 va urinish hisoblanadi; to‘g‘ri parol → o‘tadi', async () => {
    const f = mockFetch({ t2_parol_tekshir_v1: (b: { p_parol: string }) => b.p_parol === 'togri-parol-1' ? { ok: true, foydalanuvchi_id: 7 } : { ok: false, code: 'PAROL_NOTOGRI' }, t2_usul_uz_v1: { ok: true, tur: 'google' } });
    const eski = await cookie(Date.now() - SESSIYA_MUDDAT_MS / 2);
    expect((await post({ amal: 'usul_uz', usul_id: 5, parol: 'xato' }, eski)).status).toBe(401);
    expect(calls(f, 't2_usul_uz_v1')).toHaveLength(0);
    const ok = await post({ amal: 'usul_uz', usul_id: 5, parol: 'togri-parol-1' }, eski);
    expect(ok.status).toBe(200);
    expect(calls(f, 't2_usul_uz_v1')[0]).toMatchObject({ p_actor_id: 7, p_usul_id: 5 });
  });
  it('usul_uz: begona hisob parolini (boshqa foydalanuvchi_id) qabul qilmaydi', async () => {
    mockFetch({ t2_parol_tekshir_v1: { ok: true, foydalanuvchi_id: 99 }, t2_usul_uz_v1: { ok: true } });
    const eski = await cookie(Date.now() - SESSIYA_MUDDAT_MS / 2);
    expect((await post({ amal: 'usul_uz', usul_id: 5, parol: 'boshqa-parol-1' }, eski)).status).toBe(401);
  });
  it('usul_uz: yangi sessiya parolsiz o‘tadi; OXIRGI_USUL → 400', async () => {
    const f = mockFetch({ t2_usul_uz_v1: { ok: false, code: 'OXIRGI_USUL' } });
    const r = await post({ amal: 'usul_uz', usul_id: 5 });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe('OXIRGI_USUL');
    expect(calls(f, 't2_usul_uz_v1')).toHaveLength(1);
  });
  it('usul_uz: usul_id noto‘g‘ri → 400', async () => {
    mockFetch({});
    expect((await post({ amal: 'usul_uz', usul_id: 'x' })).status).toBe(400);
  });
});

describe('birlashtir_email_kod — isbot shlyuzda, actor sessiyadan', () => {
  it('format xato → 400 (RPC yo‘q); boshqa saytdan → 403', async () => {
    const f = mockFetch({});
    expect((await post({ amal: 'birlashtir_email_kod', email: 'yoq', kod: '123456', tasdiqlash_id: TID })).status).toBe(400);
    expect((await post({ amal: 'birlashtir_email_kod', email: 'a@b.uz', kod: '12', tasdiqlash_id: TID })).status).toBe(400);
    expect((await post({ amal: 'birlashtir_email_kod', email: 'a@b.uz', kod: '123456', tasdiqlash_id: TID }, undefined, { Origin: 'https://evil.example' })).status).toBe(403);
    expect(f.mock.calls.filter((c) => !String(c[0]).includes('t2_men_v1'))).toHaveLength(0);
  });
  it('muvaffaqiyat: kod xeshi (ochiq kod emas), v2 ga p_boshqa_id isbotdan, yangi cookie', async () => {
    const f = mockFetch({
      t2_email_kod_dokaz_v1: { ok: true, foydalanuvchi_id: 42 },
      t2_hisob_birlashtir_v2: { ok: true, kochirilgan_kompaniyalar: [{ kompaniya_id: 18, rol: 'usta' }], qolgan_rollar: [] },
    });
    const r = await post({ amal: 'birlashtir_email_kod', email: ' Aziz@Mail.UZ ', kod: '123 456', tasdiqlash_id: TID, p_actor_id: 1, p_boshqa_id: 2 });
    expect(r.status).toBe(200);
    const d = calls(f, 't2_email_kod_dokaz_v1')[0];
    expect(d.p_kod_xesh).toBe(await kodXesh('123456', 'aziz@mail.uz', ENV.SESSIYA_KALIT));
    expect(JSON.stringify(d)).not.toContain('123456');
    expect(calls(f, 't2_hisob_birlashtir_v2')[0]).toMatchObject({ p_actor_id: 7, p_boshqa_id: 42, p_dokaz: 'email' });
    expect(await tekshir(r.headers.get('Set-Cookie'), ENV.SESSIYA_KALIT)).toMatchObject({ foydalanuvchi_id: 7 });
  });
  it('kod noto‘g‘ri → 400 va urinish hisoblanadi; limitdan keyin 429 (RPC chaqirilmaydi)', async () => {
    const f = mockFetch({ t2_email_kod_dokaz_v1: { ok: false, code: 'KOD_YAROQSIZ' } });
    for (let i = 0; i < URINISH_LIMIT; i++) expect((await post({ amal: 'birlashtir_email_kod', email: 'a@b.uz', kod: '123456', tasdiqlash_id: TID })).status).toBe(400);
    const oldin = calls(f, 't2_email_kod_dokaz_v1').length;
    expect((await post({ amal: 'birlashtir_email_kod', email: 'a@b.uz', kod: '123456', tasdiqlash_id: TID })).status).toBe(429);
    expect(calls(f, 't2_email_kod_dokaz_v1')).toHaveLength(oldin);
    expect(calls(f, 't2_hisob_birlashtir_v2')).toHaveLength(0);
  });
  it('SUPERADMIN_FARQI → 400, cookie yo‘q', async () => {
    mockFetch({ t2_email_kod_dokaz_v1: { ok: true, foydalanuvchi_id: 42 }, t2_hisob_birlashtir_v2: { ok: false, code: 'SUPERADMIN_FARQI' } });
    const r = await post({ amal: 'birlashtir_email_kod', email: 'a@b.uz', kod: '123456', tasdiqlash_id: TID });
    expect(r.status).toBe(400);
    expect(r.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('birlashtir_google', () => {
  it('credential yo‘q / juda uzun → 400', async () => {
    mockFetch({});
    expect((await post({ amal: 'birlashtir_google' })).status).toBe(400);
    expect((await post({ amal: 'birlashtir_google', credential: 'x'.repeat(5000) })).status).toBe(400);
  });
});

describe('birlashtir_telegram — isbot (nonce + brauzer siri), actor sessiyadan', () => {
  const TG = { ...ENV, KIRISH_TELEGRAM_YOQILGAN: '1', TELEGRAM_BOT_TOKEN: '123456789:AAFakeSinovTokenFakeSinovToken_abc', TELEGRAM_BOT_USERNAME: 'sinov_bot' };
  const postTg = async (body: unknown, env: Record<string, unknown> = TG) => onRequestPost({ request: new Request('https://t.example/api/profil', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await cookie() }, body: JSON.stringify(body) }), env, data: {} } as never);
  const NONCE = 'kirish_' + 'N'.repeat(32), SIR = 'S'.repeat(43);
  it('o‘chiq sozlama → 503 YOQILMAGAN (RPC yo‘q)', async () => {
    const f = mockFetch({});
    expect((await postTg({ amal: 'birlashtir_telegram_boshla' }, ENV)).status).toBe(503);
    expect(calls(f, 't2_tg_dokaz_boshla_v1')).toHaveLength(0);
  });
  it('boshla: bazaga faqat xesh, actor sessiyadan; havola deep link (sir yo‘q)', async () => {
    const f = mockFetch({ t2_tg_dokaz_boshla_v1: { ok: true, tugaydi: '2026-11-13T10:05:00Z' } });
    const r = await postTg({ amal: 'birlashtir_telegram_boshla', p_actor_id: 99 });
    const j = await r.json() as { nonce: string; sir: string; havola: string };
    expect(j.havola).toBe(`https://t.me/sinov_bot?start=${j.nonce}`);
    const y = calls(f, 't2_tg_dokaz_boshla_v1')[0];
    expect(y.p_actor_id).toBe(7);
    expect(JSON.stringify(y)).not.toContain(j.nonce); expect(JSON.stringify(y)).not.toContain(j.sir);
  });
  it('holat: format xato → 404; kutmoqda; tayyor → v2 (dokaz=telegram, p_boshqa_id isbotdan) + yangi cookie', async () => {
    const f = mockFetch({ t2_tg_dokaz_holat_v1: { ok: true, holat: 'tayyor', foydalanuvchi_id: 42 }, t2_hisob_birlashtir_v2: { ok: true, kochirilgan_kompaniyalar: [], qolgan_rollar: [] } });
    expect((await postTg({ amal: 'birlashtir_telegram_holat', nonce: 'x', sir: SIR })).status).toBe(404);
    const r = await postTg({ amal: 'birlashtir_telegram_holat', nonce: NONCE, sir: SIR, p_boshqa_id: 5 });
    expect(r.status).toBe(200);
    expect(calls(f, 't2_hisob_birlashtir_v2')[0]).toMatchObject({ p_actor_id: 7, p_boshqa_id: 42, p_dokaz: 'telegram' });
    expect(await tekshir(r.headers.get('Set-Cookie'), ENV.SESSIYA_KALIT)).toMatchObject({ foydalanuvchi_id: 7 });
    mockFetch({ t2_tg_dokaz_holat_v1: { ok: true, holat: 'kutmoqda' } });
    expect(await (await postTg({ amal: 'birlashtir_telegram_holat', nonce: NONCE, sir: SIR })).json()).toEqual({ ok: true, holat: 'kutmoqda' });
  });
  it('TELEGRAM_HISOB_YOQ → 400; boshqa kodlar umumiy TOPILMADI 404; birlashtirish chaqirilmaydi', async () => {
    const f = mockFetch({ t2_tg_dokaz_holat_v1: { ok: false, code: 'TELEGRAM_HISOB_YOQ' } });
    expect((await postTg({ amal: 'birlashtir_telegram_holat', nonce: NONCE, sir: SIR })).status).toBe(400);
    mockFetch({ t2_tg_dokaz_holat_v1: { ok: false, code: 'BOSHQA_ICHKI' } });
    expect((await postTg({ amal: 'birlashtir_telegram_holat', nonce: NONCE, sir: SIR })).status).toBe(404);
    expect(calls(f, 't2_hisob_birlashtir_v2')).toHaveLength(0);
  });
});