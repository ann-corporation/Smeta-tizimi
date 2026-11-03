import type { BirlikOgoh } from '../../lib/fakt-birlik-ogoh';
import { t } from '../../i18n/til';

export const ogohSon = (v: number, min = 0) => v.toLocaleString('ru-RU', { minimumFractionDigits: min, maximumFractionDigits: 3 });

/** Ogohlantirish matni: birlik ko'paytmasi bor va gumon bo'lsa — aniq taklif bilan; aks holda umumiy «necha marta ko'p». */
export function birlikOgohMatn(o: BirlikOgoh, tur: 'kiritish' | 'fakt' = 'kiritish'): string {
  if (o.taklif != null && o.birlikMatn) {
    return tur === 'fakt'
      ? t('Birlik: {birlik} — fakt {n} (smeta {smeta}). {taklif} bo‘lishi kerak emasmi?', { birlik: o.birlikMatn, n: ogohSon(o.kiritilgan), smeta: ogohSon(o.smeta), taklif: ogohSon(o.taklif, 2) })
      : t('Birlik: {birlik} — siz {n} kiritdingiz (smeta {smeta}). {taklif} nazarda tutilmaganmi?', { birlik: o.birlikMatn, n: ogohSon(o.kiritilgan), smeta: ogohSon(o.smeta), taklif: ogohSon(o.taklif, 2) });
  }
  return tur === 'fakt'
    ? t('Fakt {n} — smetadan {k} marta ko‘p (smeta {smeta}). Birlik yoki o‘nli vergulni tekshiring.', { n: ogohSon(o.kiritilgan), k: ogohSon(Math.abs(o.nisbat)), smeta: ogohSon(o.smeta) })
    : t('Siz {n} kiritdingiz — jami smetadan {k} marta ko‘p (smeta {smeta}). Birlik yoki o‘nli vergulni tekshiring.', { n: ogohSon(o.kiritilgan), k: ogohSon(Math.abs(o.nisbat)), smeta: ogohSon(o.smeta) });
}
