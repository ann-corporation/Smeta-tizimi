/**
 * Slichitelniy SIKLI (egasi 2026-11-14): hujjatdan keyingi qadam — «к доплате» (fakt > ilgari Ф-2 da predyavlen) qatorlaridan
 * Ф-2 QORALAMA va «к снятию» (Ф-2 > fakt) qatorlaridan tuzatish (minus) Ф-2 QORALAMA. Yangi hisob yo'q: mavjud fakt pereraschet
 * (`faktPereraschetHisobla` → `farqYuk`, server `t2_akt_yarat_v2`) ning ± qatorlari ishora bo'yicha ikkiga bo'linadi.
 * Qoralama yaratiladi, TASDIQLANMAYDI (tasdiqlash — F2 tarixida, egasi tomonidan). NULL ≠ 0: narxsiz/summasi noma'lum qator yukka kirmaydi.
 */
import { farqYuk, type FNatija, type FaktYuk, type FaktYukQator } from './pereraschet-fakt';
import { yaxlit2 } from './hisob-yadro';

export type TsiklYuk = {
  /** Fakt > Ф-2: musbat summali qatorlar (yangi Ф-2 qoralamasi). */
  doplata: FaktYukQator[];
  /** Ф-2 > fakt: manfiy summali qatorlar (tuzatuvchi minus Ф-2 qoralamasi). */
  snyatie: FaktYukQator[];
  doplataJami: number;
  /** Manfiy (ishorali). */
  snyatieJami: number;
  /** Qoralamaga sig'magan pozitsiyalar (hajm farqi 0, faqat narx farqi) — server hajm ≠ 0 talab qiladi. */
  sigmadi: FaktYuk['sigmadi'];
};

export function slichitelniyTsiklYuki(n: FNatija): TsiklYuk {
  const y = farqYuk(n);
  const doplata = y.qatorlar.filter((q) => q.certifiedAmount > 0);
  const snyatie = y.qatorlar.filter((q) => q.certifiedAmount < 0);
  return {
    doplata, snyatie,
    doplataJami: yaxlit2(doplata.reduce((s, q) => s + q.certifiedAmount, 0)),
    snyatieJami: yaxlit2(snyatie.reduce((s, q) => s + q.certifiedAmount, 0)),
    sigmadi: y.sigmadi,
  };
}
