/**
 * /api/qulf uchidan-uchiga: haqiqiy onRequestPost/onRequestGet + supabaseStore + soxta PostgREST (JSON orqali aylanadi, xuddi prod kabi).
 * 2026-11-15 prod xatosi: PIN o'rnatildi -> darhol В«PIN noto'g'riВ». Regressiya: pin_saqla -> pin_tekshir web VA BFF (mobil) kanalida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { soxtaSupabase } from '../_shared/qulf-soxta';
import { onRequestGet, onRequestPost } from './qulf';

const KALIT = 'sinov-sessiya-kalit-0123456789abcdef';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KALIT };
const ORIGIN = 'https://qur.uz';

async function sessCookie(uid: unknown, iat = Date.now() - 60 * 60_000) {
  return 'sess=' + await imzola({ rol: 'admin', foydalanuvchi_id: uid as number }, KALIT, iat);
}
async function post(cookie: string, b: Record<string, unknown>, mobil = false) {
  const headers: Record<string, string> = { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json' };
  if (mobil) headers['X-Qulf-Kanal'] = 'mobil';
  const r = await onRequestPost({ request: new Request(ORIGIN + '/api/qulf', { method: 'POST', headers, body: JSON.stringify(b) }), env } as never);
  return { status: r.status, j: await r.json() as Record<string, unknown> };
}
async function holat(cookie: string) {
  const r = await onRequestGet({ request: new Request(ORIGIN + '/api/qulf?amal=holat', { headers: { Cookie: cookie } }), env } as never);
  return await r.json() as Record<string, unknown>;
}

describe('/api/qulf: pin_saqla -> pin_tekshir (haqiqiy handler)', () => {
  let sb: ReturnType<typeof soxtaSupabase>;
  beforeEach(() => { sb = soxtaSupabase(); vi.stubGlobal('fetch', sb.fn); });
  afterEach(() => vi.unstubAllGlobals());

  for (const mobil of [false, true]) {
    it(`${mobil ? 'BFF (mobil)' : 'web'}: 4 raqamli PIN o'rnatilgach shu PIN bilan tasdiq o'tadi`, async () => {
      const c = await sessCookie(17);
      const s = await post(c, { amal: 'pin_saqla', yangi: '1902' }, mobil);
      expect(s.status).toBe(200);
      const t = await post(c, { amal: 'pin_tekshir', pin: '1902' }, mobil);
      expect(t.j.code).toBeUndefined();
      expect(t.status).toBe(200);
      expect(t.j.tasdiq_token).toBeTruthy();
    });
  }

  it('boshqa sessiya (yangi jti) va boshqa kanal bilan ham shu PIN o\'tadi (set web, verify mobil)', async () => {
    expect((await post(await sessCookie(17), { amal: 'pin_saqla', yangi: '1902' })).status).toBe(200);
    expect((await post(await sessCookie(17), { amal: 'pin_tekshir', pin: '1902' }, true)).status).toBe(200);
  });

  it('holat PIN uzunligini qaytaradi (PIN o\'zini emas)', async () => {
    const c = await sessCookie(17);
    await post(c, { amal: 'pin_saqla', yangi: '1902' });
    const h = await holat(c);
    expect(h.pin_uzunlik).toBe(4);
    expect(JSON.stringify(h)).not.toContain('1902');
  });

  it('PIN boshqa SESSIYA_KALIT bilan yozilgan (preview/production farqi): PIN_KALIT_BOSHQA, urinish sanalmaydi, yangi kirishda eski PINsiz almashtiriladi', async () => {
    const c = await sessCookie(17);
    await post(c, { amal: 'pin_saqla', yangi: '1902' });
    const h = sb.qator.get(17)!.pin_hash as string;
    // boshqa muhit kaliti bilan yozilgan xeshni simulyatsiya qilamiz
    sb.qator.get(17)!.pin_hash = h.replace(/\$[^$.]+\.(\d)$/, '$zzzzzzzz.$1');
    for (let i = 0; i < 7; i++) { const r = await post(c, { amal: 'pin_tekshir', pin: '1902' }); expect(r.status).toBe(409); expect(r.j.code).toBe('PIN_KALIT_BOSHQA'); }
    expect(sb.qator.get(17)!.xato_soni).toBe(0);
    expect((await holat(c)).pin_kalit_boshqa).toBe(true);
    const fresh = await sessCookie(17, Date.now() - 60_000);
    expect((await post(fresh, { amal: 'pin_saqla', yangi: '7351' })).status).toBe(200);
    expect((await post(fresh, { amal: 'pin_tekshir', pin: '7351' })).status).toBe(200);
  });

  it('eski (kf/uzunliksiz) xesh hamon tekshiriladi, uzunlik noma\'lum', async () => {
    const c = await sessCookie(17);
    await post(c, { amal: 'pin_saqla', yangi: '1902' });
    sb.qator.get(17)!.pin_hash = (sb.qator.get(17)!.pin_hash as string).split('$').slice(0, 4).join('$');
    expect((await post(c, { amal: 'pin_tekshir', pin: '1902' })).status).toBe(200);
    expect((await holat(c)).pin_uzunlik).toBeNull();
  });

  it('qolgan urinishlar holatda ko\'rinadi', async () => {
    const c = await sessCookie(17);
    await post(c, { amal: 'pin_saqla', yangi: '1902' });
    await post(c, { amal: 'pin_tekshir', pin: '1111' }); await post(c, { amal: 'pin_tekshir', pin: '1111' });
    expect((await holat(c)).qolgan_urinish).toBe(3);
  });
});
