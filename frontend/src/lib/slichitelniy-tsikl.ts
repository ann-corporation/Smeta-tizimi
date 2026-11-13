/**
 * Slichitelniy SIKLI: hujjatdan keyingi qadam — «к доплате» qatorlaridan Ф-2 QORALAMA, «к снятию» qatorlaridan tuzatuvchi (minus)
 * Ф-2 QORALAMA. Hisob HUJJAT BILAN BIR XIL: `slichitelniyModeli` barglarining `doplataHajm/doplataSumma`
 * (= fakt (Ф-2 narxida) − tasdiqlangan Ф-2; smeta bilan CHEKLANMAYDI — fakt smetadan oshishi mumkin, faqat ogohlantirish).
 * к доплате = max(fakt − Ф-2, 0), к снятию = min(fakt − Ф-2, 0), svod/yaxlit bo'limlar ham hujjatdagi taqsim bilan.
 * NULL ≠ 0: fakt/narx/Ф-2 summasi noma'lum qator yukka kirmaydi. Qoralama yaratiladi, TASDIQLANMAYDI.
 */
import type { SlichitelniyModel } from './slichitelniy-vedomost';
import { yaxlit2 } from './hisob-yadro';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';

export type TsiklQator = {
  qatorId: number; certifiedQuantity: number; certifiedUnitPrice: number; certifiedAmount: number;
  rawSnapshot: Record<string, unknown>; izoh: string;
};

export type TsiklYuk = {
  doplata: TsiklQator[];
  snyatie: TsiklQator[];
  doplataJami: number;
  /** Manfiy (ishorali). */
  snyatieJami: number;
  /** Kategoriya kesimlari (MUTLAQ qiymatda) — ustamali / QQS bilan ko'rsatish uchun. */
  plusKesim: KatKesim; minusKesim: KatKesim;
  /** Qoralamaga sig'magan (hajm farqi 0, summa farqi bor) — server hajm ≠ 0 talab qiladi. */
  sigmadi: { soni: number; summa: number };
  /** Noma'lum (fakt, narx yoki Ф-2 summasi NULL) pozitsiyalar soni. */
  nomalum: number;
};

const MANBA = { source: 'slichitelniy_tsikl', sourceReference: 'Перерасчёт (сличительная ведомость)' };

export function slichitelniyTsiklYuki(model: SlichitelniyModel, yaxlitIdlar?: ReadonlySet<number> | null): TsiklYuk {
  const doplata: TsiklQator[] = []; const snyatie: TsiklQator[] = [];
  const plusKesim = bosKatKesim(); const minusKesim = bosKatKesim();
  const sigmadi = { soni: 0, summa: 0 };
  let nomalum = 0;
  for (const q of model.qatorlar) {
    if (q.tur !== 'barg') continue;
    const d = q.doplataSumma;
    if (d == null) { if (q.nomalum) nomalum++; continue; }
    if (Math.abs(d) < 0.005) continue;
    const yx = !!yaxlitIdlar?.has(q.id) || q.yaxlitTaqsim != null;
    if (d > 0) katKesimgaQosh(plusKesim, q.kat ?? null, d, yx); else katKesimgaQosh(minusKesim, q.kat ?? null, -d, yx);
    const dh = q.doplataHajm;
    if (dh == null || Math.abs(dh) < 1e-9) { sigmadi.soni++; sigmadi.summa += d; continue; }
    const qator: TsiklQator = {
      qatorId: q.id, certifiedQuantity: dh, certifiedUnitPrice: d / dh, certifiedAmount: d,
      rawSnapshot: { ...MANBA, bolim: d > 0 ? 'doplata' : 'snyatie', faktHajm: q.faktHajm, f2Hajm: q.f2Hajm, enteredQuantity: dh, enteredAmount: d },
      izoh: d > 0 ? 'Перерасчёт: к доплате (факт больше ранее предъявленного по Ф-2)' : 'Перерасчёт: к снятию (предъявлено по Ф-2 больше факта)',
    };
    (d > 0 ? doplata : snyatie).push(qator);
  }
  sigmadi.summa = yaxlit2(sigmadi.summa);
  return {
    doplata, snyatie, plusKesim, minusKesim, sigmadi, nomalum,
    doplataJami: yaxlit2(doplata.reduce((s, x) => s + x.certifiedAmount, 0)),
    snyatieJami: yaxlit2(snyatie.reduce((s, x) => s + x.certifiedAmount, 0)),
  };
}
