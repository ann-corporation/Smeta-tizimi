/**
 * Svod yaxlit bo'limlari (egasi 2026-10-27, migratsiya 20261113500000_t2_svod_yaxlit_v1): svoddagi «письмо
 * заказчика» / ekspertiza yaxlit summalariga ustama HISOBLANMAYDI. Server (`t2_obyekt_nakrutka_v1`) belgili bo'lim
 * avlodlarini kategoriyalardan chiqaradi va bo'lim summasini (QQS siz) ИТОГО-4 ga ustamasiz qo'shadi; QQS bir marta.
 *
 * Bu fayl — o'sha qadamning JS oynasi (SQL `t2_nakrutka_yaxlit_qosh_v1` bilan tiyingacha bir xil), yangi formula emas.
 * Ekran/eksportlar shu yerdagi yordamchilardan foydalanadi:
 *  - `yaxlitQatorIdlari` — belgili bo'lim va uning barcha avlodlari (qator darajasida ustama qo'llanmaydi);
 *  - `kaskadgaYaxlit` — kaskad natijasiga yaxlit qatorini qo'shish (ИТОГО-4 → НДС → ВСЕГО).
 * Hisob qadami yadroda (`lib/hisob-yadro/yaxlit-svod.ts`).
 */
import { yaxlit2 as r2, yaxlitBilanYakun as yadroYakun } from './hisob-yadro';

export type SvodYaxlitBolim = {
  id: number; qator_id: number; nom: string | null;
  svod_summa: number | null; qqs_stavka: number | null;
  /** Ustamaga kirmaydigan summa, QQS siz. */
  qqssiz: number;
  /** Bo'lim barglarining smetadagi to'g'ri xarajati (ustamasiz). */
  barglar: number;
  asos: 'svod' | 'barglar';
  dalil: Record<string, unknown>;
};
export type SvodYaxlit = { qqssiz: number; barglar: number; summasiz: number; bolimlar: SvodYaxlitBolim[] };

/** Eksport hujjatlaridagi yashirin kategoriya ustuniga yaxlit qatorlar uchun yoziladigan belgi — SUMIF ga kirmaydi. */
export const YAXLIT_KAT = 'СВОД';
/** Eksport podvalidagi alohida qator nomi. */
export const YAXLIT_PODVAL_NOM = 'Разделы по своду целой суммой (без накладных расходов, без НДС)';
/** Eksport izohi (qator darajasi). */
export const YAXLIT_IZOH = 'Разделы, принятые по своду (письмо заказчика / экспертиза) целой суммой: накладные и прочие расходы на их строки НЕ начисляются — «к оплате» по ним равно прямым затратам; в расчете стоимости к оплате они учтены одной строкой «Разделы по своду целой суммой» (сумма свода без НДС), НДС — один раз в конце.';

/** Kaskad ИТОГО-4 (yaxlit bo'limlarsiz) + yaxlit (QQS siz) → ИТОГО-4, QQS, ВСЕГО. yaxlit yo'q — o'zgarishsiz. */
export function yaxlitBilanYakun(itogo4: number, yaxlitQqssiz: number | null | undefined, ndsFoiz: number): { itogo4: number; nds: number; vsego: number } | null {
  const y = yadroYakun(itogo4, yaxlitQqssiz, ndsFoiz);
  return y && y.nds != null && y.vsego != null ? { itogo4: y.itogo4, nds: y.nds, vsego: y.vsego } : null;
}

/**
 * Kaskad natijasi (`itogo4` bor) + yaxlit → yangi natija (`itogo4/nds/vsego` almashtiriladi, `kaskad_itogo4` va
 * `yaxlit` qo'shiladi). `vsegoKod` — maxsus podvaldagi oxirgi qator kodi (u ham ВСЕГО ga tenglashtiriladi).
 * yaxlit null — natija AYNAN o'zi (invariant).
 */
export function kaskadgaYaxlit<T extends { itogo4: number; nds: number; vsego: number }>(q: T, yaxlitQqssiz: number | null | undefined, ndsFoiz: number, vsegoKod = 'vsego'): T {
  const y = yaxlitBilanYakun(q.itogo4, yaxlitQqssiz, ndsFoiz);
  if (!y) return q;
  return { ...q, kaskad_itogo4: q.itogo4, yaxlit: r2(yaxlitQqssiz!), itogo4: y.itogo4, nds: y.nds, vsego: y.vsego, [vsegoKod]: y.vsego } as T;
}

/** Server javobidan ustama kaskadi uchun kategoriya summalari: belgi bo'lsa `cats_kaskad`, aks holda `cats`. */
export function kaskadCats<C>(r: { cats?: C; cats_kaskad?: C; svod_yaxlit?: SvodYaxlit | null }): C | undefined {
  return r.svod_yaxlit && r.cats_kaskad ? r.cats_kaskad : r.cats;
}

/**
 * Belgili bo'limlar (svod_yaxlit.bolimlar[].qator_id) va ularning BARCHA avlodlari (ota_id bo'yicha) — server
 * `t2_svod_yaxlit_obyekt_v1` dagi rekursiya bilan bir xil to'plam. Belgi yo'q — bo'sh to'plam.
 */
export function yaxlitQatorIdlari(qatorlar: Iterable<{ id: number; ota_id?: number | null }>, svod: SvodYaxlit | null | undefined): Set<number> {
  const out = new Set<number>();
  if (!svod?.bolimlar?.length) return out;
  const bolalar = new Map<number, number[]>();
  for (const q of qatorlar) {
    if (q.ota_id == null) continue;
    const b = bolalar.get(q.ota_id);
    if (b) b.push(q.id); else bolalar.set(q.ota_id, [q.id]);
  }
  const navbat = svod.bolimlar.map((b) => b.qator_id);
  while (navbat.length) {
    const id = navbat.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of bolalar.get(id) ?? []) navbat.push(c);
  }
  return out;
}
