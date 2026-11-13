/** TOMON PROFILLARI (ekotizim V2 §2/§4): `t2_yonalish` kaliti -> standart ilovalar, bosh ish joyi, kabinet sahifalari. Yozuvlar 13-qadamda. */
import type { IlovaKod } from '../ilova/ilovalar';
import type { IshJoyi } from './ishJoyi';

export type TomonProfil = {
  /** `t2_yonalish` kaliti. */
  yonalish: string;
  defaultIlovalar: readonly IlovaKod[];
  boshIshJoyi: IshJoyi;
  /** Kabinet sahifalari (Sahifa.kalit). */
  kabinetSahifalar: readonly string[];
};

export const TOMON_PROFILLARI: readonly TomonProfil[] = [
  /* Subpudratchi: bosh sahifa - «Subpudratchi: bugun»; ishlar bosh pudratchi tenantidan t2_tomon_aloqa + grant orqali ko'rinadi (nusxa emas). */
  { yonalish: 'subpudratchi', defaultIlovalar: ['hujjat'], boshIshJoyi: 'tomonlar', kabinetSahifalar: ['subpudratchi'] },
];

/**
 * ROL PROFILI: «Bugun» bosh sahifasidagi 4–6 katta tugma (Sahifa.kalit). Rol = kompaniyadagi effektiv rol (t2_azolik.rol).
 * Tugma foydalanuvchiga ruxsat bo'lmasa ko'rsatilmaydi (navFiltr bilan bir xil filtr). Rol yo'q bo'lsa — `UMUMIY_PROFIL`.
 * Yangi rol/tomon turi = shu yerga bitta yozuv.
 */
export type RolProfil = { rol: string; tugmalar: readonly string[] };

export const UMUMIY_PROFIL: readonly string[] = ['ish-joylarim', 'obyektlar', 'documents', 'topshiriqlar', 'akkaunt', 'sozlamalar'];

export const ROL_PROFILLARI: readonly RolProfil[] = [
  { rol: 'pto', tugmalar: ['obyektlar', 'f2-tayyorlash', 'fakt', 'smeta-narxlash', 'nakopitelniy', 'holat'] },
  { rol: 'bugalter', tugmalar: ['obyektlar', 'moliya', 'shartnoma-liniya', 'nakopitelniy', 'f2-tarix', 'documents'] },
  { rol: 'prorab', tugmalar: ['fakt', 'obyektlar', 'm29', 'holat', 'aosr', 'zayavka'] },
  { rol: 'boss', tugmalar: ['dashboard', 'moliya', 'holat', 'f2-reestr', 'qarzdorlik', 'kompaniya'] },
  { rol: 'rahbar', tugmalar: ['dashboard', 'moliya', 'holat', 'f2-reestr', 'qarzdorlik', 'documents'] },
  { rol: 'admin', tugmalar: ['obyektlar', 'dashboard', 'kompaniya', 'ruxsatlar-jadvali', 'documents', 'moliya'] },
  { rol: 'buyurtmachi', tugmalar: ['zakazchik', 'taqdimlar', 'murojaatlar', 'holat', 'documents'] },
  { rol: 'usta', tugmalar: ['fakt', 'm29', 'topshiriqlar', 'ish-joylarim'] },
  { rol: 'brigadir', tugmalar: ['fakt', 'm29', 'topshiriqlar', 'ish-joylarim'] },
  { rol: 'omborchi', tugmalar: ['logistika', 'zayavka', 'm29', 'yuk-birjasi'] },
  { rol: 'taminotchi', tugmalar: ['logistika', 'zayavka', 'tender', 'yuk-birjasi', 'yetkazuvchi'] },
  { rol: 'mexanik', tugmalar: ['erp', 'logistika', 'topshiriqlar'] },
  { rol: 'kadr', tugmalar: ['hr', 'erp', 'topshiriqlar'] },
  { rol: 'inspektor', tugmalar: ['aosr', 'laboratoriya', 'hujjat-nazorat', 'documents'] },
  { rol: 'loyihachi', tugmalar: ['loyihachi', 'chizmalar', 'documents', 'hujjat-nazorat'] },
];

/** Rolning «Bugun» tugmalari (kalitlar); rol topilmasa umumiy profil. */
export function rolTugmalari(rol: string | null | undefined): readonly string[] {
  return ROL_PROFILLARI.find((p) => p.rol === rol)?.tugmalar ?? UMUMIY_PROFIL;
}

/**
 * «BUGUN» EKRANI (rol bosh sahifasi /admin/bugun): bitta yo'l, rolga qarab mazmun.
 *  - 'usta'    — usta/brigadir (self.work.write bor, kengroq fakt.write yo'q): telefon ekrani (UstaBugun: bugungi ishlar, hajm, oflayn navbat);
 *  - 'tugmalar' — boshqa rollar: rol profilidagi 4–6 katta tugma (boshqa tomon agentlari yaratgan bosh sahifalar — yetkazuvchi, loyihachi,
 *                 buyurtmachi, texnadzor, direktor — shu profil orqali HAVOLA qilinadi, takrorlanmaydi).
 * Yangi rolning o'z ekrani bo'lsa: shu yerga `BugunEkrani` qiymati va Bugun.tsx da xaritalash (1 qator).
 */
export type BugunEkrani = 'usta' | 'tugmalar';

export function bugunEkrani(rol: string | null | undefined, permissions?: readonly string[] | null, superadmin = false): BugunEkrani {
  if (superadmin) return 'tugmalar';
  if (rol === 'usta' || rol === 'brigadir') return 'usta';
  if (permissions && permissions.includes('self.work.write') && !permissions.includes('fakt.write') && !permissions.includes('control.company.read')) return 'usta';
  return 'tugmalar';
}
