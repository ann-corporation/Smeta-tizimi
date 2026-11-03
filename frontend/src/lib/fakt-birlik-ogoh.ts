/**
 * Fakt kiritishda «birlik xatosi» ogohlantirishi (egasi: tester «100М3» ishga 300 yozdi — 300 m³ ni nazarda tutgan,
 * ya'ni birlikda 3,00; fakt 10749% bo'lib, bolalar resurslari va obyekt ham shishdi).
 *
 * FAQAT ogohlantirish — hech qachon bloklamaydi (fakt smetadan oshishi mumkin; minus qiymat mumkin).
 * NULL ≠ 0: smeta noma'lum yoki 0 bo'lsa nisbat yo'q → ogohlantirish yo'q.
 * Qoida: (joriy fakt bilan jamlangan) fakt / smeta > 1,5 yoki kiritilgan hajmning smetaga nisbati 10/100/1000 ga ±10% da.
 */
import { birlikKopaytma } from './birlik-kopaytma';
import { kiritmaSoni } from './fakt-jurnal';

export const OGOH_CHEGARA = 1.5;
const DARAJA_TOLERANT = 0.1;
/** Tekshiriladigan 10 darajalari: ×10, ×100, ×1000. */
const DARAJALAR = [1, 2, 3] as const;

export type BirlikOgoh = {
  /** Kiritilgan hajm (foiz bo'lsa — hisoblangan) va smeta hajmi. */
  kiritilgan: number; smeta: number; yangiFakt: number;
  /** Jamlangan fakt / smeta (smeta manfiy bo'lsa ham ishora mos). */
  nisbat: number;
  /** Nisbat aynan 10^k (±10%) ga yaqin bo'lsa k (1..3), aks holda null. */
  daraja: number | null;
  /** Birlikdagi ko'paytma (100М3 → 100) va ko'rsatiladigan birlik («100 М3»); yo'q bo'lsa null. */
  kopaytma: number | null; birlikMatn: string | null;
  /** Birlik xatosiga o'xshaydimi (daraja yoki nisbat ≳ ko'paytma/2). */
  gumon: boolean;
  /** Taklif qilinadigan qiymat (kiritilgan / ko'paytma) — faqat birlik ko'paytmasi bor va gumon bo'lsa. */
  taklif: number | null;
};

export type BirlikOgohKirish = {
  smeta: number | null | undefined;
  /** Hozirgi (saqlangan) fakt. */
  joriy: number | null | undefined;
  rejim: '+' | '=';
  /** Kiritilgan son (foiz bo'lsa — smetadan hisoblangan). */
  n: number | null | undefined;
  birlik?: string | null;
};

const yaxlit6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Nisbat 10^k (k = 1..3) ga ±10% da yaqinmi — k yoki null. Manfiy/0 nisbat — null. */
export function ongDaraja(nisbat: number): number | null {
  if (!Number.isFinite(nisbat) || nisbat <= 0) return null;
  for (const k of DARAJALAR) if (Math.abs(nisbat / 10 ** k - 1) <= DARAJA_TOLERANT + 1e-9) return k;
  return null;
}

export function birlikOgohi(x: BirlikOgohKirish): BirlikOgoh | null {
  const smeta = x.smeta; const n = x.n;
  if (smeta == null || !Number.isFinite(smeta) || smeta === 0) return null;
  if (n == null || !Number.isFinite(n)) return null;
  const joriy = x.joriy != null && Number.isFinite(x.joriy) ? x.joriy : 0;
  const yangiFakt = x.rejim === '+' ? joriy + n : n;
  const nisbat = yangiFakt / smeta;
  const kiritNisbat = n / smeta;
  const daraja = ongDaraja(nisbat) ?? ongDaraja(kiritNisbat);
  if (!(nisbat > OGOH_CHEGARA) && daraja == null) return null;
  const bk = birlikKopaytma(x.birlik);
  const kopaytma = bk?.kopaytma ?? null;
  const gumon = daraja != null || (kopaytma != null && Math.max(nisbat, kiritNisbat) >= kopaytma / 2);
  const taklif = kopaytma != null && gumon ? yaxlit6(n / kopaytma) : null;
  return { kiritilgan: n, smeta, yangiFakt, nisbat, daraja, kopaytma, birlikMatn: bk?.birlik ?? null, gumon, taklif };
}

/** Kiritma qiymati («300», «50%») bo'yicha ogohlantirish — jurnal qatori va egizak oldindan ko'rish uchun yagona yo'l. */
export function qiymatBirlikOgohi(qiymat: string, rejim: '+' | '=', smeta: number | null | undefined, joriy: number | null | undefined, birlik?: string | null): BirlikOgoh | null {
  const n = kiritmaSoni(qiymat, smeta);
  return typeof n === 'number' ? birlikOgohi({ smeta, joriy, rejim, n, birlik }) : null;
}