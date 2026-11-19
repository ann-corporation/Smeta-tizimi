// @vitest-environment node
/* «To'liq bot» webhook yo'naltirishi: doimiy menyu matni, chuqur havola, callback, ulanmagan foydalanuvchi. SINTETIK; Telegram soxta. */
import { beforeEach, expect, it, vi } from 'vitest';
import { limitTozala } from '../../_shared/telegram-bot';

const net = vi.hoisted(() => ({ amal: vi.fn() }));
vi.mock('../../_shared/telegram-amal', () => ({ botChaqiruv: net.amal, botChaqiruvFayl: vi.fn() }));
import { updateIshla } from './webhook';

const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32), TELEGRAM_BOT_TOKEN: '123456789:AAFakeSinovTokenFakeSinovToken_abc', TELEGRAM_SAYT_URL: 'https://qurai.uz' };
const TG = 5550001, UID = 7;
let ulangan = true; let tg: { metod: string; yuk: any }[] = []; let uid = 1000;
const msg = (text: string) => ({ update_id: ++uid, message: { text, chat: { id: TG, type: 'private' }, from: { id: TG, language_code: 'uz' } } });
const cbq = (data: string) => ({ update_id: ++uid, callback_query: { id: 'c', from: { id: TG, language_code: 'uz' }, data, message: { message_id: 9, chat: { id: TG, type: 'private' } } } });
const yuborilgan = () => tg.filter((x) => x.metod === 'sendMessage').map((x) => String(x.yuk.text));

beforeEach(() => {
  ulangan = true; tg = []; net.amal.mockReset(); limitTozala();
  net.amal.mockImplementation(async (_e: unknown, _u: number, c: { api: string; json?: any }) => {
    if (c.api === 'sb') return { status: 200, body: { ok: true, qatorlar: c.json.jadval === 't2_obyekt' ? [{ id: 79, nom: 'Sinov bog‘i', kompaniya_id: 17 }] : [] } };
    if (c.api === 'obyekt-tugun-summa') return { status: 200, body: { ok: true, ustama: 'yoq', obyekt: [[100, null, 90], [null, null, null], [null, null, null]], tugunlar: [] } };
    return { status: 404, body: null };
  });
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    if (url.host === 'api.telegram.org') { tg.push({ metod: url.pathname.split('/').at(-1)!, yuk: JSON.parse(String(init?.body ?? '{}')) }); return Response.json({ ok: true, result: true }); }
    const nom = url.pathname.split('/').at(-1);
    if (nom === 't2_telegram_update_qabul_v1') return Response.json({ ok: true, yangi: true, limit: false });
    if (nom === 't2_telegram_aniqla_v1') return Response.json({ ok: true, ulangan, foydalanuvchi_id: ulangan ? UID : null });
    if (nom === 't2_men_v1') return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { ism: 'Sinov' }, azoliklar: [{ kompaniya_id: 17, nom: 'Sinov MChJ', rol: 'pto', faol: true }] });
    return Response.json({ message: 'yo‘q' }, { status: 404 });
  }));
});

it('/start — doimiy menyu klaviaturasi o‘rnatiladi; menyu tugmasi matni obyektlar ro‘yxatini ochadi (ombor buyrug‘iga ketmaydi)', async () => {
  expect(await updateIshla(ENV, msg('/start'))).toBe('salom');
  expect(tg.some((x) => x.metod === 'sendMessage' && x.yuk.reply_markup?.is_persistent === true && x.yuk.reply_markup.keyboard.flat().some((t: { text: string }) => t.text === 'Fakt kiritish'))).toBe(true);
  tg = [];
  expect(await updateIshla(ENV, msg('Obyektlar'))).toBe('g_menyu_obyektlar');
  expect(yuborilgan()[0]).toContain('Menyu › Obyektlar');
});

it('chuqur havola /start o_79 — obyekt kartasi; ulash kodi yo‘li ishga tushmaydi', async () => {
  expect(await updateIshla(ENV, msg('/start o_79'))).toBe('chuqur_havola');
  expect(yuborilgan()[0]).toContain('#79 Sinov bog‘i'); expect(yuborilgan()[0]).toContain('Smeta: QQS bilan 100 · ustamali — · ustamasiz 90');
});

it('g: callback — menyu; tugmalar eski xabardan olib tashlanadi', async () => {
  expect(await updateIshla(ENV, cbq('g:m'))).toBe('cb:g_menyu');
  expect(tg.some((x) => x.metod === 'editMessageReplyMarkup')).toBe(true);
});

it('ulanmagan foydalanuvchi g: tugmasini bosa olmaydi — hech qaysi shlyuz chaqirilmaydi', async () => {
  ulangan = false;
  expect(await updateIshla(ENV, cbq('g:k:79'))).toBe('cb_ulanmagan');
  expect(net.amal).not.toHaveBeenCalled();
});
