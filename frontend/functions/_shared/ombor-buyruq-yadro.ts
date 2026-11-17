/**
 * ombor-buyruq-yadro.ts — omborchi buyrug'i (ovoz/matn) uchun SOF mantiq: oddiy tahlil, LLM javobini tekshirish, tasdiq tokeni,
 * Telegram kartasi matni. Tarmoq/DB yo'q → sintetik matnlar bilan to'liq test qilinadi.
 *
 * Oqim: matn → (oddiyTahlil | LLM) → server moslashtiruvchi (t2_ombor_qoldiq_v2) → PREVIEW → tasdiq tokeni → faqat tasdiqdan keyin yoziladi.
 * Hech qachon taxmin bilan yozilmaydi: tuzatish/bekor aniq harakat_id talab qiladi.
 */
import { nomTokenlari } from '../../src/lib/ombor-moslash/moslash';

export type Amal = 'prixod' | 'chiqim' | 'qoldiq' | 'tuzat' | 'bekor' | 'tarix';
export const AMALLAR: readonly Amal[] = ['prixod', 'chiqim', 'qoldiq', 'tuzat', 'bekor', 'tarix'];

export type Buyruq = {
  amal: Amal;
  nomi: string | null;
  miqdor: number | null;
  birlik: string | null;
  kontragent: string | null;    // prixod: yetkazuvchi; chiqim: qabul qiluvchi (prorab/brigada/subpudratchi)
  obyekt: string | null;        // obyekt nomi (matn) — serverda id ga moslanadi
  sana: string | null;          // YYYY-MM-DD
  harakat_id: number | null;    // tuzat/bekor: aniq yozuv
  yangi: { miqdor?: number; sana?: string; nomi?: string; birligi?: string; kontragent?: string; izoh?: string } | null;
  izoh: string | null;
};

const bosh = (v: unknown, n: number): string | null => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s ? s.slice(0, n) : null;
};
const musbat = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/\s/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 && n <= 1_000_000_000 ? Math.round(n * 10000) / 10000 : null;
};
const sanaTekshir = (v: unknown): string | null => {
  const s = bosh(v, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
};

/** LLM chiqishini (yoki istalgan obyektni) qat'iy Buyruq ga keltiradi; noto'g'ri bo'lsa null. */
export function buyruqTekshir(x: unknown): Buyruq | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const amal = AMALLAR.find((a) => a === String(o.amal ?? '').toLowerCase());
  if (!amal) return null;
  const yo = o.yangi && typeof o.yangi === 'object' && !Array.isArray(o.yangi) ? o.yangi as Record<string, unknown> : null;
  const yangi: NonNullable<Buyruq['yangi']> = {};
  if (yo) {
    const m = musbat(yo.miqdor); if (m) yangi.miqdor = m;
    const s = sanaTekshir(yo.sana); if (s) yangi.sana = s;
    const n = bosh(yo.nomi, 500); if (n) yangi.nomi = n;
    const b = bosh(yo.birligi ?? yo.birlik, 100); if (b) yangi.birligi = b;
    const k = bosh(yo.kontragent, 500); if (k) yangi.kontragent = k;
    const i = bosh(yo.izoh, 1000); if (i) yangi.izoh = i;
  }
  const hid = Number(o.harakat_id);
  return {
    amal, nomi: bosh(o.nomi, 500), miqdor: musbat(o.miqdor), birlik: bosh(o.birlik ?? o.birligi, 100),
    kontragent: bosh(o.kontragent ?? o.postavshik ?? o.qabul_qiluvchi, 500), obyekt: bosh(o.obyekt, 200), sana: sanaTekshir(o.sana),
    harakat_id: Number.isSafeInteger(hid) && hid > 0 ? hid : null, yangi: Object.keys(yangi).length ? yangi : null, izoh: bosh(o.izoh, 1000),
  };
}

/** LLM ajratib chiqargan JSON matnini (``` bilan o'ralgan bo'lsa ham) ochadi. */
export function llmJsonOl(matn: string): unknown {
  const s = String(matn ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

// ── oddiy (bepul) tahlil: tushunarli iboralar uchun; aniq bo'lmasa LLM ga o'tiladi ──────────────────────────────────────────────
const NIYAT: [Amal, RegExp][] = [
  ['bekor', /(?<![\p{L}])(bekor|otmen[\p{L}]*|отмен[\p{L}]*|удал[\p{L}]*|o['ʻ’`]?chir[\p{L}]*)(?![\p{L}])/iu],
  ['tuzat', /(?<![\p{L}])(tuzat[\p{L}]*|isprav[\p{L}]*|исправ[\p{L}]*|поправ[\p{L}]*|измен[\p{L}]*|o['ʻ’`]?zgartir[\p{L}]*|ozgartir[\p{L}]*)(?![\p{L}])/iu],
  ['qoldiq', /(qoldiq|ostatok|остат|qancha|nechta|necha|сколько|осталос|bormi|есть ли|qolgan)/iu],
  ['tarix', /(?<![\p{L}])(tarix|istoriya|история|harakat(lar)?)(?![\p{L}])/iu],
  ['chiqim', /(chiqim|rasxod|расход|berdim|berildi|bering|берд|выдал|выдан|отпуст|списал|olib ketdi|oldi(?![\p{L}])|jo['ʻ’`]?natdi|yubordim)/iu],
  ['prixod', /(kirim|prixod|приход|keldi|kelti|qabul qildim|qabul|принял|получил|привез|завез|tushdi|olib keldi|олиб келди)/iu],
];
const BIRLIK_SOZ = '(?:dona|ta|шт|штук|sht|kg|кг|килограмм|tonna|тонн|тн|tn|metr|метр|м2|м3|кв\\.?\\s*м|куб|litr|л|рулон|rulon|komplekt|комплект|qop|мешок|pochka|почка|upakovka|упак|m2|m3|m|t)';
const MIQDOR_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${BIRLIK_SOZ})?(?![\\p{L}\\d])`, 'iu');
const TO_XTASH = new Set(['bugun', 'kecha', 'ombor', 'omborga', 'omborda', 'omborga', 'omborni', 'склад', 'склада', 'на', 'в', 'из', 'со', 'для', 'dan', 'ga', 'uchun', 'ni', 'ning', 'va', 'и', 'ta', 'ni', 'bu', 'это', 'пожалуйста', 'iltimos', 'oldi', 'berdim']);

const BIRLIK_KANON: Record<string, string> = {
  dona: 'шт', ta: 'шт', шт: 'шт', штук: 'шт', sht: 'шт', kg: 'кг', кг: 'кг', килограмм: 'кг', tonna: 'тн', тонн: 'тн', тн: 'тн', tn: 'тн', t: 'тн',
  metr: 'м', метр: 'м', m: 'м', м2: 'м2', m2: 'м2', м3: 'м3', m3: 'м3', куб: 'м3', litr: 'л', л: 'л', рулон: 'рулон', rulon: 'рулон', komplekt: 'комплект', комплект: 'комплект',
  qop: 'мешок', мешок: 'мешок', pochka: 'почка', почка: 'почка', upakovka: 'упак', упак: 'упак',
};
const sana0 = (hozir: Date, kunFarq: number): string => { const d = new Date(hozir.getTime() + 5 * 3600_000 + kunFarq * 86400_000); return d.toISOString().slice(0, 10); };

/**
 * Bepul, deterministik tahlil. `ishonch`: 'yuqori' — niyat+nom+miqdor aniq; aks holda chaqiruvchi LLM ga o'tadi.
 * Raqam so'zlari («o'n», «десять»), murakkab tuzatishlar — LLM ishi.
 */
export function oddiyTahlil(matn: string, hozir: Date = new Date()): { buyruq: Buyruq | null; ishonch: 'yuqori' | 'past' } {
  const t = String(matn ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!t) return { buyruq: null, ishonch: 'past' };
  const niyat = NIYAT.find(([, re]) => re.test(t))?.[0];
  if (!niyat) return { buyruq: null, ishonch: 'past' };
  const bil = (n: string) => BIRLIK_KANON[n.toLowerCase().replace(/[.\s]/g, '')] ?? n.toLowerCase();
  let harakatId: number | null = null;
  const hm = /(?:#|№|\bid\s*|harakat\s*)(\d{1,12})\b/i.exec(t);
  if (hm) harakatId = Number(hm[1]);
  let sana: string | null = null;
  if (/(?<![\p{L}])(kecha|вчера)(?![\p{L}])/iu.test(t)) sana = sana0(hozir, -1);
  else if (/(?<![\p{L}])(bugun|сегодня)(?![\p{L}])/iu.test(t)) sana = sana0(hozir, 0);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso) sana = sanaTekshir(iso[1]);
  const dm = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/.exec(t);
  if (dm) sana = sanaTekshir(`${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`);

  let qolgan = t.replace(/(?:#|№|\bid\s*|harakat\s*)\d{1,12}\b/gi, ' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g, ' ');
  // kontragent: «<so'z>ga» / «<X>dan» / «от X» / «поставщик X» / «для X»
  let kontragent: string | null = null;
  const km = /(?:(?<![\p{L}])postavshik\s+|(?<![\p{L}])поставщик\s+|(?<![\p{L}])от\s+|(?<![\p{L}])для\s+|(?<![\p{L}])prorab(?:ga)?\s+|(?<![\p{L}])прорабу\s+)([^\d,;]+?)(?=\s+\d|[,;]|$)/iu.exec(qolgan)
    ?? /\b([\p{L}'’‘ʻ-]{3,})(?:ga|ka|qa)\s+(?=[\p{L}]*\s*\d|\d)/iu.exec(qolgan);
  if (km) { kontragent = bosh(km[1], 200); qolgan = qolgan.replace(km[0], ' '); }
  const mm = MIQDOR_RE.exec(qolgan);
  let miqdor: number | null = null, birlik: string | null = null;
  if (mm) {
    miqdor = musbat(mm[1]);
    birlik = mm[2] ? bil(mm[2]) : null;
    qolgan = qolgan.replace(mm[0], ' ');
  }
  // niyat so'zlari va to'xtash so'zlarini olib tashlab, qolganini material nomi deb olamiz
  for (const [, re] of NIYAT) qolgan = qolgan.replace(new RegExp(re.source, 'giu'), ' ');
  qolgan = qolgan.replace(/(?<![\p{L}])(kecha|bugun|вчера|сегодня)(?![\p{L}])/giu, ' ');
  const sozlar = qolgan.split(/[\s,;:!?]+/).filter((s) => s && !TO_XTASH.has(s.toLowerCase()) && !/^(dan|ga|ni|uchun|на|в|из)$/iu.test(s));
  const nomi = bosh(sozlar.join(' '), 500);
  const buyruq: Buyruq = { amal: niyat, nomi: nomi && nomTokenlari(nomi).length ? nomi : null, miqdor, birlik, kontragent, obyekt: null, sana, harakat_id: harakatId, yangi: null, izoh: null };
  let yuqori = false;
  if (niyat === 'prixod' || niyat === 'chiqim') yuqori = !!(buyruq.nomi && buyruq.miqdor);
  else if (niyat === 'qoldiq' || niyat === 'tarix') yuqori = !!buyruq.nomi;
  else if (niyat === 'bekor') yuqori = !!harakatId;
  else if (niyat === 'tuzat') { // «#123 ni 50 ga o'zgartir»: aniq yozuv + yangi miqdor
    yuqori = !!(harakatId && buyruq.miqdor);
    if (buyruq.miqdor) buyruq.yangi = { miqdor: buyruq.miqdor };
  }
  return { buyruq, ishonch: yuqori ? 'yuqori' : 'past' };
}

export const LLM_TIZIM_MATNI = [
  'Sen ombor yordamchisisan. Foydalanuvchi (omborchi) o\'zbek yoki rus tilida ovoz/matn yozadi. Matnni FAQAT bitta JSON obyektga aylantir.',
  'Maydonlar: amal (prixod=kirim/приход, chiqim=berdi/расход, qoldiq=ostatka so\'rovi, tuzat=tuzatish, bekor=yozuvni bekor qilish, tarix=material tarixi),',
  'nomi (material nomi, matndagi yozilishi), miqdor (musbat son), birlik (шт, кг, тн, м, м2, м3, л, ...), kontragent (kirimda yetkazuvchi, chiqimda qabul qiluvchi),',
  'obyekt (obyekt nomi, bo\'lsa), sana (YYYY-MM-DD, aytilmasa null), harakat_id (tuzat/bekor uchun yozuv raqami, aytilmasa null),',
  'yangi ({miqdor, sana, nomi, birligi, kontragent, izoh} — tuzatishda faqat o\'zgargan maydonlar), izoh.',
  'Raqam so\'zlarini son qil («o\'n besh» = 15). Hech narsani o\'ylab topma: aytilmagan maydon null. Boshqa matn yozma, faqat JSON.',
].join(' ');

// ── tasdiq tokeni (HMAC-SHA256, stateless; Telegram uchun xabar matnida saqlanadi) ───────────────────────────────────────────────
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ''; for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDan = (s: string): Uint8Array => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
async function hmacKalit(sir: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode('ombor-buyruq:v1:' + sir), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export type TokenYuk = { a: number; k: number; s: number; op: string; e: number; p: Record<string, unknown> };

export async function tokenYarat(sir: string, yuk: Omit<TokenYuk, 'e'>, amaliyMs = 15 * 60_000, hozir = Date.now()): Promise<string> {
  const tana = b64u(enc.encode(JSON.stringify({ ...yuk, e: hozir + amaliyMs })));
  const imzo = await crypto.subtle.sign('HMAC', await hmacKalit(sir), enc.encode(tana));
  return tana + '.' + b64u(imzo);
}
export async function tokenTekshir(sir: string, token: string, hozir = Date.now()): Promise<TokenYuk | 'muddati' | null> {
  if (typeof token !== 'string' || token.length > 4000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [tana, imzo] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKalit(sir), b64uDan(imzo), enc.encode(tana));
    if (!ok) return null;
    const yuk = JSON.parse(new TextDecoder().decode(b64uDan(tana))) as TokenYuk;
    if (!yuk || !Number.isSafeInteger(yuk.a) || !Number.isSafeInteger(yuk.k) || !Number.isSafeInteger(yuk.s) || typeof yuk.op !== 'string') return null;
    return hozir > yuk.e ? 'muddati' : yuk;
  } catch { return null; }
}

export const SON_FORMAT = (n: number | null | undefined): string => (n == null ? '—' : String(Math.round(n * 10000) / 10000).replace('.', ','));
