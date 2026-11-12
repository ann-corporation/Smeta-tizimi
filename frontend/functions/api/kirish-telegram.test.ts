/* /api/kirish-telegram + bot oqimi (webhook) — SINTETIK ma'lumot; tarmoq to'liq soxtalashtirilgan. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tekshir } from '../_shared/auth';
import { xesh } from '../_shared/kirish-emailsiz';
import { updateIshla } from './telegram/webhook';
import { onRequestGet, onRequestPost } from './kirish-telegram';

const KALIT = 'k'.repeat(32);
const SITE = 'https://t.example';
const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: KALIT, KIRISH_TELEGRAM_YOQILGAN: '1',
  TELEGRAM_BOT_TOKEN: '123456789:AAFakeSinovTokenFakeSinovToken_abc', TELEGRAM_BOT_USERNAME: 'sinov_bot' };

type Yozuv = { nom: string; yuk: any };
function tarmoq(rpc: Record<string, (b: any) => unknown>) {
  const rpcLog: Yozuv[] = []; const tg: Yozuv[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw); const yuk = init?.body ? JSON.parse(String(init.body)) : {};
    const nom = url.pathname.split('/').at(-1)!;
    if (url.host === 'api.telegram.org') { tg.push({ nom, yuk }); return Response.json({ ok: true, result: true }); }
    rpcLog.push({ nom, yuk });
    const h = rpc[nom]; if (!h) return Response.json({ message: 'not found' }, { status: 404 });
    const r = h(yuk); return r instanceof Response ? r : Response.json(r);
  }));
  return { rpcLog, tg };
}
afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown, o: { env?: Record<string, unknown>; headers?: Record<string, string> } = {}) =>
  onRequestPost({ request: new Request(SITE + '/api/kirish-telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(o.headers ?? {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env: o.env ?? ENV } as never);

describe('/api/kirish-telegram — rad yo‘llari', () => {
  it('boshqa sayt → 403; sozlama o‘chiq → 503; bot sozlanmagan → 503; noto‘g‘ri tana → 400; GET yoqilganlik', async () => {
    const { rpcLog } = tarmoq({});
    expect((await post({ amal: 'boshla' }, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post({ amal: 'boshla' }, { env: { ...ENV, KIRISH_TELEGRAM_YOQILGAN: undefined } })).status).toBe(503);
    expect((await post({ amal: 'boshla' }, { env: { ...ENV, TELEGRAM_BOT_TOKEN: undefined } })).status).toBe(503);
    expect((await post('{x')).status).toBe(400);
    expect((await post({ amal: 'nomalum' })).status).toBe(400);
    expect(await (await onRequestGet({ env: ENV } as never)).json()).toEqual({ ok: true, yoqilgan: true });
    expect(await (await onRequestGet({ env: { ...ENV, KIRISH_TELEGRAM_YOQILGAN: '0' } } as never)).json()).toEqual({ ok: true, yoqilgan: false });
    expect(rpcLog).toHaveLength(0);
  });
});

describe('boshla → holat', () => {
  const boshla = async (log: ReturnType<typeof tarmoq>) => {
    const r = await post({ amal: 'boshla', ism: 'Sinov Odam' });
    const j = await r.json() as { nonce: string; sir: string; belgi: string; havola: string };
    return { r, j, yuk: log.rpcLog.find((l) => l.nom === 't2_tg_kirish_boshla_v1')!.yuk };
  };
  it('nonce va brauzer siri javobda; bazaga FAQAT xesh; havola — deep link (sir havolada YO‘Q)', async () => {
    const log = tarmoq({ t2_tg_kirish_boshla_v1: () => ({ ok: true, tugaydi: '2026-11-13T10:05:00Z' }) });
    const { r, j, yuk } = await boshla(log);
    expect(r.status).toBe(200);
    expect(j.nonce).toMatch(/^kirish_[A-Za-z0-9_-]{32}$/);
    expect(j.havola).toBe(`https://t.me/sinov_bot?start=${j.nonce}`);
    expect(j.havola).not.toContain(j.sir);
    expect(j.belgi).toMatch(/^\d{4}$/);
    expect(yuk.p_nonce_xesh).toBe(await xesh('tg-nonce', j.nonce, KALIT));
    expect(yuk.p_brauzer_xesh).toBe(await xesh('tg-brauzer', j.sir, KALIT));
    expect(yuk.p_nonce_xesh).not.toBe(yuk.p_brauzer_xesh);
    const xom = JSON.stringify(yuk);
    expect(xom).not.toContain(j.nonce); expect(xom).not.toContain(j.sir);
  });
  it('limit → 429', async () => {
    tarmoq({ t2_tg_kirish_boshla_v1: () => ({ ok: false, code: 'LIMIT' }) });
    expect((await post({ amal: 'boshla' })).status).toBe(429);
  });
  const NONCE = 'kirish_' + 'N'.repeat(32), SIR = 'S'.repeat(43);
  it('holat: noto‘g‘ri format → 404 (bazaga yetmaydi)', async () => {
    const log = tarmoq({});
    for (const b of [{ nonce: 'x', sir: SIR }, { nonce: NONCE, sir: 'qisqa' }, { nonce: 'N'.repeat(39), sir: SIR }, {}]) expect((await post({ amal: 'holat', ...b })).status).toBe(404);
    expect(log.rpcLog).toHaveLength(0);
  });
  it('holat: faqat havolani bilgan (noto‘g‘ri brauzer siri) va nonce yo‘q holatlari bir xil javob; cookie yo‘q', async () => {
    tarmoq({ t2_tg_kirish_holat_v1: () => ({ ok: false, code: 'TOPILMADI' }) });
    const a = await post({ amal: 'holat', nonce: NONCE, sir: SIR });
    const b = await post({ amal: 'holat', nonce: 'kirish_' + 'M'.repeat(32), sir: SIR });
    expect(a.status).toBe(404); expect(b.status).toBe(404);
    expect(await a.json()).toEqual(await b.json());
    expect(a.headers.get('Set-Cookie')).toBeNull();
  });
  it('holat: kutmoqda; muddati o‘tgan → 410; KIRISH_RAD → 403 (umumiy xabar); noma’lum kod TOPILMADI ga tushadi', async () => {
    tarmoq({ t2_tg_kirish_holat_v1: () => ({ ok: true, holat: 'kutmoqda' }) });
    expect(await (await post({ amal: 'holat', nonce: NONCE, sir: SIR })).json()).toEqual({ ok: true, holat: 'kutmoqda' });
    tarmoq({ t2_tg_kirish_holat_v1: () => ({ ok: false, code: 'MUDDATI_OTGAN' }) });
    expect((await post({ amal: 'holat', nonce: NONCE, sir: SIR })).status).toBe(410);
    tarmoq({ t2_tg_kirish_holat_v1: () => ({ ok: false, code: 'KIRISH_RAD' }) });
    const rad = await post({ amal: 'holat', nonce: NONCE, sir: SIR });
    expect(rad.status).toBe(403); expect(rad.headers.get('Set-Cookie')).toBeNull();
    tarmoq({ t2_tg_kirish_holat_v1: () => ({ ok: false, code: 'BOSHQA_ICHKI_KOD' }) });
    expect(((await (await post({ amal: 'holat', nonce: NONCE, sir: SIR })).json()) as { code: string }).code).toBe('TOPILMADI');
  });
  it('holat: tayyor → oddiy sess cookie; hisob/rol bazadan, yuborilgan xeshlar bilan', async () => {
    const log = tarmoq({ t2_tg_kirish_holat_v1: () => ({ ok: true, holat: 'tayyor', yangi: true, foydalanuvchi_id: 77, login: '+998901234567', rol: 'kuzatuvchi', azoliklar: [] }) });
    const r = await post({ amal: 'holat', nonce: NONCE, sir: SIR });
    expect(await r.json()).toEqual({ ok: true, holat: 'tayyor', yangi: true, rol: 'kuzatuvchi' });
    const ck = r.headers.get('Set-Cookie')!;
    expect(ck).toMatch(/^sess=.+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=\d+$/);
    expect(await tekshir(ck, KALIT)).toMatchObject({ foydalanuvchi_id: 77, rol: 'kuzatuvchi', kompaniyalar: [] });
    expect(log.rpcLog[0].yuk.p_nonce_xesh).toBe(await xesh('tg-nonce', NONCE, KALIT));
    expect(log.rpcLog[0].yuk.p_brauzer_xesh).toBe(await xesh('tg-brauzer', SIR, KALIT));
  });
});

describe('bot: kontakt va /start kirish_<nonce> (webhook mantiqi)', () => {
  const TGENV = { ...ENV, TELEGRAM_WEBHOOK_SECRET: 'w'.repeat(20) };
  const NONCE = 'kirish_' + 'N'.repeat(32);
  const upd = (n: number, msg: Record<string, unknown>) => ({ update_id: n, message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false, language_code: 'uz' }, ...msg } });
  const baza = { t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: true, limit: false }) };

  it('/start kirish_<nonce>: xesh bilan RPC, javobda moslik raqami va request_contact tugmasi', async () => {
    const l = tarmoq({ ...baza, t2_tg_kirish_start_v1: () => ({ ok: true, belgi: '4821' }) });
    expect(await updateIshla(TGENV as never, upd(1, { text: '/start ' + NONCE }) as never)).toBe('kirish_start');
    const y = l.rpcLog.find((x) => x.nom === 't2_tg_kirish_start_v1')!.yuk;
    expect(y).toMatchObject({ p_telegram_user_id: 555, p_chat_id: 555, p_til: 'uz' });
    expect(y.p_nonce_xesh).toBe(await xesh('tg-nonce', NONCE, KALIT));
    const msg = l.tg.find((x) => x.nom === 'sendMessage')!.yuk;
    expect(msg.text).toContain('4821');
    expect(msg.reply_markup.keyboard[0][0].request_contact).toBe(true);
    expect(l.rpcLog.some((x) => x.nom === 't2_telegram_ulash_v1')).toBe(false); // ulash kodi sifatida talqin QILINMAYDI
  });
  it('sozlama o‘chiq bo‘lsa — hech qanday RPC (start) chaqirilmaydi', async () => {
    const l = tarmoq({ ...baza });
    expect(await updateIshla({ ...TGENV, KIRISH_TELEGRAM_YOQILGAN: undefined } as never, upd(2, { text: '/start ' + NONCE }) as never)).toBe('kirish_yoqilmagan');
    expect(l.rpcLog.map((x) => x.nom)).toEqual(['t2_telegram_update_qabul_v1']);
  });
  it('kontakt: contact.user_id o‘zi (555) → RPC ga ikkala id uzatiladi; boshqaniki → SQL KONTAKT_BOSHQANIKI, javob rad', async () => {
    const l = tarmoq({ ...baza, t2_tg_kirish_kontakt_v1: (b) => b.p_contact_user_id === b.p_telegram_user_id ? { ok: true } : { ok: false, code: 'KONTAKT_BOSHQANIKI' } });
    expect(await updateIshla(TGENV as never, upd(3, { contact: { phone_number: '998901234567', user_id: 555 } }) as never)).toBe('kontakt_ok');
    expect(await updateIshla(TGENV as never, upd(4, { contact: { phone_number: '998901234567', user_id: 999 } }) as never)).toBe('kontakt_rad:KONTAKT_BOSHQANIKI');
    expect(await updateIshla(TGENV as never, upd(5, { contact: { phone_number: '998901234567' } }) as never)).toBe('kontakt_rad:KONTAKT_BOSHQANIKI');
    const ys = l.rpcLog.filter((x) => x.nom === 't2_tg_kirish_kontakt_v1').map((x) => x.yuk);
    expect(ys[0]).toMatchObject({ p_telegram_user_id: 555, p_contact_user_id: 555, p_chat_id: 555 });
    expect(ys[1].p_contact_user_id).toBe(999);
    expect(ys[2].p_contact_user_id).toBeNull();
  });
  it('guruh chatidagi kontakt e’tiborsiz (faqat shaxsiy chat)', async () => {
    const l = tarmoq({ ...baza });
    const u = upd(6, { contact: { phone_number: '998901234567', user_id: 555 } }); (u.message as any).chat.type = 'group';
    expect(await updateIshla(TGENV as never, u as never)).toBe('etibor_yoq');
    expect(l.rpcLog.some((x) => x.nom === 't2_tg_kirish_kontakt_v1')).toBe(false);
  });
});
