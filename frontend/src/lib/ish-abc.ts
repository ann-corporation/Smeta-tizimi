/**
 * Kichik ABC — sof hisob mantiqi (ШНК tuzilishi): resurs hajmi = norma × ish hajmi,
 * summa = hajm × birlik narxi, ish summasi = resurslar yig'indisi; kategoriyalar bo'yicha jami.
 * Narx yo'q resurs — summa NULL (0 emas) va "narxsiz" sanaladi.
 */
import type { Kat, NarxManba, NarxVariant } from '../api/t2-ish-abc';

export type AbcResurs = {
  kat: Kat; kod: string; nom: string; birlik: string;
  norma: string; narx: string; manba: NarxManba;
  /** Server bergan narx variantlari (shu smeta / boshqa smeta / katalog). */
  variantlar?: NarxVariant[];
};

export const KATLAR: readonly Kat[] = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ'];
export const KAT_NOMI: Record<Kat, string> = { ЧЕЛ: 'Mehnat', МАШ: 'Mashina', МАТ: 'Material', ОБ: 'Uskuna' };
export const MANBA_NOMI: Record<NarxManba, string> = { smeta_obyekt: 'shu smeta', smeta: 'boshqa smeta', katalog: 'katalog', qolda: 'qo‘lda' };

export function son(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const t = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const y6 = (x: number) => Math.round(x * 1e6) / 1e6;
/** Postgres numeric bilan bir xil yaxlitlash: avval float shovqinini (…7849999) 6 xonada tozalab,
 *  keyin o'nlik ko'rinishda 2 xonaga (85,085 × 29 421 = 2 503 285,785 → ,79 — server ham ,79). */
const y2 = (x: number) => { const t = y6(x); return Number(Math.round(Number(`${t}e2`)) + 'e-2'); };

/** Smeta kategoriyasini aniqlash (sostavdagi kat/tur → ЧЕЛ/МАШ/МАТ/ОБ). */
export function katAniqla(kat: string | null | undefined, tur?: string | null, birlik?: string | null): Kat {
  const k = String(kat ?? '').toUpperCase();
  if (k === 'ЧЕЛ' || k === 'МАШ' || k === 'МАТ' || k === 'ОБ') return k;
  if (tur === 'ob') return 'ОБ';
  const b = String(birlik ?? '').toUpperCase();
  if (/ЧЕЛ/.test(b)) return 'ЧЕЛ';
  if (/МАШ/.test(b)) return 'МАШ';
  return 'МАТ';
}

export type AbcHisob = {
  qatorlar: Array<{ hajm: number | null; summa: number | null }>;
  jamiKat: Record<Kat, number>;
  jami: number; narxsiz: number;
  /** Ish birlik narxi = jami / ish hajmi. */
  ishNarxi: number | null;
};

export function abcHisobla(ishHajm: string | number | null, resurslar: readonly AbcResurs[]): AbcHisob {
  const h = son(ishHajm);
  const jamiKat: Record<Kat, number> = { ЧЕЛ: 0, МАШ: 0, МАТ: 0, ОБ: 0 };
  let jami = 0; let narxsiz = 0;
  const qatorlar = resurslar.map((r) => {
    const n = son(r.norma); const p = son(r.narx);
    const hajm = h != null && n != null ? y6(n * h) : null;
    const summa = hajm != null && p != null && p > 0 ? y2(hajm * p) : null;
    if (summa == null) narxsiz += 1; else { jamiKat[r.kat] += summa; jami += summa; }
    return { hajm, summa };
  });
  jami = y2(jami);
  return { qatorlar, jamiKat, jami, narxsiz, ishNarxi: h && h > 0 && jami > 0 ? y2(jami / h) : null };
}

export type AbcXato = { joy: string; matn: string };

export function abcTekshir(p: { rejim: 'ish' | 'resurs'; ish?: { nom: string; birlik: string; hajm: string }; resurslar: readonly AbcResurs[]; sabab: string; fakt?: string }): AbcXato[] {
  const x: AbcXato[] = [];
  if (p.rejim === 'ish') {
    if (!p.ish?.nom.trim()) x.push({ joy: 'ish', matn: 'Ish turi nomi kiritilmagan' });
    if (!p.ish?.birlik.trim()) x.push({ joy: 'ish', matn: 'Ish birligi kiritilmagan' });
    const h = son(p.ish?.hajm); if (h == null || h <= 0) x.push({ joy: 'ish', matn: 'Ish hajmi > 0 bo‘lishi kerak' });
    const f = son(p.fakt ?? ''); if (p.fakt?.trim() && (f == null || f < 0)) x.push({ joy: 'fakt', matn: 'Bajarilgan hajm noto‘g‘ri' });
  } else if (p.resurslar.length !== 1) x.push({ joy: 'resurs', matn: 'Bitta yangi resurs tanlang' });
  p.resurslar.forEach((r, i) => {
    if (!r.nom.trim() || !r.birlik.trim()) x.push({ joy: `r${i}`, matn: `${i + 1}-resurs: nom va birlik kerak` });
    const n = son(r.norma); if (n == null || n <= 0) x.push({ joy: `r${i}`, matn: `${i + 1}-resurs: norma > 0 bo‘lishi kerak` });
    const pr = son(r.narx); if (r.narx.trim() && (pr == null || pr < 0)) x.push({ joy: `r${i}`, matn: `${i + 1}-resurs: narx noto‘g‘ri` });
  });
  if (!p.sabab.trim()) x.push({ joy: 'sabab', matn: 'Sabab majburiy' });
  return x;
}

/** Variantlardan eng yaxshisi: shu smeta (RES) → boshqa smeta → katalog. */
export function engYaxshiNarx(v: readonly NarxVariant[]): NarxVariant | null {
  const tartib: NarxManba[] = ['smeta_obyekt', 'smeta', 'katalog'];
  for (const m of tartib) { const t = v.find((x) => x.manba === m && x.narx > 0); if (t) return t; }
  return null;
}
