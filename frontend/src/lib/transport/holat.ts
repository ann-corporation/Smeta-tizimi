import { yaxlit2 } from '../hisob-yadro';

/** Reys holat mashinasi, hujjat muddati signali, obyektlarga ulush (SQL `t2_tr_reys_yop_v1` bilan bir xil qoida). */
export type ReysHolat = 'reja' | 'yolda' | 'yetkazildi' | 'yopildi' | 'bekor';
export const REYS_HOLATLARI: ReadonlyArray<ReysHolat> = ['reja', 'yolda', 'yetkazildi', 'yopildi', 'bekor'];
export type Harakat = 'boshla' | 'bekat' | 'yetkaz' | 'yop' | 'bekor' | 'tahrir';

const OTISH: Record<Harakat, ReadonlyArray<ReysHolat>> = {
  tahrir: ['reja'], boshla: ['reja'], bekat: ['yolda'], yetkaz: ['yolda'], yop: ['yetkazildi'], bekor: ['reja', 'yolda', 'yetkazildi'],
};
export const harakatMumkinmi = (h: ReysHolat, a: Harakat) => OTISH[a].includes(h);
export const keyingiHolat = (a: Harakat): ReysHolat | null => ({ boshla: 'yolda', yetkaz: 'yetkazildi', yop: 'yopildi', bekor: 'bekor' } as Partial<Record<Harakat, ReysHolat>>)[a] ?? null;

export type HujjatSignal = 'otgan' | 'yaqin' | 'ok';
/** Muddatgacha kun (bugun = 0) va signal: o'tgan (<0), yaqin (≤ ogohKun), ok. */
export function hujjatSignal(muddat: string, bugun: string, ogohKun = 30): { qolganKun: number; signal: HujjatSignal } {
  const k = (s: string) => Math.floor(Date.parse(s.slice(0, 10) + 'T00:00:00Z') / 86_400_000);
  const q = k(muddat) - k(bugun);
  return { qolganKun: q, signal: q < 0 ? 'otgan' : q <= ogohKun ? 'yaqin' : 'ok' };
}

export type YukUlush = { obyektId: number | null; ogirlikT: number | null };
export type Ulush = { obyektId: number; ulush: number; summa: number; asos: 'ogirlik' | 'teng' };

/**
 * Reys tannarxini obyektlarga taqsimlash: barcha obyektli yuk og'irligi ma'lum bo'lsa — og'irlikka mutanosib, aks holda teng.
 * Obyekt yo'q → bo'sh (taqsimlanmagan). Oxirgi obyekt qoldiqni oladi: yig'indi aynan tannarxga teng.
 */
export function obyektgaTaqsimla(jami: number, yuklar: YukUlush[], tushirishObyektlari: number[] = []): Ulush[] {
  const ob = yuklar.filter((y) => y.obyektId != null);
  const ogirlikBilan = ob.length > 0 && ob.every((y) => (y.ogirlikT ?? 0) > 0);
  const guruh = new Map<number, number>();
  if (ogirlikBilan) for (const y of ob) guruh.set(y.obyektId as number, (guruh.get(y.obyektId as number) ?? 0) + (y.ogirlikT as number));
  else {
    for (const y of ob) guruh.set(y.obyektId as number, 1);
    for (const o of tushirishObyektlari) if (!guruh.has(o)) guruh.set(o, 1);
  }
  const idlar = [...guruh.keys()].sort((a, b) => a - b);
  if (!idlar.length) return [];
  const tot = [...guruh.values()].reduce((a, b) => a + b, 0);
  let kum = 0; let sum = 0;
  return idlar.map((id, i) => {
    const oxirgi = i === idlar.length - 1;
    const ush = oxirgi ? 1 - kum : (guruh.get(id) as number) / tot;
    kum += Math.round(ush * 1e6) / 1e6;
    const summa = oxirgi ? yaxlit2(jami - sum) : yaxlit2(jami * ush);
    sum += summa;
    return { obyektId: id, ulush: Math.round(ush * 1e6) / 1e6, summa, asos: ogirlikBilan ? 'ogirlik' : 'teng' };
  });
}
