/** USERNAME-V1 — bot: /start da Telegram username taklifi (tasdiq bilan), /username, /men, /taklif. SINTETIK; tarmoq soxta. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vakolatKeshTozala } from '../../_shared/role-authority';
import { updateIshla } from './webhook';

const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32), TELEGRAM_BOT_TOKEN: '123456789:AAFakeSinovTokenFakeSinovToken_abc', TELEGRAM_WEBHOOK_SECRET: 'sir-sinov-0123456789' };
type C = { rpc: string[]; yuk: Record<string, any>; tg: { metod: string; yuk: any }[] };
function tarmoq(rpc: Record<string, (b: any) => unknown>): C {
  const c: C = { rpc: [], yuk: {}, tg: [] };
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw); const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.host === 'api.telegram.org') { c.tg.push({ metod: url.pathname.split('/').at(-1)!, yuk: body }); return Response.json({ ok: true, result: true }); }
    const nom = url.pathname.split('/').at(-1)!; c.rpc.push(nom); c.yuk[nom] = body;
    const h = rpc[nom]; if (!h) return Response.json({ message: 'not found' }, { status: 404 });
    return Response.json(h(body));
  }));
  return c;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vakolatKeshTozala(); });
const base = { t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true }), t2_telegram_aniqla_v1: () => ({ ok: true, ulangan: true, foydalanuvchi_id: 7 }) };
const upd = (text: string, username?: string, id = 1) => ({ update_id: id, message: { text, chat: { id: 5550001, type: 'private' }, from: { id: 5550001, language_code: 'uz', ...(username ? { username } : {}) } } });
const cb = (data: string, id = 2) => ({ update_id: id, callback_query: { id: 'cb1', from: { id: 5550001, language_code: 'uz' }, data, message: { message_id: 5, chat: { id: 5550001, type: 'private' } } } });

describe('Bot — @username', () => {
  it('/start: QURAI username bo‘sh + Telegram username mos → tasdiq tugmalari (jimgina yozilmaydi)', async () => {
    const c = tarmoq({ ...base, t2_men_v1: () => ({ ok: true, foydalanuvchi: { ism: 'Sinov' }, azoliklar: [] }), t2_username_ol_v1: () => ({ ok: true, username: null }) });
    await updateIshla(ENV, upd('/start', 'Sinov_Tg'));
    const taklif = c.tg.find((x) => JSON.stringify(x.yuk).includes('usr:ha:'));
    expect(taklif).toBeTruthy();
    expect(taklif!.yuk.reply_markup.inline_keyboard[0][0].callback_data).toBe('usr:ha:sinov_tg');
    expect(c.rpc).not.toContain('t2_username_belgila_v1');
  });

  it('/start: username allaqachon bor yoki Telegram username mos emas → taklif yo‘q', async () => {
    let c = tarmoq({ ...base, t2_men_v1: () => ({ ok: true, foydalanuvchi: {}, azoliklar: [] }), t2_username_ol_v1: () => ({ ok: true, username: 'bor_user' }) });
    await updateIshla(ENV, upd('/start', 'sinov_tg'));
    expect(JSON.stringify(c.tg)).not.toContain('usr:ha:');
    c = tarmoq({ ...base, t2_men_v1: () => ({ ok: true, foydalanuvchi: {}, azoliklar: [] }), t2_username_ol_v1: () => ({ ok: true, username: null }) });
    await updateIshla(ENV, upd('/start', 'ab', 3));
    expect(JSON.stringify(c.tg)).not.toContain('usr:ha:');
  });

  it('tugma «Ha» → RPC (actor — bog‘langan hisob), tugmalar olib tashlanadi', async () => {
    const c = tarmoq({ ...base, t2_username_belgila_v1: () => ({ ok: true, username: 'sinov_tg' }) });
    expect(await updateIshla(ENV, cb('usr:ha:sinov_tg'))).toBe('cb:usr_ha');
    expect(c.yuk.t2_username_belgila_v1).toMatchObject({ p_actor_id: 7, p_username: 'sinov_tg' });
    expect(c.tg.some((x) => x.metod === 'editMessageReplyMarkup')).toBe(true);
    expect(c.tg.some((x) => String(x.yuk.text ?? '').includes('@sinov_tg'))).toBe(true);
  });

  it('tugma: yaroqsiz nom RPC ga yetmaydi; «Yo‘q» hech narsa yozmaydi', async () => {
    const c = tarmoq({ ...base, t2_username_belgila_v1: () => ({ ok: true }) });
    expect(await updateIshla(ENV, cb('usr:ha:admin'))).toBe('cb:usr_notogri');
    expect(await updateIshla(ENV, cb('usr:yoq', 3))).toBe('cb:usr_yoq');
    expect(c.rpc).not.toContain('t2_username_belgila_v1');
  });

  it('/username: ko‘rsatadi; /username nom — o‘rnatadi; band → xabar', async () => {
    let c = tarmoq({ ...base, t2_username_ol_v1: () => ({ ok: true, username: 'meniki_user' }) });
    await updateIshla(ENV, upd('/username'));
    expect(c.tg[0].yuk.text).toContain('@meniki_user');
    c = tarmoq({ ...base, t2_username_belgila_v1: () => ({ ok: false, code: 'USERNAME_BAND' }) });
    await updateIshla(ENV, upd('/username @Band_User', undefined, 4));
    expect(c.yuk.t2_username_belgila_v1.p_username).toBe('band_user');
    expect(c.tg[0].yuk.text).toContain('band');
  });

  it('/men: @username ko‘rsatiladi', async () => {
    const c = tarmoq({ ...base, t2_men_v1: () => ({ ok: true, foydalanuvchi: { ism: 'Sinov' }, azoliklar: [] }), t2_username_ol_v1: () => ({ ok: true, username: 'meniki_user' }) });
    await updateIshla(ENV, upd('/men'));
    expect(c.tg[0].yuk.text).toContain('@meniki_user');
  });

  it('/taklif @username rol: direktor kompaniyasi bo‘yicha RPC; telefon bo‘sh joylari saqlanadi', async () => {
    const men = { ok: true, azoliklar: [{ kompaniya_id: 17, nom: 'Sinov MChJ', kod: 'SINOV', is_director: true, faol: true }, { kompaniya_id: 18, nom: 'Boshqa', kod: 'BOSH', is_director: false, faol: true }] };
    const c = tarmoq({ ...base, t2_men_v1: () => men, t2_kompaniya_taklif_yubor_v1: () => ({ ok: true, profil: { ism: 'Sinov Odam', username: 'sinov_odam' } }) });
    await updateIshla(ENV, upd('/taklif +998 90 123 45 67 prorab'));
    expect(c.yuk.t2_kompaniya_taklif_yubor_v1).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17, p_qiymat: '+998 90 123 45 67', p_rol: 'prorab' });
    expect(c.tg[0].yuk.text).toContain('@sinov_odam');
  });

  it('/taklif: noto‘g‘ri shakl yoki direktor emas → RPC yo‘q', async () => {
    let c = tarmoq({ ...base, t2_men_v1: () => ({ ok: true, azoliklar: [{ kompaniya_id: 18, kod: 'BOSH', is_director: false, faol: true }] }), t2_kompaniya_taklif_yubor_v1: () => ({ ok: true }) });
    await updateIshla(ENV, upd('/taklif @sinov_odam prorab'));
    expect(c.rpc).not.toContain('t2_kompaniya_taklif_yubor_v1');
    c = tarmoq({ ...base, t2_men_v1: () => ({ ok: true, azoliklar: [] }) });
    await updateIshla(ENV, upd('/taklif salom', undefined, 5));
    expect(c.tg[0].yuk.text).toContain('Qaysi rolda');   // rolsiz — rol so'raladi (kutilgan niyat); RPC hali yo'q
    expect(c.rpc).not.toContain('t2_kompaniya_taklif_yubor_v1');
  });
});