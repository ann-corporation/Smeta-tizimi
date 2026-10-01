/**
 * hujjat-yozuvchi/imzo.ts — imzo bloki (H3).
 *
 * Har bir PTO hujjati ЗАКАЗЧИК / ПОДРЯДЧИК imzosi bilan tugaydi; hujjat
 * turiga qarab СОСТАВИЛ / ПРОВЕРИЛ / ТЕХНАДЗОР qo'shiladi. Tomon nomi
 * saytdan (kompaniya/shartnoma) keladi; bo'sh bo'lsa — to'ldirish chizig'i.
 * Nom hech qachon o'ylab topilmaydi.
 */

export type ImzoRol = 'ЗАКАЗЧИК' | 'ПОДРЯДЧИК' | 'СУБПОДРЯДЧИК' | 'ТЕХНАДЗОР' | 'СОСТАВИЛ' | 'ПРОВЕРИЛ';

export type ImzoTomon = { rol: ImzoRol; nom?: string | null };

/** Oferta va tomonlar nomi uchun qisqa kirish: tashkilot yoki F.I.O. */
export type ImzoNomlar = { zakazchik?: string; pudratchi?: string; subpudratchi?: string; texnadzor?: string; tuzuvchi?: string; tekshiruvchi?: string };

export const IMZO_CHIZIQ = '________________________________________';
export const IMZO_IMZO_CHIZIQ = '____________________';
export const IMZO_IZOH = '(наименование организации, должность, Ф.И.О.)';
export const IMZO_IZOH_SHAXS = '(должность, Ф.И.О.)';
export const IMZO_PODPIS = '(подпись)';
export const IMZO_MP = 'М.П.';

/** "ЗАКАЗЧИК:  <nom yoki chiziq>" — Oferta V3 bilan aynan bir xil matn. */
export function imzoMatni(rol: ImzoRol, nom?: string | null): string {
  return `${rol}:  ${nom?.trim() || IMZO_CHIZIQ}`;
}

/** Hujjat turiga mos tomonlar ro'yxati (tartib — hujjatdagi tartib). */
export function imzoTomonlari(rollar: readonly ImzoRol[], nomlar?: ImzoNomlar): ImzoTomon[] {
  const nomi: Record<ImzoRol, string | undefined> = {
    ЗАКАЗЧИК: nomlar?.zakazchik,
    ПОДРЯДЧИК: nomlar?.pudratchi,
    СУБПОДРЯДЧИК: nomlar?.subpudratchi,
    ТЕХНАДЗОР: nomlar?.texnadzor,
    СОСТАВИЛ: nomlar?.tuzuvchi,
    ПРОВЕРИЛ: nomlar?.tekshiruvchi,
  };
  return rollar.map((rol) => ({ rol, nom: nomi[rol] ?? null }));
}

/** Tashkilot tomonlari (muhr qo'yiladi) va shaxslar (СОСТАВИЛ/ПРОВЕРИЛ). */
export const imzoMuhrli = (rol: ImzoRol): boolean => rol === 'ЗАКАЗЧИК' || rol === 'ПОДРЯДЧИК' || rol === 'СУБПОДРЯДЧИК' || rol === 'ТЕХНАДЗОР';
