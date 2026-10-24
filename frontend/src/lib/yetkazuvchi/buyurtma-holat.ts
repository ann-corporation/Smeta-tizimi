/**
 * Yetkazuvchi buyurtmasi hayot sikli (sof holat-mashina). Hand-off logistikaga: `yuklashga_tayyor`.
 * Bu yerda faqat qoidalar; bazadagi haqiqat (versiya, operation_id) arxitektura kontrakti kelgach RPC orqali.
 */
export const BUYURTMA_HOLATLAR = ['tasdiqlandi', 'tayyorlanmoqda', 'yuklashga_tayyor', 'yetkazildi', 'qabul_qilindi', 'hisob_faktura', 'yopildi', 'bekor'] as const;
export type BuyurtmaHolat = typeof BUYURTMA_HOLATLAR[number];
export type TolovHolat = 'tolanmagan' | 'qisman' | 'tolangan';
/** Kim holatni o'zgartira oladi. */
export type BuyurtmaTomon = 'yetkazuvchi' | 'logistika' | 'obyekt' | 'buxgalter';

export const BUYURTMA_HOLAT_NOMI: Readonly<Record<BuyurtmaHolat, string>> = {
  tasdiqlandi: 'Tasdiqlandi', tayyorlanmoqda: 'Tayyorlanmoqda', yuklashga_tayyor: 'Yuklashga tayyor', yetkazildi: 'Yetkazildi',
  qabul_qilindi: 'Qabul qilindi', hisob_faktura: 'Hisob-faktura', yopildi: 'Yopildi', bekor: 'Bekor qilindi',
};

const OTISH: Readonly<Record<BuyurtmaHolat, readonly { ga: BuyurtmaHolat; tomon: BuyurtmaTomon }[]>> = {
  tasdiqlandi: [{ ga: 'tayyorlanmoqda', tomon: 'yetkazuvchi' }, { ga: 'bekor', tomon: 'obyekt' }, { ga: 'bekor', tomon: 'yetkazuvchi' }],
  tayyorlanmoqda: [{ ga: 'yuklashga_tayyor', tomon: 'yetkazuvchi' }, { ga: 'bekor', tomon: 'obyekt' }, { ga: 'bekor', tomon: 'yetkazuvchi' }],
  yuklashga_tayyor: [{ ga: 'yetkazildi', tomon: 'logistika' }, { ga: 'yetkazildi', tomon: 'yetkazuvchi' }, { ga: 'bekor', tomon: 'obyekt' }],
  yetkazildi: [{ ga: 'qabul_qilindi', tomon: 'obyekt' }],
  qabul_qilindi: [{ ga: 'hisob_faktura', tomon: 'yetkazuvchi' }],
  hisob_faktura: [{ ga: 'yopildi', tomon: 'buxgalter' }],
  yopildi: [], bekor: [],
};

export function mumkinOtish(dan: BuyurtmaHolat, ga: BuyurtmaHolat, tomon: BuyurtmaTomon): boolean {
  return OTISH[dan].some((o) => o.ga === ga && o.tomon === tomon);
}
/** Shu tomon hozir bajara oladigan keyingi holatlar (UI tugmalari uchun). */
export function keyingiHolatlar(dan: BuyurtmaHolat, tomon: BuyurtmaTomon): BuyurtmaHolat[] {
  return OTISH[dan].filter((o) => o.tomon === tomon).map((o) => o.ga);
}
export const buyurtmaYakunlandi = (h: BuyurtmaHolat) => h === 'yopildi' || h === 'bekor';

/** To'lov holati yig'indidan: to'langan summa noma'lum (null) bo'lsa holat noma'lum (null) - taxmin qilinmaydi. */
export function tolovHolati(buyurtmaSumma: number | null, tolangan: number | null): TolovHolat | null {
  if (buyurtmaSumma == null || tolangan == null || !Number.isFinite(buyurtmaSumma) || !Number.isFinite(tolangan)) return null;
  if (tolangan <= 0) return 'tolanmagan';
  return tolangan + 0.005 >= buyurtmaSumma ? 'tolangan' : 'qisman';
}

/** Qabul oldidan tekshiruv: sertifikat (kirish nazorati) yo'q bo'lsa ogohlantirish; to'sib qo'ymaydi (qaror nazoratchida). */
export function qabulOgohlantirish(p: { sertifikatSoni: number; qabulMiqdor: number | null; buyurtmaMiqdor: number | null }): string[] {
  const o: string[] = [];
  if (p.sertifikatSoni <= 0) o.push("Sertifikat/pasport biriktirilmagan - kirish nazorati uchun kerak");
  if (p.qabulMiqdor != null && p.buyurtmaMiqdor != null && Math.abs(p.qabulMiqdor - p.buyurtmaMiqdor) > 1e-9) o.push(`Qabul miqdori buyurtmadan farq qiladi: ${p.qabulMiqdor} / ${p.buyurtmaMiqdor}`);
  return o;
}
