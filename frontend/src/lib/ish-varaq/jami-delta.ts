/**
 * Ish varag'i pastki panel: SAQLANMAGAN kiritmalar bilan jami (delta) — sof mantiq. Yangi pul formulasi yo'q:
 *  - fakt: o'zgargan HAJM (delta) × qator birlik narxi, narx qoidasi yadrodan — `faktSummaF2Narxda` (tasdiqlangan F2 bor qatorda F2 narxida);
 *  - ustamali ko'rinish — `SummaJuft` (kesim → ustama podvali), bu yerda faqat KATEGORIYA KESIMI va ustamasiz yig'indi.
 * NULL ≠ 0: birlik narxi noma'lum qator deltasi `null` (kesimda «narxsiz» sanaladi), 0 emas.
 */
import type { T2Qator } from '../../api/supabase';
import { ayirma2, faktSummaF2Narxda, qatorSumma, yigindi2 } from '../hisob-yadro';
import type { JurnalHolat, JurnalIsh, JurnalQator, SummaKesim } from '../fakt-jurnal';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from '../ustamali-summa';

export type SummaDelta = { id: number; kat: string | null; summa: number | null };

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Fakt deltalari (paket: qator_id → qo'shiladigan hajm) → barg qatorlari summa farqi. Ish (bl) deltasi uning AVTOMATIK
 * resurslariga norma bo'yicha tushadi (server ham shunday: norma × ish fakti); mat/ob — o'zi.
 */
export function faktDeltalar(o: {
  deltalar: ReadonlyArray<{ qator_id: number; hajm: number }>;
  qatorOl: (id: number) => JurnalQator | JurnalIsh | undefined;
  holat: ReadonlyMap<number, JurnalHolat>;
  rowById: ReadonlyMap<number, T2Qator>;
  chiqarilgan?: ReadonlySet<number>;
}): SummaDelta[] {
  const out: SummaDelta[] = [];
  const barg = (id: number, dh: number) => {
    if (o.chiqarilgan?.has(id)) return;
    const h = o.holat.get(id);
    const f0 = son(h?.fakt_hajm) ?? 0; const f1 = f0 + dh;
    const yangi = faktSummaF2Narxda(f1, son(h?.f2_hajm), son(h?.f2_summa), qatorSumma(f1, son(h?.smeta_narx)), h?.f2_summa_yoq).summa;
    const eski = faktSummaF2Narxda(f0, son(h?.f2_hajm), son(h?.f2_summa), son(h?.fakt_summa), h?.f2_summa_yoq).summa ?? (f0 === 0 ? 0 : null);
    out.push({ id, kat: o.rowById.get(id)?.kat ?? null, summa: ayirma2(yangi, eski) });
  };
  for (const d of o.deltalar) {
    const q = o.qatorOl(d.qator_id);
    if (!q || !Number.isFinite(d.hajm) || d.hajm === 0) continue;
    if (q.tur === 'bl' && 'avtomatik' in q) {
      for (const c of q.avtomatik) { const norma = c.norma ?? (q.smeta ? (c.smeta ?? 0) / q.smeta : null); if (norma != null) barg(c.id, d.hajm * norma); }
    } else barg(q.id, d.hajm);
  }
  return out;
}

const kesimNusxa = (k: KatKesim): KatKesim => ({ ...k, summalar: { ...k.summalar }, ...(k.yaxlit ? { yaxlit: { ...k.yaxlit } } : {}) });
const bormi = (xs: ReadonlyArray<number | null>) => xs.some((x) => x != null && Number.isFinite(x));

/** Jami + saqlanmagan deltalar (baza — saqlangan holat jami). Baza yo'q va delta yo'q — null. */
export function jamiDeltaBilan(baza: SummaKesim | undefined, deltalar: readonly SummaDelta[]): SummaKesim {
  const kesim = baza ? kesimNusxa(baza.kesim) : bosKatKesim();
  for (const d of deltalar) katKesimgaQosh(kesim, d.kat, d.summa);
  const qiymatlar = [baza?.ustamasiz ?? null, ...deltalar.map((d) => d.summa)];
  return { ustamasiz: bormi(qiymatlar) ? yigindi2(qiymatlar) : null, kesim };
}

/** Faqat delta (saqlanmaganning o'zi). */
export function deltaFaqat(deltalar: readonly SummaDelta[]): SummaKesim {
  const kesim = bosKatKesim();
  for (const d of deltalar) katKesimgaQosh(kesim, d.kat, d.summa);
  const qiymatlar = deltalar.map((d) => d.summa);
  return { ustamasiz: bormi(qiymatlar) ? yigindi2(qiymatlar) : null, kesim };
}
