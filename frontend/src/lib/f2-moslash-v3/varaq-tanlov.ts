/**
 * F2 import — HAR VARAQ = ALOHIDA F2 (egasi 2026-10-23). Bitta faylda o'nlab F2 varag'i bo'lishi mumkin (obyekt boshida
 * hammasi bitta faylda; ba'zi varaqlar ichki/oraliq — masalan «ost», manfiy «Лист2 (2)»). Reestrda esa faqat bittasi.
 * Bu modul faqat solishtiradi: reestr summasi (QQSsiz yoki QQS bilan) qaysi varaqning hujjat jamiga to'g'ri keladi.
 * Hech narsa taxmin qilinmaydi — faqat hujjatning o'z ВСЕГО / ИТОГО ПРЯМЫЕ / «ранее» qiymatlari bilan, ±1 so'm.
 */
import type { F2Akt } from '../smeta-anatomiya/f2';

export type VaraqMoslik = 'vsego' | 'vsego_qqssiz' | 'pryamye' | 'kumulyativ' | 'kumulyativ_qqssiz';

export const VARAQ_MOSLIK_NOMI: Record<VaraqMoslik, string> = {
  vsego: 'ВСЕГО (QQS bilan)',
  vsego_qqssiz: 'ВСЕГО ÷ 1,12 (QQSsiz)',
  pryamye: 'ИТОГО ПРЯМЫЕ',
  kumulyativ: 'ВСЕГО − ранее (QQS bilan)',
  kumulyativ_qqssiz: '(ВСЕГО − ранее) ÷ 1,12',
};

const yaqin = (a: number | null | undefined, b: number, tol = 1) => a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;

/** Reestr summasi shu varaqqa mosmi — qaysi qiymat bo'yicha. Mos emas — null. */
export function varaqReestrMos(akt: Pick<F2Akt, 'jami'>, summa: number, ndsFoiz = 12): VaraqMoslik | null {
  if (!Number.isFinite(summa) || summa === 0) return null;
  const { vsego, pryamye, ranee } = akt.jami;
  const k = 1 + ndsFoiz / 100;
  if (yaqin(vsego, summa)) return 'vsego';
  if (vsego != null && yaqin(vsego / k, summa)) return 'vsego_qqssiz';
  if (yaqin(pryamye, summa)) return 'pryamye';
  if (vsego != null && ranee != null && ranee !== 0) {
    const d = vsego - ranee;
    if (yaqin(d, summa)) return 'kumulyativ';
    if (yaqin(d / k, summa)) return 'kumulyativ_qqssiz';
  }
  return null;
}

/** Manfiy (storno/qaytarish) varag'i — hujjat jami manfiy. */
export const manfiyVaraqmi = (akt: Pick<F2Akt, 'jami' | 'qatorlarJami'>): boolean =>
  (akt.jami.vsego ?? akt.jami.pryamye ?? akt.qatorlarJami) < 0;

/** Matndagi summani o'qish: «24 143 466 271», «24143466271,00», «1 470 198 639.5». */
export function summaniOqi(matn: string): number | null {
  const t = matn.replace(/[\s ]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Navbatdagi import qilinmagan varaq (joriydan keyingi, aylana bo'ylab). Hammasi kiritilgan — null. */
export function keyingiVaraq(soni: number, joriy: number, kiritilgan: ReadonlySet<number>): number | null {
  for (let i = 1; i < soni; i++) {
    const j = (joriy + i) % soni;
    if (!kiritilgan.has(j)) return j;
  }
  return null;
}
