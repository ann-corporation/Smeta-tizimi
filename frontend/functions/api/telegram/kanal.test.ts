/* Kanal/guruh boshqaruvi: auth, bot huquqlari, FAQAT callback dan keyin chiqarish, audit. Telegram API va baza soxtalashtirilgan. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../../_shared/auth';
import { onRequestPost as kanalPost } from './kanal';
import { updateIshla } from './webhook';

const TOKEN = '123456789:AAFakeSinovTokenFakeSinovToken_abc';
const SITE = 'https://qurai.uz';
const OWNER = 1; const OWNER_TG = 5550001;
const r2 = () => { const m = new Map<string, string>(); return { m, put: async (k: string, v: string) => { m.set(k, v); }, get: async (k: string) => (m.has(k) ? { json: async () => JSON.parse(m.get(k)!) } : null) }; };
const mkEnv = (R2 = r2()) => ({ SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32), TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: 'webhook-sir-sinov-0123456789', TG_KANAL: '@qurai_uz', TG_GURUH: '-1001234567890', R2_CANONICAL: R2 });

type Tg = { metod: string; yuk: any };
function tarmoq(opts: { superadmin?: boolean; huquq?: Record<string, boolean>; ulangan?: boolean } = {}) {
  const tg: Tg[] = [];
  const { superadmin = true, huquq = { can_post_messages: true, can_change_info: true }, ulangan = true } = opts;
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw); const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.host === 'api.telegram.org') {
      const metod = url.pathname.split('/').at(-1)!; tg.push({ metod, yuk: body });
      if (metod === 'getMe') return Response.json({ ok: true, result: { id: 777, username: 'qur_uz_bot' } });
      if (metod === 'getChat') return Response.json({ ok: true, result: { id: -100123, title: 'QURAI', username: 'qurai_uz', description: 'eski', type: 'channel' } });
      if (metod === 'getChatMemberCount') return Response.json({ ok: true, result: 42 });
      if (metod === 'getChatMember') return Response.json({ ok: true, result: { status: 'administrator', ...huquq } });
      if (metod === 'sendMessage' || metod === 'sendPhoto') return Response.json({ ok: true, result: { message_id: 901 } });
      return Response.json({ ok: true, result: true });
    }
    const nom = url.pathname.split('/').at(-1)!;
    if (nom === 't2_boshqaruv_umumiy_v1') return superadmin ? Response.json({ foydalanuvchi: { jami: 1 } }) : new Response('{"message":"SUPERADMIN_KERAK"}', { status: 400 });
    if (nom === 't2_telegram_manzil_v1') return Response.json(ulangan ? { ok: true, yuborish: true, chat_id: OWNER_TG, til: 'uz' } : { ok: true, yuborish: false });
    if (nom === 't2_telegram_update_qabul_v1') return Response.json({ ok: true, yangi: true, limit: false });
    if (nom === 't2_telegram_aniqla_v1') return Response.json({ ok: true, ulangan: true, foydalanuvchi_id: OWNER });
    return Response.json({ message: 'yoq' }, { status: 404 });
  }));
  return tg;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const cookie = async (id = OWNER) => 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: id, kompaniyalar: [] }, 'k'.repeat(32));
const post = async (env: ReturnType<typeof mkEnv>, body: unknown, c?: string) => kanalPost({ request: new Request(SITE + '/api/telegram/kanal', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: SITE, ...(c ? { Cookie: c } : {}) }, body: JSON.stringify(body) }), env } as never);
const auditlar = (R2: ReturnType<typeof r2>) => [...R2.m.entries()].filter(([k]) => k.startsWith('tg-kanal/audit/')).map(([, v]) => JSON.parse(v) as { amal: string });
const cb = (data: string, id: number) => ({ update_id: id, callback_query: { id: 'c' + id, from: { id: OWNER_TG, language_code: 'uz' }, data, message: { message_id: 5, chat: { id: OWNER_TG, type: 'private' } } } });

describe('/api/telegram/kanal — auth', () => {
  it('sessiyasiz 401; superadmin emas 403 (hech narsa yuborilmaydi)', async () => {
    const tg = tarmoq({ superadmin: false }); const env = mkEnv();
    expect((await post(env, { amal: 'holat' })).status).toBe(401);
    expect((await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'x' }, await cookie(7))).status).toBe(403);
    expect(tg.filter((x) => x.metod !== 'getMe')).toEqual([]);
    expect(auditlar(env.R2_CANONICAL)).toEqual([]);
  });
  it('boshqa origin rad; sozlanmagan chat (ixtiyoriy id) ga yozib bo‘lmaydi', async () => {
    tarmoq(); const env = mkEnv();
    const r = await kanalPost({ request: new Request(SITE + '/api/telegram/kanal', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: await cookie() }, body: '{}' }), env } as never);
    expect(r.status).toBe(403);
    expect((await post(env, { amal: 'tavsif_ornat', chat: '-100999', tavsif: 'x' }, await cookie())).status).toBe(400);
    expect((await post(env, { amal: 'post_taklif', chat: '@boshqa_kanal', matn: 'x' }, await cookie())).status).toBe(400);
  });
});

describe('/api/telegram/kanal — holat va huquq', () => {
  it('holat: nom, a‘zolar, bot huquqlari; tokensiz', async () => {
    tarmoq(); const env = mkEnv();
    const r = await post(env, { amal: 'holat', chat: 'kanal' }, await cookie()); const t = await r.text();
    expect(t).not.toContain(TOKEN);
    expect(JSON.parse(t).chatlar[0]).toMatchObject({ ok: true, nom: 'QURAI', username: 'qurai_uz', azolar: 42, bot_holati: 'administrator',
      huquqlar: { can_post_messages: true, can_change_info: true, can_delete_messages: false, can_pin_messages: false } });
  });
  it('tavsif_ornat: can_change_info yo‘q → HUQUQ_YOQ, setChatDescription chaqirilmaydi', async () => {
    const tg = tarmoq({ huquq: { can_post_messages: true, can_change_info: false } }); const env = mkEnv();
    const r = await post(env, { amal: 'tavsif_ornat', chat: 'kanal', tavsif: 'Yangi tavsif' }, await cookie());
    expect(r.status).toBe(403); expect(await r.json()).toMatchObject({ code: 'HUQUQ_YOQ', huquq: 'can_change_info' });
    expect(tg.some((x) => x.metod === 'setChatDescription')).toBe(false);
  });
  it('tavsif_ornat: huquq bor → tavsif o‘rnatiladi, sarlavha faqat aniq berilsa; audit yoziladi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    expect((await post(env, { amal: 'tavsif_ornat', chat: 'kanal', tavsif: 'Yangi' }, await cookie())).status).toBe(200);
    expect(tg.some((x) => x.metod === 'setChatTitle')).toBe(false);
    expect(tg.find((x) => x.metod === 'setChatDescription')!.yuk).toMatchObject({ chat_id: '@qurai_uz', description: 'Yangi' });
    await post(env, { amal: 'tavsif_ornat', chat: 'kanal', sarlavha: 'QURAI' }, await cookie());
    expect(tg.some((x) => x.metod === 'setChatTitle')).toBe(true);
    expect(auditlar(env.R2_CANONICAL).map((a) => a.amal)).toEqual(['tavsif_ornat', 'tavsif_ornat']);
  });
  it('bot_profil_ornat: har til uchun setMy*; uz — standart ham', async () => {
    const tg = tarmoq(); const env = mkEnv();
    const r = await post(env, { amal: 'bot_profil_ornat', nom: 'QURAI', qisqa: { uz: 'a', ru: 'b', en: 'c' }, tavsif: { uz: 'd', ru: 'e', en: 'f' } }, await cookie());
    expect(r.status).toBe(200);
    expect(tg.filter((x) => x.metod === 'setMyShortDescription')).toHaveLength(4);
    expect(tg.filter((x) => x.metod === 'setMyDescription')).toHaveLength(4);
    expect(tg.some((x) => x.metod === 'setMyName')).toBe(true);
  });
});

describe('post oqimi: tasdiq tugmasisiz hech narsa chiqmaydi', () => {
  it('post_taklif: faqat egasining shaxsiy chatiga tugmalar bilan; kanalga YOZILMAYDI', async () => {
    const tg = tarmoq(); const env = mkEnv();
    const r = await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom QURAI' }, await cookie());
    expect(r.status).toBe(200);
    const yuborilgan = tg.filter((x) => x.metod === 'sendMessage' || x.metod === 'sendPhoto');
    expect(yuborilgan).toHaveLength(1);
    expect(yuborilgan[0].yuk.chat_id).toBe(OWNER_TG);
    const d = yuborilgan[0].yuk.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data as string);
    expect(d.map((x: string) => x.slice(0, 5))).toEqual(['kp:y:', 'kp:e:', 'kp:n:']);
    expect(auditlar(env.R2_CANONICAL).map((a) => a.amal)).toEqual(['post_taklif']);
  });
  it('rasm faqat o‘z saytimizdan (https)', async () => {
    tarmoq(); const env = mkEnv();
    expect((await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'x', rasm: 'https://evil.example/a.png' }, await cookie())).status).toBe(400);
    expect((await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'x', rasm: SITE + '/a.png' }, await cookie())).status).toBe(200);
  });
  it('egasi Telegram ulanmagan → 409', async () => {
    tarmoq({ ulangan: false }); const env = mkEnv();
    expect((await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'x' }, await cookie())).status).toBe(409);
  });
  it('Chiqarish bosilgach — kanalga yoziladi + audit; takror bosish qayta chiqarmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom QURAI' }, await cookie());
    const id = [...env.R2_CANONICAL.m.keys()].find((k) => k.startsWith('tg-kanal/qoralama/'))!.split('/').pop()!.replace('.json', '');
    tg.length = 0;
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 10))).toBe('kp_chiqarildi');
    const kanalga = tg.filter((x) => x.metod === 'sendMessage' && x.yuk.chat_id === '@qurai_uz');
    expect(kanalga).toHaveLength(1); expect(kanalga[0].yuk.text).toBe('Salom QURAI');
    expect(auditlar(env.R2_CANONICAL).map((a) => a.amal)).toEqual(expect.arrayContaining(['chiqarish_urinish', 'chiqarildi']));
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 11))).toBe('kp_yopiq');
    expect(tg.filter((x) => x.yuk.chat_id === '@qurai_uz')).toHaveLength(1);
  });
  it('Bekor / Tahrirlash — kanalga yozilmaydi; boshqa foydalanuvchi qoralamasini bosa olmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom' }, await cookie());
    const id = [...env.R2_CANONICAL.m.keys()].find((k) => k.startsWith('tg-kanal/qoralama/'))!.split('/').pop()!.replace('.json', '');
    expect(await updateIshla(env as never, cb(`kp:e:${id}`, 20))).toBe('kp_tahrir');
    const q = JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${id}.json`)!); q.egasi = 99; env.R2_CANONICAL.m.set(`tg-kanal/qoralama/${id}.json`, JSON.stringify(q));
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 21))).toBe('kp_yoq');
    q.egasi = OWNER; env.R2_CANONICAL.m.set(`tg-kanal/qoralama/${id}.json`, JSON.stringify(q));
    expect(await updateIshla(env as never, cb(`kp:n:${id}`, 22))).toBe('kp_bekor');
    expect(tg.some((x) => x.yuk.chat_id === '@qurai_uz')).toBe(false);
  });
  it('Tahrirlash javobi matnni yangilaydi, lekin chiqarmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Eski' }, await cookie());
    const id = [...env.R2_CANONICAL.m.keys()].find((k) => k.startsWith('tg-kanal/qoralama/'))!.split('/').pop()!.replace('.json', '');
    await updateIshla(env as never, cb(`kp:e:${id}`, 30));
    const u = { update_id: 31, message: { message_id: 9, text: 'Yangi matn', chat: { id: OWNER_TG, type: 'private' }, from: { id: OWNER_TG, language_code: 'uz' }, reply_to_message: { text: 'x\n#KP:' + id } } };
    expect(await updateIshla(env as never, u as never)).toBe('kp_tahrir_ok');
    expect(JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${id}.json`)!)).toMatchObject({ matn: 'Yangi matn', holat: 'kutilmoqda' });
    expect(tg.some((x) => x.yuk.chat_id === '@qurai_uz')).toBe(false);
  });
  it('Audit yozilmasa (R2 yo‘q) — chiqarilmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom' }, await cookie());
    const id = [...env.R2_CANONICAL.m.keys()].find((k) => k.startsWith('tg-kanal/qoralama/'))!.split('/').pop()!.replace('.json', '');
    const buzuq = { ...env, R2_CANONICAL: { get: env.R2_CANONICAL.get, put: async (k: string, v: string) => { if (k.includes('/audit/')) throw new Error('x'); env.R2_CANONICAL.m.set(k, v); } } };
    tg.length = 0;
    expect(await updateIshla(buzuq as never, cb(`kp:y:${id}`, 40))).toBe('kp_audit_xato');
    expect(tg.some((x) => x.yuk.chat_id === '@qurai_uz')).toBe(false);
  });
  it('post_ochir: egasiga tugma; deleteMessage faqat tasdiqdan keyin', async () => {
    const tg = tarmoq(); const env = mkEnv();
    expect((await post(env, { amal: 'post_ochir', chat: 'kanal', xabar_id: 55 }, await cookie())).status).toBe(200);
    expect(tg.some((x) => x.metod === 'deleteMessage')).toBe(false);
    const id = [...env.R2_CANONICAL.m.keys()].find((k) => k.startsWith('tg-kanal/qoralama/'))!.split('/').pop()!.replace('.json', '');
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 50))).toBe('kp_ochirildi');
    expect(tg.find((x) => x.metod === 'deleteMessage')!.yuk).toMatchObject({ chat_id: '@qurai_uz', message_id: 55 });
    expect(auditlar(env.R2_CANONICAL).map((a) => a.amal)).toContain('ochirildi');
  });
  it('superadmin bo‘lmay qolgan egasi tugmani bosa olmaydi', async () => {
    const tg = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom' }, await cookie());
    const id = [...env.R2_CANONICAL.m.keys()].find((k) => k.startsWith('tg-kanal/qoralama/'))!.split('/').pop()!.replace('.json', '');
    tarmoq({ superadmin: false });
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 60))).toBe('kp_ruxsatsiz');
    void tg;
  });
});
