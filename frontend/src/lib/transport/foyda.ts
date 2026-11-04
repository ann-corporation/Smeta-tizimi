/**
 * Rentabellik ko'rsatkichlari (server KPI qatoridan). Hammasi QQS siz tannarx va QQS siz daromad asosida; noma'lum — null.
 *  bo'sh yurish %   = bosh_km / km  (faqat bosh_km kiritilgan reyslar bo'yicha)
 *  tonna-km tannarxi = xarajat / (tonna × km)  (faqat yuk og'irligi ma'lum reyslar)
 *  yoqilg'i og'ishi % = (haqiqiy − me'yor) / me'yor  (faqat ikkalasi ma'lum reyslar)
 *  marja %          = foyda / daromad  (faqat daromadli reyslar)
 */
export type KpiManba = {
  km: number | null; km_bosh_bilan: number | null; bosh_km: number | null; xarajat_tonna_km: number | null; tonna_km: number | null;
  fakt_l: number | null; norma_l: number | null; foyda: number | null; daromad_qqs_siz: number | null; xarajat_daromadli: number | null;
};
const yaxlit = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const musbat = (n: number | null) => n != null && n > 0;

export function kpiKorsatkich(q: KpiManba) {
  return {
    boshYurishFoiz: musbat(q.km_bosh_bilan) && q.bosh_km != null ? yaxlit((q.bosh_km / (q.km_bosh_bilan as number)) * 100) : null,
    tonnaKmTannarx: musbat(q.tonna_km) && q.xarajat_tonna_km != null ? yaxlit((q.xarajat_tonna_km / (q.tonna_km as number)), 2) : null,
    yoqilgiOgishFoiz: musbat(q.norma_l) && q.fakt_l != null ? yaxlit(((q.fakt_l - (q.norma_l as number)) / (q.norma_l as number)) * 100) : null,
    margaFoiz: musbat(q.daromad_qqs_siz) && q.foyda != null ? yaxlit((q.foyda / (q.daromad_qqs_siz as number)) * 100) : null,
  };
}

/** Excel eksporti uchun qator (ustun nomlari tashqarida). */
export function bandlikFoiz(bandKun: number, kunlar: number): number | null { return kunlar > 0 ? yaxlit((bandKun / kunlar) * 100) : null; }
