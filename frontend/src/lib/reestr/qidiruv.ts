/**
 * UNIVERSAL QIDIRUV (ekotizim V2, 2-qadam) — sof funksiyalar (React yo'q, testlanadi). Bitta kiritish: sahifa, amal (Amal reestri),
 * obyekt, shartnoma, hujjat. Lotin/kirill farqsiz (qidiruvTayyorla + matnning kirillcha shakli). Sahifa va amal faqat foydalanuvchiga
 * KO'RINADIGAN sahifalar bo'yicha (`bandlar` — sidebar bilan bir manba): ruxsatsiz amal ko'rsatilmaydi.
 */
import { qidiruvTayyorla, lotinKirill } from '../qidiruv-normalizatsiya';
import { SAHIFA_SINONIM } from '../yordamchi/sinonim';
import { AMALLAR, type Amal } from './amal';
import { SAHIFALAR } from './sahifa';
import { ISH_JOYI_META } from './ishJoyi';

export type QidiruvTur = 'sahifa' | 'amal' | 'obyekt' | 'shartnoma' | 'hujjat';
export type QidiruvNatija = { kalit: string; tur: QidiruvTur; nom: string; izoh: string; yol: string };
export type QidiruvBand = { yol: string; nom: string; guruh: string };

/** Matn + uning kirillcha shakli (lotin nom kirill so'rovga ham topilsin). */
export const qidiruvHaystack = (matn: string): string => `${matn} ${lotinKirill(matn)}`;

/** So'rov matnga mosmi (lotin/kirill farqsiz; har so'z shart). */
export function qidiruvMosmi(matn: string, sorov: string): boolean {
  return qidiruvTayyorla(sorov)(qidiruvHaystack(matn));
}

function sahifaMatni(b: QidiruvBand): string {
  const meta = SAHIFALAR.find((s) => s.yol === b.yol);
  const sin = SAHIFA_SINONIM[b.yol];
  return [b.nom, b.guruh, meta?.sinonimlar.join(' '), meta ? ISH_JOYI_META[meta.ishJoyi].nom : '', sin?.uz?.join(' '), sin?.ru.join(' '), sin?.en.join(' ')].filter(Boolean).join(' ');
}

function amalMatni(a: Amal): string {
  return [a.nom, a.sinonimlar?.join(' '), a.kalit].filter(Boolean).join(' ');
}

/** Sahifalar va amallar. Bo'sh so'rov: faqat sahifalar (tartib saqlanadi). Natija tartibi: amallar, keyin sahifalar. */
export function sahifaVaAmalQidir(sorov: string, bandlar: readonly QidiruvBand[], permissions?: readonly string[] | null): QidiruvNatija[] {
  const mos = qidiruvTayyorla(sorov);
  const korinadi = new Set(bandlar.map((b) => b.yol));
  const sahifalar = bandlar.filter((b) => !sorov.trim() || mos(qidiruvHaystack(sahifaMatni(b))))
    .map((b): QidiruvNatija => ({ kalit: `sahifa:${b.yol}`, tur: 'sahifa', nom: b.nom, izoh: b.guruh, yol: b.yol }));
  if (!sorov.trim()) return sahifalar;
  const amallar = AMALLAR.filter((a) => a.yol && korinadi.has(a.yol) && (!permissions || permissions.includes(a.capability) || permissions.includes('control.company.read')) && mos(qidiruvHaystack(amalMatni(a))))
    .map((a): QidiruvNatija => ({ kalit: `amal:${a.kalit}`, tur: 'amal', nom: a.nom ?? a.kalit, izoh: 'Amal', yol: a.yol as string }));
  return [...amallar, ...sahifalar];
}

/** Obyekt/shartnoma/hujjat yozuvlarini nom va raqam bo'yicha filtrlash (so'rov: lotin/kirill farqsiz). */
export function yozuvQidir<T>(yozuvlar: readonly T[], sorov: string, matn: (y: T) => string, chegara: number): T[] {
  if (!sorov.trim()) return [];
  const mos = qidiruvTayyorla(sorov);
  return yozuvlar.filter((y) => mos(qidiruvHaystack(matn(y)))).slice(0, chegara);
}