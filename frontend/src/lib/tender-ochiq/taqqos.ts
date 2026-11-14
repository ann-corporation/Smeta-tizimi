/**
 * Ochilgan tender taqqosi: har taklif uchun birlik narxlari (QQS siz) va jami. Pul arifmetikasi FAQAT lib/hisob-yadro orqali (qatorSumma, yigindi2Qatiy);
 * narxsiz qator bo'lsa jami NULL («—», hech qachon 0 emas).
 */
import { qatorSumma, yigindi2Qatiy } from '../hisob-yadro';
import type { Bayonnoma } from '../../api/t2-tender-ochiq';

export type TaqqosQator = { taklif_id: number; kompaniya: string; holat: string; jami: number | null; qqs_foiz: number; muddat_kun_max: number | null; amal_kun: number | null; kafolat_oy: number | null; yetkazish_narx: number | null };

const YAROQLI = new Set(['berildi', 'faol', 'golib', 'yutqazdi']);

/** Yaroqli (qaytarib olinmagan) takliflar jami bo'yicha o'sish tartibida (NULL oxirida); tenglikda oldin berilgani. */
export function taqqosQatorlari(b: Pick<Bayonnoma, 'takliflar' | 'qatorlar'>): TaqqosQator[] {
  const yaroqli = b.takliflar.filter((t) => YAROQLI.has(t.holat));
  const qatorlar = yaroqli.map((t) => {
    const narxlar = new Map((t.qatorlar ?? []).map((q) => [q.qator_no, q]));
    const jami = b.qatorlar.length === 0 ? null : yigindi2Qatiy(b.qatorlar.map((q) => qatorSumma(q.miqdor, narxlar.get(q.qator_no)?.narx ?? null)));
    const muddatlar = (t.qatorlar ?? []).map((q) => q.muddat_kun).filter((x): x is number => x != null);
    return { taklif_id: t.taklif_id, kompaniya: t.kompaniya, holat: t.holat, jami, qqs_foiz: t.qqs_foiz, muddat_kun_max: muddatlar.length ? Math.max(...muddatlar) : null,
      amal_kun: t.amal_kun, kafolat_oy: t.kafolat_oy, yetkazish_narx: t.yetkazish_narx } satisfies TaqqosQator;
  });
  return qatorlar.sort((a, b2) => (a.jami == null ? 1 : b2.jami == null ? -1 : a.jami - b2.jami) || a.taklif_id - b2.taklif_id);
}
