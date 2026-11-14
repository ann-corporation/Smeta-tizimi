/**
 * hujjat-dvigatel/hayot.ts — hujjat hayot sikli (toza funksiyalar).
 *   qoralama → tekshiruv → yuborildi (t2_tomon_taqdim, R2 snapshot + sha256) → qaror (qabul / tuzatish / rad) → arxiv.
 * Qoida (V3): «tasdiqlangan» FAQAT qarshi tomon qarori bilan; o'z tomoning uni qo'lda belgilay olmaydi.
 * Yangi jadval yo'q: bosqich mavjud t2_tomon_taqdim.holat dan hosil qilinadi (`taqdimHolatidanBosqich`).
 */
import type { TaqdimHolat } from '../../api/t2-tomon';
import type { HujjatBosqich, HujjatKalit, QarorNatija, TomonRol } from './turlar';
import { HUJJAT_TURLARI } from './reestr';
import type { HujjatTuri } from './turlar';

export const BOSQICH_TARTIBI: readonly HujjatBosqich[] = ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'];

/** t2_tomon_taqdim.holat → hayot sikli bosqichi. «qaytarilgan» — yuboruvchi o'zi qaytarib oldi (qoralamaga). */
export function taqdimHolatidanBosqich(h: TaqdimHolat): HujjatBosqich {
  switch (h) {
    case 'yuborilgan': case 'ko_rilmoqda': return 'yuborildi';
    case 'qabul': case 'rad': case 'tuzatish': return 'qaror';
    case 'qaytarilgan': return 'qoralama';
  }
}

/** Qaror natijasi taqdim holatidan (qaror bosqichida bo'lmasa null). */
export function taqdimQarori(h: TaqdimHolat): QarorNatija | null {
  return h === 'qabul' || h === 'rad' || h === 'tuzatish' ? h : null;
}

/** Tur uchun bosqichdan keyingi bosqich (turning o'z bosqichlari bo'yicha); oxirgisida null. */
export function keyingiBosqich(kalit: HujjatKalit, hozir: HujjatBosqich): HujjatBosqich | null {
  const b = (HUJJAT_TURLARI[kalit] as HujjatTuri).bosqichlar;
  const i = b.indexOf(hozir);
  return i >= 0 && i < b.length - 1 ? b[i + 1] : null;
}

/** Ruxsat etilgan o'tish: oldinga bir bosqich; tuzatish/rad dan qoralamaga qaytish (qayta yuborish). */
export function otishMumkinmi(kalit: HujjatKalit, hozir: HujjatBosqich, keyin: HujjatBosqich, qaror?: QarorNatija | null): boolean {
  if (keyin === keyingiBosqich(kalit, hozir)) return true;
  return hozir === 'qaror' && keyin === 'qoralama' && (qaror === 'tuzatish' || qaror === 'rad');
}

/** Qaror chiqarishi mumkin bo'lgan tomonlar (hujjat egasi emas). */
export function qarorChiqaruvchilar(kalit: HujjatKalit): readonly TomonRol[] {
  return (HUJJAT_TURLARI[kalit] as HujjatTuri).imzo.tasdiqlaydi;
}

export function menQarorChiqaramanmi(kalit: HujjatKalit, menRol: TomonRol): boolean {
  return qarorChiqaruvchilar(kalit).includes(menRol);
}
