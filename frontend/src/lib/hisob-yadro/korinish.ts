/**
 * KO'RINISHLAR (Construct uslubi): smeta / fakt / F2 / F2 qoralama / qoldiq / oy / jamlanma — bitta yadro, faqat
 * HAJM ko'rinishi boshqa. Oylik pul = o'sha kaskad, masshtablangan hajm ko'rinishida.
 *  - F2 summalari tasdiqlangan import qatorlaridan AYNAN olinadi (ishorali, minus ruxsat), hech qachon masshtablanmaydi.
 *  - Qoldiq = smeta − F2 − almashtirilgan; smeta summasi noma'lum — qoldiq ham noma'lum (0 emas).
 *  - Fakt hajmi yozilganidek (F2 dan chiqarilmaydi); tasdiqlangan F2 bor qatorda fakt summasi F2 narxida: `faktSummaF2Narxda`.
 */
import { bosKesim, f2YaxlitdanChiqadi, kesimgaQosh, type Kesim } from './kategoriya';
import { qatorSumma, yaxlit2 } from './yaxlit';

export type Korinish = 'smeta' | 'fakt' | 'f2' | 'f2_qoralama' | 'qoldiq' | 'oy' | 'jamlanma';

export type KorinishQator = {
  id: number;
  kat: string | null | undefined;
  narx: number | null | undefined;
  smetaHajm: number | null | undefined;
  faktHajm?: number | null;
  /** Tasdiqlangan F2 summasi (ishorali, aynan). */
  f2Summa?: number | null;
  /** Tasdiqlangan F2 hajmi (fakt qoidasi hajm darajasida). */
  f2Hajm?: number | null;
  /** Qoralama F2 summasi (aynan). */
  f2QoralamaSumma?: number | null;
  /** Almashtirilgan (replaced) summa — qoldiqdan ayriladi. */
  almashtirilganSumma?: number | null;
  /** Oy / jamlanma uchun hajm (masshtablangan ko'rinish). */
  davrHajm?: number | null;
};

/** Fakt summasi natijasi: `manba` — 'f2' (tasdiqlangan F2 narxida) yoki 'fakt' (odatdagi fakt summasi). */
export type FaktSummaNatija = { summa: number | null; manba: 'f2' | 'fakt'; narx: number | null };

const son = (x: number | null | undefined): number | null => (x == null || !Number.isFinite(x) ? null : x);

/**
 * NARX QOIDASI (egasi, YAGONA): fakt HAJMI qanday yozilgan bo'lsa shunday (F2 dan hech narsa chiqarilmaydi; fakt < F2 —
 * normal, F2 oldindan olinadi). Qatorda tasdiqlangan F2 bo'lsa — fakt SUMMASI F2 birlik narxida:
 * F2 narx = Σ F2 summa / Σ F2 hajm (qator bo'yicha, `f2NarxYigish` ma'nosi); summa = ROUND(fakt × F2 summa / F2 hajm, 2).
 * F2 summasi noma'lum — narx to'qilmaydi: f2Summa null — null; `f2SummaYoq` > 0 (F2 hajmi bor-u summa yozilmagan, f2Summa 0 ko'rinsa
 * ham) — fakt summasi avvalgidek (0 ga tushmaydi). F2 yo'q (hajm 0/null) — odatdagi fakt summasi (`faktSummaAsl`).
 * Fakt noma'lum — null (NULL ≠ 0); 0 — 0.
 */
export function faktSummaF2Narxda(faktHajm: number | null | undefined, f2Hajm: number | null | undefined, f2Summa: number | null | undefined, faktSummaAsl: number | null | undefined, f2SummaYoq?: number | string | boolean | null): FaktSummaNatija {
  const fk = son(faktHajm), f2h = son(f2Hajm), f2s = son(f2Summa);
  if (f2h == null || f2h === 0) return { summa: son(faktSummaAsl), manba: 'fakt', narx: null };
  // F2 qatorlarida hajm bor-u summa yozilmagan (`f2SummaYoq` > 0 — server `t2_qator_holat.f2_summa_yoq`; bl/rz ham: pul bolalarda, svod
  // bo'limlarda) — `f2_summa` 0 ko'rinsa ham u NOMA'LUM, 0 emas: narx to'qilmaydi, fakt summasi avvalgidek (SQL bilan bir xil).
  if (f2SummaYoq != null && Number(f2SummaYoq) > 0) return { summa: son(faktSummaAsl), manba: 'fakt', narx: null };
  if (f2s == null) return { summa: null, manba: 'f2', narx: null };
  // Excel bilan bir xil tartib: (H × K) / J, so'ng ROUND 2.
  return { summa: fk == null ? null : yaxlit2((fk * f2s) / f2h), manba: 'f2', narx: f2s / f2h };
}

/**
 * Excel formulasi (kesh = `faktSummaF2Narxda`): F2 hajmi (J) 0 dan farqli — F2 summasi (K) son bo'lsa
 * ROUND(fakt × K / J, 2), aks holda ""; F2 yo'q — odatdagi `asl` ifoda (masalan ROUND(H × F, 2)).
 */
export function faktSummaF2NarxFormula(fakt: string, f2Hajm: string, f2Summa: string, asl: string): string {
  return `IF(AND(ISNUMBER(${f2Hajm}),${f2Hajm}<>0),IF(AND(ISNUMBER(${f2Summa}),${fakt}<>""),ROUND(${fakt}*${f2Summa}/${f2Hajm},2),""),${asl})`;
}

/**
 * «F2 ga olish mumkin» = fakt − F2, ISHORAGA qarab (manfiy qatorlar nolga tushirilmaydi): musbat qatorda MAX(0, fakt − F2),
 * manfiy qatorda (smeta < 0; smeta noma'lum/0 bo'lsa fakt yoki F2 manfiy) MIN(0, fakt − F2). Fakt noma'lum — null.
 */
export function f2MumkinIshorali(fakt: number | null | undefined, f2: number | null | undefined, smeta?: number | null): number | null {
  const fk = son(fakt);
  if (fk == null) return null;
  const f = son(f2) ?? 0;
  const sm = son(smeta);
  const manfiy = sm != null && sm !== 0 ? sm < 0 : fk < 0 || f < 0;
  const d = yaxlit2(fk - f);
  return manfiy ? Math.min(0, d) : Math.max(0, d);
}

/** Svod (yaxlit) bo'limi F2 qoldig'i = yaxlit − F2 AYNAN (F2 masshtablanmaydi). Yaxlit noma'lum — null. */
export function yaxlitQoldiqF2(yaxlit: number | null | undefined, f2Jami: number | null | undefined): number | null {
  return yaxlit == null || !Number.isFinite(yaxlit) ? null : yaxlit2(yaxlit - (son(f2Jami) ?? 0));
}
/** Qoldiq = smeta − F2 − almashtirilgan (ROUND 2). Smeta noma'lum — null. F2/almashtirilgan yo'q — 0. */
export function qoldiq(smeta: number | null | undefined, f2: number | null | undefined, almashtirilgan?: number | null): number | null {
  if (smeta == null || !Number.isFinite(smeta)) return null;
  return yaxlit2(smeta - (f2 ?? 0) - (almashtirilgan ?? 0));
}

/** Hajmni masshtablash (oylik ko'rinish: hajm × ulush), 6 xonagacha. Noma'lum — null. */
export function hajmMasshtab(hajm: number | null | undefined, ulush: number | null | undefined): number | null {
  if (hajm == null || ulush == null || !Number.isFinite(hajm) || !Number.isFinite(ulush)) return null;
  return Math.round(hajm * ulush * 1e6) / 1e6;
}

export type KorinishOpsiya = {
  /** Fakt ko'rinishida narx qoidasi: tasdiqlangan F2 bor qatorda fakt summasi F2 narxida (`faktSummaF2Narxda`). */
  f2Narx?: boolean;
};

/** Qatorning ko'rinishdagi to'g'ri xarajat summasi (QQS siz, ustamasiz). null — noma'lum. */
export function korinishSummasi(q: KorinishQator, k: Korinish, o: KorinishOpsiya = {}): number | null {
  switch (k) {
    case 'smeta': return qatorSumma(q.smetaHajm, q.narx);
    case 'fakt': return o.f2Narx ? faktSummaF2Narxda(q.faktHajm, q.f2Hajm, q.f2Summa, qatorSumma(q.faktHajm, q.narx)).summa : qatorSumma(q.faktHajm, q.narx);
    case 'f2': return q.f2Summa == null ? null : q.f2Summa;
    case 'f2_qoralama': return q.f2QoralamaSumma == null ? null : q.f2QoralamaSumma;
    case 'qoldiq': return qoldiq(qatorSumma(q.smetaHajm, q.narx), q.f2Summa, q.almashtirilganSumma);
    case 'oy':
    case 'jamlanma': return qatorSumma(q.davrHajm, q.narx);
  }
}

/** Ko'rinish kesimi: har qator summasi `korinishSummasi` dan; `yaxlitIdlar` — svod yaxlit avlodlari (ustamasiz). */
export function korinishKesim(qatorlar: Iterable<KorinishQator>, k: Korinish, o: KorinishOpsiya & { yaxlitIdlar?: ReadonlySet<number> | null } = {}): Kesim {
  const kes = bosKesim();
  const f2m = k === 'f2' || k === 'f2_qoralama';
  for (const q of qatorlar) kesimgaQosh(kes, q.kat, korinishSummasi(q, k, o), !!o.yaxlitIdlar?.has(q.id) && !(f2m && f2YaxlitdanChiqadi(q.kat)));
  return kes;
}
