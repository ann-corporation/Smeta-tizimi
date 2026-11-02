/**
 * nakrutka-konstruktor.ts — NAKRUTKA PODVALI KONSTRUKTORI (egasi Q6, 2026-10-01).
 *
 * Hisob mantig'i `lib/hisob-yadro/podval.ts` ga ko'chirildi (YAGONA baholovchi). Bu fayl — eski import yo'llari uchun
 * moslik qatlami: yangi kod to'g'ridan-to'g'ri `lib/hisob-yadro` dan import qilsin.
 */
import {
  podvalBahola, serverMerosKoefQoy,
  type Podval, type PodvalNatija,
} from './hisob-yadro';
import type { KatSummalar } from './hisob-yadro';

export {
  standartPodval, podvalTekshir, podvalKf, podvalBelgilanganSumma, standartmi, yangiKod, hadNomi, serverMerosKoefQoy,
} from './hisob-yadro';
export type { Podval, PodvalQator, PodvalHad, PodvalXato, PodvalNatija } from './hisob-yadro';

/**
 * @deprecated — `serverMerosKoefQoy` (server bilan bir xil rejim: faqat `manba ≠ 'smeta'` foiz qatorlari koeffitsientdan).
 * Avvalgi «hamma foizni ustidan yozish» xatti-harakati olib tashlandi: smeta podvalidan isbotlangan foiz o'zgarmaydi.
 */
export const podvalgaKoefQoy = serverMerosKoefQoy;

/** Podval hisobi (har qadam ROUND 2). */
export function podvalHisobla(p: Podval, s: Partial<KatSummalar>): PodvalNatija {
  return podvalBahola(p, s);
}

/** Belgilangan summalarsiz hisob (ko'p ustunli hujjatning ikkinchi va keyingi pul ustunlari uchun). */
export function podvalHisoblaSummasiz(p: Podval, s: Partial<KatSummalar>): PodvalNatija {
  return podvalBahola(p, s, { summaQosh: false });
}
