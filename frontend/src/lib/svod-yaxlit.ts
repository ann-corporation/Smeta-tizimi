/**
 * Svod yaxlit bo'limlari (egasi 2026-10-27, migratsiya 20261113500000_t2_svod_yaxlit_v1): svoddagi «письмо
 * заказчика» / ekspertiza yaxlit summalariga ustama HISOBLANMAYDI. Server (`t2_obyekt_nakrutka_v1`) belgili bo'lim
 * avlodlarini kategoriyalardan chiqaradi va bo'lim summasini (QQS siz) ИТОГО-4 ga ustamasiz qo'shadi; QQS bir marta.
 *
 * Bu fayl — o'sha qadamning JS oynasi (SQL `t2_nakrutka_yaxlit_qosh_v1` bilan tiyingacha bir xil), yangi formula emas.
 */
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

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Kaskad ИТОГО-4 (yaxlit bo'limlarsiz) + yaxlit (QQS siz) → ИТОГО-4, QQS, ВСЕГО. yaxlit yo'q — o'zgarishsiz. */
export function yaxlitBilanYakun(itogo4: number, yaxlitQqssiz: number | null | undefined, ndsFoiz: number): { itogo4: number; nds: number; vsego: number } | null {
  if (yaxlitQqssiz == null || !Number.isFinite(yaxlitQqssiz)) return null;
  const i4 = r2(itogo4 + yaxlitQqssiz);
  const nds = r2((i4 * ndsFoiz) / 100);
  return { itogo4: i4, nds, vsego: r2(i4 + nds) };
}

/** Server javobidan ustama kaskadi uchun kategoriya summalari: belgi bo'lsa `cats_kaskad`, aks holda `cats`. */
export function kaskadCats<C>(r: { cats?: C; cats_kaskad?: C; svod_yaxlit?: SvodYaxlit | null }): C | undefined {
  return r.svod_yaxlit && r.cats_kaskad ? r.cats_kaskad : r.cats;
}
