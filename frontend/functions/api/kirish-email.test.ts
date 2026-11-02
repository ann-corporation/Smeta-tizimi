import { afterEach, describe, expect, it, vi } from 'vitest';
import { tekshir } from '../_shared/auth';
import { kodXesh, onRequestGet, onRequestPost, PAROLLI_HISOB_KOD, PAROLLI_HISOB_XABAR, STANDART_FROM, xatTanasi, yangiKod } from './kirish-email';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service', RESEND_API_KEY: 're_x', EMAIL_FROM: 'Smeta OS <kod@smeta.uz>' };
const TID = '11111111-1111-4111-8111-111111111111';
const post = (body: unknown, env: Record<string, unknown> = ENV, headers: Record<string, string> = {}) =>
  onRequestPost({ request: new Request('https://t.example/api/kirish-email', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), env, data: {} } as never);

type Javob = Record<string, (body: any) => Response | unknown>;
function mockFetch(j: Javob) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const key = String(url).includes('resend.com') ? 'resend' : String(url).split('/rpc/')[1];
    if (!(key in j)) throw new Error('kutilmagan: ' + key);
    const v = j[key](body);
    return v instanceof Response ? v : Response.json(v);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe('/api/kirish-email — kod', () => {
  it('yaroqsiz email → 400; boshqa saytdan → 403; amal noma’lum → 400', async () => {
    mockFetch({});
    expect((await post({ amal: 'kod', email: 'yoq' })).status).toBe(400);
    expect((await post({ amal: 'kod', email: 'a@b.uz' }, ENV, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ amal: 'x', email: 'a@b.uz' })).status).toBe(400);
  });
  it('Resend kaliti yo‘q → 503 EMAIL_XIZMATI_SOZLANMAGAN (bazaga yozmaydi)', async () => {
    const f = mockFetch({});
    const r = await post({ amal: 'kod', email: 'a@b.uz' }, { ...ENV, RESEND_API_KEY: '' });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { code?: string }).code).toBe('EMAIL_XIZMATI_SOZLANMAGAN');
    expect(f).not.toHaveBeenCalled();
  });
  it('muvaffaqiyat: xesh yuboriladi (kodning o‘zi emas), xat jo‘natiladi, yuborildi belgilanadi', async () => {
    let xesh = ''; let xat: any = null;
    const f = mockFetch({
      t2_email_kod_yarat_v1: (b) => { xesh = b.p_kod_xesh; return { ok: true, tasdiqlash_id: TID }; },
      resend: (b) => { xat = b; return { id: 'x' }; },
      t2_royxat_email_kod_yuborildi_v1: () => ({ ok: true }),
    });
    const r = await post({ amal: 'kod', email: 'Ali@Mail.UZ ' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, tasdiqlash_id: TID });
    const kod = /(\d{6})/.exec(xat.subject)![1];
    expect(xesh).toBe(await kodXesh(kod, 'ali@mail.uz', ENV.SESSIYA_KALIT));
    expect(xesh).not.toContain(kod);
    expect(xat.to).toEqual(['ali@mail.uz']);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('limit → 429; migratsiya yo‘q (404) → 503 SERVER_YANGILANMAGAN', async () => {
    mockFetch({ t2_email_kod_yarat_v1: () => ({ ok: false, code: 'LIMIT', xabar: 'limit' }) });
    expect((await post({ amal: 'kod', email: 'a@b.uz' })).status).toBe(429);
    mockFetch({ t2_email_kod_yarat_v1: () => new Response('{}', { status: 404 }) });
    const r = await post({ amal: 'kod', email: 'a@b.uz' });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { code?: string }).code).toBe('SERVER_YANGILANMAGAN');
  });
});

describe('/api/kirish-email — sozlama', () => {
  it('EMAIL_FROM berilmasa Resend sinov manzili ishlatiladi', async () => {
    let from = '';
    mockFetch({ t2_email_kod_yarat_v1: () => ({ ok: true, tasdiqlash_id: TID }), resend: (b) => { from = b.from; return { id: 'x' }; }, t2_royxat_email_kod_yuborildi_v1: () => ({ ok: true }) });
    expect((await post({ amal: 'kod', email: 'a@b.uz' }, { ...ENV, EMAIL_FROM: '' })).status).toBe(200);
    expect(from).toBe(STANDART_FROM);
  });
  it('Resend 403 (domen tasdiqlanmagan) → aniq xabar EMAIL_SINOV_REJIMI', async () => {
    mockFetch({ t2_email_kod_yarat_v1: () => ({ ok: true, tasdiqlash_id: TID }), resend: () => new Response('{}', { status: 403 }) });
    const r = await post({ amal: 'kod', email: 'boshqa@b.uz' });
    expect(((await r.json()) as { code?: string }).code).toBe('EMAIL_SINOV_REJIMI');
  });
  it('GET holat maxfiy qiymatni qaytarmaydi', async () => {
    const r = await onRequestGet({ request: new Request('https://t.example/api/kirish-email'), env: ENV, data: {} } as never);
    const d = await r.json() as Record<string, unknown>;
    expect(d).toEqual({ ok: true, email_yoqilgan: true, yuboruvchi: 'domen' });
    expect(JSON.stringify(d)).not.toContain('re_x');
  });
});

describe('/api/kirish-email — tasdiqla', () => {
  it('kod formati noto‘g‘ri → 400 (RPC chaqirilmaydi)', async () => {
    const f = mockFetch({});
    expect((await post({ amal: 'tasdiqla', email: 'a@b.uz', tasdiqlash_id: TID, kod: '12ab' })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('noto‘g‘ri kod → 400 va qolgan urinish', async () => {
    mockFetch({ t2_email_kod_kirish_v1: () => ({ ok: false, code: 'KOD_NOTOGRI', xabar: 'Kod noto‘g‘ri.', qolgan_urinish: 3 }) });
    const r = await post({ amal: 'tasdiqla', email: 'a@b.uz', tasdiqlash_id: TID, kod: '123 456' });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, code: 'KOD_NOTOGRI', qolgan_urinish: 3 });
  });
  it('email tasdiqlanmagan parolli hisob → 409, tushunarli xabar, sessiya cookie YO‘Q', async () => {
    mockFetch({ t2_email_kod_kirish_v1: () => ({ ok: false, code: PAROLLI_HISOB_KOD }) });
    const r = await post({ amal: 'tasdiqla', email: 'a@b.uz', tasdiqlash_id: TID, kod: '123456' });
    expect(r.status).toBe(409);
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect(await r.json()).toEqual({ ok: false, code: 'EMAIL_TASDIQLANMAGAN_PAROLLI_HISOB', xabar: PAROLLI_HISOB_XABAR });
    expect(PAROLLI_HISOB_XABAR).toMatch(/^Bu email bilan parolli hisob bor\. Parol bilan kiring/);
  });
  it('muvaffaqiyat: sessiya cookie DB qaytargan foydalanuvchi uchun imzolanadi', async () => {
    let yuk: any = null;
    mockFetch({ t2_email_kod_kirish_v1: (b) => { yuk = b; return { ok: true, yangi: true, foydalanuvchi_id: 501, login: 'a@b.uz', rol: 'boss', azoliklar: [{ kompaniya_id: 9, rol: 'boss' }], demo_obyekt_id: 3 }; } });
    const r = await post({ amal: 'tasdiqla', email: 'a@b.uz', tasdiqlash_id: TID, kod: '123456', ism: ' Ali ' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, yangi: true, rol: 'boss', demo: true });
    expect(yuk.p_ism).toBe('Ali');
    expect(yuk.p_kod_xesh).toBe(await kodXesh('123456', 'a@b.uz', ENV.SESSIYA_KALIT));
    const cookie = r.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    const s = await tekshir(cookie.split(';')[0], ENV.SESSIYA_KALIT);
    expect(s?.foydalanuvchi_id).toBe(501);
    expect(s?.kompaniyalar).toEqual([{ kompaniya_id: 9, rol: 'boss' }]);
  });
});

describe('yordamchilar', () => {
  it('kod har doim 6 xonali, xat matnida kod bor', () => {
    for (let i = 0; i < 200; i++) expect(yangiKod()).toMatch(/^[1-9]\d{5}$/);
    const x = xatTanasi('123456');
    expect(x.text).toContain('123456');
    expect(x.html).toContain('123456');
  });
});
