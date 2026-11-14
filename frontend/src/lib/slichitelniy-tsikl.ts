/**
 * Slichitelniy SIKLI: hujjatdan keyingi qadam — «к доплате» qatorlaridan Ф-2 QORALAMA, «к снятию» qatorlaridan tuzatuvchi (minus)
 * Ф-2 QORALAMA. Hisob HUJJAT BILAN BIR XIL: `slichitelniyModeli` barglarining `doplataHajm/doplataSumma`
 * (= fakt (Ф-2 narxida) − tasdiqlangan Ф-2; smeta bilan CHEKLANMAYDI — fakt smetadan oshishi mumkin, faqat ogohlantirish).
 * к доплате = max(fakt − Ф-2, 0), к снятию = min(fakt − Ф-2, 0), svod/yaxlit bo'limlar ham hujjatdagi taqsim bilan.
 * NULL ≠ 0: fakt/narx/Ф-2 summasi noma'lum qator yukka kirmaydi. Qoralama yaratiladi, TASDIQLANMAYDI.
 */
import { svodGuruhlari, type SlichitelniyModel } from './slichitelniy-vedomost';
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
  // Svod (yaxlit) bo'limi — bitta summa: qoralama BO'LIM SOFI bo'yicha (ichki + va − qoplanadi, model.pereraschet bilan bir xil). Bo'lim sofi ishorasidagi
  // qatorlar olinadi, summa va hajmi sof farqqa proporsional keltiriladi (birlik narxi saqlanadi), qarama-qarshi ishorali qatorlar tushmaydi.
  const lump = new Map<number, { sof: number; koef: number }>(); // qator indeksi -> bo'lim sofi va koeffitsient
  const lumpQatorlar = new Map<number, TsiklQator[]>();
  for (const idx of svodGuruhlari(model.qatorlar).values()) {
    const sof = yaxlit2(idx.reduce((s, i) => s + (model.qatorlar[i].doplataSumma ?? 0), 0));
    const bir = idx.reduce((s, i) => { const d = model.qatorlar[i].doplataSumma ?? 0; return Math.sign(d) === Math.sign(sof) ? s + d : s; }, 0);
    for (const i of idx) lump.set(i, { sof, koef: Math.abs(sof) < 0.005 || !bir ? 0 : sof / bir });
  }
  model.qatorlar.forEach((q, i) => {
    if (q.tur !== 'barg') return;
    let d = q.doplataSumma;
    if (d == null) { if (q.nomalum) nomalum++; return; }
    if (Math.abs(d) < 0.005) return;
    const L = lump.get(i);
    let dh = q.doplataHajm;
    if (L) {
      if (!L.koef || Math.sign(d) !== Math.sign(L.sof)) return;
      d = d * L.koef; dh = dh == null ? null : dh * L.koef;
    }
    const yx = !!yaxlitIdlar?.has(q.id) || q.yaxlitTaqsim != null;
    if (d > 0) katKesimgaQosh(plusKesim, q.kat ?? null, d, yx); else katKesimgaQosh(minusKesim, q.kat ?? null, -d, yx);
    if (dh == null || Math.abs(dh) < 1e-9) { sigmadi.soni++; sigmadi.summa += d; return; }
    const qator: TsiklQator = {
      qatorId: q.id, certifiedQuantity: dh, certifiedUnitPrice: d / dh, certifiedAmount: d,
      rawSnapshot: { ...MANBA, bolim: d > 0 ? 'doplata' : 'snyatie', faktHajm: q.faktHajm, f2Hajm: q.f2Hajm, enteredQuantity: dh, enteredAmount: d },
      izoh: d > 0 ? 'Перерасчёт: к доплате (факт больше ранее предъявленного по Ф-2)' : 'Перерасчёт: к снятию (предъявлено по Ф-2 больше факта)',
    };
    (d > 0 ? doplata : snyatie).push(qator);
    if (L) { const a = lumpQatorlar.get(q.yaxlitTaqsim!); if (a) a.push(qator); else lumpQatorlar.set(q.yaxlitTaqsim!, [qator]); }
  });
  // Yaxlitlash: bo'lim qatorlari yig'indisi sof farqqa tiyingacha teng (oxirgi qatorga qoldiq).
  for (const [bid, qs] of lumpQatorlar) {
    const L = [...lump.entries()].find(([i]) => model.qatorlar[i].yaxlitTaqsim === bid)?.[1];
    if (!L || !qs.length) continue;
    for (const x of qs) x.certifiedAmount = yaxlit2(x.certifiedAmount);
    const qoldiq = yaxlit2(L.sof - qs.reduce((s, x) => s + x.certifiedAmount, 0));
    if (qoldiq) { const o = qs[qs.length - 1]; o.certifiedAmount = yaxlit2(o.certifiedAmount + qoldiq); }
  }
  sigmadi.summa = yaxlit2(sigmadi.summa);
  return {
    doplata, snyatie, plusKesim, minusKesim, sigmadi, nomalum,
    doplataJami: yaxlit2(doplata.reduce((s, x) => s + x.certifiedAmount, 0)),
    snyatieJami: yaxlit2(snyatie.reduce((s, x) => s + x.certifiedAmount, 0)),
  };
}