/**
 * M-29 KO'RINISHI — vizual tahlil uchun sof hisoblar (egasi 2026-10-25: «har hujjatni bir qarashda tushunish»).
 * Yangi biznes formula YO'Q: faqat `m29Hisobla` natijasidan (norma, fakt, farq, farq summasi, diqqat)
 *  - har material uchun «norma = 100%» ga nisbatan fakt chizig'i va so'z bilan holat (ortiqcha / tejaldi / mos);
 *  - xulosa: necha material normadan oshgan, tejalgan, fakti noma'lum;
 *  - diqqat yozuvlarini tegishli material qatoriga bog'lash (alohida oynada ham qoladi);
 *  - tejash / ortiqcha pulining kategoriya kesimi (ustamali summa uchun).
 * NULL ≠ 0: fakt noma'lum bo'lsa — foiz ham, holat ham «noma'lum», nol emas.
 */
import type { M29Diqqat, M29Material, M29Natija } from './m29';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';

const EPS = 1e-9;
/** Chiziq shkalasi: fakt normadan 2 baravardan oshsa ham norma belgisi 50% da qoladi. */
const SHKALA_MAX = 2;

export type M29Holat = 'ortiqcha' | 'tejaldi' | 'mos' | 'faktYoq' | 'normasiz' | 'bosh';

export type M29Nisbat = {
  holat: M29Holat;
  /** fakt / norma × 100 (norma 0 yoki fakt noma'lum — null). */
  foiz: number | null;
  /** |fakt − norma| / norma × 100 — «ortiqcha 12%» / «tejaldi 8%» uchun (null — aniqlab bo'lmaydi). */
  farqFoiz: number | null;
  /** Chizish uchun 0..1: norma belgisi joyi va fakt chizig'i uzunligi (bir shkalada). */
  normaJoy: number;
  faktUzun: number;
  /** Fakt shkaladan chiqib ketdi (≥ 2 × norma) — chiziq kesilgan. */
  kesilgan: boolean;
};

/** Boshidan beri (yoki oy) norma ↔ fakt nisbati. Fakt null — noma'lum, nol emas. */
export function m29Nisbat(norma: number, fakt: number | null): M29Nisbat {
  if (fakt == null) return { holat: norma > EPS ? 'faktYoq' : 'bosh', foiz: null, farqFoiz: null, normaJoy: norma > EPS ? 1 : 0, faktUzun: 0, kesilgan: false };
  if (norma <= EPS) {
    return fakt > EPS
      ? { holat: 'normasiz', foiz: null, farqFoiz: null, normaJoy: 0, faktUzun: 1, kesilgan: false }
      : { holat: 'bosh', foiz: null, farqFoiz: null, normaJoy: 0, faktUzun: 0, kesilgan: false };
  }
  const nis = fakt / norma;
  const farq = fakt - norma;
  const holat: M29Holat = farq > EPS ? 'ortiqcha' : farq < -EPS ? 'tejaldi' : 'mos';
  const max = Math.min(Math.max(1, nis), SHKALA_MAX);
  return {
    holat, foiz: nis * 100, farqFoiz: Math.abs(farq) / norma * 100,
    normaJoy: 1 / max, faktUzun: Math.min(1, Math.max(0, nis / max)), kesilgan: nis > SHKALA_MAX,
  };
}

export const m29MaterialNisbat = (m: M29Material): M29Nisbat => m29Nisbat(m.normaJami, m.faktJami);

export type M29Xulosa = {
  materialSoni: number;
  ortiqchaSoni: number;
  tejaldiSoni: number;
  mosSoni: number;
  faktYoqSoni: number;
  normasizSoni: number;
  /** Kamida bitta materialda sklad chiqimi bor (aks holda haqiqiy sarf butunlay noma'lum). */
  faktBor: boolean;
};

export function m29Xulosa(n: M29Natija): M29Xulosa {
  const r: M29Xulosa = { materialSoni: 0, ortiqchaSoni: 0, tejaldiSoni: 0, mosSoni: 0, faktYoqSoni: 0, normasizSoni: 0, faktBor: false };
  for (const g of n.guruhlar) for (const m of g.materiallar) {
    r.materialSoni++;
    if (m.faktJami != null) r.faktBor = true;
    const h = m29MaterialNisbat(m).holat;
    if (h === 'ortiqcha') r.ortiqchaSoni++;
    else if (h === 'tejaldi') r.tejaldiSoni++;
    else if (h === 'mos') r.mosSoni++;
    else if (h === 'faktYoq') r.faktYoqSoni++;
    else if (h === 'normasiz') r.normasizSoni++;
  }
  return r;
}

/** Diqqat yozuvidagi material nomi — `m29Hisobla` dagi bilan bir xil shakl. */
const diqqatNomi = (m: Pick<M29Material, 'nom' | 'birlik'>) => `${m.nom} (${m.birlik ?? '—'})`;

/**
 * material kaliti → shu materialga tegishli diqqat yozuvlari. NORMA_YOQ yozuvi «material — ish» shaklida.
 * SMETADA_YOQ smetada yo'q materialga tegishli — jadvalda qatori yo'q, faqat o'z oynasida.
 */
export function m29DiqqatXaritasi(n: M29Natija): Map<string, M29Diqqat[]> {
  const out = new Map<string, M29Diqqat[]>();
  const nomBoyicha = new Map<string, string>();
  const mats: M29Material[] = n.guruhlar.flatMap((g) => g.materiallar);
  for (const m of mats) nomBoyicha.set(diqqatNomi(m), m.kalit);
  for (const d of n.diqqat) {
    if (d.tur === 'SMETADA_YOQ') continue;
    let kalit = nomBoyicha.get(d.nom);
    if (!kalit && d.tur === 'NORMA_YOQ') kalit = mats.find((m) => d.nom.startsWith(`${m.nom} — `))?.kalit;
    if (!kalit) continue;
    const r = out.get(kalit) ?? [];
    r.push(d); out.set(kalit, r);
  }
  return out;
}

export type M29PulTur = 'tejash' | 'ortiqcha' | 'sof';

/**
 * Pul farqining kategoriya kesimi (ustamali summa uchun). Yig'indisi `natija.jami` dagi bilan bir xil:
 * tejash — manfiy farqlar moduli, ortiqcha — musbat farqlar, sof — imzoli yig'indi (modul: belgi so'z bilan beriladi).
 */
export function m29PulKesim(n: M29Natija, tur: M29PulTur): KatKesim {
  const k = bosKatKesim();
  const sofManfiy = (n.jami.farqSummaJami ?? 0) < 0;
  for (const g of n.guruhlar) for (const m of g.materiallar) {
    const s = m.farqSummaJami;
    if (s == null) continue;
    if (tur === 'tejash' && s < 0) katKesimgaQosh(k, m.kat, -s);
    else if (tur === 'ortiqcha' && s > 0) katKesimgaQosh(k, m.kat, s);
    else if (tur === 'sof' && s !== 0) katKesimgaQosh(k, m.kat, sofManfiy ? -s : s);
  }
  return k;
}

/** Bitta guruhning pul farqi kesimi (modul; belgi alohida so'z bilan). */
export function m29GuruhKesim(g: M29Natija['guruhlar'][number]): KatKesim {
  const k = bosKatKesim();
  const manfiy = (g.farqSummaJami ?? 0) < 0;
  for (const m of g.materiallar) if (m.farqSummaJami != null && m.farqSummaJami !== 0) katKesimgaQosh(k, m.kat, manfiy ? -m.farqSummaJami : m.farqSummaJami);
  return k;
}

/** Imzoli farq → so'z bilan holat (+ — ortiqcha, − — tejaldi). */
export const m29FarqHolat = (x: number | null | undefined): 'ortiqcha' | 'tejaldi' | 'mos' | null =>
  x == null ? null : x > EPS ? 'ortiqcha' : x < -EPS ? 'tejaldi' : 'mos';

export type M29Chetlanish = { kalit: string; nom: string; birlik: string | null; norma: number; fakt: number; foiz: number; holat: M29Holat };

/**
 * Normadan eng ko'p chetlashgan materiallar (fakt/norma %): avval ortiqcha (kattasi birinchi), keyin tejalgan.
 * Faqat fakt ma'lum va norma > 0 bo'lganlar (NULL ≠ 0). Yangi formula yo'q — `m29Nisbat` foizi.
 */
export function m29EngKopChetlanish(n: M29Natija, limit = 8): M29Chetlanish[] {
  const r: M29Chetlanish[] = [];
  for (const g of n.guruhlar) for (const m of g.materiallar) {
    const x = m29MaterialNisbat(m);
    if (x.foiz == null || m.faktJami == null || (x.holat !== 'ortiqcha' && x.holat !== 'tejaldi')) continue;
    r.push({ kalit: m.kalit, nom: m.nom, birlik: m.birlik ?? null, norma: m.normaJami, fakt: m.faktJami, foiz: x.foiz, holat: x.holat });
  }
  r.sort((a, b) => Math.abs(b.foiz - 100) - Math.abs(a.foiz - 100));
  return r.slice(0, limit);
}
