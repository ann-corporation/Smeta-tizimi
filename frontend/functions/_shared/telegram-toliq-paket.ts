/**
 * telegram-toliq-paket.ts - botda «Hujjatlar paketi»: saqlangan filtr YOKI shartnoma + oy tanlanadi -> tarkib va TOKEN ko'rsatiladi -> «Tasdiqlash» -> ZIP hujjat sifatida.
 *
 * Yangi mantiq yo'q: nomzodlar - mavjud `/api/hujjat-maydoni` (`paket_nomzod`, `filtr_royxat`), reja/yo'llar/ZIP - `lib/hujjat-paket` (sayt bilan bir xil:
 * `paketReja`, `paketYigish`, `paketZipi`), Diskdan olish - `/api/hujjat-maydoni-ol` (bepul), yasash - `/api/hujjat-yarat` (token yechiladi).
 * Hammasi `botChaqiruv` orqali (middleware -> shlyuz): botda ham veb bilan bir xil ruxsat va hisob-kitob. Token tasdiqdan OLDIN ko'rsatiladi.
 * Telegram chegarasi 50 MB: katta paket yuborilmaydi - Mini App havolasi beriladi. Callback: g:pk[:kid], g:ps:kid, g:pc:kid:sid, g:pm:kid:sid:YYYYMM,
 * g:pf:kid:filtrId (reja), g:pzm:kid:sid:YYYYMM / g:pzf:kid:filtrId (bajarish).
 */
import { type TgTil, miniAppYoliTugma, tgT } from './telegram';
import { botChaqiruv, botChaqiruvFayl } from './telegram-amal';
import { limitOshdi } from './telegram-bot';
import type { BotJavob } from './telegram-bot';
import { type BotEnv, type CbNatija, XATO_OQISH, bosh, orqaQatori, rolOl, xatoMatni, yol } from './telegram-toliq-yadro';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestGet as maydonGet } from '../api/hujjat-maydoni';
import { onRequestGet as maydonOlGet } from '../api/hujjat-maydoni-ol';
import { onRequestPost as yaratPost } from '../api/hujjat-yarat';
import { onRequestPost as sbPost } from '../api/sb';
import { paketReja, tokenBahosi, type Nomzod, type PaketReja } from '../../src/lib/hujjat-paket/nomzod';
import { paketYigish, paketZipi, type Yetkazuvchi } from '../../src/lib/hujjat-paket/yigish';
import { yasashSorovi } from '../../src/lib/hujjat-paket/yasash-sorov';
import { narxHisob, type TokenHolat } from '../../src/api/t2-token';

export const PAKET_TG_CHEGARA = 49 * 1024 * 1024;
/** Botda bir martada yasash mumkin bo'lgan yangi hujjatlar (webhook vaqti); ko'pi - Mini App. */
export const PAKET_YASASH_MAKS = 6;
export const PAKET_JAMI_MAKS = 60;

type Filtr = Record<string, unknown>;
type SaqlanganFiltr = { id: number; nom: string; filtr: Filtr };

const oyMatn = (son: number) => `${String(son).slice(0, 4)}-${String(son).slice(4, 6)}`;
export const oySondan = (s: number): string | null => (/^\d{4}(0[1-9]|1[0-2])$/.test(String(s)) ? oyMatn(s) : null);
/** Shartnoma + oy -> server filtri. */
export const shartnomaOyFiltri = (sid: number, oy: string): Filtr => ({ shartnoma_ids: [sid], oy_dan: oy, oy_gacha: oy });

export async function nomzodlarOl(env: BotEnv, uid: number, kid: number, filtr: Filtr): Promise<Nomzod[] | number> {
  const r = await botChaqiruv<{ ok?: boolean; nomzodlar?: Nomzod[] }>(env, uid, { api: 'hujjat-maydoni', method: 'GET', query: { amal: 'paket_nomzod', kompaniya_id: kid, filtr: JSON.stringify(filtr) } }, middleware, maydonGet);
  return r.status === 200 && r.body?.ok && Array.isArray(r.body.nomzodlar) ? r.body.nomzodlar : r.status === 200 ? 500 : r.status;
}
async function filtrlarOl(env: BotEnv, uid: number, kid: number): Promise<SaqlanganFiltr[] | number> {
  const r = await botChaqiruv<{ ok?: boolean; filtrlar?: SaqlanganFiltr[] }>(env, uid, { api: 'hujjat-maydoni', method: 'GET', query: { amal: 'filtr_royxat', kompaniya_id: kid } }, middleware, maydonGet);
  return r.status === 200 && r.body?.ok && Array.isArray(r.body.filtrlar) ? r.body.filtrlar : r.status === 200 ? 500 : r.status;
}
async function tokenHolatiOl(env: BotEnv, uid: number, kid: number): Promise<TokenHolat | null> {
  const r = await botChaqiruv<{ ok?: boolean; natija?: TokenHolat }>(env, uid, { api: 'sb', json: { soro: 'token_holat_v1', kompaniya_id: kid } }, middleware, sbPost);
  return r.status === 200 && r.body?.ok ? r.body.natija ?? null : null;
}

/** Barcha qoralama bo'lmagan nomzodlar paketga (sayt «hammasi» bilan bir xil qoida: taxminiy/takror rad etiladi). */
export const botReja = (nomzodlar: readonly Nomzod[]): PaketReja => paketReja(nomzodlar, new Set(nomzodlar.filter((n) => n.holat !== 'qoralama').map((n) => n.kalit)));

/** Reja bot uchun yaroqlimi (kattalik chegaralari): null = yaroqli, aks holda sabab kaliti. */
export function rejaChegarasi(reja: Pick<PaketReja, 'hujjatlar' | 'yasash'>): 'bosh' | 'kop_yasash' | 'kop' | null {
  if (!reja.hujjatlar.length) return 'bosh';
  if (reja.yasash.length > PAKET_YASASH_MAKS) return 'kop_yasash';
  if (reja.hujjatlar.length > PAKET_JAMI_MAKS) return 'kop';
  return null;
}

const sonMatni = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const MINI = '/admin/f2-reestr';

/* ═════════ 1) boshlash: kompaniya, saqlangan filtrlar ═════════ */
export async function paketBosh(env: BotEnv, uid: number, til: TgTil, kid: number | null): Promise<BotJavob> {
  const orqa = { inline_keyboard: [orqaQatori(til, 'g:m')] };
  const r = await rolOl(env, uid);
  if (!r) return { matn: tgT(XATO_OQISH, til), markup: orqa };
  if (!r.kompaniyalar.length) return { matn: tgT('Hali hech qaysi ish joyiga a’zo emassiz.', til), markup: orqa };
  const k = kid ? r.kompaniyalar.find((x) => x.id === kid) : r.kompaniyalar.length === 1 ? r.kompaniyalar[0] : null;
  const sarlavha = yol(til, tgT('Hujjatlar paketi', til));
  if (!k) {
    if (kid) return { matn: xatoMatni(til, 404), markup: orqa };
    return { matn: [sarlavha, tgT('Ish joyini tanlang:', til)].join('\n'), markup: { inline_keyboard: [...r.kompaniyalar.slice(0, 10).map((x) => [{ text: bosh(x.nom, 40), callback_data: `g:pk:${x.id}` }]), orqa.inline_keyboard[0]] } };
  }
  const f = await filtrlarOl(env, uid, k.id);
  if (typeof f === 'number') return { matn: xatoMatni(til, f), markup: orqa };
  return {
    matn: [sarlavha, bosh(k.nom, 40), tgT('Saqlangan filtrni tanlang yoki shartnoma va oyni belgilang. Paket ZIP bo‘lib shu chatga yuboriladi.', til), ...(f.length ? [] : [tgT('Saqlangan filtr yo‘q.', til)])].join('\n'),
    markup: { inline_keyboard: [...f.slice(0, 8).map((x) => [{ text: bosh(x.nom, 50) || `#${x.id}`, callback_data: `g:pf:${k.id}:${x.id}` }]), [{ text: tgT('Shartnoma + oy', til), callback_data: `g:ps:${k.id}` }], orqa.inline_keyboard[0]] },
  };
}

/* ═════════ 2) shartnoma, oy ═════════ */
export async function paketShartnomalar(env: BotEnv, uid: number, til: TgTil, kid: number): Promise<BotJavob> {
  const orqa = { inline_keyboard: [orqaQatori(til, `g:pk:${kid}`)] };
  const r = await botChaqiruv<{ ok?: boolean; variantlar?: { shartnomalar?: Array<{ id: number; raqam: string | null }> } }>(env, uid,
    { api: 'hujjat-maydoni', method: 'GET', query: { amal: 'paket_royxat', kompaniya_id: kid, filtr: JSON.stringify({ variantlar: true, sahifa_limit: 1 }) } }, middleware, maydonGet);
  if (r.status !== 200 || !r.body?.ok) return { matn: xatoMatni(til, r.status === 200 ? 500 : r.status), markup: orqa };
  const sh = (r.body.variantlar?.shartnomalar ?? []).filter((s) => Number.isSafeInteger(s.id) && s.id > 0).slice(0, 10);
  const sarlavha = yol(til, tgT('Hujjatlar paketi', til), tgT('Shartnoma + oy', til));
  if (!sh.length) return { matn: [sarlavha, tgT('Shartnoma topilmadi.', til)].join('\n'), markup: orqa };
  return { matn: [sarlavha, tgT('Shartnomani tanlang:', til)].join('\n'), markup: { inline_keyboard: [...sh.map((s) => [{ text: `№ ${bosh(s.raqam, 40) || s.id}`, callback_data: `g:pc:${kid}:${s.id}` }]), orqa.inline_keyboard[0]] } };
}

export async function paketOylar(env: BotEnv, uid: number, til: TgTil, kid: number, sid: number): Promise<BotJavob> {
  const orqa = { inline_keyboard: [orqaQatori(til, `g:ps:${kid}`)] };
  const n = await nomzodlarOl(env, uid, kid, { shartnoma_ids: [sid] });
  if (typeof n === 'number') return { matn: xatoMatni(til, n), markup: orqa };
  const oylar = [...new Set(n.map((x) => x.oy).filter((o): o is string => !!o && /^\d{4}-\d{2}$/.test(o)))].sort().reverse().slice(0, 12);
  const sarlavha = yol(til, tgT('Hujjatlar paketi', til), tgT('Shartnoma + oy', til));
  if (!oylar.length) return { matn: [sarlavha, tgT('Bu shartnomada oylik hujjat topilmadi.', til)].join('\n'), markup: orqa };
  const qatorlar: Record<string, unknown>[][] = [];
  for (let i = 0; i < oylar.length; i += 3) qatorlar.push(oylar.slice(i, i + 3).map((o) => ({ text: o, callback_data: `g:pm:${kid}:${sid}:${o.replace('-', '')}` })));
  return { matn: [sarlavha, tgT('Oyni tanlang:', til)].join('\n'), markup: { inline_keyboard: [...qatorlar, orqa.inline_keyboard[0]] } };
}

/* ═════════ 3) reja: tarkib + TOKEN (hech narsa yasalmaydi) ═════════ */
export async function paketReja_(env: BotEnv, uid: number, til: TgTil, kid: number, filtr: Filtr, orqaData: string, bajarData: string): Promise<BotJavob> {
  const orqa = { inline_keyboard: [orqaQatori(til, orqaData)] };
  const n = await nomzodlarOl(env, uid, kid, filtr);
  if (typeof n === 'number') return { matn: xatoMatni(til, n), markup: orqa };
  const reja = botReja(n);
  const sarlavha = yol(til, tgT('Hujjatlar paketi', til), tgT('Paket tarkibi', til));
  const ch = rejaChegarasi(reja);
  if (ch === 'bosh') return { matn: [sarlavha, tgT('Paketga hech narsa kirmaydi.', til)].join('\n'), markup: orqa };
  const th = reja.yasash.length ? await tokenHolatiOl(env, uid, kid) : null;
  const narx = th?.narxlar.find((x) => x.amal === 'hujjat');
  const baho = tokenBahosi(reja, narx && th?.sozlama ? (k: number) => narxHisob(narx, k, th.sozlama)?.token ?? null : null);
  const satrlar = [
    sarlavha,
    tgT('Diskdan (bepul): {n}', til, { n: reja.diskdan.length }),
    reja.yasash.length ? (baho.token == null ? tgT('Yangi yasaladi: {n} · token: aniqlanmadi', til, { n: reja.yasash.length }) : tgT('Yangi yasaladi: {n} · token ≈ {t}', til, { n: reja.yasash.length, t: sonMatni(baho.token) })) : tgT('Yangi yasaladigan hujjat yo‘q: token yechilmaydi.', til),
    ...(typeof th?.balans === 'number' ? [tgT('Balans: {n}', til, { n: sonMatni(th.balans) })] : []),
    ...(reja.rad.length || reja.olinmaydi.length ? [tgT('O‘tkazib yuboriladi: {n}', til, { n: reja.rad.length + reja.olinmaydi.length })] : []),
  ];
  if (ch) {
    return { matn: [...satrlar, tgT(ch === 'kop_yasash' ? 'Botda bir martada {n} tadan ortiq yangi hujjat yasab bo‘lmaydi. Mini App da oching.' : 'Paket juda katta (>{n} hujjat). Mini App da oching.', til, { n: ch === 'kop_yasash' ? PAKET_YASASH_MAKS : PAKET_JAMI_MAKS })].join('\n'),
      markup: { inline_keyboard: [[miniAppYoliTugma(env, til, MINI, 'Mini App da ochish')], orqa.inline_keyboard[0]] } };
  }
  return { matn: satrlar.join('\n'), markup: { inline_keyboard: [[{ text: `${tgT('Tasdiqlash', til)} · ZIP`, callback_data: bajarData }], orqa.inline_keyboard[0]] } };
}

export async function paketRejaFiltr(env: BotEnv, uid: number, til: TgTil, kid: number, fid: number): Promise<BotJavob> {
  const f = await filtrlarOl(env, uid, kid);
  if (typeof f === 'number') return { matn: xatoMatni(til, f), markup: { inline_keyboard: [orqaQatori(til, `g:pk:${kid}`)] } };
  const x = f.find((q) => q.id === fid);
  if (!x) return { matn: tgT('Filtr topilmadi.', til), markup: { inline_keyboard: [orqaQatori(til, `g:pk:${kid}`)] } };
  return paketReja_(env, uid, til, kid, x.filtr, `g:pk:${kid}`, `g:pzf:${kid}:${fid}`);
}
export async function paketRejaOy(env: BotEnv, uid: number, til: TgTil, kid: number, sid: number, oySon: number): Promise<BotJavob> {
  const oy = oySondan(oySon);
  if (!oy) return { matn: tgT('Tugma eskirgan.', til) };
  return paketReja_(env, uid, til, kid, shartnomaOyFiltri(sid, oy), `g:pc:${kid}:${sid}`, `g:pzm:${kid}:${sid}:${oySon}`);
}

/* ═════════ 4) bajarish: yig'ish -> ZIP -> Telegram hujjati ═════════ */
const nomOl = (h: Headers | null, zaxira: string): string => {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(h?.get('Content-Disposition') ?? '');
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* zaxira */ } }
  return zaxira;
};

/** Server yetkazuvchisi: Disk (bepul) va yagona dvigatel (token) - sayt `saytYetkazuvchi` bilan bir xil qoida, faqat bot shlyuzi orqali. */
export function botYetkazuvchi(env: BotEnv, uid: number, kid: number): Yetkazuvchi {
  return {
    async diskdan(n) {
      if (n.fayl_id == null) throw new Error('Diskda fayl yo‘q');
      const r = await botChaqiruvFayl(env, uid, { api: 'hujjat-maydoni-ol', method: 'GET', query: { id: n.fayl_id } }, middleware, maydonOlGet);
      if (r.status !== 200 || !r.bayt) throw new Error(`Diskdan o‘qilmadi (HTTP ${r.status})`);
      return { bytes: r.bayt, faylNomi: nomOl(r.sarlavhalar, `${n.sarlavha}.xlsx`) };
    },
    async yasa(n) {
      const s = yasashSorovi(n);
      if (!s || n.obyekt_id == null) throw new Error('Bu hujjatni yasab bo‘lmaydi');
      const r = await botChaqiruvFayl(env, uid, { api: 'hujjat-yarat', json: { ...s.parametrlar, ...(s.tur === 'f2' ? { disk_afzal: 1 } : {}), amal: 'yarat', tur: s.tur, format: 'xlsx', kompaniya_id: kid, obyekt_id: n.obyekt_id } }, middleware, yaratPost);
      if (r.status !== 200 || !r.bayt) throw new Error(r.status === 402 ? 'Tokenlar yetarli emas' : `Yasalmadi (HTTP ${r.status})`);
      return { bytes: r.bayt, faylNomi: nomOl(r.sarlavhalar, `${n.sarlavha}.xlsx`) };
    },
  };
}

/** Telegram sendDocument (ZIP). Token URL ichida - hech qayerga yozilmaydi. Hajm chegarasidan oshsa yoki xato bo'lsa false. */
export async function zipYubor(env: BotEnv, chatId: number, bayt: Uint8Array, nom: string, izoh: string): Promise<boolean> {
  const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token) || bayt.byteLength === 0 || bayt.byteLength > PAKET_TG_CHEGARA) return false;
  const form = new FormData();
  form.set('chat_id', String(chatId)); form.set('caption', izoh.slice(0, 900));
  form.set('document', new File([bayt as unknown as ArrayBuffer], nom.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 100) || 'paket.zip', { type: 'application/zip' }));
  try { return (await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form })).ok; } catch { return false; }
}

export type PaketBajarishDeps = { yet: Yetkazuvchi; yubor: (bayt: Uint8Array, nom: string, izoh: string) => Promise<boolean> };
/** Toza orkestrator (testlanadi): reja -> yig'ish -> ZIP -> yuborish. */
export async function paketBajar(n: readonly Nomzod[], sarlavha: string, d: PaketBajarishDeps): Promise<{ holat: 'yuborildi' | 'katta' | 'yuborilmadi' | 'bosh' | 'chegara'; soni: number; xato: number; mb: number }> {
  const reja = botReja(n);
  if (rejaChegarasi(reja) === 'bosh') return { holat: 'bosh', soni: 0, xato: 0, mb: 0 };
  if (rejaChegarasi(reja)) return { holat: 'chegara', soni: 0, xato: 0, mb: 0 };
  const y = await paketYigish(reja, d.yet, { parallel: 3, yasashParallel: 1 });
  if (!y.fayllar.length) return { holat: 'bosh', soni: 0, xato: y.xatolar.length, mb: 0 };
  const z = paketZipi(y, { sarlavha, reja });
  const mb = Math.round((z.bytes.byteLength / 1024 / 1024) * 10) / 10;
  if (z.bytes.byteLength > PAKET_TG_CHEGARA) return { holat: 'katta', soni: y.fayllar.length, xato: y.xatolar.length, mb };
  const ok = await d.yubor(z.bytes, 'Hujjatlar_paketi.zip', `${sarlavha} · ${y.fayllar.length}`);
  return { holat: ok ? 'yuborildi' : 'yuborilmadi', soni: y.fayllar.length, xato: y.xatolar.length, mb };
}

export async function paketBer(env: BotEnv, uid: number, til: TgTil, chatId: number, kid: number, filtr: Filtr | null, fid: number | null, orqaData: string): Promise<CbNatija> {
  const rad = (amal: string, matn: string): CbNatija => ({ toast: tgT('Bajarilmadi', til), amal, tugmalarniOlibTashla: true, xabar: { matn } });
  if (limitOshdi('gpaket:' + uid, 2)) return rad('paket_limit', xatoMatni(til, 429));
  let f = filtr;
  if (!f && fid != null) { const l = await filtrlarOl(env, uid, kid); f = typeof l === 'number' ? null : l.find((x) => x.id === fid)?.filtr ?? null; }
  if (!f) return rad('paket_filtr', tgT('Filtr topilmadi.', til));
  const n = await nomzodlarOl(env, uid, kid, f);
  if (typeof n === 'number') return rad('paket_royxat', xatoMatni(til, n));
  const r = await paketBajar(n, tgT('Hujjatlar paketi', null), { yet: botYetkazuvchi(env, uid, kid), yubor: (b, nom, izoh) => zipYubor(env, chatId, b, nom, izoh) });
  const orqa = { inline_keyboard: [orqaQatori(til, orqaData)] };
  const mini = [miniAppYoliTugma(env, til, MINI, 'Mini App da ochish')];
  if (r.holat === 'bosh') return rad('paket_bosh', tgT('Paketga hech narsa kirmaydi.', til));
  if (r.holat === 'chegara') return { toast: tgT('Bajarilmadi', til), amal: 'paket_chegara', tugmalarniOlibTashla: true, xabar: { matn: tgT('Paket juda katta. Mini App da oching.', til), markup: { inline_keyboard: [mini] } } };
  if (r.holat === 'katta') return { toast: tgT('Bajarilmadi', til), amal: 'paket_katta', tugmalarniOlibTashla: true, xabar: { matn: tgT('Paket {mb} MB: Telegram chegarasidan (50 MB) katta. Mini App da yuklab oling.', til, { mb: r.mb }), markup: { inline_keyboard: [mini] } } };
  if (r.holat === 'yuborilmadi') return { toast: tgT('Bajarilmadi', til), amal: 'paket_yuborilmadi', tugmalarniOlibTashla: true, xabar: { matn: tgT('Paket yasaldi, lekin Telegramga yuborib bo‘lmadi. Mini App da yuklab oling.', til), markup: { inline_keyboard: [mini] } } };
  return { toast: tgT('Yuborildi', til), amal: 'paket_yuborildi', tugmalarniOlibTashla: true, xabar: {
    matn: [tgT('Paket yuborildi: {n} ta fayl ({mb} MB).', til, { n: r.soni, mb: r.mb }), ...(r.xato ? [tgT('Olinmadi: {n} (tarkib faylida yozilgan).', til, { n: r.xato })] : [])].join('\n'), markup: orqa } };
}

