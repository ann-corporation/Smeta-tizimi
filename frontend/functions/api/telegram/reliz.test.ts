/* Reliz e'loni + yuklab olish: Telegram API, sayt manifestlari va R2 soxtalashtirilgan; haqiqiy xabar yuborilmaydi. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../../_shared/auth';
import { relizMatni, TG_FAYL_MAX } from '../../_shared/telegram-reliz';
import { onRequestPost as relizPost } from './reliz';
import { updateIshla } from './webhook';

const TOKEN = '123456789:AAFakeSinovTokenFakeSinovToken_abc';
const SITE = 'https://qurai.uz';
const CRON = 'cron-sir-sinov-0123456789abcdef';
const SHA_A = 'a'.repeat(64); const SHA_W = 'b'.repeat(64);
const MOB = { android: { version: '1.2.3', generatedAtUtc: '2026-11-18T10:00:00Z', file: 'qurai-1.2.3-native-release.apk', bytes: 1000, sha256: SHA_A } };
const DESK = { version: '2.0.0', generatedAtUtc: '2026-11-18T10:05:00Z', file: 'QURAI-2.0.0.msi', bytes: 2000, sha256: SHA_W };
const YANGI = { yozuvlar: [{ sana: '2026-11-17', sarlavha: 'Yangi F2 sahifasi', bandlar: [] }, { sana: '2026-11-01', sarlavha: 'Eski yangilik', bandlar: [] }, { sana: '2027-01-01', sarlavha: 'Kelajak', bandlar: [] }] };

function r2(fayllar: Record<string, number>) {
  const m = new Map<string, string>();
  return {
    m,
    put: async (k: string, v: string) => { m.set(k, v); },
    list: async ({ prefix }: { prefix: string }) => ({ objects: Object.keys(fayllar).filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: fayllar[key] })) }),
    get: async (k: string) => {
      if (m.has(k)) return { json: async () => JSON.parse(m.get(k)!) };
      if (k in fayllar) return { size: fayllar[k], body: new Response(new Uint8Array(fayllar[k]).fill(7)).body, json: async () => ({}) };
      return null;
    },
  };
}
const mkEnv = (R2 = r2({ [`reliz/android/1.2.3/${SHA_A}/${MOB.android.file}`]: 1000, [`windows/2.0.0/${SHA_W}/${DESK.file}`]: 2000 }), extra: Record<string, unknown> = {}) => ({
  SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32), TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: 'webhook-sir-sinov-0123456789', TG_KANAL: '@qurai_uz', TG_GURUH: '-1001234567890', R2_CANONICAL: R2, BILDIRISHNOMA_CRON_KALIT: CRON, ...extra,
});

type Tg = { metod: string; chat?: string; yuk?: any; hujjat?: boolean; matn?: string };
function tarmoq(opts: { mob?: unknown; desk?: unknown; superadmin?: boolean; tgOk?: boolean } = {}) {
  const tg: Tg[] = [];
  const { mob = MOB, desk = DESK, superadmin = true, tgOk = true } = opts;
  let n = 0;
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    if (url.host === 'api.telegram.org') {
      const metod = url.pathname.split('/').at(-1)!;
      if (init?.body && typeof init.body !== 'string') {
        const b = init.body as Blob;
        const t = typeof b.text === 'function' ? await b.text() : await new Response(b as BodyInit).text();
        tg.push({ metod, hujjat: true, chat: /name="chat_id"\r\n\r\n([^\r]+)/.exec(t)?.[1], matn: /name="caption"\r\n\r\n([\s\S]*?)\r\n--/.exec(t)?.[1] });
      } else { const yuk = init?.body ? JSON.parse(String(init.body)) : {}; tg.push({ metod, yuk, chat: String(yuk.chat_id) }); }
      if (!tgOk) return Response.json({ ok: false, description: 'Bad Request' });
      return Response.json({ ok: true, result: { message_id: 900 + n++, document: { file_id: 'FILE-ID-' + n } } });
    }
    if (url.origin === SITE) {
      if (url.pathname === '/mobile-release.json') return Response.json(mob);
      if (url.pathname === '/desktop-release.json') return Response.json(desk);
      if (url.pathname === '/yangiliklar.json') return Response.json(YANGI);
    }
    const nom = url.pathname.split('/').at(-1)!;
    if (nom === 't2_boshqaruv_umumiy_v1') return superadmin ? Response.json({ foydalanuvchi: { jami: 1 } }) : new Response('{"message":"SUPERADMIN_KERAK"}', { status: 400 });
    if (nom === 't2_telegram_update_qabul_v1') return Response.json({ ok: true, yangi: true, limit: false });
    if (nom === 't2_telegram_aniqla_v1') return Response.json({ ok: true, ulangan: false });
    return Response.json({ message: 'yoq' }, { status: 404 });
  }));
  return tg;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const post = (env: ReturnType<typeof mkEnv>, body: unknown, h: Record<string, string> = {}) => relizPost({ request: new Request(SITE + '/api/telegram/reliz', { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) }), env } as never);
const cronH = { 'X-Cron-Kalit': CRON };
const sess = async () => ({ Origin: SITE, Cookie: 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 1, kompaniyalar: [] }, 'k'.repeat(32)) });
const yuborilgan = (tg: Tg[]) => tg.filter((x) => x.metod === 'sendDocument' || x.metod === 'sendMessage');

describe('/api/telegram/reliz — kirish', () => {
  it('kalitsiz/noto‘g‘ri kalit/sessiyasiz rad; hech narsa yuborilmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    expect((await post(env, { amal: 'elon' })).status).toBe(401);
    expect((await post(env, { amal: 'elon' }, { 'X-Cron-Kalit': 'x'.repeat(30) })).status).toBe(403);
    expect((await post(mkEnv(undefined, { BILDIRISHNOMA_CRON_KALIT: '' }), { amal: 'elon' }, cronH)).status).toBe(503);
    tarmoq({ superadmin: false });
    expect((await post(env, { amal: 'elon' }, await sess())).status).toBe(403);
    expect(yuborilgan(tg)).toEqual([]);
  });
  it('cron faqat joriy relizni e‘lon qila oladi (majbur/versiya/platforma — 403)', async () => {
    tarmoq(); const env = mkEnv();
    for (const b of [{ amal: 'elon', majbur: true }, { amal: 'elon', versiya: '1.0.0' }, { amal: 'elon', platforma: 'android' }]) expect((await post(env, b, cronH)).status).toBe(403);
  });
});

describe('e‘lon — kanal + guruh, fayl bilan, idempotent', () => {
  it('ikkala chatga ikkala platforma: birinchisida yuklash, keyin keshlangan file_id; sha256 izohda', async () => {
    const tg = tarmoq(); const env = mkEnv();
    const r = await post(env, { amal: 'elon' }, cronH);
    expect(r.status).toBe(200);
    const j = await r.json() as { ok: boolean; natija: { holat: string }[] };
    expect(j.ok).toBe(true); expect(j.natija.map((x) => x.holat)).toEqual(['yuborildi', 'yuborildi', 'yuborildi', 'yuborildi']);
    const y = yuborilgan(tg);
    expect(y.every((x) => x.metod === 'sendDocument')).toBe(true);
    expect(y.filter((x) => x.hujjat).length).toBe(2);              // har platforma bir marta yuklandi
    expect(y.filter((x) => !x.hujjat && x.yuk.document).length).toBe(2);   // guruhga keshlangan file_id
    expect(y.map((x) => x.chat).sort()).toEqual(['-1001234567890', '-1001234567890', '@qurai_uz', '@qurai_uz']);
    expect(y.find((x) => x.hujjat)!.matn).toContain(`SHA-256: ${SHA_A}`);
    expect([...env.R2_CANONICAL.m.keys()].filter((k) => k.startsWith('tg-reliz/fayl-id/')).length).toBe(2);
    expect(JSON.stringify(j)).not.toContain(TOKEN);
  });
  it('ikkinchi marta — o‘tkazildi (qayta yuborilmaydi); majbur (superadmin) — qayta yuboradi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'elon' }, cronH); tg.length = 0;
    const r2nd = await (await post(env, { amal: 'elon' }, cronH)).json() as { natija: { holat: string }[] };
    expect(r2nd.natija.every((x) => x.holat === 'otkazildi')).toBe(true); expect(yuborilgan(tg)).toEqual([]);
    const maj = await (await post(env, { amal: 'elon', platforma: 'android', majbur: true }, await sess())).json() as { natija: { holat: string }[] };
    expect(maj.natija.map((x) => x.holat)).toEqual(['yuborildi', 'yuborildi']); expect(yuborilgan(tg).length).toBe(2);
  });
  it('> 50 MB — fayl yuklanmaydi: matn + URL tugma (ochiq reliz manzili)', async () => {
    const tg = tarmoq({ desk: { ...DESK, bytes: TG_FAYL_MAX + 1 } }); const env = mkEnv();
    await post(env, { amal: 'elon', platforma: 'windows' }, await sess());
    const y = yuborilgan(tg);
    expect(y.length).toBe(2); expect(y.every((x) => x.metod === 'sendMessage')).toBe(true);
    expect(y[0].yuk.reply_markup.inline_keyboard[0][0].url).toBe(`${SITE}/windows/2.0.0/${SHA_W}/${DESK.file}`);
    expect(y[0].yuk.text).toContain(`SHA-256: ${SHA_W}`);
  });
  it('fayl R2 da yo‘q — tugmali xabarga tushadi; Telegram xato — natijada xato, yozuv yozilmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv(r2({}));
    const j = await (await post(env, { amal: 'elon', platforma: 'android' }, await sess())).json() as { natija: { holat: string }[] };
    expect(j.natija.every((x) => x.holat === 'yuborildi')).toBe(true); expect(yuborilgan(tg).every((x) => x.metod === 'sendMessage')).toBe(true);
    tarmoq({ tgOk: false }); const env2 = mkEnv();
    const bad = await (await post(env2, { amal: 'elon' }, cronH)).json() as { ok: boolean; natija: { holat: string }[] };
    expect(bad.ok).toBe(false); expect(bad.natija.every((x) => x.holat === 'xato')).toBe(true);
    expect([...env2.R2_CANONICAL.m.keys()].filter((k) => k.startsWith('tg-reliz/elon/'))).toEqual([]);
  });
  it('eski versiyani qayta e‘lon (manifestda yo‘q, R2 dan topiladi); noma’lum versiya — 404', async () => {
    const tg = tarmoq(); const env = mkEnv(r2({ [`reliz/android/1.0.0/${'c'.repeat(64)}/qurai-1.0.0-native-release.apk`]: 500 }));
    const ok = await post(env, { amal: 'elon', platforma: 'android', versiya: '1.0.0', majbur: true }, await sess());
    expect(ok.status).toBe(200); expect(yuborilgan(tg).length).toBe(2);
    expect((await post(env, { amal: 'elon', versiya: '9.9.9', majbur: true }, await sess())).status).toBe(404);
  });
});

describe('«Nima yangi» va bot tugmasi', () => {
  it('izoh: manifest sanasigacha eng yangi sarlavhalar, kelajak yozuvi chiqmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'elon', platforma: 'android' }, await sess());
    const m = tg.find((x) => x.hujjat)!.matn!;
    expect(m).toContain('Yangi F2 sahifasi'); expect(m).not.toContain('Kelajak'); expect(m).toContain('Nima yangi:');
    expect(relizMatni({ platforma: 'android', versiya: '1.0.0', fayl: 'a.apk', bayt: 1048576, sha256: SHA_A, sana: '' }, 'uz', false)).toContain('Hajmi: 1.0 MB');
  });
  it('«📥 Ilovani yuklab olish» (rl:y) ulanmagan foydalanuvchiga ham ikkala faylni yuboradi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    const r = await updateIshla(env as never, { update_id: 7, callback_query: { id: 'c1', from: { id: 5550001, language_code: 'uz' }, data: 'rl:y', message: { message_id: 5, chat: { id: 5550001, type: 'private' } } } } as never);
    expect(r).toBe('reliz_yuklash');
    expect(tg.filter((x) => x.metod === 'sendDocument').length).toBe(2);
    expect(tg.some((x) => x.metod === 'answerCallbackQuery')).toBe(true);
  });
  it('/yuklash buyrug‘i ham ishlaydi; /reliz_elon ulanmaganga yo‘q', async () => {
    const tg = tarmoq(); const env = mkEnv();
    const msg = (text: string, id: number) => ({ update_id: id, message: { message_id: 1, text, chat: { id: 5550001, type: 'private' }, from: { id: 5550001, language_code: 'uz' } } });
    expect(await updateIshla(env as never, msg('/yuklash', 8) as never)).toBe('reliz_yuklash');
    expect(tg.filter((x) => x.metod === 'sendDocument').length).toBe(2);
    expect(await updateIshla(env as never, msg('/reliz_elon', 9) as never)).toBe('ulanmagan');
  });
});
