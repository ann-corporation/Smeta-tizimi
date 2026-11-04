/**
 * Yuk birjasi holat mashinalari (SQL 20261201000000 bilan bir xil). Yuk: qoralama → elon → takliflar → bron → yolda → yetkazildi → yopildi;
 * bekor / muddat_tugadi / nizo. To'lov (escrow) — provayder ko'zgusi: o'tishlarni faqat provayder hodisasi qiladi.
 */
export type YukHolat = 'qoralama' | 'elon' | 'takliflar' | 'bron' | 'yolda' | 'yetkazildi' | 'yopildi' | 'bekor' | 'muddat_tugadi' | 'nizo';
export const YUK_HOLATLAR: readonly YukHolat[] = ['qoralama', 'elon', 'takliflar', 'bron', 'yolda', 'yetkazildi', 'yopildi', 'bekor', 'muddat_tugadi', 'nizo'];

/** Ruxsat etilgan o'tishlar (yuk darajasi). bron → elon: tashuvchi bronni bekor qilsa yuk qayta e'longa chiqadi. */
export const YUK_OTISH: Readonly<Record<YukHolat, readonly YukHolat[]>> = {
  qoralama: ['elon', 'bekor'],
  elon: ['takliflar', 'bron', 'bekor', 'muddat_tugadi'],
  takliflar: ['elon', 'bron', 'bekor', 'muddat_tugadi'],
  bron: ['yolda', 'elon', 'bekor'],
  yolda: ['yetkazildi', 'nizo'],
  yetkazildi: ['yopildi', 'nizo'],
  nizo: ['yopildi', 'bekor'],
  yopildi: [],
  bekor: [],
  muddat_tugadi: [],
};
export const yukOtishMumkin = (a: YukHolat, b: YukHolat): boolean => YUK_OTISH[a].includes(b);
export const YUK_YAKUNIY: ReadonlySet<YukHolat> = new Set<YukHolat>(['yopildi', 'bekor', 'muddat_tugadi']);

/** Yuk egasi uchun joriy holatda mumkin amallar. */
export type EgaAmal = 'tahrir' | 'elon' | 'javob' | 'bekor' | 'tasdiq' | 'baho' | 'nizo';
export function egaAmallari(h: YukHolat, baholangan = false): EgaAmal[] {
  switch (h) {
    case 'qoralama': return ['tahrir', 'elon', 'bekor'];
    case 'elon': case 'takliflar': return ['javob', 'bekor'];
    case 'bron': return ['bekor'];
    case 'yolda': return ['nizo'];
    case 'yetkazildi': return ['tasdiq', 'nizo'];
    case 'yopildi': return baholangan ? [] : ['baho'];
    default: return [];
  }
}

export const YUK_HOLAT_NOMI: Readonly<Record<YukHolat, string>> = {
  qoralama: 'Qoralama', elon: 'E’lon qilingan', takliflar: 'Takliflar bor', bron: 'Bron qilingan', yolda: 'Yo‘lda', yetkazildi: 'Yetkazildi',
  yopildi: 'Yopildi', bekor: 'Bekor qilingan', muddat_tugadi: 'Muddati tugadi', nizo: 'Nizo',
};

export type TolovHolat = 'kutilmoqda' | 'ushlab_turibdi' | 'chiqarish_sorovi' | 'chiqarildi' | 'qaytarish_sorovi' | 'qaytarildi' | 'muzlatilgan' | 'xato' | 'bekor';
export type TolovHodisa = 'hold_ok' | 'hold_xato' | 'release_ok' | 'refund_ok';

/** Provayder hodisasi bo'yicha o'tish (t2_yb_tolov_hodisa_v1 bilan aynan bir xil). Noto'g'ri o'tish — null. */
export function tolovOtish(h: TolovHolat, e: TolovHodisa): TolovHolat | null {
  if (e === 'hold_ok' && h === 'kutilmoqda') return 'ushlab_turibdi';
  if (e === 'hold_xato' && h === 'kutilmoqda') return 'xato';
  if (e === 'release_ok' && h === 'chiqarish_sorovi') return 'chiqarildi';
  if (e === 'refund_ok' && h === 'qaytarish_sorovi') return 'qaytarildi';
  return null;
}
export const TOLOV_HOLAT_NOMI: Readonly<Record<TolovHolat, string>> = {
  kutilmoqda: 'To‘lov kutilmoqda', ushlab_turibdi: 'Pul ushlab turilibdi', chiqarish_sorovi: 'Tashuvchiga o‘tkazilmoqda', chiqarildi: 'Tashuvchiga o‘tkazildi',
  qaytarish_sorovi: 'Qaytarilmoqda', qaytarildi: 'Qaytarildi', muzlatilgan: 'Nizo — pul muzlatilgan', xato: 'To‘lov xatosi', bekor: 'Bekor qilingan',
};