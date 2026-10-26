/**
 * Qoralama kesimi — faqat KO‘RSATISH uchun (yangi formula yo‘q): `calcDoc` natijasidagi qator summalari
 * resurs kategoriyasi bo‘yicha yig‘iladi (kategoriya — RES/ustama bilan bir xil `qatorKategoriyasi`).
 * Summasi noma’lum qator yig‘indiga qo‘shilmaydi va alohida sanaladi (NULL ≠ 0).
 */
import { t } from '../../i18n/til';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { CoefScope, EstimateDoc } from '../../lib/smeta-studio/model';
import { qatorKategoriyasi } from '../../lib/smeta-studio/narx-yigish';
import { katGuruh, type KatGuruh } from '../../lib/f2-hujjat-korinish';
import { katKesimgaQosh, bosKatKesim, type KatKesim } from '../../lib/ustamali-summa';

type UnitText = Parameters<typeof qatorKategoriyasi>[3];
export const KAT_TARTIB: KatGuruh[] = ['chel', 'mash', 'mat', 'ob', 'nomalum'];
export type Qism = { guruh: KatGuruh; summa: number; ulush: number };
export type Kesim = { qismlar: Qism[]; jami: number; summasiz: number; narxsiz: number; qator: number; kesim: KatKesim };

const son = (v: string | null | undefined): number | null => { if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

function yig(parts: Array<{ kat: string | null; amount: string | null }>): Kesim {
  const acc = new Map<KatGuruh, number>();
  const kesim = bosKatKesim();
  let summasiz = 0, narxsiz = 0;
  for (const p of parts) {
    const s = son(p.amount);
    katKesimgaQosh(kesim, p.kat, s);
    if (s == null) { summasiz++; continue; }
    const g = katGuruh(p.kat);
    acc.set(g, (acc.get(g) ?? 0) + s);
  }
  const jami = [...acc.values()].reduce((a, b) => a + b, 0);
  narxsiz = summasiz;
  const qismlar = KAT_TARTIB.filter(g => acc.has(g)).map(g => ({ guruh: g, summa: acc.get(g)!, ulush: jami > 0 ? Math.max(0, acc.get(g)!) / jami : 0 }));
  return { qismlar, jami, summasiz, narxsiz, qator: parts.length, kesim };
}

/** Bitta ish qatorlarining kategoriya kesimi. */
export function ishKesimi(doc: EstimateDoc, calc: DocCalc, workId: string, unitText?: UnitText): Kesim {
  const o = doc.occurrences[workId];
  const lines = calc.occurrences[workId]?.lines ?? [];
  return yig(!o ? [] : lines.map(l => ({ kat: qatorKategoriyasi(o, l.recipeId, l.resource, unitText), amount: l.amount })));
}

/** Butun qoralama kesimi (SummaJuft uchun `kesim` ham shu yerdan). */
export function qoralamaKesimi(doc: EstimateDoc, calc: DocCalc, unitText?: UnitText): Kesim {
  const parts: Array<{ kat: string | null; amount: string | null }> = [];
  for (const o of Object.values(doc.occurrences)) for (const l of calc.occurrences[o.id]?.lines ?? [])
    parts.push({ kat: qatorKategoriyasi(o, l.recipeId, l.resource, unitText), amount: l.amount });
  return yig(parts);
}

export const foiz = (x: number) => `${Math.round(x * 100)}%`;

/** Koeffitsient nimani ko‘paytirishi — o‘qiladigan matn (hisob `calc.coefficientFor` da; bu faqat izoh). */
export function scopeMatn(scope: CoefScope): string {
  switch (scope) {
    case 'ЧЕЛ': return t('ЧЕЛ resurs miqdorini ko‘paytiradi');
    case 'МАШ': return t('МАШ resurs miqdorini ko‘paytiradi');
    case 'ЧЕЛ+МАШ': return t('ЧЕЛ va МАШ resurs miqdorini ko‘paytiradi');
    case 'МАТ': return t('МАТ resurs miqdorini ko‘paytiradi');
    default: return t('Hamma resurs miqdorini ko‘paytiradi');
  }
}
