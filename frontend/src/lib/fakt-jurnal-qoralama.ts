/**
 * Fakt jurnali qoralamasi (hodisa 2026-11-09): saqlanmagan kiritmalar faqat React xotirasida edi — deploydan keyin
 * eski varaqda saqlash muvaffaqiyatsiz bo'lib, sahifa yangilanganda ~30 qator yo'qoldi. Endi kiritmalar
 * kompaniya+obyekt bo'yicha brauzerda (localStorage) saqlanib turadi va sahifa ochilganda xavfsiz tiklanadi.
 *
 * Saqlanadi: qator_id, rejim (+/=), kiritilgan qiymat va kiritish paytidagi server fakti (`asos`). Summa/narx YO'Q.
 * Tiklash: qator endi yo'q yoki server fakti `asos` dan farq qilsa — kiritma JIM qo'llanmaydi, ziddiyat sifatida belgilanadi.
 */
import type { Kiritma, Rejim } from './fakt-jurnal';

export const QORALAMA_VERSIYA = 1 as const;
const PREFIKS_UMUMIY = 't2.fakt.jurnal.qoralama';
/** v2: foydalanuvchi id si kalitda — bir profilda (desktop/brauzer) ikki hisob bir-birining qoralamasini ko'rmaydi. */
const PREFIKS = `${PREFIKS_UMUMIY}:v2`;
/** v1 kalitda egasi yo'q edi: hech kimga ko'chirilmaydi, o'chiriladi. */
const PREFIKS_V1 = `${PREFIKS_UMUMIY}:v1:`;
/** Juda eski qoralama (30 kun) tiklanmaydi — o'chiriladi. */
export const QORALAMA_MUDDAT_MS = 30 * 24 * 3600_000;
const EPS = 1e-9;

export const qoralamaKaliti = (kompaniyaId: number, obyektId: number, foydalanuvchiId: number): string => `${PREFIKS}:${kompaniyaId}:${foydalanuvchiId}:${obyektId}`;

export type QoralamaYozuv = { id: number; rejim: Rejim; qiymat: string; /** Kiritish paytidagi server fakti. */ asos: number };
export type Qoralama = { v: typeof QORALAMA_VERSIYA; ts: number; sana?: string; yozuvlar: QoralamaYozuv[] };
export type Xotira = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>;

/** Prefiks bilan boshlanadigan kalitlarni o'chiradi (key/length bo'lmagan xotirada — hech narsa). */
function kalitlarniOchir(xotira: Xotira | null, mos: (k: string) => boolean): number {
  if (!xotira || typeof xotira.key !== 'function' || typeof xotira.length !== 'number') return 0;
  try {
    const kalitlar: string[] = [];
    for (let i = 0; i < xotira.length; i++) { const k = xotira.key(i); if (k && mos(k)) kalitlar.push(k); }
    for (const k of kalitlar) xotira.removeItem(k);
    return kalitlar.length;
  } catch { return 0; }
}

/**
 * Bir martalik migratsiya: shu kompaniya+obyekt uchun v1 qoralama bor va joriy foydalanuvchining v2 si YO'Q bo'lsa —
 * v1 mazmuni v2 ga ko'chiriladi, so'ng v1 o'chiriladi. v2 allaqachon bo'lsa v1 ga tegilmaydi. Ko'chirilgan bo'lsa true.
 */
export function qoralamaV1Kochir(xotira: Xotira | null, kompaniyaId: number, obyektId: number, foydalanuvchiId: number): boolean {
  if (!xotira) return false;
  try {
    const v1 = `${PREFIKS_V1}${kompaniyaId}:${obyektId}`;
    const matn = xotira.getItem(v1);
    if (!matn) return false;
    const v2 = qoralamaKaliti(kompaniyaId, obyektId, foydalanuvchiId);
    if (xotira.getItem(v2) != null) return false;
    xotira.setItem(v2, matn);
    xotira.removeItem(v1);
    return true;
  } catch { return false; }
}

/** Chiqishda: shu profildagi barcha fakt qoralamalari (v1 va v2) o'chiriladi. */
export const qoralamaHammasiniOchir = (xotira: Xotira | null): number => kalitlarniOchir(xotira, (k) => k.startsWith(`${PREFIKS_UMUMIY}:`));

/** localStorage — yopiq/taqiqlangan bo'lsa null (qoralama shunchaki ishlamaydi, sahifa ishlaydi). */
export function brauzerXotirasi(): Xotira | null {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}

/** Kiritmalardan qoralama yasaydi (bo'sh qiymatlar tashlanadi). Hech narsa bo'lmasa — null. */
export function qoralamaQur(kiritmalar: Readonly<Record<number, Kiritma>>, faktlar: ReadonlyMap<number, number>, ts: number, sana?: string, qoshimcha: readonly QoralamaYozuv[] = []): Qoralama | null {
  const yozuvlar: QoralamaYozuv[] = [];
  const bor = new Set<number>();
  for (const [k, v] of Object.entries(kiritmalar)) {
    const id = Number(k);
    if (!Number.isSafeInteger(id) || !v || !v.qiymat.trim()) continue;
    yozuvlar.push({ id, rejim: v.rejim, qiymat: v.qiymat, asos: faktlar.get(id) ?? 0 });
    bor.add(id);
  }
  // Hal qilinmagan ziddiyatlar (tiklanmagan yozuvlar) foydalanuvchi qaror qilguncha qoralamada qoladi.
  for (const y of qoshimcha) if (!bor.has(y.id)) { yozuvlar.push(y); bor.add(y.id); }
  if (!yozuvlar.length) return null;
  yozuvlar.sort((a, b) => a.id - b.id);
  return { v: QORALAMA_VERSIYA, ts, ...(sana ? { sana } : {}), yozuvlar };
}

/** Qoralamani yozadi (null — o'chiradi). Xotira to'lgan/yopiq bo'lsa jim o'tadi; muvaffaqiyat — true. */
export function qoralamaYoz(xotira: Xotira | null, kompaniyaId: number, obyektId: number, foydalanuvchiId: number, q: Qoralama | null): boolean {
  if (!xotira) return false;
  try {
    const k = qoralamaKaliti(kompaniyaId, obyektId, foydalanuvchiId);
    if (q) xotira.setItem(k, JSON.stringify(q)); else xotira.removeItem(k);
    return true;
  } catch { return false; }
}

export const qoralamaOchir = (xotira: Xotira | null, kompaniyaId: number, obyektId: number, foydalanuvchiId: number): boolean => qoralamaYoz(xotira, kompaniyaId, obyektId, foydalanuvchiId, null);

function yozuvmi(x: unknown): x is QoralamaYozuv {
  if (!x || typeof x !== 'object') return false;
  const y = x as Record<string, unknown>;
  return Number.isSafeInteger(y.id) && (y.rejim === '+' || y.rejim === '=') && typeof y.qiymat === 'string' && typeof y.asos === 'number' && Number.isFinite(y.asos);
}

/** Qoralamani o'qiydi va tekshiradi. Buzilgan/boshqa versiya/muddati o'tgan bo'lsa — null. */
export function qoralamaOqi(xotira: Xotira | null, kompaniyaId: number, obyektId: number, foydalanuvchiId: number, hozir = Date.now()): Qoralama | null {
  if (!xotira) return null;
  let matn: string | null;
  try { matn = xotira.getItem(qoralamaKaliti(kompaniyaId, obyektId, foydalanuvchiId)); } catch { return null; }
  if (!matn) return null;
  try {
    const j = JSON.parse(matn) as Partial<Qoralama>;
    if (!j || j.v !== QORALAMA_VERSIYA || typeof j.ts !== 'number' || !Array.isArray(j.yozuvlar)) return null;
    if (hozir - j.ts > QORALAMA_MUDDAT_MS) { qoralamaOchir(xotira, kompaniyaId, obyektId, foydalanuvchiId); return null; }
    const yozuvlar = j.yozuvlar.filter(yozuvmi).filter((y) => y.qiymat.trim());
    if (!yozuvlar.length) return null;
    return { v: QORALAMA_VERSIYA, ts: j.ts, ...(typeof j.sana === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.sana) ? { sana: j.sana } : {}), yozuvlar };
  } catch { return null; }
}

export type QoralamaZiddiyat = { yozuv: QoralamaYozuv; sabab: 'yoq' | 'ozgargan'; /** Hozirgi server fakti (sabab='ozgargan'). */ joriy?: number };
export type QoralamaTiklash = { kiritmalar: Record<number, Kiritma>; ziddiyatlar: QoralamaZiddiyat[]; ts: number; sana?: string };

/**
 * Qoralamani joriy jadvalga solishtiradi: qator bor va server fakti `asos` bilan bir xil — kiritma tiklanadi;
 * aks holda ziddiyat (qo'llanmaydi). `faktlar` — joriy jadvaldagi BARCHA qatorlar (yo'q kalit = qator yo'q).
 */
export function qoralamaTikla(q: Qoralama, faktlar: ReadonlyMap<number, number>): QoralamaTiklash {
  const kiritmalar: Record<number, Kiritma> = {};
  const ziddiyatlar: QoralamaZiddiyat[] = [];
  for (const y of q.yozuvlar) {
    const joriy = faktlar.get(y.id);
    if (joriy == null) { ziddiyatlar.push({ yozuv: y, sabab: 'yoq' }); continue; }
    if (Math.abs(joriy - y.asos) > EPS) { ziddiyatlar.push({ yozuv: y, sabab: 'ozgargan', joriy }); continue; }
    kiritmalar[y.id] = { rejim: y.rejim, qiymat: y.qiymat };
  }
  return { kiritmalar, ziddiyatlar, ts: q.ts, ...(q.sana ? { sana: q.sana } : {}) };
}
