/**
 * F2 REESTRI KO'RINISHI — chizish uchun sof ulushlar (egasi 2026-10-25: «hujjat va ish holatini bir qarashda ko'rish»).
 * Yangi biznes formula YO'Q: reestrQur bergan summalarni smeta (=100%) ga nisbatan chiziq bo'laklariga ajratadi.
 * Bu SUMMA nisbati — jismoniy bajarilish foizi emas. NULL ≠ 0: smeta noma'lum yoki ≤ 0 bo'lsa foiz ham noma'lum (null).
 */
import type { Summa } from './reestr';

export type ReestrUlush = {
  /** Tasdiqlangan F2 (ma'lum qismi) / smeta × 100; smeta noma'lum bo'lsa null. */
  foiz: number | null;
  /** Chiziq bo'laklari 0..1 (yig'indisi ≤ 1): import, tizimda yasalgan, manbasi aniqlanmagan. */
  importUlush: number; tizimUlush: number; boshqaUlush: number;
  oshdi: boolean;
};

const ulush = (qism: number, butun: number) => Math.max(0, qism) / butun;

export function reestrUlush(p: { tasdiqlangan: Summa; tasdiqImport: Summa; tasdiqTizim: Summa }, smeta: number | null | undefined): ReestrUlush {
  const s = smeta == null || !Number.isFinite(Number(smeta)) ? null : Number(smeta);
  if (s == null || s <= 0) return { foiz: null, importUlush: 0, tizimUlush: 0, boshqaUlush: 0, oshdi: false };
  const jami = p.tasdiqlangan.malum;
  const boshqa = Math.max(0, jami - p.tasdiqImport.malum - p.tasdiqTizim.malum);
  let qoldi = 1;
  const kes = (x: number) => { const v = Math.min(qoldi, ulush(x, s)); qoldi -= v; return v; };
  const importUlush = kes(p.tasdiqImport.malum);
  const tizimUlush = kes(p.tasdiqTizim.malum);
  const boshqaUlush = kes(boshqa);
  return { foiz: (jami / s) * 100, importUlush, tizimUlush, boshqaUlush, oshdi: jami > s * 1.0001 };
}

/** Kompaniya bo'yicha tasdiqlangan F2 ning manba taqsimoti (fz-split uchun): import / tizimda / aniqlanmagan. */
export function manbaTaqsimot(p: { tasdiqlangan: Summa; tasdiqImport: Summa; tasdiqTizim: Summa }): { import: number; tizim: number; boshqa: number; jami: number } {
  const imp = Math.max(0, p.tasdiqImport.malum), tiz = Math.max(0, p.tasdiqTizim.malum);
  const boshqa = Math.max(0, p.tasdiqlangan.malum - imp - tiz);
  return { import: imp, tizim: tiz, boshqa, jami: imp + tiz + boshqa };
}
