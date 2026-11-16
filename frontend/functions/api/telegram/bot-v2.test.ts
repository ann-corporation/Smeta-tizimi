// @vitest-environment node
/* Telegram bot V2 (1-bosqich): /bugun, /obyektlar, /jarvis, /kunlik, rasm→foto-dalil, inline tasdiq, kunlik cron.
   SINTETIK ma'lumot; tarmoq (Telegram + Supabase) to'liq soxtalashtirilgan. Haqiqiy middleware → shlyuz zanjiri ishlaydi. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ hisobli: vi.fn(), Xato: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } } }));
vi.mock('../../_shared/ai-hisobli', () => ({ aiHisobli: ai.hisobli, AiByudjetXatosi: ai.Xato }));

import { vakolatKeshTozala } from '../../_shared/role-authority';
import { bildirishnomaTugmalari } from '../../_shared/telegram-tugma';
import { limitTozala } from '../../_shared/telegram-bot';
import { onRequestPost as kunlik } from './kunlik';
import { bogliqlik } from '../bildirishnoma-yetkaz';
import { updateIshla } from './webhook';
import { PERMISSIONS } from '../../../src/lib/company-authorization/effective-authorization';

const TOKEN = '123456789:AAFakeSinovTokenFakeSinovToken_abc';
const R2 = { put: vi.fn(async () => undefined) };
const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32), TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: 'webhook-sir-sinov-0123456789', BILDIRISHNOMA_CRON_KALIT: 'cron-kalit-sinov-0123456789abcdef', R2_CANONICAL: R2 };
const SITE = 'https://qurai.uz';
const TG = 5550001; const UID = 7;
const ALL = PERMISSIONS.filter((p) => !p.startsWith('control.global'));

type Handler = (body: any, url: URL) => unknown;
type Net = { rpc: string[]; yuk: Record<string, any[]>; tg: { metod: string; yuk: any }[]; urls: string[]; sozlamalar: Record<string, unknown> };
/** `h` — Supabase (rpc nomi yoki jadval nomi → javob); `tgH` — Telegram metod → javob. */
function net(h: Record<string, Handler>, tgH: Record<string, (b: any) => unknown> = {}): Net {
  const c: Net = { rpc: [], yuk: {}, tg: [], urls: [], sozlamalar: {} };
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    if (url.host === 'api.telegram.org') {
      if (url.pathname.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200 });
      const metod = url.pathname.split('/').at(-1)!;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      c.tg.push({ metod, yuk: body });
      const r = tgH[metod]?.(body);
      return Response.json(r ?? { ok: true, result: true });
    }
    const nom = url.pathname.split('/').at(-1)!;
    let body: any = {};
    try { body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch { body = {}; }
    c.rpc.push(nom); (c.yuk[nom] ||= []).push(body); c.urls.push(raw);
    const f = h[nom];
    if (!f) return Response.json({ message: 'not found' }, { status: 404 });
    const r = f(body, url);
    return r instanceof Response ? r : Response.json(r);
  }));
  return c;
}

const men = (perms: string[] = ALL, rol = 'pto', kompaniyalar = [17]) => () => ({
  ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol', ism: 'Sinov PTO' },
  azoliklar: kompaniyalar.map((id) => ({ kompaniya_id: id, nom: 'Sinov MChJ ' + id, rol, faol: true })),
  context_kompaniyalar: kompaniyalar.map((id) => ({ kompaniya_id: id, effective_role: rol, permissions: perms, explicit_denials: [] })),
});
/** PostgREST kabi: Content-Range bilan (sb sahifalash shunga tayanadi). */
const satrlar = (rows: unknown[]) => new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0', 'Content-Type': 'application/json' } });
const aniqla = () => ({ ok: true, ulangan: true, foydalanuvchi_id: UID });
const qabul = () => ({ ok: true, yangi: true, limit: false });
const asos = (extra: Record<string, Handler> = {}) => ({ t2_telegram_update_qabul_v1: qabul, t2_telegram_aniqla_v1: aniqla, t2_men_v1: men(), ...extra });

let uid = 100;
const msg = (text: string, extra: Record<string, unknown> = {}) => ({ update_id: ++uid, message: { text, chat: { id: TG, type: 'private' }, from: { id: TG, language_code: 'uz' }, ...extra } });
const cb = (data: string, over: Record<string, unknown> = {}) => ({ update_id: ++uid, callback_query: { id: 'cbq1', from: { id: TG, language_code: 'uz' }, data,
  message: { message_id: 42, chat: { id: TG, type: 'private' } }, ...over } });
const javobMatni = (c: Net) => c.tg.filter((x) => x.metod === 'sendMessage').map((x) => x.yuk.text).join('\n---\n');
/** sb (t2_akt) javobi: tur filtri URL dan. */
const aktSoni = (f2: number, fakt: number): Handler => (_b, url) => {
  const n = url.search.includes('tur=eq.f2') ? f2 : fakt;
  return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i + 1 }))), { status: 200, headers: { 'Content-Range': n ? `0-${n - 1}/${n}` : '*/0', 'Content-Type': 'application/json' } });
};

beforeEach(() => { limitTozala(); ai.hisobli.mockReset(); R2.put.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vakolatKeshTozala(); });

describe('/start (ulangan) — holat va asosiy menyu', () => {
  it('ism, Mini App tugmasi va menyu callback tugmalari', async () => {
    const c = net(asos());
    expect(await updateIshla(ENV, msg('/start') as never)).toBe('salom');
    const m = c.tg.find((x) => x.metod === 'sendMessage')!.yuk;
    expect(m.text).toContain('Sinov PTO'); expect(m.text).toContain('/bugun');
    const tugmalar = m.reply_markup.inline_keyboard.flat();
    expect(tugmalar.some((t: any) => t.web_app?.url === SITE + '/tg')).toBe(true);
    expect(tugmalar.map((t: any) => t.callback_data).filter(Boolean)).toEqual(['m:b', 'm:o', 'm:y']);
  });
  it('ulanmagan foydalanuvchi — hech bir yangi buyruq ishlamaydi', async () => {
    const c = net({ t2_telegram_update_qabul_v1: qabul, t2_telegram_aniqla_v1: () => ({ ok: true, ulangan: false }) });
    for (const t of ['/bugun', '/obyektlar', '/jarvis savol', '/kunlik on']) expect(await updateIshla(ENV, msg(t) as never)).toBe('ulanmagan');
    expect(c.rpc.filter((r) => !['t2_telegram_update_qabul_v1', 't2_telegram_aniqla_v1'].includes(r))).toEqual([]);
  });
});

describe('/bugun — faqat o‘qish, DB foydalanuvchisi sifatida', () => {
  it('tasdiq soni + F-2/fakt qoralamalari; actor = bog‘langan foydalanuvchi', async () => {
    const c = net(asos({ t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 3, xat: 1, murojaat: 0 } }), t2_akt: aktSoni(2, 5) }));
    expect(await updateIshla(ENV, msg('/bugun') as never)).toBe('bugun');
    const t = javobMatni(c);
    expect(t).toContain('Tasdiq kutayotgan hujjatlar: 3'); expect(t).toContain('F-2 qoralamalari: 2'); expect(t).toContain('Tugallanmagan fakt (qoralama): 5');
    expect(c.yuk.t2_hujjat_kiruvchi_v1[0]).toEqual({ p_actor_id: UID, p_kompaniya_id: 17 });
    // Telegram id hech qayerda actor sifatida ishlatilmagan; hech qanday yozuvchi RPC chaqirilmagan.
    expect(JSON.stringify(c.yuk.t2_hujjat_kiruvchi_v1)).not.toContain(String(TG));
    const yozuvchi = c.rpc.filter((r) => /(_yoz|_yarat|_qaror|_tasdiq|bogla|sarf|update|ochir)/.test(r) && r !== 't2_telegram_update_qabul_v1');
    expect(yozuvchi).toEqual([]);
    expect(c.tg.find((x) => x.metod === 'sendMessage')!.yuk.reply_markup.inline_keyboard.flat().every((b: any) => b.web_app)).toBe(true);
  });
  it('rolga mos: buyurtmachiga F-2/fakt qoralamalari ko‘rsatilmaydi (so‘ralmaydi ham)', async () => {
    const c = net(asos({ t2_men_v1: men(['company.read', 'document.read'], 'buyurtmachi'), t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 1 } }) }));
    await updateIshla(ENV, msg('/bugun') as never);
    const t = javobMatni(c);
    expect(t).toContain('Tasdiq kutayotgan hujjatlar: 1'); expect(t).not.toContain('F-2 qoralamalari'); expect(c.rpc).not.toContain('t2_akt');
  });
  it('ruxsat yo‘q kompaniya jim o‘tkaziladi: son «—» (0 emas)', async () => {
    net(asos({ t2_men_v1: men(['company.read']), t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 9 } }), t2_akt: aktSoni(4, 4) }));
    const c2 = net(asos({ t2_men_v1: men(['company.read']), t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 9 } }), t2_akt: aktSoni(4, 4) }));
    await updateIshla(ENV, msg('/bugun') as never);
    const t = javobMatni(c2);
    expect(t).toContain('Tasdiq kutayotgan hujjatlar: —'); expect(c2.rpc).not.toContain('t2_hujjat_kiruvchi_v1');
  });
  it('ru tilida matn ruscha', async () => {
    const c = net(asos({ t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 0 } }), t2_akt: aktSoni(0, 0) }));
    const u = msg('/bugun'); (u.message.from as any).language_code = 'ru';
    await updateIshla(ENV, u as never);
    expect(javobMatni(c)).toContain('Документов ждут вашего согласования: 0');
  });
});

describe('/obyektlar', () => {
  it('faol obyektlar ro‘yxati + Mini App havolalari; tenant filtri serverda', async () => {
    const c = net(asos({ t2_obyekt: () => satrlar([{ id: 79, nom: 'Fast Food 1-etaj', kompaniya_id: 17 }, { id: 80, nom: 'Sinov bog', kompaniya_id: 17 }]) }));
    expect(await updateIshla(ENV, msg('/obyektlar') as never)).toBe('obyektlar');
    const m = c.tg.find((x) => x.metod === 'sendMessage')!.yuk;
    expect(m.text).toContain('#79 Fast Food 1-etaj'); expect(m.text).toContain('#80 Sinov bog');
    expect(m.reply_markup.inline_keyboard.flat()[0].web_app.url).toBe(SITE + '/tg?to=' + encodeURIComponent('/admin/obyektlar'));
    const url = decodeURIComponent(c.urls.find((u) => u.includes('/t2_obyekt'))!);
    expect(url).toContain('kompaniya_id=in.(17)'); expect(url).toContain('holat=eq.faol');
  });
});

describe('/jarvis — mavjud ai-savol (aiHisobli: limit + token yechish)', () => {
  const umumiy = { t2_ai_umumiy: () => ({ ok: true, izoh: '', obyektlar: [{ id: 79, nom: 'Sinov', smeta: 10, fakt: 20, f2: 30, narxsiz: 0, toliq: true }] }) };
  const envAi = { ...ENV, OPENROUTER_API_KEY: 'test' };
  it('hisobli yo‘l: actor + kompaniya + profil/amal; javob yuboriladi; Workers AI chetlab o‘tilmaydi', async () => {
    const worker = vi.fn();
    ai.hisobli.mockResolvedValue({ text: 'Dalilli javob', provider: 'openrouter', model: 'm' });
    const c = net(asos(umumiy));
    expect(await updateIshla({ ...envAi, AI: { run: worker } } as never, msg('/jarvis Narxlar haqida tushuntir') as never)).toBe('jarvis');
    expect(ai.hisobli).toHaveBeenCalledTimes(1);
    expect(ai.hisobli.mock.calls[0].slice(1, 5)).toEqual([UID, 17, 'company_access', 'jarvis_eski']);
    expect(worker).not.toHaveBeenCalled();
    expect(javobMatni(c)).toBe('Dalilli javob');
  });
  it('byudjet/limit tugagan — model chaqirilmaydi, server xabari foydalanuvchiga', async () => {
    ai.hisobli.mockRejectedValue(new ai.Xato('BYUDJET_YOQ', 'AI uchun oylik limit belgilanmagan'));
    const c = net(asos(umumiy));
    await updateIshla(envAi as never, msg('/jarvis Narxlar haqida tushuntir') as never);
    expect(javobMatni(c)).toContain('oylik limit');
  });
  it('bo‘sh savol — model chaqirilmaydi; juda uzun savol — rad', async () => {
    const c = net(asos(umumiy));
    await updateIshla(envAi as never, msg('/jarvis') as never);
    await updateIshla(envAi as never, msg('/jarvis ' + 'x'.repeat(1001)) as never);
    expect(ai.hisobli).not.toHaveBeenCalled(); expect(c.rpc).not.toContain('t2_ai_umumiy');
    expect(javobMatni(c)).toContain('Jarvis uchun kompaniyani tanlang.'); expect(javobMatni(c)).toContain('juda uzun');
  });
  it('soʻrov limiti: daqiqada 5 tadan keyin AI chaqirilmaydi', async () => {
    ai.hisobli.mockResolvedValue({ text: 'ok', provider: 'p', model: 'm' });
    const c = net(asos(umumiy));
    for (let i = 0; i < 7; i++) await updateIshla(envAi as never, msg('/jarvis Narxlar haqida tushuntir ' + i) as never);
    expect(ai.hisobli).toHaveBeenCalledTimes(5);
    expect(javobMatni(c)).toContain('Juda ko‘p so‘rov');
  });
  it('ruxsati yo‘q rol (document.read yo‘q) — middleware rad etadi, AI chaqirilmaydi', async () => {
    const c = net(asos({ ...umumiy, t2_men_v1: men(['company.read']) }));
    await updateIshla(envAi as never, msg('/jarvis Narxlar haqida tushuntir') as never);
    expect(ai.hisobli).not.toHaveBeenCalled(); expect(c.rpc).not.toContain('t2_ai_umumiy');
  });
});

it('lists shared Jarvis chats only through the bound actor and selected company', async () => {
  const tag = 'a'.repeat(32);
  const row = { id: 'test-chat', sarlavha: 'Synthetic chat', yangilandi: '2026-11-16T10:00:00Z', toliq: true };
  const c = net(asos({
    t2_jarvis_suhbat_page_v1: (body) => ({ ok: true, royxat: body.p_before_id ? [] : [row],
      keyingi: body.p_before_id ? null : { at: '2026-11-16T10:00:00.123456+00:00', row: '9007199254740993' } }),
    t2_jarvis_suhbat_sync_v1: (body) => ({ ok: true, royxat: [row], suhbat: body.p_klient_id ? {
      id: row.id, holat: 'changed', etag: tag, xabarlar: [{ r: 'ai', m: 'Shared synthetic answer' }], qisqartma: null,
    } : null }),
    t2_agent_kasb_v1: () => ({ ok: true, rol: 'pto', profil: 'pto', nom: 'Synthetic assistant',
      vazifa: 'Synthetic remit', kategoriyalar: [], namuna_savollar: [] }),
    t2_jarvis_suhbat_mutate_v1: () => ({ ok: true, id: row.id, etag: 'b'.repeat(32) }),
  }));
  expect(await updateIshla(ENV, msg('/jarvis') as never)).toBe('jarvis');
  expect(await updateIshla(ENV, cb('j:c:17') as never)).toBe('cb:jarvis');
  const pages = c.tg.find(x => x.metod === 'sendMessage' && x.yuk.reply_markup?.inline_keyboard?.some((items: any[]) =>
    items[0].callback_data?.startsWith('j:p:')));
  const older = pages?.yuk.reply_markup.inline_keyboard.at(-1)[0].callback_data;
  expect(older).toMatch(/^j:p:17:/);
  expect(older.length).toBeLessThanOrEqual(64);
  expect(await updateIshla(ENV, cb(older) as never)).toBe('cb:jarvis');
  expect(await updateIshla(ENV, cb('j:o:17:test-chat') as never)).toBe('cb:jarvis');
  expect(await updateIshla(ENV, cb('j:o:18:test-chat') as never)).toBe('cb:jarvis');
  expect(c.yuk.t2_jarvis_suhbat_sync_v1).toEqual([
    { p_actor_id: UID, p_kompaniya_id: 17, p_klient_id: 'test-chat', p_etag: null },
  ]);
  expect(c.yuk.t2_jarvis_suhbat_page_v1).toEqual([
    { p_actor_id: UID, p_kompaniya_id: 17, p_before_at: null, p_before_id: null },
    { p_actor_id: UID, p_kompaniya_id: 17, p_before_at: '2026-11-16T10:00:00.123456Z', p_before_id: '9007199254740993' },
  ]);
  const sends = c.tg.filter(x => x.metod === 'sendMessage').map(x => x.yuk);
  expect(sends.some(x => x.reply_markup?.inline_keyboard?.some((r: any[]) => r[0].callback_data === 'j:o:17:test-chat'))).toBe(true);
  expect(sends.some(x => x.text.includes('Shared synthetic answer'))).toBe(true);
  const prompt = sends.find(x => x.reply_markup?.force_reply && x.entities?.[0].url.includes('#jarvis-tg='));
  expect(prompt).toBeTruthy();
  expect(await updateIshla(ENV, msg('Salom', { reply_to_message: { from: { is_bot: true }, entities: prompt.entities } }) as never)).toBe('jarvis_reply');
  expect(c.yuk.t2_jarvis_suhbat_mutate_v1).toEqual([{
    p_actor_id: UID, p_kompaniya_id: 17, p_klient_id: row.id, p_etag: tag, p_amal: 'append',
    p_sarlavha: null, p_xabarlar: [{ r: 'user', m: 'Salom' }, { r: 'ai', m: expect.stringContaining('Synthetic assistant') }],
  }]);
  expect(ai.hisobli).not.toHaveBeenCalled();
});

describe('/kunlik on|off', () => {
  it('yoqish: bog‘langan foydalanuvchi uchun sozlama; tasdiq xabari', async () => {
    const c = net(asos({ t2_telegram_sozlama_v1: (b) => ({ ok: true, bildirishnoma: { topshiriq: true, kunlik: b.p_bildirishnoma.kunlik } }) }));
    expect(await updateIshla(ENV, msg('/kunlik on') as never)).toBe('kunlik');
    expect(c.yuk.t2_telegram_sozlama_v1[0]).toEqual({ p_actor_id: UID, p_bildirishnoma: { kunlik: true } });
    expect(javobMatni(c)).toContain('yoqildi');
    await updateIshla(ENV, msg('/kunlik off') as never);
    expect(c.yuk.t2_telegram_sozlama_v1[1].p_bildirishnoma).toEqual({ kunlik: false });
  });
  it('migratsiya qo‘llanmagan (eski baza kalitni e’tiborsiz qoldiradi) — yolg‘on «yoqildi» demaydi', async () => {
    const c = net(asos({ t2_telegram_sozlama_v1: () => ({ ok: true, bildirishnoma: { topshiriq: true } }) }));
    await updateIshla(ENV, msg('/kunlik on') as never);
    expect(javobMatni(c)).toContain('hali serverda yoqilmagan'); expect(javobMatni(c)).not.toContain('yoqildi.');
  });
  it('argumentsiz — yordam', async () => {
    const c = net(asos());
    await updateIshla(ENV, msg('/kunlik') as never);
    expect(javobMatni(c)).toContain('/kunlik on'); expect(c.rpc).not.toContain('t2_telegram_sozlama_v1');
  });
});

describe('rasm → foto-dalil (umumiy, biriktirilmagan; summa yozilmaydi)', () => {
  const rasm = (caption?: string) => msg('', { text: undefined, caption, photo: [{ file_id: 'AgACsmall1234567890', width: 90, height: 90 }, { file_id: 'AgACbig123456789012', width: 1280, height: 960, file_size: 5 }] });
  const yukHandlers = (): Record<string, Handler> => ({
    t2_obyekt: (_b, url) => (url.search.includes('select=kompaniya_id') ? [{ kompaniya_id: 17 }] : satrlar([{ id: 79, nom: 'Fast Food', kompaniya_id: 17 }, { id: 80, nom: 'Sinov bog', kompaniya_id: 17 }])),
    t2_document_registry: () => [{ kompaniya_id: 17 }],
    t2_document_canonical_reserve_v1: () => ({ ok: true, document_id: 55, r2_key: 'k/55', canonical_storage_status: 'reserved' }),
    t2_document_canonical_finalize_v1: () => ({ ok: true, revision_seq: 1, sha256: 'x', sha256_verified: true, versiya: 1 }),
    t2_foto_dalil_bogla_v1: () => ({ ok: true, id: 9 }),
  });
  const tgH = { getFile: () => ({ ok: true, result: { file_path: 'photos/file_1.jpg', file_size: 5 } }) };

  it('izohdagi #obyekt → R2 + reyestr + umumiy dalil; Mini App havolasi; faktga hech narsa yozilmaydi', async () => {
    const c = net(asos(yukHandlers()), tgH);
    expect(await updateIshla(ENV, rasm('Beton quyildi #79') as never)).toBe('foto');
    expect(c.tg.find((x) => x.metod === 'getFile')!.yuk).toEqual({ file_id: 'AgACbig123456789012' }); // eng katta o‘lcham
    expect(R2.put).toHaveBeenCalledTimes(1);
    const r = c.yuk.t2_document_canonical_reserve_v1[0];
    expect(r).toMatchObject({ p_kompaniya_id: 17, p_actor_id: UID, p_obyekt_id: 79, p_document_type: 'foto_dalil' });
    const b = c.yuk.t2_foto_dalil_bogla_v1[0];
    expect(b).toMatchObject({ p_actor_id: UID, p_kompaniya_id: 17, p_obyekt_id: 79, p_document_id: 55, p_manba_turi: 'umumiy', p_manba_id: null, p_izoh: 'Beton quyildi' });
    expect(c.rpc.filter((x) => /fakt|akt_qator|qator_tahrir|sarf/.test(x))).toEqual([]);
    const m = c.tg.filter((x) => x.metod === 'sendMessage').at(-1)!.yuk;
    expect(m.text).toContain('Fast Food'); expect(m.text).toContain('hali faktga biriktirilmagan');
    expect(m.reply_markup.inline_keyboard[0][0].web_app.url).toBe(SITE + '/tg?to=' + encodeURIComponent('/admin/foto'));
    // Telegram fayl URL i (token ichida) hech qayerga yozilmagan.
    expect(JSON.stringify(c.tg.map((x) => x.yuk))).not.toContain(TOKEN);
  });
  it('bitta obyekt bo‘lsa izohsiz ham o‘sha obyektga; bir nechtasi bo‘lsa — taxmin qilmaydi, so‘raydi', async () => {
    let c = net(asos({ ...yukHandlers(), t2_obyekt: (_b, url) => (url.search.includes('select=kompaniya_id') ? [{ kompaniya_id: 17 }] : satrlar([{ id: 79, nom: 'Yagona', kompaniya_id: 17 }])) }), tgH);
    await updateIshla(ENV, rasm() as never);
    expect(c.yuk.t2_foto_dalil_bogla_v1[0].p_obyekt_id).toBe(79);
    limitTozala(); vakolatKeshTozala();
    c = net(asos(yukHandlers()), tgH);
    await updateIshla(ENV, rasm('izohsiz') as never);
    expect(c.rpc).not.toContain('t2_document_canonical_reserve_v1'); expect(R2.put).toHaveBeenCalledTimes(1);
    expect(javobMatni(c)).toContain('#79 Fast Food'); expect(c.tg.some((x) => x.metod === 'getFile')).toBe(false);
  });
  it('ruxsatli obyektlar ro‘yxatida bo‘lmagan #raqam — rad (begona obyektga yozilmaydi)', async () => {
    const c = net(asos(yukHandlers()), tgH);
    await updateIshla(ENV, rasm('#999') as never);
    expect(javobMatni(c)).toContain('sizga ochiq emas');
    expect(c.rpc).not.toContain('t2_document_canonical_reserve_v1'); expect(c.rpc).not.toContain('t2_foto_dalil_bogla_v1');
  });
  it('hujjat yozish ruxsati yo‘q rol — middleware rad etadi, R2 ga yozilmaydi', async () => {
    const c = net(asos({ ...yukHandlers(), t2_men_v1: men(ALL.filter((p) => p !== 'document.write')) }), tgH);
    await updateIshla(ENV, rasm('#79') as never);
    expect(R2.put).not.toHaveBeenCalled(); expect(c.rpc).not.toContain('t2_foto_dalil_bogla_v1');
    expect(javobMatni(c)).toContain('saqlanmadi');
  });
  it('katta rasm (10 MB dan) olinmaydi', async () => {
    const c = net(asos(yukHandlers()), { getFile: () => ({ ok: true, result: { file_path: 'photos/big.jpg', file_size: 11 * 1024 * 1024 } }) });
    await updateIshla(ENV, rasm('#79') as never);
    expect(R2.put).not.toHaveBeenCalled(); expect(javobMatni(c)).toContain('10 MB');
  });
});

describe('bildirishnoma tugmalari (Ko‘rish / Tasdiqlash)', () => {
  it('hujjat.tasdiq_kutmoqda → Ko‘rish (Mini App chuqur havola) + Tasdiqlash callback', () => {
    const mk = bildirishnomaTugmalari(ENV, 'uz', 'hujjat.tasdiq_kutmoqda', '/admin/hujjat-aylanish?zanjir=5', { zanjir_id: 5 })!;
    const [kor, tas] = mk.inline_keyboard[0] as any[];
    expect(kor.web_app.url).toBe(SITE + '/tg?to=' + encodeURIComponent('/admin/hujjat-aylanish?zanjir=5'));
    expect(tas.callback_data).toBe('tq:5'); expect(tas.callback_data.length).toBeLessThanOrEqual(64);
  });
  it('boshqa mavzu — faqat Ko‘rish; zanjir_id yo‘q/yaroqsiz — Tasdiqlash yo‘q; tashqi havola Mini App ga o‘tmaydi', () => {
    expect(bildirishnomaTugmalari(ENV, 'uz', 'hujjat.tasdiqlandi', '/admin/hujjat-aylanish', { zanjir_id: 5 })!.inline_keyboard[0]).toHaveLength(1);
    expect(bildirishnomaTugmalari(ENV, 'uz', 'hujjat.tasdiq_kutmoqda', '/admin/hujjat-aylanish', { zanjir_id: '5; drop' })!.inline_keyboard[0]).toHaveLength(1);
    expect(bildirishnomaTugmalari(ENV, 'uz', 'hujjat.tasdiqlandi', null, {})).toBeNull();
    const t = bildirishnomaTugmalari(ENV, 'uz', 'hujjat.tasdiqlandi', '//yomon.example/x', {})!.inline_keyboard[0][0] as any;
    expect(t.web_app.url).toBe(SITE + '/tg');
  });
  it('yetkazuvchi: yuborilgan xabarda tugmalar bor', async () => {
    const c = net({});
    const r = await bogliqlik(ENV as never).yubor(TG, 'matn', 'uz', '/admin/hujjat-aylanish?zanjir=5', { mavzu: 'hujjat.tasdiq_kutmoqda', parametrlar: { zanjir_id: 5 } });
    expect(r.ok).toBe(true);
    const tugmalar = c.tg[0].yuk.reply_markup.inline_keyboard.flat();
    expect(tugmalar.map((t: any) => t.callback_data).filter(Boolean)).toEqual(['tq:5']);
    expect(tugmalar[0].web_app.url).toContain('/tg?to=');
  });
});

describe('callback: hujjat tasdiqi — bog‘lanish + ruxsat SERVERDA', () => {
  const qaror = (javob: unknown = { ok: true, holat: 'tasdiqlandi' }) => ({ t2_hujjat_zanjir_qaror_v1: () => javob });
  /** Zanjir tafsiloti (mavjud o‘qish RPC si): navbat shu kompaniyada (`men`). `raund`/`tartib` — qadam belgisi manbai. */
  const tafsilot = (over: Record<string, unknown> = {}, qadamlar: unknown[] = [{ tartib: 1, rol: 'pto', holat: 'navbat', men: true }]): Handler => () => ({
    ok: true, qadamlar,
    zanjir: { id: 5, hujjat_turi: 'f2', sarlavha: 'F-2 oktyabr', holat: 'jarayonda', raund: 1, obyekt_id: 79, manba_jadval: 't2_akt', manba_id: 11, yaratildi: '2026-11-10T08:00:00Z', ...over },
  });
  const hujjatOqish = (zanjir: Handler = tafsilot()): Record<string, Handler> => ({
    t2_hujjat_zanjir_tafsilot_v1: zanjir,
    t2_akt: () => satrlar([{ id: 11, raqam: 'F2-04', oy: '2026-10-31', tur: 'f2', hujjat_jami: 1234567.5, obyekt_id: 79 }]),
    t2_obyekt: () => satrlar([{ id: 79, nom: 'Fast Food 1-etaj', kompaniya_id: 17 }]),
  });

  it('«Tasdiqlash» — hujjat tafsiloti (tur, raqam, obyekt, sana, jami) + qadam belgili «Ha»; RPC chaqirilmaydi', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish() }));
    expect(await updateIshla(ENV, cb('tq:5') as never)).toBe('cb:tasdiq_sorov');
    expect(c.rpc).not.toContain('t2_hujjat_zanjir_qaror_v1');
    expect(c.yuk.t2_hujjat_zanjir_tafsilot_v1[0]).toEqual({ p_actor_id: UID, p_kompaniya_id: 17, p_zanjir_id: 5 });
    expect(c.tg.map((x) => x.metod)).toEqual(['answerCallbackQuery', 'sendMessage']);
    const t = c.tg[1].yuk.text as string;
    expect(t).toContain('Hujjat № 5'); expect(t).toContain('F-2 (bajarilgan ishlar akti)'); expect(t).toContain('Raqami: F2-04');
    expect(t).toContain('Obyekt: Fast Food 1-etaj'); expect(t).toContain('Sana: 2026-10-31'); expect(t).toContain('Jami: 1 234 567,5');
    const d = c.tg[1].yuk.reply_markup.inline_keyboard[0].map((x: any) => x.callback_data);
    expect(d).toEqual(['tqy:5:1-1', 'tqn:5']); d.forEach((x: string) => expect(x.length).toBeLessThanOrEqual(64));
  });
  it('tafsilot manbasi yo‘q (akt o‘qilmadi) — noma’lum maydonlar «—» (0 emas)', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish(tafsilot({ manba_jadval: null, manba_id: null, obyekt_id: null })) }));
    await updateIshla(ENV, cb('tq:5') as never);
    const t = c.tg[1].yuk.text as string;
    expect(t).toContain('Raqami: —'); expect(t).toContain('Obyekt: —'); expect(t).toContain('Jami: —'); expect(t).not.toContain('Jami: 0');
  });
  it('navbat sizniki emas — so‘rovda «Ha» tugmasi chiqmaydi', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish(tafsilot({}, [{ tartib: 1, rol: 'pto', holat: 'navbat', men: false }])) }));
    expect(await updateIshla(ENV, cb('tq:5') as never)).toBe('cb:tasdiq_sorov_navbat_emas');
    expect(JSON.stringify(c.tg)).not.toContain('tqy:');
  });
  it('«Ha» — qadam belgisi mos: DB foydalanuvchisi nomidan mavjud RPC; tugmalar olib tashlanadi', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish() }));
    expect(await updateIshla(ENV, cb('tqy:5:1-1') as never)).toBe('cb:tasdiq_ok');
    expect(c.yuk.t2_hujjat_zanjir_qaror_v1).toEqual([{ p_actor_id: UID, p_kompaniya_id: 17, p_zanjir_id: 5, p_qaror: 'tasdiqlash', p_izoh: null }]);
    expect(javobMatni(c)).toContain('tasdiqlandi');
    expect(c.tg.find((x) => x.metod === 'editMessageReplyMarkup')!.yuk).toMatchObject({ chat_id: TG, message_id: 42, reply_markup: { inline_keyboard: [] } });
  });
  it('QULF: PIN/biometrik talab qilinsa «Ha» botda tasdiqlamaydi — RPC chaqirilmaydi, Mini App ga yo‘naltiradi', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish(), t2_qulf_talab_v1: () => ({ talab: true, rejim: 'pin', pin: true, kalit: false }) }));
    expect(await updateIshla(ENV, cb('tqy:5:1-1') as never)).toBe('cb:tasdiq_step_up');
    expect(c.rpc).not.toContain('t2_hujjat_zanjir_qaror_v1');
    expect(javobMatni(c)).toContain('PIN yoki biometrik');
  });
  it('ESKIRGAN «Ha»: so‘rovdan keyin zanjir keyingi qadamga/raundga o‘tgan — hech narsa tasdiqlanmaydi', async () => {
    for (const [nom, zanjir] of [
      ['keyingi qadam', tafsilot({}, [{ tartib: 2, rol: 'rahbar', holat: 'navbat', men: true }])],
      ['yangi raund (qaytarilib qayta yuborilgan)', tafsilot({ raund: 2 })],
      ['yopilgan', tafsilot({ holat: 'tasdiqlandi' })],
    ] as [string, Handler][]) {
      vakolatKeshTozala();
      const c = net(asos({ ...qaror(), ...hujjatOqish(zanjir) }));
      const amal = await updateIshla(ENV, cb('tqy:5:1-1') as never);
      expect(amal, nom).toMatch(/^cb:tasdiq_(eskirgan|navbat_emas)$/);
      expect(c.rpc, nom).not.toContain('t2_hujjat_zanjir_qaror_v1');
      expect(javobMatni(c), nom).not.toContain('Hujjat tasdiqlandi.');
    }
  });
  it('belgisiz (eski) «Ha» — tasdiqlanmaydi, RPC chaqirilmaydi', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish() }));
    expect(await updateIshla(ENV, cb('tqy:5') as never)).toBe('cb:tasdiq_eskirgan');
    expect(c.rpc).not.toContain('t2_hujjat_zanjir_qaror_v1'); expect(c.rpc).not.toContain('t2_hujjat_zanjir_tafsilot_v1');
  });
  it('ulanmagan Telegram — callback hech narsa qilmaydi', async () => {
    const c = net({ t2_telegram_update_qabul_v1: qabul, t2_telegram_aniqla_v1: () => ({ ok: true, ulangan: false }), ...qaror(), ...hujjatOqish() });
    expect(await updateIshla(ENV, cb('tqy:5:1-1') as never)).toBe('cb_ulanmagan');
    expect(c.rpc).not.toContain('t2_hujjat_zanjir_qaror_v1'); expect(c.rpc).not.toContain('t2_men_v1');
  });
  it('ruxsat yo‘q (document.read yo‘q → middleware rad) — RPC chaqirilmaydi', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish(), t2_men_v1: men(['company.read']) }));
    expect(await updateIshla(ENV, cb('tqy:5:1-1') as never)).toBe('cb:tasdiq_navbat_emas');
    expect(c.rpc).not.toContain('t2_hujjat_zanjir_qaror_v1'); expect(javobMatni(c)).toContain('ruxsatingiz yo‘q');
  });
  it('bir nechta kompaniya: navbat bor kompaniyada qaror (boshqa kompaniyaga tegilmaydi)', async () => {
    const c = net(asos({ t2_men_v1: men(ALL, 'pto', [17, 18]), ...hujjatOqish(), t2_hujjat_zanjir_tafsilot_v1: (b) => tafsilot({}, [{ tartib: 1, rol: 'pto', holat: 'navbat', men: b.p_kompaniya_id === 18 }])(b, new URL('http://x')),
      t2_hujjat_zanjir_qaror_v1: () => ({ ok: true, holat: 'tasdiqlandi' }) }));
    expect(await updateIshla(ENV, cb('tqy:5:1-1') as never)).toBe('cb:tasdiq_ok');
    expect(c.yuk.t2_hujjat_zanjir_qaror_v1.map((b) => b.p_kompaniya_id)).toEqual([18]);
  });
  it('RPC NAVBAT_EMAS (poyga) — «tasdiqlandi» deb aytilmaydi', async () => {
    const c = net(asos({ ...hujjatOqish(), t2_hujjat_zanjir_qaror_v1: () => ({ ok: false, code: 'NAVBAT_EMAS' }) }));
    expect(await updateIshla(ENV, cb('tqy:5:1-1') as never)).toBe('cb:tasdiq_navbat_emas');
    expect(javobMatni(c)).not.toContain('tasdiqlandi.');
  });
  it('soxta/buzilgan callback_data va boshqa chatdan kelgan callback — rad', async () => {
    const c = net(asos({ ...qaror(), ...hujjatOqish() }));
    for (const d of ['tqy:abc', 'tqy:0:1-1', 'tqy:5:1-1;x', 'tqy:99999999999999999999:1-1', 'tqy:5:x']) expect(await updateIshla(ENV, cb(d) as never)).toBe('cb:tasdiq_eskirgan');
    for (const d of ['zzz', 'fb:abc', 'fq:1:2', 'fs:1:2:0', 'fd:1:2:3:4']) expect(['cb:nomalum', 'cb:fakt_notogri']).toContain(await updateIshla(ENV, cb(d) as never));
    expect(c.rpc).not.toContain('t2_hujjat_zanjir_qaror_v1');
    const boshqa = cb('tqy:5:1-1', { message: { message_id: 1, chat: { id: 999, type: 'private' } } });
    expect(await updateIshla(ENV, boshqa as never)).toBe('etibor_yoq');
    const guruh = cb('tqy:5:1-1', { message: { message_id: 1, chat: { id: TG, type: 'group' } } });
    expect(await updateIshla(ENV, guruh as never)).toBe('etibor_yoq');
    expect(c.rpc).not.toContain('t2_hujjat_zanjir_qaror_v1');
  });
  it('takror update_id — qayta bajarilmaydi (idempotent)', async () => {
    const c = net({ t2_telegram_update_qabul_v1: () => ({ ok: true, yangi: false }), ...qaror() });
    expect(await updateIshla(ENV, cb('tqy:5') as never)).toBe('takror');
    expect(c.rpc).toEqual(['t2_telegram_update_qabul_v1']);
  });
  it('menyu callback’lari (/bugun, /obyektlar) bog‘langan foydalanuvchi uchun ishlaydi', async () => {
    const c = net(asos({ t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 2 } }), t2_akt: aktSoni(1, 1), t2_obyekt: () => satrlar([{ id: 79, nom: 'Sinov', kompaniya_id: 17 }]) }));
    expect(await updateIshla(ENV, cb('m:b') as never)).toBe('cb:menyu_bugun');
    expect(await updateIshla(ENV, cb('m:o') as never)).toBe('cb:menyu_obyekt');
    expect(javobMatni(c)).toContain('Tasdiq kutayotgan hujjatlar: 2'); expect(javobMatni(c)).toContain('#79 Sinov');
  });
});

describe('kunlik cron endpointi', () => {
  const req = (kalit?: string, body: unknown = {}) => new Request(SITE + '/api/telegram/kunlik', { method: 'POST', headers: kalit ? { 'X-Cron-Kalit': kalit } : {}, body: JSON.stringify(body) });
  it('kalit yo‘q → 403; sir sozlanmagan → 503; bazaga tegilmaydi', async () => {
    const c = net({});
    expect((await kunlik({ request: req('xato'), env: ENV } as never)).status).toBe(403);
    expect((await kunlik({ request: req(), env: ENV } as never)).status).toBe(403);
    expect((await kunlik({ request: req(ENV.BILDIRISHNOMA_CRON_KALIT), env: { ...ENV, BILDIRISHNOMA_CRON_KALIT: '' } } as never)).status).toBe(503);
    expect(c.rpc).toEqual([]);
  });
  it('rozi foydalanuvchilarga xulosa yuboradi; rozi emas — o‘tkazib yuboradi; kursor qaytadi', async () => {
    const c = net({
      t2_telegram_kunlik_royxat_v1: (b) => ({ ok: true, foydalanuvchilar: [7, 8], keyingi: b.p_keyin_id === 0 ? 8 : null }),
      t2_telegram_manzil_v1: (b) => (b.p_foydalanuvchi_id === 7 ? { ok: true, yuborish: true, chat_id: TG, til: 'uz' } : { ok: true, yuborish: false }),
      t2_men_v1: men(), t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 4 } }), t2_akt: aktSoni(1, 2),
    });
    const r = await kunlik({ request: req(ENV.BILDIRISHNOMA_CRON_KALIT, { keyin_id: 0 }), env: ENV } as never);
    expect(await r.json()).toEqual({ ok: true, telegram: true, yuborildi: 1, otkazildi: 1, keyingi: 8 });
    expect(c.yuk.t2_telegram_manzil_v1.map((b) => b.p_tur)).toEqual(['kunlik', 'kunlik']);
    const m = c.tg.filter((x) => x.metod === 'sendMessage');
    expect(m).toHaveLength(1); expect(m[0].yuk.chat_id).toBe(TG); expect(m[0].yuk.text).toContain('Tasdiq kutayotgan hujjatlar: 4');
    expect(c.yuk.t2_hujjat_kiruvchi_v1[0].p_actor_id).toBe(7);
  });
  it('token yo‘q → hech narsa yuborilmaydi', async () => {
    const c = net({});
    const r = await kunlik({ request: req(ENV.BILDIRISHNOMA_CRON_KALIT), env: { ...ENV, TELEGRAM_BOT_TOKEN: '' } } as never);
    expect(await r.json()).toMatchObject({ telegram: false }); expect(c.rpc).toEqual([]);
  });
});

describe('xavfsizlik: ichki sessiya va matnlar', () => {
  it('ulanmagan callback/rasm/buyruq javobida token chiqmaydi; javob matnlarida token yo‘q', async () => {
    const c = net(asos({ t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 1 } }), t2_akt: aktSoni(0, 0) }));
    await updateIshla(ENV, msg('/bugun') as never);
    expect(JSON.stringify(c.tg)).not.toContain(TOKEN);
  });
  it('console ga matn/token yozilmaydi', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    net(asos({ t2_hujjat_kiruvchi_v1: () => ({ ok: true, sanoq: { zanjir: 1 } }), t2_akt: aktSoni(0, 0), t2_obyekt: () => satrlar([]) }));
    await updateIshla(ENV, msg('/bugun') as never); await updateIshla(ENV, msg('/obyektlar') as never);
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain(TOKEN);
  });
});

/* ───────────────────────── 2-bosqich: rasm → fakt qatori, /fakt qoralama, menyu tugmasi ───────────────────────── */
const obyektH: Handler = (_b, url) => (url.search.includes('select=kompaniya_id') ? [{ kompaniya_id: 17 }] : satrlar([{ id: 79, nom: 'Fast Food', kompaniya_id: 17 }, { id: 80, nom: 'Sinov bog', kompaniya_id: 17 }]));
/** t2_qator: bo‘limlar (tur=rz), qidiruv (tur=in.(bl,mat,ob)), ota zanjiri (id=in.(…)), bitta qator (id=eq.N). 301 → 201 → 101 (Beton), 302 → 202 → 999 (boshqa bo‘lim). */
const qatorH: Handler = (_b, url) => {
  const u = decodeURIComponent(url.search);
  const egalik = /select=id,kompaniya_id&id=in\.\(([\d,]+)\)/.exec(u);   // sb-yoz yozish izolyatsiyasi: qator egasi kompaniya
  if (egalik) return egalik[1].split(',').map((id) => ({ id: Number(id), kompaniya_id: 17 }));
  if (u.includes('tur=eq.rz')) return satrlar([{ id: 101, kod: '03', nom: 'Beton ishlari' }, { id: 102, kod: '04', nom: 'Armatura' }]);
  if (u.includes('tur=in.(bl,mat,ob)')) return satrlar([{ id: 301, ota_id: 201, kod: '03.01', nom: 'Beton quyish', birlik: 'm3' }, { id: 302, ota_id: 202, kod: '09.01', nom: 'Beton plita', birlik: 'm3' }]);
  if (/(?:^|[?&])id=in\.\(/.test(u)) return satrlar([{ id: 201, ota_id: 101 }, { id: 202, ota_id: 999 }]);
  const id = Number(/(?:^|[?&])id=eq\.(\d+)/.exec(u)?.[1]);
  const q: Record<number, unknown> = { 101: { id: 101, kod: '03', nom: 'Beton ishlari' }, 301: { id: 301, kod: '03.01', nom: 'Beton quyish', birlik: 'm3' }, 302: { id: 302, kod: '09.01', nom: 'Beton plita', birlik: 'm3' } };
  return satrlar(q[id] ? [q[id]] : []);
};
const QATOR = { t2_obyekt: obyektH, t2_qator: qatorH };
const YOZUVCHI = /(_yoz|_yarat|_qaror|_tasdiq|bogla|sarf|update|ochir|fakt_belgila|akt_qator)/;
const tugmalar = (c: Net, i = -1) => c.tg.filter((x) => x.metod === 'sendMessage').at(i)!.yuk.reply_markup.inline_keyboard.flat() as any[];

describe('rasm → fakt qatori: Bo‘lim → so‘z → qator → foto-dalil yangila', () => {
  const fotoH = { ...QATOR, t2_foto_dalil_yangila_v1: () => ({ ok: true, id: 9 }) };
  const rasmUpd = () => msg('', { text: undefined, caption: '#79', photo: [{ file_id: 'AgACbig123456789012', width: 1280, height: 960, file_size: 5 }] });
  const yuk: Record<string, Handler> = {
    t2_obyekt: obyektH, t2_document_registry: () => [{ kompaniya_id: 17 }],
    t2_document_canonical_reserve_v1: () => ({ ok: true, document_id: 55, r2_key: 'k/55', canonical_storage_status: 'reserved' }),
    t2_document_canonical_finalize_v1: () => ({ ok: true, revision_seq: 1, sha256: 'x', sha256_verified: true, versiya: 1 }),
    t2_foto_dalil_bogla_v1: () => ({ ok: true, id: 9 }),
  };
  const tgH = { getFile: () => ({ ok: true, result: { file_path: 'photos/file_1.jpg', file_size: 5 } }) };

  it('rasm saqlangach «Fakt qatoriga biriktirish» tugmasi (fb:<foto>:<obyekt>) va menyu tugmasi shu obyektda', async () => {
    const c = net(asos(yuk), tgH);
    expect(await updateIshla(ENV, rasmUpd() as never)).toBe('foto');
    const t = tugmalar(c);
    expect(t.find((x) => x.callback_data)!.callback_data).toBe('fb:9:79');
    expect(t[0].web_app.url).toBe(SITE + '/tg?to=' + encodeURIComponent('/admin/foto'));
    const mb = c.tg.find((x) => x.metod === 'setChatMenuButton')!.yuk;
    expect(mb).toMatchObject({ chat_id: TG, menu_button: { type: 'web_app', web_app: { url: SITE + '/tg?to=' + encodeURIComponent('/admin/fakt?obyekt=79') } } });
  });

  it('to‘liq oqim: bo‘limlar → bo‘lim → javob-so‘z → qator → yangila (manba=qator); faqat o‘sha bo‘lim qatorlari; fakt yozilmaydi', async () => {
    const c = net(asos(fotoH));
    expect(await updateIshla(ENV, cb('fb:9:79') as never)).toBe('cb:foto_bolimlar');
    expect(tugmalar(c).map((x) => x.callback_data)).toEqual(['fd:9:79:101', 'fd:9:79:102']);
    expect(javobMatni(c)).toContain('Fast Food');
    // bo'lim tanlandi → force_reply + kontekst belgisi
    expect(await updateIshla(ENV, cb('fd:9:79:101') as never)).toBe('cb:foto_bolim');
    const so = c.tg.filter((x) => x.metod === 'sendMessage').at(-1)!.yuk;
    expect(so.reply_markup.force_reply).toBe(true); expect(so.text).toContain('[fq:9:79:101]'); expect(so.text).toContain('Beton ishlari');
    // foydalanuvchi shu xabarga javob yozadi
    const javob = msg('beton', { reply_to_message: { from: { is_bot: true }, text: so.text } });
    expect(await updateIshla(ENV, javob as never)).toBe('foto_qidiruv');
    const t = tugmalar(c);
    expect(t.map((x) => x.callback_data)).toEqual(['fq:9:79:301']);   // 302 — boshqa bo'lim ostida: chiqmaydi
    expect(decodeURIComponent(c.urls.filter((u) => u.includes('/t2_qator')).join('\n'))).toContain('nom=ilike.*beton*');
    t.forEach((x) => expect(x.callback_data.length).toBeLessThanOrEqual(64));
    // qator tanlandi
    expect(await updateIshla(ENV, cb('fq:9:79:301') as never)).toBe('cb:foto_biriktirildi');
    expect(c.yuk.t2_foto_dalil_yangila_v1).toEqual([{ p_actor_id: UID, p_kompaniya_id: 17, p_id: 9, p_izoh: null, p_ai_izoh: null, p_ai_taklif: null, p_manba_ozgar: true, p_manba_turi: 'qator', p_manba_id: 301 }]);
    expect(javobMatni(c)).toContain('qatoriga dalil sifatida biriktirildi'); expect(javobMatni(c)).toContain('03.01 Beton quyish');
    expect(c.rpc.filter((r) => YOZUVCHI.test(r) && r !== 't2_foto_dalil_yangila_v1' && r !== 't2_telegram_update_qabul_v1')).toEqual([]);
  });

  it('javob bot xabariga emas / belgisiz / buzilgan belgi — qidiruv ishlamaydi (oddiy matn e’tiborsiz)', async () => {
    const c = net(asos(fotoH));
    for (const reply of [{ from: { is_bot: false }, text: '[fq:9:79:101]' }, { from: { is_bot: true }, text: 'salom' }, { from: { is_bot: true }, text: '[fq:9:x:101]' }, undefined]) {
      expect(await updateIshla(ENV, msg('beton', { reply_to_message: reply }) as never)).toBe('nomalum');
    }
    expect(c.rpc).not.toContain('t2_qator');
  });
  it('begona obyekt/ruxsat: sb tenant filtri obyektni bermasa — hech narsa yozilmaydi', async () => {
    const c = net(asos({ ...fotoH, t2_obyekt: () => satrlar([]) }));
    expect(await updateIshla(ENV, cb('fq:9:79:301') as never)).toBe('cb:foto_obyekt');
    expect(c.rpc).not.toContain('t2_foto_dalil_yangila_v1');
  });
  it('yangila rad etsa (RPC MANBA_TOPILMADI / foto yo‘q) — «biriktirildi» deb aytilmaydi', async () => {
    const c = net(asos({ ...fotoH, t2_foto_dalil_yangila_v1: () => ({ ok: false, code: 'TOPILMADI' }) }));
    expect(await updateIshla(ENV, cb('fq:9:79:301') as never)).toBe('cb:foto_biriktirish_xato');
    expect(javobMatni(c)).not.toContain('biriktirildi');
  });
  it('mos qator yo‘q — qayta javob berishni so‘raydi; bir harfli so‘z — rad', async () => {
    const c = net(asos({ ...fotoH, t2_qator: () => satrlar([]) }));
    const ctx = { from: { is_bot: true }, text: 'x [fq:9:79:101]' };
    await updateIshla(ENV, msg('zzzz', { reply_to_message: ctx }) as never);
    expect(javobMatni(c)).toContain('mos qator topilmadi');
    await updateIshla(ENV, msg('a', { reply_to_message: ctx }) as never);
    expect(javobMatni(c)).toContain('Kamida bitta so‘z');
  });
  it('ruscha: tugma va xabarlar ruscha', async () => {
    const c = net(asos(fotoH));
    const u = cb('fb:9:79'); (u.callback_query.from as any).language_code = 'ru';
    await updateIshla(ENV, u as never);
    expect(javobMatni(c)).toContain('К какому разделу');
  });
});

describe('/fakt <obyekt#> <matn> — AI taklifi → ko‘rib chiqish → faqat QORALAMA', () => {
  const niyat = (o: Record<string, unknown> = {}) => ({ text: JSON.stringify({ niyatlar: [{ tavsif: 'beton quyish', birlik: 'm3', hajm: '12,5', razdel: null, ...o }] }), provider: 'openrouter', model: 'm' });
  const hamma = (extra: Record<string, Handler> = {}) => asos({ ...QATOR, ...extra });
  const envAi = { ...ENV, OPENROUTER_API_KEY: 'test' };

  it('hisobli AI (smeta_ai/smeta_f2_niyat, actor + kompaniya); ko‘rib chiqish matni va «Saqlash» (fs:…) tugmasi; hali hech narsa yozilmagan', async () => {
    ai.hisobli.mockResolvedValue(niyat());
    const c = net(hamma());
    expect(await updateIshla(envAi as never, msg('/fakt 79 beton quyish 12,5 m3') as never)).toBe('fakt');
    expect(ai.hisobli).toHaveBeenCalledTimes(1);
    expect(ai.hisobli.mock.calls[0].slice(1, 5)).toEqual([UID, 17, 'smeta_ai', 'smeta_f2_niyat']);
    const t = javobMatni(c);
    expect(t).toContain('QORALAMASI'); expect(t).toContain('Fast Food'); expect(t).toContain('Hajm: 12,5 m3'); expect(t).toContain('03.01 Beton quyish');
    const b = tugmalar(c);
    expect(b.map((x) => x.callback_data)).toEqual(['fs:79:301:12500', 'fs:79:302:12500', 'fx']);
    b.forEach((x) => expect(x.callback_data.length).toBeLessThanOrEqual(64));
    expect(c.rpc.filter((r) => YOZUVCHI.test(r) && r !== 't2_telegram_update_qabul_v1')).toEqual([]);
  });

  it('«Saqlash» — sb-yoz usta_fakt_qoralama_v1 (QORALAMA): actor=DB foydalanuvchisi; tasdiq/jurnal RPC lari chaqirilmaydi; takror bosish — bir xil operation_id', async () => {
    ai.hisobli.mockResolvedValue(niyat());
    const c = net(hamma({ t2_usta_fakt_qoralama_v1: () => ({ ok: true, qator_soni: 1, holat: 'qoralama' }) }));
    expect(await updateIshla(envAi as never, cb('fs:79:301:12500') as never)).toBe('cb:fakt_saqlandi');
    expect(await updateIshla(envAi as never, cb('fs:79:301:12500') as never)).toBe('cb:fakt_saqlandi');
    const [a, b] = c.yuk.t2_usta_fakt_qoralama_v1;
    expect(a).toMatchObject({ p_actor_id: UID, p_kompaniya_id: 17, p_obyekt_id: 79, p_qatorlar: [{ qator_id: 301, hajm: 12.5 }], p_foto_hujjat_id: null });
    expect(a.p_sana).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(a.p_operation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b.p_operation_id).toBe(a.p_operation_id);
    expect(c.rpc.filter((r) => YOZUVCHI.test(r) && !['t2_usta_fakt_qoralama_v1', 't2_telegram_update_qabul_v1'].includes(r))).toEqual([]);
    expect(c.rpc).not.toContain('t2_usta_fakt_qaror_v1'); expect(c.rpc).not.toContain('t2_fakt_yoz_v2');
    expect(javobMatni(c)).toContain('qoralamasi saqlandi'); expect(javobMatni(c)).toContain('Tasdiqlanmagan');
    expect(ai.hisobli).not.toHaveBeenCalled();   // saqlash qo'shimcha token sarflamaydi
    expect(c.tg.find((x) => x.metod === 'editMessageReplyMarkup')!.yuk.reply_markup.inline_keyboard).toEqual([]);
  });
  it('ruxsat yo‘q (self.work.write yo‘q) — middleware/RPC rad: qoralama saqlanmadi', async () => {
    const c = net(hamma({ t2_men_v1: men(ALL.filter((p) => p !== 'self.work.write' && p !== 'fakt.write')), t2_usta_fakt_qoralama_v1: () => ({ ok: true }) }));
    await updateIshla(envAi as never, cb('fs:79:301:12500') as never);
    expect(c.rpc).not.toContain('t2_usta_fakt_qoralama_v1'); expect(javobMatni(c)).toContain('saqlanmadi');
  });
  it('byudjet/limit tugagan — server xabari; qator qidirilmaydi, hech narsa yozilmaydi', async () => {
    ai.hisobli.mockRejectedValue(new ai.Xato('BYUDJET_YOQ', 'AI uchun oylik limit belgilanmagan'));
    const c = net(hamma());
    await updateIshla(envAi as never, msg('/fakt 79 beton quyish 12,5 m3') as never);
    expect(javobMatni(c)).toContain('oylik limit'); expect(c.rpc).not.toContain('t2_qator');
  });
  it('begona obyekt / format / uzun matn / limit: AI chaqirilmaydi', async () => {
    const c = net(hamma());
    for (const t of ['/fakt', '/fakt beton', '/fakt 999 beton 5', '/fakt 79 ' + 'x'.repeat(501)]) await updateIshla(envAi as never, msg(t) as never);
    expect(ai.hisobli).not.toHaveBeenCalled();
    const j = javobMatni(c); expect(j).toContain('Format: /fakt'); expect(j).toContain('sizga ochiq emas'); expect(j).toContain('juda uzun');
    ai.hisobli.mockResolvedValue(niyat()); limitTozala();
    for (let i = 0; i < 7; i++) await updateIshla(envAi as never, msg('/fakt 79 beton quyish ' + i) as never);
    expect(ai.hisobli).toHaveBeenCalledTimes(5); expect(javobMatni(c)).toContain('Juda ko‘p so‘rov');
  });
  it('hajm aniqlanmasa yoki ifoda bo‘lsa — saqlash tugmasi yo‘q (taxmin qilinmaydi)', async () => {
    for (const hajm of [null, 'ko‘p', '5*3', '-4', '0']) {
      limitTozala(); vakolatKeshTozala(); ai.hisobli.mockResolvedValue(niyat({ hajm }));
      const c = net(hamma());
      await updateIshla(envAi as never, msg('/fakt 79 beton quyish') as never);
      expect(javobMatni(c), String(hajm)).toContain('Hajm aniqlanmadi'); expect(JSON.stringify(c.tg)).not.toContain('fs:');
    }
  });
  it('mos qator topilmasa — taklif yo‘q, Mini App havolasi; AI javobi noto‘g‘ri bo‘lsa — yozuv yo‘q', async () => {
    ai.hisobli.mockResolvedValue(niyat());
    let c = net(hamma({ t2_qator: () => satrlar([]) }));
    await updateIshla(envAi as never, msg('/fakt 79 beton quyish 5') as never);
    expect(javobMatni(c)).toContain('mos smeta qatori topilmadi'); expect(JSON.stringify(c.tg)).not.toContain('fs:');
    limitTozala(); vakolatKeshTozala(); ai.hisobli.mockResolvedValue({ text: 'bu json emas', provider: 'p', model: 'm' });
    c = net(hamma());
    await updateIshla(envAi as never, msg('/fakt 79 beton quyish 5') as never);
    expect(c.rpc.filter((r) => YOZUVCHI.test(r) && r !== 't2_telegram_update_qabul_v1')).toEqual([]);
  });
  it('buzilgan «Saqlash» (hajm 0, begona qator) — yozilmaydi', async () => {
    const c = net(hamma({ t2_usta_fakt_qoralama_v1: () => ({ ok: true }) }));
    expect(await updateIshla(envAi as never, cb('fs:79:301:0') as never)).toBe('cb:fakt_notogri');
    expect(await updateIshla(envAi as never, cb('fs:79:777:1000') as never)).toBe('cb:fakt_qator_yoq');
    expect(c.rpc).not.toContain('t2_usta_fakt_qoralama_v1');
  });
  it('«Bekor» — tugmalar olib tashlanadi, hech narsa yozilmaydi', async () => {
    const c = net(hamma());
    expect(await updateIshla(envAi as never, cb('fx') as never)).toBe('cb:fakt_bekor');
    expect(c.rpc.filter((r) => YOZUVCHI.test(r) && r !== 't2_telegram_update_qabul_v1')).toEqual([]);
  });
});

describe('Mini App menyu tugmasi — oxirgi obyekt', () => {
  it('/start: tugma obyektsiz bo‘lsa — eng so‘nggi yangilangan faol obyekt (deep link); obyektli bo‘lsa tegilmaydi', async () => {
    let c = net(asos({ t2_obyekt: obyektH }), { getChatMenuButton: () => ({ ok: true, result: { type: 'commands' } }) });
    await updateIshla(ENV, msg('/start') as never);
    expect(c.tg.find((x) => x.metod === 'setChatMenuButton')!.yuk.menu_button.web_app.url).toBe(SITE + '/tg?to=' + encodeURIComponent('/admin/fakt?obyekt=79'));
    expect(decodeURIComponent(c.urls.find((u) => u.includes('/t2_obyekt'))!)).toContain('order=yangilandi.desc');
    vakolatKeshTozala();
    c = net(asos({ t2_obyekt: obyektH }), { getChatMenuButton: () => ({ ok: true, result: { type: 'web_app', web_app: { url: SITE + '/tg?to=' + encodeURIComponent('/admin/fakt?obyekt=80') } } }) });
    await updateIshla(ENV, msg('/ilova') as never);
    expect(c.tg.some((x) => x.metod === 'setChatMenuButton')).toBe(false);
  });
  it('obyekt yo‘q / Telegram xatosi — buyruq baribir ishlaydi', async () => {
    const c = net(asos({ t2_obyekt: () => satrlar([]) }), { setChatMenuButton: () => ({ ok: false, description: 'x' }) });
    expect(await updateIshla(ENV, msg('/start') as never)).toBe('salom');
    expect(c.tg.some((x) => x.metod === 'setChatMenuButton')).toBe(false);
  });
});

describe('2-bosqich xavfsizlik: loglar va javoblarda token/matn yo‘q', () => {
  it('console ga yozilmaydi; Telegram yukida token yo‘q (tasdiq, foto oqimi, /fakt)', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    ai.hisobli.mockResolvedValue({ text: JSON.stringify({ niyatlar: [{ tavsif: 'beton quyish', birlik: 'm3', hajm: '5', razdel: null }] }), provider: 'p', model: 'm' });
    const c = net(asos({ ...QATOR, t2_hujjat_zanjir_tafsilot_v1: () => ({ ok: true, zanjir: { id: 5, hujjat_turi: 'f2', holat: 'jarayonda', raund: 1 }, qadamlar: [{ tartib: 1, holat: 'navbat', men: true }] }),
      t2_usta_fakt_qoralama_v1: () => ({ ok: true }), t2_foto_dalil_yangila_v1: () => ({ ok: true }) }));
    for (const u of [cb('tq:5'), cb('fb:9:79'), cb('fd:9:79:101'), cb('fq:9:79:301'), msg('/fakt 79 beton quyish 5'), cb('fs:79:301:5000')]) await updateIshla({ ...ENV, OPENROUTER_API_KEY: 'test' } as never, u as never);
    expect(JSON.stringify(c.tg)).not.toContain(TOKEN); expect(c.urls.join(' ')).not.toContain(TOKEN);
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain(TOKEN);
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('beton');
  });
});
