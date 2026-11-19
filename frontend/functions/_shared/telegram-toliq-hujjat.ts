/**
 * telegram-toliq-hujjat.ts — botda: TASDIQLAR (kiruvchi quti: Tasdiqlash / Rad), BILDIRISHNOMALAR va HUJJATLAR (tayyor fayl Telegramga hujjat sifatida).
 *
 *  • Tasdiq/Rad: mavjud `hujjat-aylanish` (zanjir_qaror). «Tasdiqlash» — mavjud `tq:` oqimi (tafsilot + qadam belgisi + «Ha»); «Rad» — xuddi shu naqsh
 *    (`g:rq` → `g:ry` qadam belgisi bilan). Rol/navbat bazada; PIN/biometrik talab qilinsa — Mini App ga yo'naltiriladi.
 *  • Hujjat: YAGONA server dvigateli `/api/hujjat-yarat` (sayt, Android, Windows bilan bir xil fayl). Birinchi yasash tokenlardan yechadi, qayta yuklash BEPUL —
 *    shuning uchun fayl yuborishdan oldin aniq «Tasdiqlash» so'raladi. Rasmiy F-2 Excel server dvigateli `claude/mcp-f2-excel` PR da kengaytiriladi;
 *    shu PR gacha bot `hujjat-yarat` ro'yxatidagi mavjud turlarni (f2, forma3, nakopitelniy, m29, slichitelniy, ostatka) beradi.
 */
import { type TgTil, miniAppYoliTugma, tgT } from './telegram';
import { botChaqiruv, botChaqiruvFayl } from './telegram-amal';
import { type BotJavob, limitOshdi } from './telegram-bot';
import { obyektOl, zanjirHolatiOl } from './telegram-bot-oqim';
import { TASDIQ_SO_ROV, TASDIQ_YOQ } from './telegram-tugma';
import { type BotEnv, type CbNatija, XATO_OQISH, bosh, musbat, navQatori, orqaQatori, rolOl, sahifala, xatoMatni, yol } from './telegram-toliq-yadro';
import { bildirishnomaHavolasi, bildirishnomaMatnKaliti } from '../../src/lib/bildirishnoma-matn';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestGet as aylanishGet, onRequestPost as aylanishPost } from '../api/hujjat-aylanish';
import { onRequestPost as yaratPost } from '../api/hujjat-yarat';

/* ═════════ Tasdiqlar (kiruvchi quti) ═════════ */
type Zanjir = { id?: number; hujjat_turi?: string; sarlavha?: string; muddat?: string | null; kechikkan?: boolean };
const TUR_QISQA: Record<string, string> = { f2: 'F-2', fakt: 'Fakt akti', aosr: 'AOSR', forma3: 'Forma № 3' };

export async function tasdiqlarRoyxati(env: BotEnv, uid: number, til: TgTil, p: number): Promise<BotJavob> {
  const r = await rolOl(env, uid);
  if (!r) return { matn: tgT(XATO_OQISH, til) };
  if (!r.kompaniyalar.length) return { matn: tgT('Hali hech qaysi ish joyiga a’zo emassiz.', til) };
  const javoblar = await Promise.all(r.kompaniyalar.slice(0, 10).map((k) => botChaqiruv<{ ok?: boolean; zanjirlar?: Zanjir[] }>(env, uid,
    { api: 'hujjat-aylanish', method: 'GET', query: { bolim: 'kiruvchi', kompaniya_id: k.id } }, middleware, aylanishGet)));
  if (javoblar.every((j) => j.status !== 200 || !j.body?.ok)) return { matn: xatoMatni(til, javoblar[0]?.status ?? 500) };
  const ro = javoblar.flatMap((j) => (j.status === 200 && j.body?.ok ? j.body.zanjirlar ?? [] : [])).filter((z, i, arr) => musbat(z.id) && arr.findIndex((y) => y.id === z.id) === i).sort((a, b) => (b.id as number) - (a.id as number));
  const sarlavha = yol(til, tgT('Tasdiqlar', til));
  if (!ro.length) return { matn: [sarlavha, tgT('Hozir sizning qaroringizni kutayotgan hujjat yo‘q.', til)].join('\n'), markup: { inline_keyboard: [orqaQatori(til, 'g:m')] } };
  const { qism, sah, jami } = sahifala(ro, p, 5);
  return {
    matn: [sarlavha, tgT('Qaroringizni kutayotgan hujjatlar: {n}', til, { n: ro.length }),
      ...qism.map((z) => `• #${z.id} ${bosh(TUR_QISQA[z.hujjat_turi ?? ''] ?? z.hujjat_turi, 20)} — ${bosh(z.sarlavha, 70)}${z.kechikkan ? ' · ' + tgT('muddati o‘tgan', til) : ''}`)].join('\n'),
    markup: { inline_keyboard: [
      ...qism.map((z) => [{ text: `${tgT('Tasdiqlash', til)} #${z.id}`, callback_data: TASDIQ_SO_ROV + z.id }, { text: `${tgT('Rad etish', til)} #${z.id}`, callback_data: `g:rq:${z.id}` }]),
      ...navQatori(sah, jami, (n) => `g:t:${n}`), orqaQatori(til, 'g:m')] },
  };
}

/** «Rad etish» bosildi: qadam belgisi bilan tasdiq so'rovi (eskirgan «Ha» o'tmaydi). */
export async function radSorovi(env: BotEnv, uid: number, til: TgTil, zid: number): Promise<CbNatija> {
  const h = await zanjirHolatiOl(env, uid, zid);
  if (h === 'xato') return { toast: tgT('Bajarilmadi', til), amal: 'rad_sorov_xato', xabar: { matn: tgT(XATO_OQISH, til) } };
  if (!h || !h.navbat || !h.belgi) return { toast: tgT('Bajarilmadi', til), amal: 'rad_navbat_emas', xabar: { matn: tgT('Hozir sizning qaroringiz kutilmayapti yoki ruxsatingiz yo‘q.', til) } };
  return { toast: tgT('Rad etishni tasdiqlang', til), amal: 'rad_sorov', xabar: {
    matn: [tgT('Hujjat № {id} ni RAD etasizmi?', til, { id: zid }), bosh(h.z.sarlavha, 120), tgT('Bu qaror qaytarilmaydi.', til)].filter(Boolean).join('\n'),
    markup: { inline_keyboard: [[{ text: tgT('Ha, rad etaman', til), callback_data: `g:ry:${zid}:${h.belgi}` }, { text: tgT('Bekor', til), callback_data: TASDIQ_YOQ + zid }],
      [miniAppYoliTugma(env, til, `/admin/hujjat-aylanish?zanjir=${zid}`, 'Ko‘rish')]] } } };
}

export async function radBajar(env: BotEnv, uid: number, til: TgTil, zid: number, belgi: string): Promise<CbNatija> {
  const rad = (amal: string, toast: string, matn: string): CbNatija => ({ toast: tgT(toast, til), amal, tugmalarniOlibTashla: true, xabar: { matn: tgT(matn, til) } });
  const h = await zanjirHolatiOl(env, uid, zid);
  if (h === 'xato') return rad('rad_xato', 'Bajarilmadi', 'Server xatosi. Mini App da urinib ko‘ring.');
  if (!h || !h.navbat) return rad('rad_navbat_emas', 'Bajarilmadi', 'Hozir sizning qaroringiz kutilmayapti yoki ruxsatingiz yo‘q.');
  if (h.belgi !== belgi) return rad('rad_eskirgan', 'Eskirgan tugma', 'Hujjat holati soʻrovdan keyin oʻzgargan. Hech narsa rad etilmadi — ro‘yxatni qayta oching.');
  const r = await botChaqiruv<{ ok?: boolean; code?: string }>(env, uid,
    { api: 'hujjat-aylanish', json: { amal: 'zanjir_qaror', kompaniya_id: h.kompaniya_id, zanjir_id: zid, qaror: 'rad', izoh: 'Telegram orqali rad etildi' } }, middleware, aylanishPost);
  if (r.status === 200 && r.body?.ok) return rad('rad_ok', 'Rad etildi', 'Hujjat rad etildi.');
  if (r.status === 403 && r.body?.code === 'STEP_UP_KERAK') {
    return { toast: tgT('Bajarilmadi', til), amal: 'rad_step_up', tugmalarniOlibTashla: true, xabar: { matn: tgT('Bu qaror PIN yoki biometrik talab qiladi. Hech narsa o‘zgarmadi — Mini App da bajaring.', til),
      markup: { inline_keyboard: [[miniAppYoliTugma(env, til, `/admin/hujjat-aylanish?zanjir=${zid}`, 'Ko‘rish')]] } } };
  }
  if ((r.status === 200 && r.body?.code === 'NAVBAT_EMAS') || [401, 403].includes(r.status)) return rad('rad_navbat_emas', 'Bajarilmadi', 'Hozir sizning qaroringiz kutilmayapti yoki ruxsatingiz yo‘q.');
  return rad('rad_xato', 'Bajarilmadi', 'Server xatosi. Mini App da urinib ko‘ring.');
}

/* ═════════ Bildirishnomalar ═════════ */
type Bild = { id?: number; mavzu?: string; sarlavha_kalit?: string | null; parametrlar?: Record<string, unknown> | null; havola?: string | null; oqildi?: string | null; yaratildi?: string };

export async function bildirishnomalarRoyxati(env: BotEnv, uid: number, til: TgTil, p: number): Promise<BotJavob> {
  const r = await botChaqiruv<{ ok?: boolean; qatorlar?: Bild[]; oqilmagan?: number }>(env, uid, { api: 'hujjat-aylanish', method: 'GET', query: { bolim: 'bildirishnomalar', limit: 50 } }, middleware, aylanishGet);
  if (r.status !== 200 || !r.body?.ok || !Array.isArray(r.body.qatorlar)) return { matn: xatoMatni(til, r.status) };
  const sarlavha = yol(til, tgT('Bildirishnomalar', til));
  const ro = r.body.qatorlar.filter((b) => musbat(b.id) && typeof b.mavzu === 'string');
  if (!ro.length) return { matn: [sarlavha, tgT('Bildirishnoma yo‘q.', til)].join('\n'), markup: { inline_keyboard: [orqaQatori(til, 'g:m')] } };
  const { qism, sah, jami } = sahifala(ro, p, 5);
  const matnOl = (b: Bild) => { const k = bildirishnomaMatnKaliti(String(b.mavzu)); return k ? tgT(k, til) : bosh(b.sarlavha_kalit, 80) || String(b.mavzu); };
  const tugmalar = qism.flatMap((b): Record<string, unknown>[][] => {
    const z = Number(b.parametrlar?.zanjir_id);
    if (b.mavzu === 'hujjat.tasdiq_kutmoqda' && Number.isSafeInteger(z) && z > 0) return [[{ text: `${tgT('Tasdiqlash', til)} #${z}`, callback_data: TASDIQ_SO_ROV + z }]];
    const h = bildirishnomaHavolasi({ havola: b.havola, mavzu: String(b.mavzu), parametrlar: b.parametrlar });
    return h?.startsWith('/admin') ? [[miniAppYoliTugma(env, til, h, 'Ko‘rish')]] : [];
  });
  return {
    matn: [sarlavha, tgT('O‘qilmagan: {n}', til, { n: r.body.oqilmagan ?? '—' }),
      ...qism.map((b) => `• ${b.oqildi ? '' : tgT('yangi', til) + ' · '}${bosh(b.yaratildi, 16).replace('T', ' ')} — ${matnOl(b)}`)].join('\n'),
    markup: { inline_keyboard: [...tugmalar.slice(0, 5), ...navQatori(sah, jami, (n) => `g:n:${n}`), orqaQatori(til, 'g:m')] },
  };
}

/* ═════════ Hujjatlar (server dvigatelidan tayyor fayl) ═════════ */
type HujjatTuri = { kalit?: string; tur?: string; sarlavha?: string; holat?: string | null; summa?: number | null; parametrlar?: Record<string, unknown>; formatlar?: string[] };
const KALIT = /^[A-Za-z0-9:_-]{1,40}$/;

async function hujjatRoyxatiOl(env: BotEnv, uid: number, kid: number, oid: number) {
  const r = await botChaqiruv<{ ok?: boolean; hujjatlar?: HujjatTuri[] }>(env, uid, { api: 'hujjat-yarat', json: { amal: 'royxat', kompaniya_id: kid, obyekt_id: oid } }, middleware, yaratPost);
  return r.status === 200 && r.body?.ok && Array.isArray(r.body.hujjatlar) ? r.body.hujjatlar.filter((h) => typeof h.kalit === 'string' && KALIT.test(h.kalit)) : r.status === 200 ? null : r.status;
}

export async function hujjatlarRoyxati(env: BotEnv, uid: number, til: TgTil, oid: number): Promise<BotJavob> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const h = await hujjatRoyxatiOl(env, uid, ob.kompaniya_id, oid);
  const orqa = { inline_keyboard: [orqaQatori(til, `g:k:${oid}`)] };
  if (typeof h === 'number' || h === null) return { matn: xatoMatni(til, h ?? 500), markup: orqa };
  const sarlavha = yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, tgT('Hujjatlar', til));
  if (!h.length) return { matn: [sarlavha, tgT('Tayyor hujjat yo‘q.', til)].join('\n'), markup: orqa };
  return {
    matn: [sarlavha, tgT('Hujjatni tanlang — fayl shu chatga yuboriladi. Birinchi yasash tokenlardan yechadi, qayta yuklash bepul.', til)].join('\n'),
    markup: { inline_keyboard: [...h.slice(0, 10).map((x) => [{ text: bosh(x.sarlavha, 52) || String(x.kalit), callback_data: `g:d:${oid}:${x.kalit}` }]), orqaQatori(til, `g:k:${oid}`)] },
  };
}

/** Hujjat tanlandi → token haqida ogohlantirish + format tanlash (hech narsa yasalmaydi). */
export async function hujjatSorovi(env: BotEnv, uid: number, til: TgTil, oid: number, kalit: string): Promise<BotJavob> {
  if (!KALIT.test(kalit)) return { matn: tgT('Tugma eskirgan.', til) };
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const h = await hujjatRoyxatiOl(env, uid, ob.kompaniya_id, oid);
  if (typeof h === 'number' || h === null) return { matn: xatoMatni(til, h ?? 500) };
  const x = h.find((t) => t.kalit === kalit);
  if (!x) return { matn: tgT('Hujjat topilmadi (holati o‘zgargan bo‘lishi mumkin). Ro‘yxatni qayta oching.', til), markup: { inline_keyboard: [orqaQatori(til, `g:h:${oid}`)] } };
  const fmt = (x.formatlar ?? ['xlsx']).filter((f) => f === 'xlsx' || f === 'pdf');
  return {
    matn: [yol(til, tgT('Hujjatlar', til)), bosh(x.sarlavha, 120), tgT('Yasash tokenlardan yechiladi (bir xil hujjatni qayta yuklash bepul). Davom etasizmi?', til)].join('\n'),
    markup: { inline_keyboard: [fmt.map((f) => ({ text: `${tgT('Tasdiqlash', til)} · ${f.toUpperCase()}`, callback_data: `g:x:${oid}:${f === 'pdf' ? 'p' : 'x'}:${kalit}` })), orqaQatori(til, `g:h:${oid}`)] },
  };
}

const MIME: Record<string, string> = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };
/** Telegram sendDocument (multipart). Token URL ichida — hech qayerga yozilmaydi; xato bo'lsa faqat false. */
export async function hujjatYubor(env: BotEnv, chatId: number, bayt: Uint8Array, nom: string, format: 'xlsx' | 'pdf', izoh: string): Promise<boolean> {
  const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token) || bayt.byteLength === 0 || bayt.byteLength > 49 * 1024 * 1024) return false;
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('caption', izoh.slice(0, 900));
  form.set('document', new File([bayt], nom.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 100) || 'hujjat.' + format, { type: MIME[format] }));
  try { const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form }); return r.ok; } catch { return false; }
}

/** «Tasdiqlash · XLSX/PDF»: server dvigateli faylni yasaydi (token yechiladi yoki bepul takror) → Telegram hujjati. */
export async function hujjatBerish(env: BotEnv, uid: number, til: TgTil, chatId: number, oid: number, fmt: string, kalit: string): Promise<CbNatija> {
  const rad = (amal: string, matn: string): CbNatija => ({ toast: tgT('Bajarilmadi', til), amal, tugmalarniOlibTashla: true, xabar: { matn } });
  const format = fmt === 'p' ? 'pdf' : fmt === 'x' ? 'xlsx' : null;
  if (!format || !KALIT.test(kalit)) return rad('hujjat_notogri', tgT('Tugma eskirgan.', til));
  if (limitOshdi('ghujjat:' + uid, 4)) return rad('hujjat_limit', xatoMatni(til, 429));
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return rad('hujjat_obyekt', tgT('Bu obyekt sizga ochiq emas.', til));
  const h = await hujjatRoyxatiOl(env, uid, ob.kompaniya_id, oid);
  if (typeof h === 'number' || h === null) return rad('hujjat_royxat', xatoMatni(til, h ?? 500));
  const x = h.find((t) => t.kalit === kalit && typeof t.tur === 'string');
  if (!x) return rad('hujjat_yoq', tgT('Hujjat topilmadi (holati o‘zgargan bo‘lishi mumkin). Ro‘yxatni qayta oching.', til));
  const r = await botChaqiruvFayl(env, uid, { api: 'hujjat-yarat', json: { ...(x.parametrlar ?? {}), amal: 'yarat', tur: x.tur, format, kompaniya_id: ob.kompaniya_id, obyekt_id: oid } }, middleware, yaratPost);
  if (r.status !== 200 || !r.bayt) return rad('hujjat_xato', xatoMatni(til, r.status === 200 ? 502 : r.status));
  const nom = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(r.sarlavhalar?.get('Content-Disposition') ?? '')?.[1];
  const sarf = Number(r.sarlavhalar?.get('X-Hujjat-Sarf') ?? 0), takror = r.sarlavhalar?.get('X-Hujjat-Bepul-Takror') === '1';
  const yuborildi = await hujjatYubor(env, chatId, r.bayt, nom ? decodeURIComponent(nom) : `${x.tur}.${format}`, format, bosh(x.sarlavha, 200));
  if (!yuborildi) return rad('hujjat_yuborilmadi', tgT('Fayl yasaldi, lekin Telegramga yuborib bo‘lmadi. Mini App dan yuklab oling.', til));
  return { toast: tgT('Yuborildi', til), amal: 'hujjat_yuborildi', tugmalarniOlibTashla: true, xabar: {
    matn: takror ? tgT('Hujjat yuborildi (takror yuklash — token yechilmadi).', til) : tgT('Hujjat yuborildi. Sarflangan tokenlar: {n}', til, { n: Number.isFinite(sarf) ? sarf : '—' }),
    markup: { inline_keyboard: [orqaQatori(til, `g:h:${oid}`)] } } };
}
