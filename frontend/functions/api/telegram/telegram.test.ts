/* Telegram bot + Mini App poydevori (egasi 2026-10-28) — SINTETIK ma'lumot; tarmoq to'liq soxtalashtirilgan. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../../_shared/auth';
import { vakolatKeshTozala } from '../../_shared/role-authority';
import { initDataImzola, initDataTekshir, tgT, ulashKodXesh, ulashKodYarat, ulashKodYaroqli, webhookSirTekshir } from '../../_shared/telegram';
import { onRequestPost as webhook, updateIshla, buyruqAjrat } from './webhook';
import { onRequestPost as miniapp } from './miniapp';
import { onRequestGet as holatGet, onRequestPost as telegramPost } from './index';
import { onRequest as middleware } from '../_middleware';
import { onRequestPost as topshiriqPost } from '../topshiriq';
import { PERMISSIONS } from '../../../src/lib/company-authorization/effective-authorization';

const TOKEN = '123456789:AAFakeSinovTokenFakeSinovToken_abc';
const SIR = 'webhook-sir-sinov-0123456789';
const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32),
  TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SIR };
const SITE = 'https://smeta-tizimi.pages.dev';

type Chaqiruv = { rpc: string[]; yuk: Record<string, any>; tg: { metod: string; yuk: any; url: string }[] };
function tarmoq(rpc: Record<string, (b: any) => unknown>): Chaqiruv {
  const c: Chaqiruv = { rpc: [], yuk: {}, tg: [] };
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.host === 'api.telegram.org') {
      const metod = url.pathname.split('/').at(-1)!;
      c.tg.push({ metod, yuk: body, url: raw });
      if (metod === 'getWebhookInfo') return Response.json({ ok: true, result: { url: SITE + '/api/telegram/webhook', pending_update_count: 0 } });
      if (metod === 'getMe') return Response.json({ ok: true, result: { username: 'qur_uz_bot' } });
      return Response.json({ ok: true, result: true });
    }
    const nom = url.pathname.split('/').at(-1)!;
    c.rpc.push(nom); c.yuk[nom] = body;
    const h = rpc[nom];
    if (!h) return Response.json({ message: 'not found' }, { status: 404 });
    const r = h(body);
    return r instanceof Response ? r : Response.json(r);
  }));
  return c;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vakolatKeshTozala(); });

const hozir = () => Math.floor(Date.now() / 1000);
const userJson = (id = 5550001) => JSON.stringify({ id, first_name: 'Sinov', language_code: 'uz' });

describe('Mini App initData imzosi (server tomoni)', () => {
  it('to‘g‘ri imzo va yangi auth_date → qabul', async () => {
    const d = await initDataImzola({ auth_date: String(hozir()), query_id: 'AAE1', user: userJson() }, TOKEN);
    const r = await initDataTekshir(d, TOKEN);
    expect(r).toMatchObject({ ok: true, user: { id: 5550001 } });
  });
  it('muddati o‘tgan (1 soatdan eski) → rad', async () => {
    const d = await initDataImzola({ auth_date: String(hozir() - 3601), user: userJson() }, TOKEN);
    expect(await initDataTekshir(d, TOKEN)).toEqual({ ok: false, sabab: 'MUDDATI_OTGAN' });
  });
  it('kelajakdagi auth_date → rad', async () => {
    const d = await initDataImzola({ auth_date: String(hozir() + 3600), user: userJson() }, TOKEN);
    expect(await initDataTekshir(d, TOKEN)).toEqual({ ok: false, sabab: 'KELAJAK' });
  });
  it('o‘zgartirilgan user (boshqa id) → imzo noto‘g‘ri', async () => {
    const d = await initDataImzola({ auth_date: String(hozir()), user: userJson(5550001) }, TOKEN);
    const p = new URLSearchParams(d); p.set('user', userJson(5550002));
    expect(await initDataTekshir(p.toString(), TOKEN)).toEqual({ ok: false, sabab: 'IMZO_NOTOGRI' });
  });
  it('boshqa bot tokeni bilan imzolangan → rad; hash yo‘q → rad; bo‘sh → rad', async () => {
    const d = await initDataImzola({ auth_date: String(hozir()), user: userJson() }, '999:BoshqaBotTokenBoshqaBotToken___');
    expect((await initDataTekshir(d, TOKEN)).ok).toBe(false);
    const p = new URLSearchParams(d); p.delete('hash');
    expect(await initDataTekshir(p.toString(), TOKEN)).toEqual({ ok: false, sabab: 'HASH_YOQ' });
    expect(await initDataTekshir('', TOKEN)).toEqual({ ok: false, sabab: 'BOSH' });
  });
  it('user maydoni yo‘q → rad', async () => {
    const d = await initDataImzola({ auth_date: String(hozir()) }, TOKEN);
    expect(await initDataTekshir(d, TOKEN)).toEqual({ ok: false, sabab: 'USER_YOQ' });
  });
});

describe('Webhook sirli sarlavha', () => {
  const req = (h?: string) => new Request(SITE + '/api/telegram/webhook', { method: 'POST', headers: h ? { 'X-Telegram-Bot-Api-Secret-Token': h } : {}, body: '{}' });
  it('sir sozlanmagan → 503 (fail closed), noto‘g‘ri → 403, to‘g‘ri → ok', async () => {
    expect(webhookSirTekshir(req(SIR), undefined)).toBe('sozlanmagan');
    expect(webhookSirTekshir(req('xato'), SIR)).toBe('rad');
    expect(webhookSirTekshir(req(), SIR)).toBe('rad');
    expect(webhookSirTekshir(req(SIR), SIR)).toBe('ok');
    const c = tarmoq({});
    const r503 = await webhook({ request: req(SIR), env: { ...ENV, TELEGRAM_WEBHOOK_SECRET: '' } } as never);
    expect(r503.status).toBe(503);
    const r403 = await webhook({ request: req('xato'), env: ENV } as never);
    expect(r403.status).toBe(403);
    expect(c.rpc).toEqual([]); // rad etilgan so'rov bazaga yetmaydi
  });
  it('to‘g‘ri sir → darhol 200, ishlov waitUntil da', async () => {
    const c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true, limit: false }), t2_telegram_aniqla_v1: () => ({ ok: true, ulangan: false }) });
    const kutish: Promise<unknown>[] = [];
    const request = new Request(SITE + '/api/telegram/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': SIR },
      body: JSON.stringify({ update_id: 77, message: { text: '/men', chat: { id: 5550001, type: 'private' }, from: { id: 5550001 } } }) });
    const r = await webhook({ request, env: ENV, waitUntil: (p: Promise<unknown>) => kutish.push(p) } as never);
    expect(r.status).toBe(200);
    await Promise.all(kutish);
    expect(c.tg.map((x) => x.metod)).toEqual(['sendMessage']);
    expect(c.tg[0].yuk.text).toContain('ulanmagansiz'); // ulanmagan foydalanuvchiga faqat «ulang»
  });
});

const upd = (text: string, id = 1, from = 5550001, type = 'private') => ({ update_id: id, message: { text, chat: { id: from, type }, from: { id: from, language_code: 'uz' } } });

describe('Bot buyruqlari va ulash', () => {
  it('buyruq ajratish (@bot qo‘shimchasi bilan ham)', () => {
    expect(buyruqAjrat('/start abc')).toEqual({ buyruq: 'start', arg: 'abc' });
    expect(buyruqAjrat('/men@qur_uz_bot')).toEqual({ buyruq: 'men', arg: '' });
    expect(buyruqAjrat('salom')).toBeNull();
  });
  it('ulash kodi: 32 belgi, t.me start ga mos; bazaga faqat xesh boradi', async () => {
    const kod = ulashKodYarat();
    expect(kod).toMatch(/^[A-Za-z0-9_-]{32}$/); expect(ulashKodYaroqli(kod)).toBe(true);
    expect(ulashKodYarat()).not.toBe(kod);
    const c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }), t2_telegram_ulash_v1: () => ({ ok: true, foydalanuvchi_id: 7, ism: 'Sinov' }) });
    expect(await updateIshla(ENV, upd('/start ' + kod))).toBe('ulandi');
    expect(c.yuk.t2_telegram_ulash_v1.p_kod_xesh).toBe(await ulashKodXesh(kod));
    expect(JSON.stringify(c.yuk.t2_telegram_ulash_v1)).not.toContain(kod);
    expect(c.yuk.t2_telegram_ulash_v1).toMatchObject({ p_telegram_user_id: 5550001, p_chat_id: 5550001, p_til: 'uz' });
    expect(c.tg[0].yuk.reply_markup.inline_keyboard[0][0].web_app.url).toBe(SITE + '/tg');
  });
  it('ishlatilgan / muddati o‘tgan / boshqa hisobdagi kod — tushunarli rad, ulanmaydi', async () => {
    for (const [code, soz] of [['KOD_ISHLATILGAN', 'allaqachon ishlatilgan'], ['KOD_MUDDATI_OTGAN', 'muddati tugagan'], ['TELEGRAM_BOSHQA_HISOBDA', '/chiqish']] as const) {
      const c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }), t2_telegram_ulash_v1: () => ({ ok: false, code }) });
      expect(await updateIshla(ENV, upd('/start ' + ulashKodYarat()))).toBe('ulash_rad:' + code);
      expect(c.tg[0].yuk.text).toContain(soz);
    }
  });
  it('yaroqsiz format kod bazaga yuborilmaydi', async () => {
    const c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }) });
    expect(await updateIshla(ENV, upd('/start x'))).toBe('kod_format');
    expect(c.rpc).not.toContain('t2_telegram_ulash_v1');
  });
  it('takror update_id — hech narsa yuborilmaydi (idempotent); limit — jim', async () => {
    let c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: false }) });
    expect(await updateIshla(ENV, upd('/men'))).toBe('takror'); expect(c.tg).toEqual([]);
    c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true, limit: true }) });
    expect(await updateIshla(ENV, upd('/men'))).toBe('limit'); expect(c.tg).toEqual([]);
  });
  it('guruh chati e’tiborsiz (shaxsiy ma’lumot guruhga chiqmaydi)', async () => {
    const c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }) });
    expect(await updateIshla(ENV, upd('/men', 2, 5550001, 'group'))).toBe('etibor_yoq'); expect(c.tg).toEqual([]);
  });
  it('/men — bog‘langan foydalanuvchi (DB) sifatida t2_men_v1; Telegram id actor emas', async () => {
    const c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }), t2_telegram_aniqla_v1: () => ({ ok: true, ulangan: true, foydalanuvchi_id: 7 }),
      t2_men_v1: () => ({ ok: true, foydalanuvchi: { ism: 'Sinov PTO' }, platform_role: 'none', azoliklar: [{ nom: 'Sinov MChJ', rol: 'pto' }] }) });
    expect(await updateIshla(ENV, upd('/men'))).toBe('men');
    expect(c.yuk.t2_men_v1).toEqual({ p_actor_id: 7 });
    expect(c.tg[0].yuk.text).toContain('Sinov MChJ — PTO');
    expect(c.tg[0].yuk.parse_mode).toBeUndefined(); // oddiy matn — in'ektsiya yo'q
  });
  it('/chiqish — bot tomondan uzish', async () => {
    const c = tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }), t2_telegram_aniqla_v1: () => ({ ok: true, ulangan: true, foydalanuvchi_id: 7 }),
      t2_telegram_uz_v1: () => ({ ok: true, uzildi: true }) });
    expect(await updateIshla(ENV, upd('/chiqish'))).toBe('uzildi');
    expect(c.yuk.t2_telegram_uz_v1).toMatchObject({ p_actor_id: null, p_telegram_user_id: 5550001, p_manba: 'bot' });
  });
  it('bot matnlari tilga mos (ru/en lug‘atdan)', () => {
    expect(tgT('Tizimni ochish', 'ru')).toBe('Открыть систему');
    expect(tgT('Siz: {ism}', 'en', { ism: 'A' })).toBe('You: A');
    expect(tgT('Tizimni ochish', 'uz')).toBe('Tizimni ochish');
  });
});

describe('Mini App kirish → oddiy sessiya → mavjud ruxsat qatlami', () => {
  const kirReq = (initData: string, extra: Record<string, string> = {}) => new Request(SITE + '/api/telegram/miniapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE, ...extra }, body: JSON.stringify({ initData }) });

  it('ulanmagan Telegram → 403, cookie yo‘q', async () => {
    tarmoq({ t2_telegram_kirish_v1: () => ({ ok: false, code: 'ULANMAGAN' }) });
    const d = await initDataImzola({ auth_date: String(hozir()), user: userJson() }, TOKEN);
    const r = await miniapp({ request: kirReq(d), env: ENV } as never);
    expect(r.status).toBe(403); expect(r.headers.get('Set-Cookie')).toBeNull();
  });
  it('soxta initData → 401, bazaga so‘rov yo‘q', async () => {
    const c = tarmoq({});
    const d = await initDataImzola({ auth_date: String(hozir()), user: userJson() }, '999:BoshqaBotTokenBoshqaBotToken___');
    const r = await miniapp({ request: kirReq(d), env: ENV } as never);
    expect(r.status).toBe(401); expect(c.rpc).toEqual([]);
  });
  it('cross-site so‘rov rad', async () => {
    tarmoq({});
    const r = await miniapp({ request: kirReq('x', { Origin: 'https://yomon.example' }), env: ENV } as never);
    expect(r.status).toBe(403);
  });
  it('ruxsat o‘tkazilishi: cookie DB dagi foydalanuvchi uchun; keyingi so‘rovda t2_men_v1 rad etgan ruxsat rad', async () => {
    tarmoq({ t2_telegram_kirish_v1: (b) => { expect(b.p_telegram_user_id).toBe(5550001); return { ok: true, foydalanuvchi_id: 7, login: 'pto@sinov.invalid', rol: 'pto', azoliklar: [{ kompaniya_id: 17, rol: 'pto' }] }; } });
    const d = await initDataImzola({ auth_date: String(hozir()), user: userJson() }, TOKEN);
    const r = await miniapp({ request: kirReq(d), env: ENV } as never);
    expect(r.status).toBe(200);
    const cookie = r.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/^sess=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\//);
    const body = await r.text(); expect(body).not.toContain(TOKEN);
    // Shu cookie bilan F2 tasdiqlash: DB vakolatida f2.approve yo'q → middleware 403, domen chaqirilmaydi.
    const all = PERMISSIONS.filter((p) => !p.startsWith('control.global'));
    tarmoq({ t2_akt: () => [{ kompaniya_id: 17 }], t2_men_v1: (b) => { expect(b.p_actor_id).toBe(7); return { ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
      context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto', permissions: all.filter((p) => p !== 'f2.approve'), explicit_denials: ['f2.approve'] }] }; } });
    const next = vi.fn(async () => Response.json({ ok: true }));
    const rad = await middleware({ request: new Request(SITE + '/api/sb-yoz', { method: 'POST', headers: { Cookie: cookie.split(';')[0], 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal: 'akt_tasdiqlash', akt_id: 9, kompaniya_id: 17 }) }), env: ENV, data: {}, next } as never);
    expect(rad.status).toBe(403); expect(next).not.toHaveBeenCalled();
    // Ruxsat bor amal (F2 tayyorlash) — o'tadi.
    vakolatKeshTozala();
    const ok = await middleware({ request: new Request(SITE + '/api/sb-yoz', { method: 'POST', headers: { Cookie: cookie.split(';')[0], 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal: 'akt_lifecycle_transition_v1', to_status: 'submitted', kompaniya_id: 17 }) }), env: ENV, data: {}, next } as never);
    expect(ok.status).toBe(200); expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('/api/telegram (web: ulash, uzish, sozlama; superadmin)', () => {
  const sessCookie = async (id = 7) => 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: id, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, ENV.SESSIYA_KALIT);
  const men = () => ({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto', permissions: ['company.read'], explicit_denials: [] }] });
  const post = async (body: unknown, cookie?: string) => telegramPost({ request: new Request(SITE + '/api/telegram', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }), env: ENV } as never);

  it('sessiyasiz → 401', async () => {
    tarmoq({});
    expect((await post({ amal: 'kod' })).status).toBe(401);
    expect((await holatGet({ request: new Request(SITE + '/api/telegram'), env: ENV } as never)).status).toBe(401);
  });
  it('kod: deep link qaytadi, bazaga faqat xesh; actor sessiyadan', async () => {
    const c = tarmoq({ t2_men_v1: men, t2_telegram_kod_yarat_v1: () => ({ ok: true, tugaydi: '2026-10-29T10:10:00Z' }) });
    const r = await post({ amal: 'kod', p_actor_id: 999 }, await sessCookie());
    const j = await r.json() as { havola: string };
    expect(r.status).toBe(200);
    const kod = new URL(j.havola).searchParams.get('start')!;
    expect(j.havola).toMatch(/^https:\/\/t\.me\/qur_uz_bot\?start=/);
    expect(c.yuk.t2_telegram_kod_yarat_v1).toEqual({ p_actor_id: 7, p_kod_xesh: await ulashKodXesh(kod) });
  });
  it('uz: web tomondan uzish + botga xabar', async () => {
    const c = tarmoq({ t2_men_v1: men, t2_telegram_uz_v1: () => ({ ok: true, uzildi: true, chat_id: 5550001, til: 'ru' }) });
    const r = await post({ amal: 'uz' }, await sessCookie());
    expect(r.status).toBe(200);
    expect(c.yuk.t2_telegram_uz_v1).toMatchObject({ p_actor_id: 7, p_telegram_user_id: null, p_manba: 'web' });
    expect(c.tg[0]).toMatchObject({ metod: 'sendMessage', yuk: { chat_id: 5550001 } });
  });
  it('admin_holat — superadmin emas → 403; superadmin → holat (tokensiz)', async () => {
    tarmoq({ t2_boshqaruv_umumiy_v1: () => new Response('{"message":"SUPERADMIN_KERAK"}', { status: 400 }) });
    expect((await post({ amal: 'admin_holat' }, await sessCookie())).status).toBe(403);
    const c = tarmoq({ t2_boshqaruv_umumiy_v1: () => ({ foydalanuvchi: { jami: 1 } }), t2_telegram_statistika_v1: () => ({ ok: true, ulangan: 3, update_24s: 10, miniapp_24s: 2 }) });
    const r = await post({ amal: 'admin_holat' }, await sessCookie(1));
    const txt = await r.text();
    expect(r.status).toBe(200); expect(txt).not.toContain(TOKEN); expect(txt).not.toContain(SIR);
    expect(JSON.parse(txt)).toMatchObject({ ok: true, bot: 'qur_uz_bot', webhook: { ornatilgan: true }, statistika: { ulangan: 3 } });
    expect(c.tg.map((x) => x.metod).sort()).toEqual(['getMe', 'getWebhookInfo']);
  });
  it('admin_ornat — setWebhook secret_token bilan, menyu tugmasi Mini App ga', async () => {
    const c = tarmoq({ t2_boshqaruv_umumiy_v1: () => ({ foydalanuvchi: { jami: 1 } }) });
    const r = await post({ amal: 'admin_ornat' }, await sessCookie(1));
    expect(r.status).toBe(200);
    const w = c.tg.find((x) => x.metod === 'setWebhook')!;
    expect(w.yuk).toMatchObject({ url: SITE + '/api/telegram/webhook', secret_token: SIR });
    expect(c.tg.find((x) => x.metod === 'setChatMenuButton')!.yuk.menu_button).toMatchObject({ type: 'web_app', web_app: { url: SITE + '/tg' } });
    expect(c.tg.filter((x) => x.metod === 'setMyCommands')).toHaveLength(3);
    expect(await r.text()).not.toContain(TOKEN);
  });
});

describe('Bildirishnoma: topshiriq berilganda ijrochiga (opt-in)', () => {
  const ber = async (cookie: string) => {
    const kutish: Promise<unknown>[] = [];
    const r = await topshiriqPost({ request: new Request(SITE + '/api/topshiriq', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal: 'ber', kompaniya_id: 17, operation_id: crypto.randomUUID(), sarlavha: 'Beton qabul', ijrochi_foydalanuvchi_id: 8 }) }),
      env: ENV, data: {}, waitUntil: (p: Promise<unknown>) => kutish.push(p) } as never);
    await Promise.all(kutish);
    return r;
  };
  it('rozi bo‘lgan ijrochiga xabar ketadi; rozi bo‘lmaganga ketmaydi', async () => {
    const cookie = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7, kompaniyalar: [] }, ENV.SESSIYA_KALIT);
    let c = tarmoq({ t2_topshiriq_ber_v1: () => ({ ok: true, topshiriq_id: 1 }), t2_telegram_manzil_v1: () => ({ ok: true, yuborish: true, chat_id: 5550008, til: 'en' }) });
    expect((await ber(cookie)).status).toBe(200);
    expect(c.yuk.t2_telegram_manzil_v1).toEqual({ p_foydalanuvchi_id: 8, p_tur: 'topshiriq' });
    expect(c.tg[0].yuk).toMatchObject({ chat_id: 5550008, text: 'New task for you: Beton qabul' });
    c = tarmoq({ t2_topshiriq_ber_v1: () => ({ ok: true, topshiriq_id: 2 }), t2_telegram_manzil_v1: () => ({ ok: true, yuborish: false }) });
    expect((await ber(cookie)).status).toBe(200); expect(c.tg).toEqual([]);
  });
  it('RPC rad etsa (ruxsat yo‘q) — xabar yo‘q', async () => {
    const cookie = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7, kompaniyalar: [] }, ENV.SESSIYA_KALIT);
    const c = tarmoq({ t2_topshiriq_ber_v1: () => Response.json({ code: '42501', message: 'PERMISSION_DENIED' }, { status: 403 }) });
    expect((await ber(cookie)).status).toBe(403);
    expect(c.rpc).not.toContain('t2_telegram_manzil_v1'); expect(c.tg).toEqual([]);
  });
});

describe('Maxfiylik', () => {
  it('token va xabar matni console ga yozilmaydi', async () => {
    const log = vi.spyOn(console, 'log'); const err = vi.spyOn(console, 'error'); const warn = vi.spyOn(console, 'warn');
    tarmoq({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }), t2_telegram_aniqla_v1: () => ({ ok: true, ulangan: false }) });
    await updateIshla(ENV, upd('maxfiy matn 12345'));
    const hammasi = [...log.mock.calls, ...err.mock.calls, ...warn.mock.calls].flat().map(String).join(' ');
    expect(hammasi).not.toContain(TOKEN); expect(hammasi).not.toContain('maxfiy matn');
  });
});
