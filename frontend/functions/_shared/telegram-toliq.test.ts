// @vitest-environment node
/* «To'liq bot» (docs/ops/TELEGRAM_BOT_QAMROV.md): menyu, kontekst, sahifalash, obyekt kartasi, fakt, F-2, tasdiqlar, hujjat.
   SINTETIK ma'lumot; Telegram va shlyuzlar soxtalashtirilgan (haqiqiy xabar yuborilmaydi). Yozish faqat preview + «Tasdiqlash». */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenYarat } from './f2-buyruq-yadro';
import { limitTozala } from './telegram-bot';
import { tgT } from './telegram';

const net = vi.hoisted(() => ({ amal: vi.fn(), fayl: vi.fn() }));
vi.mock('./telegram-amal', () => ({ botChaqiruv: net.amal, botChaqiruvFayl: net.fayl }));

import { chuqurHavolaOl, toliqCallback, toliqMatn } from './telegram-toliq';
import { doimiyMenyu, gKonteksti, menyuAmali } from './telegram-toliq-yadro';

const SIR = 'sinov-sir-0123456789abcdef-sinov';
const TOKEN = '123456789:AAFakeSinovTokenFakeSinovToken_abc';
const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: SIR, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_SAYT_URL: 'https://qurai.uz' };
const UID = 7, CHAT = 5550001, KID = 17;

type Chaqiruv = { api: string; method?: string; query?: Record<string, unknown>; json?: any };
let tg: { metod: string; yuk: any }[] = [];
let rol = 'pto';
const MENU_URL = 'https://qurai.uz/tg?to=%2Fadmin%2Ffakt%3Fobyekt%3D79';

beforeEach(() => {
  net.amal.mockReset(); net.fayl.mockReset(); tg = []; rol = 'pto'; limitTozala();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    if (url.host === 'api.telegram.org') {
      const metod = url.pathname.split('/').at(-1)!;
      tg.push({ metod, yuk: init?.body instanceof FormData ? init.body : JSON.parse(String(init?.body ?? '{}')) });
      return Response.json(metod === 'getChatMenuButton' ? { ok: true, result: { web_app: { url: MENU_URL } } } : { ok: true, result: true });
    }
    if (url.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', azoliklar: [{ kompaniya_id: KID, nom: 'Sinov MChJ', rol, faol: true }, { kompaniya_id: 18, nom: 'Ikkinchi MChJ', rol, faol: true }] });
    return Response.json({ message: 'not found' }, { status: 404 });
  }));
});

/** botChaqiruv ni api nomi bo'yicha yo'naltiradi; `sb` — jadval+filtr bo'yicha. */
function yonalt(h: { sb?: (j: any) => unknown; [api: string]: ((c: Chaqiruv) => { status: number; body: any }) | ((j: any) => unknown) | undefined }) {
  net.amal.mockImplementation(async (_e: unknown, _u: number, c: Chaqiruv) => {
    if (c.api === 'sb') return { status: 200, body: { ok: true, qatorlar: (h.sb as (j: any) => unknown)?.(c.json) ?? [] } };
    const f = h[c.api] as ((c: Chaqiruv) => { status: number; body: any }) | undefined;
    return f ? f(c) : { status: 404, body: null };
  });
}
const OBYEKT = { id: 79, nom: 'Sinov bog‘i', kompaniya_id: KID };
const sbObyekt = (j: any) => (j.jadval === 't2_obyekt' && String(j.filtr).includes('id=eq.79') ? [OBYEKT] : null);
const tugmalar = (j: { markup?: any }) => (j.markup?.inline_keyboard ?? []).flat() as { text: string; callback_data?: string }[];
const data = (j: { markup?: any }) => tugmalar(j).map((t) => t.callback_data).filter(Boolean) as string[];
const cb = (d: string, text?: string) => ({ id: 'c1', data: d, message: { message_id: 42, text, chat: { id: CHAT, type: 'private' } } });
const call = async (d: string, text?: string) => (await toliqCallback(ENV, UID, 'uz', cb(d, text), CHAT))!;

describe('menyu va kontekst', () => {
  it('doimiy menyu tugmalari uz/ru/en da bir xil amalga olib boradi; rol bo‘yicha qatorlar', () => {
    expect(menyuAmali('Obyektlar')).toBe('obyektlar');
    for (const til of ['ru', 'en'] as const) expect(menyuAmali(tgT('Tasdiqlar', til))).toBe('tasdiq');
    expect(menyuAmali('tasodifiy gap')).toBeNull();
    const ijro = doimiyMenyu('uz', true).keyboard.flat().map((t) => t.text);
    const oddiy = doimiyMenyu('uz', false).keyboard.flat().map((t) => t.text);
    expect(ijro).toContain('Fakt kiritish'); expect(oddiy).not.toContain('Fakt kiritish'); expect(oddiy).toContain('Hujjatlar');
  });
  it('chuqur havolalar callback ga aylanadi; ulash kodi (≥16 belgi) bilan to‘qnashmaydi', () => {
    expect(chuqurHavolaOl('o_79')).toBe('g:k:79'); expect(chuqurHavolaOl('t')).toBe('g:t:0');
    expect(chuqurHavolaOl('Abcdefghijklmnop12345678')).toBeNull(); expect(chuqurHavolaOl('o_x')).toBeNull();
  });
  it('force_reply belgisi faqat bot xabaridan o‘qiladi', () => {
    expect(gKonteksti({ from: { is_bot: true }, text: 'so‘z yozing\n[gh:79:5]' })).toEqual({ tur: 'gh', a: 79, b: 5, c: null });
    expect(gKonteksti({ from: { is_bot: false }, text: '[gh:79:5]' })).toBeNull();
  });
});

describe('obyektlar: sahifalash, qidiruv, karta', () => {
  const royxat = Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, nom: 'Obyekt ' + i, kompaniya_id: KID }));
  it('sahifalaydi (6 ta) va ‹ › tugmalari beradi', async () => {
    yonalt({ sb: () => royxat });
    const p0 = (await call('g:o:0')).xabar!; const p1 = (await call('g:o:1')).xabar!; const son = (await call('g:o:2')).xabar!;
    expect(data(p0).filter((x) => x.startsWith('g:k:'))).toHaveLength(6); expect(data(p0)).toContain('g:o:1');
    expect(data(p1)).toEqual(expect.arrayContaining(['g:o:0', 'g:o:2'])); expect(data(son).filter((x) => x.startsWith('g:k:'))).toHaveLength(2);
    expect(p0.matn).toContain('Menyu › Obyektlar');
  });
  it('qidiruv so‘zi serverga ilike sifatida boradi; natija topilmasa odamga tushunarli matn', async () => {
    yonalt({ sb: () => [] });
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: 'bog‘', reply_to_message: { from: { is_bot: true }, text: 'so‘z\n[gs:0]' } });
    expect(net.amal.mock.calls[0][2].json.filtr).toContain('nom=ilike.*bog*');
    expect(tg.find((x) => x.metod === 'sendMessage')!.yuk.text).toContain('Bunday obyekt topilmadi');
  });
  it('karta: uch shakl, null «—» (0 emas), joriy obyekt chat menyusiga yoziladi', async () => {
    yonalt({ sb: sbObyekt, 'obyekt-tugun-summa': () => ({ status: 200, body: { ok: true, ustama: 'bor', obyekt: [[1000, 900, 800], [null, null, null], [0, 0, 0]], tugunlar: [] } }) });
    const r = await call('g:k:79');
    expect(r.xabar!.matn).toContain('Smeta: QQS bilan 1 000 · ustamali 900 · ustamasiz 800');
    expect(r.xabar!.matn).toContain('Fakt: QQS bilan — · ustamali — · ustamasiz —');
    expect(r.xabar!.matn).toContain('F-2: QQS bilan 0 · ustamali 0 · ustamasiz 0');
    expect(data(r.xabar!)).toEqual(expect.arrayContaining(['g:y:79', 'g:f:79', 'g:b:79:0', 'g:h:79']));
    expect(tg.some((x) => x.metod === 'setChatMenuButton' && JSON.stringify(x.yuk).includes('obyekt%3D79'))).toBe(true);
  });
  it('ruxsatsiz (403) — summa o‘rniga odam o‘qiydigan xabar; o‘qish tugmalari ham yo‘q obyektda rad', async () => {
    yonalt({ sb: sbObyekt, 'obyekt-tugun-summa': () => ({ status: 403, body: { ok: false } }) });
    expect((await call('g:k:79')).xabar!.matn).toContain('ruxsatingiz yo‘q');
    yonalt({ sb: () => [] });
    expect((await call('g:k:80')).xabar!.matn).toContain('Bu obyekt sizga ochiq emas');
  });
  it('har callback_data ≤ 64 bayt', async () => {
    yonalt({ sb: () => royxat, 'obyekt-tugun-summa': () => ({ status: 200, body: { ok: true, obyekt: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], tugunlar: [] } }) });
    for (const d of ['g:o:0', 'g:o:1', 'g:c', 'g:m']) for (const x of data((await call(d)).xabar!)) expect(new TextEncoder().encode(x).length).toBeLessThanOrEqual(64);
  });
});

describe('fakt: qidiruv → hajm → preview → Tasdiqlash', () => {
  const preview = { ok: true, holat: 'tasdiq_kerak', token: 'tok.en', tavsif: 'Fakt: 1 qator', preview: { qatorlar: [{ qator_id: 5, kod: 'C1', nom: 'Beton', birlik: 'm3', ozgarish: [{ maydon: 'hajm', oldin: 0, keyin: 12.5 }] }],
    jami: { oldin: { qqs_bilan: 0, ustamali: 0, ustamasiz: 0 }, keyin: { qqs_bilan: 1120, ustamali: 1000, ustamasiz: 900 }, farq: null }, natijalar: [] } };
  it('qidiruv natijasi tugma beradi; hajm so‘rovi force_reply', async () => {
    yonalt({ sb: (j) => (j.jadval === 't2_obyekt' ? [OBYEKT] : [{ id: 5, kod: 'C1', nom: 'Beton M300', birlik: 'm3', ota_id: null }]) });
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: 'beton', reply_to_message: { from: { is_bot: true }, text: '[gq:79]' } });
    expect(JSON.stringify(tg.at(-1)!.yuk.reply_markup)).toContain('g:r:79:5');
    const h = await call('g:r:79:5');
    expect(h.xabar!.markup).toMatchObject({ force_reply: true }); expect(h.xabar!.matn).toContain('[gh:79:5]');
  });
  it('preview YOZMAYDI: faqat fakt_yoz vositasi, tasdiq chaqirilmaydi; token xabar oxirida', async () => {
    const f2 = vi.fn((_c: Chaqiruv) => ({ status: 200, body: preview }));
    yonalt({ sb: sbObyekt, 'f2-buyruq': f2 });
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: '12,5', reply_to_message: { from: { is_bot: true }, text: '[gh:79:5]' } });
    const yuk = tg.find((x) => x.metod === 'sendMessage')!.yuk;
    expect(f2).toHaveBeenCalledTimes(1);
    expect(f2.mock.calls[0][0].json).toMatchObject({ amal: 'vosita', kompaniya_id: KID, nom: 'fakt_yoz', args: { obyekt_id: 79, qatorlar: [{ qator_id: 5, hajm: 12.5 }] } });
    expect(yuk.text).toMatch(/\n#JF:tok\.en$/); expect(yuk.text).toContain('hajm 0 → 12,5'); expect(yuk.text).toContain('QQS bilan 1 120 · ustamali 1 000 · ustamasiz 900');
    expect(JSON.stringify(yuk.reply_markup)).toContain('g:ok');
  });
  it('noto‘g‘ri hajm rad etiladi, serverga bormaydi', async () => {
    yonalt({ sb: sbObyekt });
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: 'ko‘p', reply_to_message: { from: { is_bot: true }, text: '[gh:79:5]' } });
    expect(tg.at(-1)!.yuk.text).toContain('Hajm tushunilmadi'); expect(net.amal).not.toHaveBeenCalled();
  });
  it('«Tasdiqlash»: yaroqli token → f2-buyruq tasdiq; muddati o‘tgan va begona token → yozilmaydi', async () => {
    const f2 = vi.fn((_c: Chaqiruv) => ({ status: 200, body: { ok: true, holat: 'yozildi', bepul_takror: false } }));
    yonalt({ 'f2-buyruq': f2 });
    const yaxshi = await tokenYarat(SIR, { a: UID, k: KID, o: 79, op: 'op', rh: 'h', v: 'fakt_yoz', args: {} });
    const ok = await call('g:ok', 'Preview\n#JF:' + yaxshi);
    expect(f2.mock.calls[0][0].json).toEqual({ amal: 'tasdiq', kompaniya_id: KID, token: yaxshi, tasdiqlayman: true });
    expect(ok.xabar!.matn).toContain('Yozildi'); expect(ok.tugmalarniOlibTashla).toBe(true);
    f2.mockClear();
    const eski = await tokenYarat(SIR, { a: UID, k: KID, o: 79, op: 'op', rh: 'h', v: 'fakt_yoz', args: {} }, -1000);
    expect((await call('g:ok', 'P\n#JF:' + eski)).xabar!.matn).toContain('muddati o‘tdi');
    const begona = await tokenYarat(SIR, { a: 99, k: KID, o: 79, op: 'op', rh: 'h', v: 'fakt_yoz', args: {} });
    expect((await call('g:ok', 'P\n#JF:' + begona)).xabar!.matn).toContain('yaroqsiz');
    expect((await call('g:ok', 'markersiz')).xabar!.matn).toContain('eskirgan');
    expect(f2).not.toHaveBeenCalled();
  });
  it('server xatolari odam tilida; «Bekor» hech narsa yozmaydi', async () => {
    const t = await tokenYarat(SIR, { a: UID, k: KID, o: 79, op: 'op', rh: 'h', v: 'fakt_yoz', args: {} });
    yonalt({ 'f2-buyruq': () => ({ status: 403, body: { ok: false, code: 'PERMISSION_DENIED' } }) });
    expect((await call('g:ok', 'P\n#JF:' + t)).xabar!.matn).toContain('ruxsat');
    net.amal.mockClear();
    expect((await call('g:no')).xabar!.matn).toContain('Hech narsa yozilmadi'); expect(net.amal).not.toHaveBeenCalled();
  });
});

describe('F-2: ro‘yxat, xulosa, qoralama tahriri', () => {
  const oy = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
  const aktlar = [{ id: 1, raqam: '3', oy, lifecycle_status: 'draft', hujjat_jami: 5000 }, { id: 2, raqam: '2', oy: '2020-01', lifecycle_status: 'approved', hujjat_jami: null }];
  it('oy bo‘yicha filtrlaydi; hujjat_jami null — «—»', async () => {
    yonalt({ sb: sbObyekt, 'f2-buyruq': () => ({ status: 200, body: { ok: true, aktlar: [aktlar[1], { ...aktlar[0], hujjat_jami: null }] } }) });
    const r = (await call('g:f:79')).xabar!;
    expect(r.matn).toContain('№ 3'); expect(r.matn).not.toContain('№ 2'); expect(r.matn).toContain('Hujjat jami —'); expect(r.matn).toContain('oyiga bitta F-2');
    expect(data(r)).toEqual(expect.arrayContaining(['g:a:79:1']));
  });
  it('xulosa: jami uch shaklda; tahrir tugmasi faqat qoralamada', async () => {
    const body = (st: string) => ({ ok: true, akt: { id: 1, obyekt_id: 79, raqam: '3', oy, lifecycle_status: st }, summa: { qqs_bilan: 1120, ustamali: 1000, ustamasiz: 900, narxsiz_soni: 2 }, qatorlar: [{ qator_id: 5, hajm: 2, summa: 10, kod: 'C1', nom: 'Beton', birlik: 'm3' }] });
    yonalt({ sb: sbObyekt, 'f2-buyruq': () => ({ status: 200, body: body('draft') }) });
    const d = (await call('g:a:79:1')).xabar!;
    expect(d.matn).toContain('Jami: QQS bilan 1 120 · ustamali 1 000 · ustamasiz 900'); expect(d.matn).toContain('Narxsiz qator: 2'); expect(data(d)).toContain('g:l:79:1:5');
    yonalt({ sb: sbObyekt, 'f2-buyruq': () => ({ status: 200, body: body('approved') }) });
    const m = (await call('g:a:79:1')).xabar!;
    expect(data(m).some((x) => x.startsWith('g:l:'))).toBe(false); expect(m.matn).toContain('muzlagan');
  });
  it('tahrir: yangi hajm → f2_qoralama_tahrir preview (yozmaydi)', async () => {
    const f2 = vi.fn((_c: Chaqiruv) => ({ status: 200, body: { ok: true, holat: 'tasdiq_kerak', token: 'a.b', preview: { qatorlar: [], jami: { oldin: null, keyin: null, farq: null }, natijalar: [] } } }));
    yonalt({ sb: sbObyekt, 'f2-buyruq': f2 });
    expect(((await call('g:l:79:1:5')).xabar!.markup as any).force_reply).toBe(true);
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: '3', reply_to_message: { from: { is_bot: true }, text: '[ge:79:1:5]' } });
    expect(f2.mock.calls[0][0].json).toMatchObject({ nom: 'f2_qoralama_tahrir', args: { akt_id: 1, ozgartir: [{ qator_id: 5, hajm: 3 }] } });
    expect(tg.at(-1)!.yuk.text).toMatch(/#JF:a\.b$/);
  });
});

describe('tasdiqlar va bildirishnomalar', () => {
  it('kiruvchi quti: Tasdiqlash (mavjud tq: oqimi) va Rad tugmalari, sahifalash', async () => {
    const zanjirlar = Array.from({ length: 7 }, (_, i) => ({ id: 50 + i, hujjat_turi: 'f2', sarlavha: 'Sinov F-2 ' + i, kechikkan: i === 0 }));
    yonalt({ 'hujjat-aylanish': (c: Chaqiruv) => ({ status: 200, body: { ok: true, zanjirlar: c.query?.kompaniya_id === KID ? zanjirlar : [] } }) });
    const r = (await call('g:t:0')).xabar!;
    expect(data(r)).toEqual(expect.arrayContaining(['tq:56', 'g:rq:56', 'g:t:1'])); expect((await call('g:t:1')).xabar!.matn).toContain('muddati o‘tgan');
  });
  it('rad: qadam belgisi eskirgan bo‘lsa POST yo‘q; mos bo‘lsa zanjir_qaror=rad', async () => {
    const zanjir = (belgi = 2) => ({ status: 200, body: { ok: true, zanjir: { id: 50, holat: 'jarayonda', raund: 1, sarlavha: 'S' }, qadamlar: [{ tartib: belgi, holat: 'navbat', men: true }] } });
    const post = vi.fn((_c: Chaqiruv) => ({ status: 200, body: { ok: true } }));
    yonalt({ 'hujjat-aylanish': (c: Chaqiruv) => (c.method === 'GET' ? zanjir() : post(c)) });
    expect((await call('g:ry:50:1-9')).xabar!.matn).toContain('Hech narsa rad etilmadi'); expect(post).not.toHaveBeenCalled();
    expect((await call('g:ry:50:1-2')).xabar!.matn).toContain('rad etildi'); expect(post).toHaveBeenCalledTimes(1);
    const sorov = await call('g:rq:50'); expect(data(sorov.xabar!)).toContain('g:ry:50:1-2');
  });
  it('bildirishnomalar: o‘qilmagan soni va Tasdiqlash tugmasi', async () => {
    yonalt({ 'hujjat-aylanish': () => ({ status: 200, body: { ok: true, oqilmagan: 1, qatorlar: [{ id: 1, mavzu: 'hujjat.tasdiq_kutmoqda', parametrlar: { zanjir_id: 50 }, oqildi: null, yaratildi: '2026-11-19T10:00:00Z' }] } }) });
    const r = (await call('g:n:0')).xabar!;
    expect(r.matn).toContain('O‘qilmagan: 1'); expect(data(r)).toContain('tq:50');
  });
});

describe('hujjatlar', () => {
  const royxat = { status: 200, body: { ok: true, hujjatlar: [{ kalit: 'f2:1', tur: 'f2', sarlavha: 'Ф-2 № 3', parametrlar: { akt_id: 1 }, formatlar: ['xlsx', 'pdf'] }] } };
  it('tanlash faqat token ogohlantirishi + format tugmalari beradi (fayl yasalmaydi)', async () => {
    yonalt({ sb: sbObyekt, 'hujjat-yarat': () => royxat });
    const r = (await call('g:d:79:f2:1')).xabar!;
    expect(r.matn).toContain('tokenlardan yechiladi'); expect(data(r)).toEqual(expect.arrayContaining(['g:x:79:x:f2:1', 'g:x:79:p:f2:1']));
    expect(net.fayl).not.toHaveBeenCalled();
  });
  it('tasdiqdan keyin server fayli Telegram hujjati sifatida yuboriladi', async () => {
    yonalt({ sb: sbObyekt, 'hujjat-yarat': () => royxat });
    net.fayl.mockResolvedValue({ status: 200, bayt: new Uint8Array([1, 2, 3]), sarlavhalar: new Headers({ 'Content-Disposition': 'attachment; filename="F2.xlsx"', 'X-Hujjat-Sarf': '3', 'X-Hujjat-Bepul-Takror': '0' }), body: null });
    const r = await call('g:x:79:x:f2:1');
    expect(net.fayl.mock.calls[0][2].json).toMatchObject({ amal: 'yarat', tur: 'f2', format: 'xlsx', kompaniya_id: KID, obyekt_id: 79, akt_id: 1 });
    expect(tg.some((x) => x.metod === 'sendDocument')).toBe(true); expect(r.xabar!.matn).toContain('Sarflangan tokenlar: 3');
  });
  it('token yetmasa (402) fayl yuborilmaydi va tushunarli xabar chiqadi', async () => {
    yonalt({ sb: sbObyekt, 'hujjat-yarat': () => royxat });
    net.fayl.mockResolvedValue({ status: 402, bayt: null, sarlavhalar: null, body: { ok: false } });
    expect((await call('g:x:79:p:f2:1')).xabar!.matn).toContain('Tokenlar yetarli emas');
    expect(tg.some((x) => x.metod === 'sendDocument')).toBe(false);
  });
});
