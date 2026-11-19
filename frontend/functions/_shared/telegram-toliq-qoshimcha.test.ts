// @vitest-environment node
/* «To'liq bot» PR 2: fakt jurnali, F-2 lifecycle, o'qildi, token, xat, topshiriq. SINTETIK ma'lumot; Telegram va shlyuzlar soxtalashtirilgan.
   Yozish faqat so'rov ekrani + tasdiq tugmasi; ruxsat yo'q / eskirgan belgi / takroriy bosish tekshiriladi. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limitTozala } from './telegram-bot';

const net = vi.hoisted(() => ({ amal: vi.fn() }));
vi.mock('./telegram-amal', () => ({ botChaqiruv: net.amal, botChaqiruvFayl: vi.fn() }));

import { toliqCallback, toliqMatn } from './telegram-toliq';
import { topshiriqHarakatlari } from './telegram-toliq-qoshimcha';
import { harakatlar } from '../../src/api/t2-topshiriq';

const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'sinov-sir-0123456789abcdef-sinov', TELEGRAM_BOT_TOKEN: '123456789:AAFakeSinovTokenFakeSinovToken_abc', TELEGRAM_SAYT_URL: 'https://qurai.uz' };
const UID = 7, CHAT = 5550001, KID = 17, KID2 = 18;

type C = { api: string; method?: string; query?: Record<string, any>; json?: any };
type H = (c: C) => { status: number; body: any };
let tg: { metod: string; yuk: any }[] = [];
let kompaniyalar = [{ id: KID, nom: 'Sinov MChJ' }];

beforeEach(() => {
  net.amal.mockReset(); tg = []; limitTozala(); kompaniyalar = [{ id: KID, nom: 'Sinov MChJ' }];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    if (url.host === 'api.telegram.org') { tg.push({ metod: url.pathname.split('/').at(-1)!, yuk: JSON.parse(String(init?.body ?? '{}')) }); return Response.json({ ok: true, result: true }); }
    if (url.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', azoliklar: kompaniyalar.map((k) => ({ kompaniya_id: k.id, nom: k.nom, rol: 'pto', faol: true })) });
    return Response.json({}, { status: 404 });
  }));
});

/** api nomi bo'yicha yo'naltirish; `sb` obyektni (id 79 → KID) o'zi beradi, `soro` esa `sbSoro` ga. */
function yonalt(h: Record<string, H>, sbSoro?: (j: any) => { status: number; body: any }) {
  net.amal.mockImplementation(async (_e: unknown, _u: number, c: C) => {
    if (c.api === 'sb') {
      if (c.json?.soro) return sbSoro ? sbSoro(c.json) : { status: 404, body: null };
      if (c.json?.jadval === 't2_obyekt') return { status: 200, body: { ok: true, qatorlar: [{ id: 79, nom: 'Sinov bog‘i', kompaniya_id: KID }] } };
      if (c.json?.jadval === 't2_qator') return { status: 200, body: { ok: true, qatorlar: [{ id: 5, kod: 'К-5', nom: 'Beton ishi', birlik: 'm3' }] } };
    }
    const f = h[c.api]; return f ? f(c) : { status: 404, body: null };
  });
}
const tugmalar = (j: { markup?: any }) => (j.markup?.inline_keyboard ?? []).flat() as { text: string; callback_data?: string }[];
const data = (j: { markup?: any }) => tugmalar(j).map((t) => t.callback_data).filter(Boolean) as string[];
const cb = (d: string, text?: string) => ({ id: 'c1', data: d, message: { message_id: 42, text, chat: { id: CHAT, type: 'private' } } });
const call = async (d: string, text?: string) => (await toliqCallback(ENV, UID, 'uz', cb(d, text), CHAT))!;
const yozuvlar = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, akt_id: 3, qator_id: 5, hajm: i + 1.5, summa: 1000 * (i + 1), izoh: 'izoh', sana: '2026-11-0' + ((i % 9) + 1), akt_raqam: '12', yaratildi: '2026-11-01' }));
const sarlavhaMatn = (j: { matn: string }) => j.matn.split('\n');

describe('fakt jurnali', () => {
  it('oy bo‘yicha o‘qiydi (faqat o‘qish vositasi), 5 tadan sahifalaydi, oy navigatsiyasi va yozuv tafsiloti beradi', async () => {
    const f2 = vi.fn<H>(() => ({ status: 200, body: { ok: true, yozuvlar: yozuvlar(12) } }));
    yonalt({ 'f2-buyruq': f2 });
    const p0 = (await call('g:j:79:202611:0')).xabar!;
    expect(f2.mock.calls[0][0].json).toMatchObject({ amal: 'vosita', kompaniya_id: KID, nom: 'fakt_jurnal', args: { obyekt_id: 79, sana_dan: '2026-11-01', sana_gacha: '2026-11-30', limit: 200 } });
    expect(data(p0).filter((x) => x.startsWith('g:jd:'))).toHaveLength(5);
    expect(data(p0)).toEqual(expect.arrayContaining(['g:j:79:202611:1', 'g:j:79:202610:0', 'g:j:79:202612:0']));
    expect(p0.matn).toContain('Fakt jurnali'); expect(p0.matn).toContain('Yozuvlar: 12');
    const son = (await call('g:j:79:202611:2')).xabar!;
    expect(data(son).filter((x) => x.startsWith('g:jd:'))).toHaveLength(2);
    expect((await call('g:j:79:202602:0')).xabar).toBeTruthy();
    expect(f2.mock.calls.at(-1)![0].json.args.sana_gacha).toBe('2026-02-28');
    const d = (await call('g:jd:79:101:202611:0')).xabar!;
    expect(d.matn).toContain('К-5 Beton ishi'); expect(d.matn).toContain('2,5'); expect(data(d)).toContain('g:j:79:202611:0');
    expect(net.amal.mock.calls.every(([, , c]) => c.json?.amal !== 'tasdiq')).toBe(true);
  });
  it('bo‘sh oy va ruxsat yo‘q — tushunarli matn; ichki xato sizdirilmaydi', async () => {
    yonalt({ 'f2-buyruq': () => ({ status: 200, body: { ok: true, yozuvlar: [] } }) });
    expect((await call('g:j:79:202611:0')).xabar!.matn).toContain('Bu oyda fakt yozuvi yo‘q.');
    yonalt({ 'f2-buyruq': () => ({ status: 403, body: { ok: false, code: 'PERMISSION_DENIED', error: 'ichki-matn' } }) });
    const r = (await call('g:j:79:202611:0')).xabar!;
    expect(r.matn).toContain('ruxsatingiz yo‘q'); expect(r.matn).not.toContain('ichki-matn');
  });
});

describe('F-2 lifecycle (so‘rov → tasdiq → bajarish)', () => {
  const akt = (lifecycle_status: string, versiya = 4) => ({ status: 200, body: { ok: true, akt: { id: 5, obyekt_id: 79, raqam: '12', lifecycle_status, versiya, oy: '2026-11' }, summa: null, qatorlar: [] } });
  const lcCall = vi.fn<H>();
  beforeEach(() => lcCall.mockReset());

  it('F-2 xulosasi holatga mos tugma beradi (draft → yuborish; checked → tekshirildi emas, tasdiqlash + rad; approved → yo‘q)', async () => {
    for (const [h, kutilgan] of [['draft', ['g:lq:79:5:1']], ['submitted', ['g:lq:79:5:2']], ['checked', ['g:lq:79:5:3', 'g:lq:79:5:4']]] as const) {
      yonalt({ 'f2-buyruq': () => akt(h) });
      expect(data((await call('g:a:79:5')).xabar!).filter((x) => x.startsWith('g:lq:'))).toEqual(kutilgan);
    }
    yonalt({ 'f2-buyruq': () => akt('approved') });
    expect(data((await call('g:a:79:5')).xabar!).filter((x) => x.startsWith('g:lq:'))).toEqual([]);
  });
  it('so‘rov hech narsa yozmaydi; tasdiq tugmasi versiyani olib yuradi; ruxsat etilmagan o‘tish rad etiladi', async () => {
    yonalt({ 'f2-buyruq': () => akt('draft', 4), 'sb-yoz': lcCall });
    const s = (await call('g:lq:79:5:1')).xabar!;
    expect(data(s)).toContain('g:lo:79:5:1:4'); expect(s.matn).toContain('draft → submitted'); expect(lcCall).not.toHaveBeenCalled();
    const yaroqsiz = (await call('g:lq:79:5:3')).xabar!;   // draft dan to‘g‘ridan-to‘g‘ri tasdiq yo‘q
    expect(yaroqsiz.matn).toContain('holati o‘zgargan'); expect(data(yaroqsiz).some((x) => x.startsWith('g:lo:'))).toBe(false);
  });
  it('tasdiq: sb-yoz akt_lifecycle_transition_v1 ga to‘g‘ri yuk; operation_id deterministik (takror bosish bir xil)', async () => {
    lcCall.mockReturnValue({ status: 200, body: { ok: true, status: 'submitted' } });
    yonalt({ 'f2-buyruq': () => akt('draft', 4), 'sb-yoz': lcCall });
    const a = await call('g:lo:79:5:1:4'); const b = await call('g:lo:79:5:1:4');
    expect(a.amal).toBe('lc_ok');
    expect(lcCall.mock.calls[0][0].json).toMatchObject({ amal: 'akt_lifecycle_transition_v1', kompaniya_id: KID, akt_id: 5, to_status: 'submitted', kutilgan_versiya: 4, sabab: null });
    expect(lcCall.mock.calls[0][0].json.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(lcCall.mock.calls[1][0].json.operation_id).toBe(lcCall.mock.calls[0][0].json.operation_id);
    expect(b.amal).toBe('lc_ok');
  });
  it('ruxsat yo‘q / eskirgan versiya / SoD / step-up — tushunarli matn, yozilmadi', async () => {
    const holat = async (status: number, body: any) => { lcCall.mockReturnValue({ status, body }); yonalt({ 'f2-buyruq': () => akt('submitted'), 'sb-yoz': lcCall }); return call('g:lo:79:5:2:4'); };
    expect((await holat(403, { ok: false })).xabar!.matn).toContain('ruxsatingiz yo‘q');
    expect((await holat(409, { ok: false, code: 'STALE_VERSION' })).xabar!.matn).toContain('boshqa joyda yangilangan');
    expect((await holat(409, { ok: false, code: 'SOD_TEKSHIRUVCHI_YUBORUVCHI' })).xabar!.matn).toContain('o‘zi tekshira olmaydi');
    const su = await holat(403, { ok: false, code: 'STEP_UP_KERAK' });
    expect(su.xabar!.matn).toContain('PIN'); expect(su.amal).toBe('lc_step_up');
  });
  it('rad: avval sabab so‘raladi (force_reply), keyin tasdiq ekrani; sabab belgisiz «tasdiq» bajarilmaydi', async () => {
    yonalt({ 'f2-buyruq': () => akt('checked', 7), 'sb-yoz': lcCall });
    const s = (await call('g:lq:79:5:4')).xabar!;
    expect(s.markup?.force_reply).toBe(true); expect(s.matn).toContain('[gz:79:5]');
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: 'Narx noto‘g‘ri', reply_to_message: { from: { is_bot: true }, text: s.matn } });
    const kiruvchi = tg.find((x) => x.metod === 'sendMessage')!.yuk;
    expect(kiruvchi.text).toContain('\n#SB:Narx noto‘g‘ri'); expect(JSON.stringify(kiruvchi.reply_markup)).toContain('g:lo:79:5:4:7');
    lcCall.mockReturnValue({ status: 200, body: { ok: true } });
    expect((await call('g:lo:79:5:4:7')).amal).toBe('lc_sabab_yoq'); expect(lcCall).not.toHaveBeenCalled();
    expect((await call('g:lo:79:5:4:7', kiruvchi.text)).amal).toBe('lc_ok');
    expect(lcCall.mock.calls[0][0].json).toMatchObject({ to_status: 'rejected', sabab: 'Narx noto‘g‘ri', kutilgan_versiya: 7 });
  });
  it('begona obyektdagi akt (obyekt mos emas) — topilmadi', async () => {
    yonalt({ 'f2-buyruq': () => ({ status: 200, body: { ok: true, akt: { id: 5, obyekt_id: 999, lifecycle_status: 'draft', versiya: 1 } } }), 'sb-yoz': lcCall });
    expect((await call('g:lo:79:5:1:1')).xabar!.matn).toContain('Topilmadi'); expect(lcCall).not.toHaveBeenCalled();
  });
});

describe('bildirishnoma «o‘qildi»', () => {
  const qatorlar = [1, 2, 3].map((id) => ({ id, mavzu: 'hujjat.tasdiq_kutmoqda', parametrlar: { zanjir_id: 9 }, oqildi: id === 3 ? '2026-11-01' : null, yaratildi: '2026-11-18T10:00:00' }));
  it('ro‘yxatda o‘qilmaganlar uchun tugmalar; bitta va hammasini belgilaydi, keyin ro‘yxat yangilanadi', async () => {
    const post = vi.fn<H>(() => ({ status: 200, body: { ok: true } }));
    yonalt({ 'hujjat-aylanish': (c) => (c.method === 'GET' ? { status: 200, body: { ok: true, qatorlar, oqilmagan: 2 } } : post(c)) });
    const r = (await call('g:n:0')).xabar!;
    expect(data(r)).toEqual(expect.arrayContaining(['g:nr:1:0', 'g:nr:2:0', 'g:na:0'])); expect(data(r)).not.toContain('g:nr:3:0');
    const bitta = await call('g:nr:2:0');
    expect(post.mock.calls[0][0].json).toEqual({ amal: 'bildirishnoma_oqildi', idlar: [2] }); expect(bitta.xabar!.matn).toContain('Bildirishnomalar');
    await call('g:na:0');
    expect(post.mock.calls[1][0].json).toEqual({ amal: 'bildirishnoma_oqildi', idlar: [1, 2, 3] });
    expect(net.amal.mock.calls.some(([, , c]) => c.query?.oqilmagan === 1)).toBe(true);
  });
  it('server xatosi — belgilanmadi matni', async () => {
    yonalt({ 'hujjat-aylanish': () => ({ status: 403, body: { ok: false } }) });
    expect((await call('g:nr:2:0')).xabar!.matn).toContain('ruxsatingiz yo‘q');
  });
});

describe('token balansi', () => {
  const holat = { status: 200, body: { ok: true, natija: { balans: 1250.5, obuna: { nom: 'Pro', tugaydi: '2026-12-31' }, harakatlar: [
    { tur: 'sarf', miqdor: -30, amal: 'f2_hujjat', yaratildi: '2026-11-18T09:00:00' }, { tur: 'toldirish', miqdor: 500, yaratildi: '2026-11-01' }, { tur: 'sarf', miqdor: -12, amal: 'ai_kirish', yaratildi: '2026-11-17T09:00:00' }] } } };
  it('bitta ish joyi: balans, obuna, faqat sarflar; to‘ldirish havolasi', async () => {
    yonalt({}, () => holat);
    const r = (await call('g:tk')).xabar!;
    expect(net.amal.mock.calls.find(([, , c]) => c.json?.soro)![2].json).toEqual({ soro: 'token_holat_v1', kompaniya_id: KID });
    expect(r.matn).toContain('Balans: 1250,5'); expect(r.matn).toContain('Pro'); expect(r.matn).toContain('f2_hujjat'); expect(r.matn).not.toContain('toldirish');
    expect(tugmalar(r).some((t) => /tokenlar/.test((t as any).web_app?.url ?? (t as any).url ?? ''))).toBe(true);
  });
  it('bir necha ish joyi: avval tanlash; begona kompaniya — topilmadi; 402/403 matni', async () => {
    kompaniyalar = [{ id: KID, nom: 'Birinchi' }, { id: KID2, nom: 'Ikkinchi' }];
    yonalt({}, () => holat);
    expect(data((await call('g:tk')).xabar!)).toEqual(expect.arrayContaining([`g:tk:${KID}`, `g:tk:${KID2}`]));
    expect((await call('g:tk:999')).xabar!.matn).toContain('Topilmadi');
    yonalt({}, () => ({ status: 403, body: { ok: false } }));
    expect((await call(`g:tk:${KID2}`)).xabar!.matn).toContain('ruxsatingiz yo‘q');
  });
});

describe('xat / murojaat', () => {
  const kiruvchi = { status: 200, body: { ok: true, xatlar: [{ id: 31, mavzu: 'Muddat haqida', holat: 'yuborilgan', raqam: 'K-31', kechikkan: true }], murojaatlar: [{ id: 1, sarlavha: 'x' }] } };
  const tafsilot = (holat = 'yuborilgan', kiruvchiMi = true) => ({ status: 200, body: { ok: true, natija: { xat: { id: 31, mavzu: 'Muddat haqida', holat, sana: '2026-11-10', matn: 'Matn ichida', kiruvchi: kiruvchiMi, qarshi_kompaniya_id: 55, chiquvchi_raqam: 'C-1', kiruvchi_raqam: 'K-31' } } } });
  it('ro‘yxat (kechikkan belgisi, murojaat soni), ochish, qabul qilish tasdiq bilan', async () => {
    const post = vi.fn<H>(() => ({ status: 200, body: { ok: true } }));
    yonalt({ 'hujjat-aylanish': (c) => (c.method === 'GET' ? (c.query?.bolim === 'xat' ? tafsilot() : kiruvchi) : post(c)) });
    const r = (await call('g:q:0')).xabar!;
    expect(r.matn).toContain('muddati o‘tgan'); expect(r.matn).toContain('Murojaatlar: 1'); expect(data(r)).toContain(`g:qo:${KID}:31`);
    const o = (await call(`g:qo:${KID}:31`)).xabar!;
    expect(o.matn).toContain('Matn ichida'); expect(data(o)).toEqual(expect.arrayContaining([`g:qa:${KID}:31`, `g:qj:${KID}:31`]));
    expect(post).not.toHaveBeenCalled();
    const s = (await call(`g:qa:${KID}:31`)).xabar!; expect(data(s)).toContain(`g:qk:${KID}:31`); expect(post).not.toHaveBeenCalled();
    expect((await call(`g:qk:${KID}:31`)).amal).toBe('xat_qabul_ok');
    expect(post.mock.calls[0][0].json).toEqual({ amal: 'xat_qabul', kompaniya_id: KID, xat_id: 31 });
  });
  it('javob: force_reply → ko‘rsatish (matn xabar oxirida) → yuborish; qarshi kompaniya serverdan; belgi yo‘q — yuborilmaydi', async () => {
    const post = vi.fn<H>(() => ({ status: 200, body: { ok: true } }));
    yonalt({ 'hujjat-aylanish': (c) => (c.method === 'GET' ? tafsilot('olindi') : post(c)) });
    const s = (await call(`g:qj:${KID}:31`)).xabar!; expect(s.matn).toContain(`[gy:${KID}:31]`);
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: 'Muddatni uzaytiramiz', reply_to_message: { from: { is_bot: true }, text: s.matn } });
    const k = tg.find((x) => x.metod === 'sendMessage')!.yuk;
    expect(k.text).toContain('\n#TX:Muddatni uzaytiramiz'); expect(post).not.toHaveBeenCalled();
    expect((await call(`g:qy:${KID}:31`)).amal).toBe('xat_tx_yoq');
    expect((await call(`g:qy:${KID}:31`, k.text)).amal).toBe('xat_javob_ok');
    expect(post.mock.calls[0][0].json).toMatchObject({ amal: 'xat_yubor', kompaniya_id: KID, qabul_kompaniya_id: 55, turi: 'javob_xati', mavzu: 'Javob: Muddat haqida', matn: 'Muddatni uzaytiramiz', ota_xat_id: 31 });
  });
  it('chiquvchi xatga javob yo‘q; ruxsat yo‘q — matn', async () => {
    yonalt({ 'hujjat-aylanish': () => tafsilot('yuborilgan', false) });
    expect(data((await call(`g:qo:${KID}:31`)).xabar!).some((x) => x.startsWith('g:qj:'))).toBe(false);
    expect((await call(`g:qy:${KID}:31`, 'x\n#TX:Javob matni')).xabar!.matn).toContain('javob yozib bo‘lmaydi');
    yonalt({ 'hujjat-aylanish': () => ({ status: 403, body: { ok: false } }) });
    expect((await call('g:q:0')).xabar!.matn).toContain('ruxsatingiz yo‘q');
  });
});

describe('topshiriqlar', () => {
  const t = (holat: string, versiya = 3) => ({ id: 61, sarlavha: 'Armatura keltirish', holat, muddat: '2026-11-25', obyekt_nom: 'Sinov bog‘i', beruvchi_nom: 'Boshliq', versiya });
  const royxat = (holat: string, versiya?: number) => (c: C) => (c.method === 'GET' ? { status: 200, body: { ok: true, qatorlar: [t(holat, versiya)] } } : { status: 200, body: { ok: true } });
  it('harakatlar jadvali veb (src/api/t2-topshiriq) bilan bir xil', () => {
    for (const h of ['berildi', 'qabul_qilindi', 'rad', 'bajarilmoqda', 'bajarildi', 'tasdiqlandi', 'qaytarildi', 'bekor'] as const) {
      for (const y of [0, 1] as const) expect(topshiriqHarakatlari(h, y)).toEqual(harakatlar(h, y === 0 ? 'menga' : 'mendan').map((a) => ({ holat: a.holat, ...(a.izohKerak ? { izohKerak: true } : {}) })));
    }
  });
  it('ro‘yxat: ikki tomon, ochish, holatga mos tugmalar; hech narsa yozilmaydi', async () => {
    const top = vi.fn<H>(royxat('berildi'));
    yonalt({ topshiriq: top });
    const r = (await call('g:z:0:0')).xabar!;
    expect(top.mock.calls[0][0].query).toMatchObject({ kompaniya_id: KID, yonalish: 'menga' });
    expect(data(r)).toEqual(expect.arrayContaining(['g:z:0:0', 'g:z:1:0', `g:zo:${KID}:61:0`]));
    expect((await call('g:z:1:0')).xabar!.matn).toContain('Men bergan');
    const o = (await call(`g:zo:${KID}:61:0`)).xabar!;
    expect(data(o)).toEqual(expect.arrayContaining([`g:zs:${KID}:61:0:1`, `g:zs:${KID}:61:0:2`]));
    expect(top.mock.calls.every(([c]) => c.method === 'GET')).toBe(true);
  });
  it('holat o‘zgartirish: so‘rov → tasdiq (versiya bilan) → yozish; versiya eskirsa yozilmaydi; ruxsat yo‘q', async () => {
    const top = vi.fn<H>(royxat('berildi', 3));
    yonalt({ topshiriq: top });
    const s = (await call(`g:zs:${KID}:61:0:1`)).xabar!;
    expect(data(s)).toContain(`g:zk:${KID}:61:0:1:3`); expect(top.mock.calls.every(([c]) => c.method === 'GET')).toBe(true);
    expect((await call(`g:zk:${KID}:61:0:1:3`)).amal).toBe('top_ok');
    const yoz = top.mock.calls.find(([c]) => c.method !== 'GET')![0];
    expect(yoz.json).toMatchObject({ amal: 'otish', kompaniya_id: KID, topshiriq_id: 61, kutilgan_versiya: 3, holat: 'qabul_qilindi' });
    expect(yoz.json.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    const eski = await call(`g:zk:${KID}:61:0:1:2`);   // versiya 2 ≠ 3
    expect(eski.amal).toBe('top_eskirgan'); expect(eski.xabar!.matn).toContain('o‘zgargan yoki muddati o‘tgan');
    expect(top.mock.calls.filter(([c]) => c.method !== 'GET')).toHaveLength(1);
    yonalt({ topshiriq: (c) => (c.method === 'GET' ? { status: 200, body: { ok: true, qatorlar: [t('berildi', 3)] } } : { status: 200, body: { ok: false, code: 'RUXSAT_YOQ' } }) });
    expect((await call(`g:zk:${KID}:61:0:1:3`)).xabar!.matn).toContain('ruxsatingiz yo‘q');
    expect((await call(`g:zs:${KID}:61:0:5`)).xabar!.matn).toContain('bajarib bo‘lmaydi');   // berildi → tasdiqlandi (menga tomonida yo‘q)
  });
  it('rad etish sabab bilan (force_reply → tasdiq → yozish); sabab belgisiz bajarilmaydi', async () => {
    const top = vi.fn<H>(royxat('berildi', 3));
    yonalt({ topshiriq: top });
    const s = (await call(`g:zs:${KID}:61:0:2`)).xabar!;
    expect(s.markup?.force_reply).toBe(true); expect(s.matn).toContain(`[gv:${KID}:61:2]`);
    await toliqMatn(ENV, UID, 'uz', CHAT, { text: 'Material yo‘q', reply_to_message: { from: { is_bot: true }, text: s.matn } });
    const k = tg.find((x) => x.metod === 'sendMessage')!.yuk;
    expect(k.text).toContain('#SB:Material yo‘q'); expect(JSON.stringify(k.reply_markup)).toContain(`g:zk:${KID}:61:0:2:3`);
    expect((await call(`g:zk:${KID}:61:0:2:3`)).amal).toBe('top_sabab_yoq');
    expect((await call(`g:zk:${KID}:61:0:2:3`, k.text)).amal).toBe('top_ok');
    expect(top.mock.calls.find(([c]) => c.method !== 'GET')![0].json).toMatchObject({ holat: 'rad', izoh: 'Material yo‘q' });
  });
});

describe('menyu va chuqur havolalar', () => {
  it('asosiy menyuda yangi bo‘limlar; chuqur havolalar callback ga aylanadi', async () => {
    const m = (await call('g:m')).xabar!;
    expect(data(m)).toEqual(expect.arrayContaining(['g:q:0', 'g:z:0:0', 'g:tk']));
    const { chuqurHavolaOl } = await import('./telegram-toliq');
    expect(chuqurHavolaOl('j_79')).toBe('g:j:79:0:0'); expect(chuqurHavolaOl('z')).toBe('g:z:0:0'); expect(chuqurHavolaOl('x')).toBe('g:q:0'); expect(chuqurHavolaOl('k')).toBe('g:tk');
    expect(sarlavhaMatn(m).length).toBeGreaterThan(0);
  });
});
