import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './bildirishnoma-yetkaz';

const KALIT = 'k'.repeat(32);
const TOKEN = '123456:' + 'A'.repeat(30);
const env = (o: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'svc', BILDIRISHNOMA_CRON_KALIT: KALIT, TELEGRAM_BOT_TOKEN: TOKEN, ...o });
const post = (e = env(), kalit: string | null = KALIT) =>
  onRequestPost({ request: new Request('https://t/api/bildirishnoma-yetkaz', { method: 'POST', headers: kalit === null ? {} : { 'X-Cron-Kalit': kalit } }), env: e } as never);
const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('/api/bildirishnoma-yetkaz', () => {
  it('kalit sozlanmagan yoki qisqa — 503, hech narsa chaqirilmaydi (fail closed)', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect((await post(env({ BILDIRISHNOMA_CRON_KALIT: undefined }))).status).toBe(503);
    expect((await post(env({ BILDIRISHNOMA_CRON_KALIT: 'qisqa' }), 'qisqa')).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
  it('noto‘g‘ri yoki yo‘q kalit — 403', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect((await post(env(), 'x'.repeat(32))).status).toBe(403);
    expect((await post(env(), null)).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
  it('bot tokeni yo‘q — navbat olinmaydi', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = await post(env({ TELEGRAM_BOT_TOKEN: undefined }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, telegram: false, olindi: 0 });
    expect(f).not.toHaveBeenCalled();
  });
  it('navbat → yuborish → natija; matn/token javobga chiqmaydi', async () => {
    const natijaYuki: unknown[] = [];
    const f = vi.fn(async (u: string, init?: RequestInit) => {
      const url = String(u);
      if (url.endsWith('/rpc/t2_bildirishnoma_tg_navbat_v1')) return json({ ok: true, navbatga: 2, qatorlar: [
        { id: 1, foydalanuvchi_id: 7, mavzu: 'hujjat.muddat_otdi', parametrlar: { xat_id: 3, muddat: '2026-11-04' }, urinish: 1 },
        { id: 2, foydalanuvchi_id: 8, mavzu: 'hujjat.tasdiqlandi', parametrlar: { zanjir_id: 4 }, urinish: 1 }] });
      if (url.endsWith('/rpc/t2_telegram_manzil_v1')) {
        const b = JSON.parse(String(init?.body));
        expect(b.p_tur).toBe('topshiriq');
        return json(b.p_foydalanuvchi_id === 7 ? { ok: true, yuborish: true, chat_id: 555, til: 'uz' } : { ok: true, yuborish: false });
      }
      if (url.startsWith('https://api.telegram.org/')) {
        const b = JSON.parse(String(init?.body));
        expect(b.chat_id).toBe(555);
        expect(b.text).toBe('Hujjat muddati o‘tib ketdi\nMuddat: 04.11.2026');
        expect(b.reply_markup.inline_keyboard[0][0].url).toBe('https://smeta-tizimi.pages.dev/admin/hujjat-aylanish?xat=3');
        return json({ ok: true, result: {} });
      }
      if (url.endsWith('/rpc/t2_bildirishnoma_tg_natija_v1')) { natijaYuki.push(JSON.parse(String(init?.body))); return json({ ok: true, yangilandi: 2 }); }
      return json({ ok: false });
    });
    vi.stubGlobal('fetch', f);
    const r = await post();
    const d = await r.json() as Record<string, unknown>;
    expect(r.status).toBe(200);
    expect(d).toMatchObject({ ok: true, telegram: true, olindi: 2, yozildi: 2, yuborildi: 1, otkazildi: 1, xato: 0, nomalum: 0 });
    expect(natijaYuki).toEqual([{ p_natijalar: [{ id: 1, holat: 'yuborildi' }, { id: 2, holat: 'otkazildi', xato: 'ULANMAGAN_YOKI_ROZI_EMAS' }], p_max_urinish: 3 }]);
    expect(JSON.stringify(d)).not.toContain(TOKEN);
    expect(JSON.stringify(d)).not.toContain('muddati');
  });
  it('navbat RPC xatosi — 502, Telegram chaqirilmaydi', async () => {
    const f = vi.fn(async () => new Response('x', { status: 500 })); vi.stubGlobal('fetch', f);
    expect((await post()).status).toBe(502);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('bo‘sh navbat — natija RPC chaqirilmaydi', async () => {
    const f = vi.fn(async () => json({ ok: true, qatorlar: [] })); vi.stubGlobal('fetch', f);
    expect(await (await post()).json()).toMatchObject({ ok: true, olindi: 0 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
