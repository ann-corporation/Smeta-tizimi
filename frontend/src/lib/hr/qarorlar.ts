/**
 * HR «ishga tushirish» qarorlari D1-D5 (lead sukutlari; egasi o'zgartirishi mumkin). Har qaror BITTA joyda - o'zgartirish bir qator.
 *   D1 maosh turi:  HR_ROL_BAZA_TURI (yangi xodim uchun sukut; saqlangan qiymat xodim kartasida, SQL: t2_hr_xodim.baza_turi)
 *   D2 KPI rol bo'yicha: qoidalar SQL da (_t2_hr_kpi_qoida_v1 sukut + t2_hr_kpi_qoida); bu yerda faqat nomlar va «qayerdan olindi» matni
 *   D3 KPI pulga ta'siri: sozlama t2_hr_sozlama.kpi_pulga_tasir (sukut O'CHIQ; «Sozlamalar» ekranidagi tugma). KPI_PULGA_SUKUT - faqat ko'rsatma
 *   D4 tasdiqlash:  HR_TASDIQ (ruxsat kodlari; RPC ichida majburlanadi - bu yerda hujjat uchun)
 *   D5 ko'rinish:   xodim FAQAT o'z oyligi va KPI sini ko'radi (RPC t2_hr_men_v1 boshqa xodim parametrini qabul qilmaydi)
 */
import type { HrBazaTuri, HrKpiKod, HrKpiKorsatkich, HrRol, HrXodimlarJavob } from '../../api/t2-hr';

/** D1: brigada/ustalar - naryad bo'yicha donabay; ofis/ITR - oklad. */
export const HR_ROL_BAZA_TURI: Readonly<Record<HrRol, HrBazaTuri>> = {
  prorab: 'oylik', brigadir: 'donabay', usta: 'donabay', ishchi: 'donabay', muhandis: 'oylik', pto: 'oylik', boshqa: 'oylik',
};

/** D3: KPI pulga ta'siri sukut bo'yicha O'CHIQ (haqiqiy qiymat bazadagi sozlamada). */
export const KPI_PULGA_SUKUT = false;

/** D4: kim nimani qiladi (RPC ichida tekshiriladi). */
export const HR_TASDIQ = {
  tabelBelgilaydi: 'hr.tabel.write', // brigadir / prorab
  tabelTasdiqlaydi: 'hr.write', // kadr
  jarimaBonusYaratadi: 'hr.tabel.write',
  jarimaBonusTasdiqlaydi: 'payroll.write', // rahbar/buxgalter; muallif o'zi tasdiqlamaydi
} as const;

/** D5. */
export const HR_KORINISH = 'faqat-oz' as const;

export const ROL_NOMI: Readonly<Record<HrRol, string>> = {
  prorab: 'Prorab', brigadir: 'Brigadir', usta: 'Usta', ishchi: 'Ishchi', muhandis: 'Muhandis', pto: 'PTO', boshqa: 'Boshqa',
};
export const BAZA_TURI_NOMI: Readonly<Record<HrBazaTuri, string>> = { oylik: 'Oklad (oyiga)', kunlik: 'Kunlik stavka', donabay: 'Donabay (naryad bo‘yicha)' };

export const KPI_NOMI: Readonly<Record<HrKpiKod, string>> = {
  f2_hajm: 'Tasdiqlangan F2 hajmi',
  f2_vaqtida: 'F2 vaqtida tayyorlangan',
  aosr_vaqtida: 'АОСР vaqtida tayyorlangan',
  naryad_qabul: 'Qabul qilingan naryadlar',
  davomat: 'Davomat',
};

/** «Qayerdan olindi» - oddiy o'zbekcha bir gap (kalit; t() bilan tarjima qilinadi). */
export const KPI_MANBA: Readonly<Record<HrKpiKod, string>> = {
  f2_hajm: 'Manba: tasdiqlangan F2 aktlar (sizga biriktirilgan obyektlar, shu oy).',
  f2_vaqtida: 'Manba: F2 aktlar - yaratilgandan tasdiqlangunga qadar o‘tgan kun.',
  aosr_vaqtida: 'Manba: АОСР hujjatlari - yaratilgandan tasdiqlangunga qadar o‘tgan kun.',
  naryad_qabul: 'Manba: naryad - shu oyda qabul qilingan naryadlar soni.',
  davomat: 'Manba: tabel - kelgan kunlar / oydagi ish kunlari.',
};

/** Ko'rsatkich qiymati matni: NULL = «—» (0 emas). */
export function kpiQiymatMatn(k: Pick<HrKpiKorsatkich, 'qiymat' | 'birlik'>, son: (v: number) => string): string {
  if (k.qiymat == null) return '—';
  return k.birlik === '%' ? `${k.qiymat}%` : k.birlik === 'ta' ? `${k.qiymat}` : son(k.qiymat);
}

export type BoshlashHolati = { kerak: boolean; stavka: boolean; xodim: boolean };
/** Birinchi ishga tushirish: stavkalar yoki xodimlar yo'q bo'lsa 3 qadam ko'rsatiladi (3-qadam - tabel - xodimdan keyin ochiladi). */
export function boshlashHolati(d: Pick<HrXodimlarJavob, 'sozlama' | 'xodimlar'>): BoshlashHolati {
  const stavka = d.sozlama != null && d.sozlama.ndfl_foiz != null && d.sozlama.inps_foiz != null;
  const xodim = d.xodimlar.some((x) => x.hr_bor);
  return { kerak: !(stavka && xodim), stavka, xodim };
}