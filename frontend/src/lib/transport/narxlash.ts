import { yaxlit2 } from '../hisob-yadro';

/**
 * Tashqi mijozga narxlash (tarif). Asosiy ko'rsatkich — QQS BILAN (egasi qoidasi); QQS siz alohida. Tarif narxlari QQS bilan kiritilgan bo'lsa
 * (`qqsKiritilgan`) avval QQS siz holatga keltiriladi. Foyda/marja — QQS siz tannarxga nisbatan.
 *  tarif summasi = km_narx×km + tonna_km_narx×tonna×km + soat_narx×soat + reys_narx;  minimal_summa dan past bo'lmaydi.
 *  marja uchun minimal narx = tannarx / (1 − marja%).  tavsiya = max(tarif, marja uchun minimal).
 * Tarifda narx bor, lekin miqdor noma'lum (masalan tonna) → o'sha modda hisoblanmaydi va `yetishmaydi` da (jim 0 emas).
 */
export type Tarif = {
  kmNarx: number | null; tonnaKmNarx: number | null; soatNarx: number | null; reysNarx: number | null;
  minimalSumma: number | null; marjaFoiz: number | null; qqsFoiz: number; qqsKiritilgan: boolean;
};
export type NarxKirish = { km: number | null; tonna: number | null; soat: number | null; reys?: number };
export type NarxNatija = {
  tarifQqsSiz: number | null; minimalQqsSiz: number | null; marjaUchunMin: number | null; tavsiyaQqsSiz: number | null;
  qqs: number | null; qqsBilan: number | null; tannarx: number | null; tannarxToliq: boolean;
  foyda: number | null; marjaFoiz: number | null; yetishmaydi: Array<'km' | 'tonna' | 'soat'>; minimalQoplandi: boolean;
};

const bor = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

export const qqsBilanOl = (qqsSiz: number, foiz: number) => yaxlit2(qqsSiz * (1 + foiz / 100));
export const qqsSizOl = (qqsBilan: number, foiz: number) => yaxlit2(qqsBilan / (1 + foiz / 100));

export function narxHisobla(t: Tarif, k: NarxKirish, tannarx: { jami: number | null; toliq: boolean } | null): NarxNatija {
  const bol = t.qqsKiritilgan ? 1 + t.qqsFoiz / 100 : 1;
  const n = (v: number | null) => (bor(v) ? v / bol : null);
  const yet: NarxNatija['yetishmaydi'] = [];
  let jami = 0; let bo = false;
  const qosh = (stavka: number | null, qismlar: Array<[number | null, 'km' | 'tonna' | 'soat']>) => {
    if (!bor(stavka)) return;
    const yoq = qismlar.filter(([q]) => q == null);
    if (yoq.length) { for (const [, y] of yoq) if (!yet.includes(y)) yet.push(y); return; }
    jami += stavka * qismlar.reduce((a, [q]) => a * (q as number), 1); bo = true;
  };
  qosh(n(t.kmNarx), [[k.km, 'km']]);
  qosh(n(t.tonnaKmNarx), [[k.tonna, 'tonna'], [k.km, 'km']]);
  qosh(n(t.soatNarx), [[k.soat, 'soat']]);
  if (bor(t.reysNarx)) { jami += (t.reysNarx / bol) * (k.reys ?? 1); bo = true; }
  const min = n(t.minimalSumma);
  let tarif: number | null = bo ? yaxlit2(jami) : null;
  let qoplandi = false;
  if (min != null && tarif != null && tarif < min) { tarif = yaxlit2(min); qoplandi = true; }
  else if (min != null && tarif == null && yet.length === 0) { tarif = yaxlit2(min); qoplandi = true; }

  const tn = tannarx?.jami ?? null;
  const marjaMin = tn != null && bor(t.marjaFoiz) && t.marjaFoiz < 100 ? yaxlit2(tn / (1 - t.marjaFoiz / 100)) : null;
  const tavsiya = tarif != null && marjaMin != null ? Math.max(tarif, marjaMin) : (tarif ?? marjaMin);
  const qqs = tavsiya != null ? yaxlit2(tavsiya * t.qqsFoiz / 100) : null;
  const foyda = tavsiya != null && tn != null ? yaxlit2(tavsiya - tn) : null;
  return {
    tarifQqsSiz: tarif, minimalQqsSiz: min, marjaUchunMin: marjaMin, tavsiyaQqsSiz: tavsiya, qqs, qqsBilan: tavsiya != null && qqs != null ? yaxlit2(tavsiya + qqs) : null,
    tannarx: tn, tannarxToliq: tannarx?.toliq ?? false, foyda, marjaFoiz: foyda != null && tavsiya ? Math.round((foyda / tavsiya) * 1000) / 10 : null,
    yetishmaydi: yet, minimalQoplandi: qoplandi,
  };
}
