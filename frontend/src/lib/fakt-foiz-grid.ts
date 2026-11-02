/**
 * Fakt jurnali — jadval kabi tez kiritish (egasi 2026-10-31): foiz chiplari bo'lim/ko'rinadigan qatorlarga darhol,
 * ustunni joylash (Excel'dan nusxa), qoralama tarixi (orqaga) va saqlashdan oldin «jami» kiritmalar uchun CAS.
 * Sof funksiyalar — hisob yadrosi: foiz → hajm `kiritmaSoni` (hajmMasshtab), NULL ≠ 0, fakt F2 dan kam bo'lishi mumkin.
 */
import type { Kiritma, Rejim } from './fakt-jurnal';
import { kiritmaSoni } from './fakt-jurnal';

export type Kiritmalar = Record<number, Kiritma>;

/** Foiz chipi: berilgan qatorlarga «jami = p% smeta» ('=' rejim). Smetasi noma'lum/0 qatorlar o'tkazib yuboriladi (soni qaytadi). */
export function foizQoll(kiritmalar: Readonly<Kiritmalar>, qatorlar: ReadonlyArray<{ id: number; smeta: number | null }>, foiz: number, rejim: Rejim = '='): { kiritmalar: Kiritmalar; qollandi: number; otkazildi: number } {
  const n: Kiritmalar = { ...kiritmalar };
  let qollandi = 0; let otkazildi = 0;
  for (const q of qatorlar) {
    if (q.smeta == null || q.smeta === 0) { otkazildi++; continue; }
    n[q.id] = { rejim, qiymat: `${foiz}%` };
    qollandi++;
  }
  return { kiritmalar: n, qollandi, otkazildi };
}

/** Joylangan matn → qiymatlar ro'yxati (qator boshiga birinchi katak; bo'sh oxirgi qator tashlanadi). Bitta qiymat — null (oddiy joylash). */
export function ustunOqi(matn: string): string[] | null {
  const qatorlar = matn.replace(/\r/g, '').split('\n');
  while (qatorlar.length && !qatorlar[qatorlar.length - 1].trim()) qatorlar.pop();
  if (qatorlar.length < 2) return null;
  return qatorlar.map((x) => x.split('\t')[0].trim());
}

/** Ustunni joylash: `boshIndeks` dan boshlab ketma-ket ko'rinadigan kataklarga (rejim saqlanadi; bo'sh qiymat — kiritma o'chadi). */
export function ustunJoylash(kiritmalar: Readonly<Kiritmalar>, idlar: readonly number[], boshIndeks: number, qiymatlar: readonly string[]): { kiritmalar: Kiritmalar; joylandi: number } {
  const n: Kiritmalar = { ...kiritmalar };
  let joylandi = 0;
  for (let i = 0; i < qiymatlar.length && boshIndeks + i < idlar.length; i++) {
    const id = idlar[boshIndeks + i];
    const v = qiymatlar[i];
    if (!v) { delete n[id]; continue; }
    n[id] = { rejim: n[id]?.rejim ?? '+', qiymat: v };
    joylandi++;
  }
  return { kiritmalar: n, joylandi };
}

/**
 * CAS (jami kiritmalari): '=' qatorlar delta'si brauzerdagi fakt dan hisoblanadi — serverdagi fakt o'zgargan bo'lsa,
 * saqlash to'xtatiladi (FAKT_CONFLICT ma'nosi). '+' (bugungi hajm) — qo'shiluvchi, CAS shart emas.
 * `server` — qayta o'qilgan fakt (id → hajm); qator topilmasa ham ziddiyat (o'chirilgan/ko'chgan).
 */
export function jamiIdlari(kiritmalar: Readonly<Kiritmalar>, smetalar: ReadonlyMap<number, number | null>): number[] {
  return Object.entries(kiritmalar).filter(([id, k]) => k.rejim === '=' && k.qiymat.trim() && kiritmaSoni(k.qiymat, smetalar.get(Number(id))) != null).map(([id]) => Number(id));
}
export function casZiddiyat(idlar: readonly number[], brauzer: ReadonlyMap<number, number>, server: ReadonlyMap<number, number>): Array<{ id: number; brauzer: number; server: number | null }> {
  const out: Array<{ id: number; brauzer: number; server: number | null }> = [];
  for (const id of idlar) {
    const b = brauzer.get(id) ?? 0; const s = server.get(id);
    if (s == null || Math.abs(s - b) > 1e-9) out.push({ id, brauzer: b, server: s ?? null });
  }
  return out;
}

/** Qoralama tarixi (orqaga): ommaviy amallardan oldingi holatlar, eng ko'pi `chegara`. */
export function tarixgaQosh(tarix: readonly Kiritmalar[], holat: Readonly<Kiritmalar>, chegara = 30): Kiritmalar[] {
  return [...tarix, { ...holat }].slice(-chegara);
}
