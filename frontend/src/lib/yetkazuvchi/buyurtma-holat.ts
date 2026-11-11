/**
 * Buyurtma hayot sikli (sof holat-mashina) - bazadagi haqiqat bilan AYNAN bir xil:
 * supabase/migrations/20261108410000_t2_buyurtma_p3_v1.sql (`t2_buyurtma.holat` CHECK va `_t2_buyurtma_otish_ruxsat`).
 * o'zgarsa ikkalasi birga o'zgaradi (buyurtma-holat.test.ts jadvalni qat'iy tekshiradi).
 * Yo'l: yuborildi > qabul_qilindi > bajarilmoqda > tayyor > topshirildi > qabul_qilindi_yakuniy | qisman | nizo (rad/bekor - yon yo'l).
 * Hisob-faktura - alohida BOSQICH (holat emas): qabul_qilindi_yakuniy dan keyin yetkazuvchi qo'yadi.
 */
export const BUYURTMA_HOLATLAR = ['yuborildi', 'qabul_qilindi', 'rad', 'bajarilmoqda', 'tayyor', 'topshirildi', 'qabul_qilindi_yakuniy', 'qisman', 'nizo', 'bekor'] as const;
export type BuyurtmaHolat = typeof BUYURTMA_HOLATLAR[number];
export type TolovHolat = 'tolanmagan' | 'qisman' | 'tolangan';
/** Kim holatni o'zgartira oladi: xaridor (buyurtma bergan kompaniya) yoki ijrochi (yetkazuvchi). */
export type BuyurtmaTomon = 'xaridor' | 'ijrochi';

export const BUYURTMA_HOLAT_NOMI: Readonly<Record<BuyurtmaHolat, string>> = {
  yuborildi: 'Yuborildi', qabul_qilindi: 'Qabul qilindi', rad: 'Rad etildi', bajarilmoqda: 'Bajarilmoqda', tayyor: 'Tayyor',
  topshirildi: 'Topshirildi', qabul_qilindi_yakuniy: 'Xaridor qabul qildi', qisman: 'Qisman qabul qilindi', nizo: 'Nizo', bekor: 'Bekor qilindi',
};

/** Chiplar uchun rang toifasi (fz-stamp modifikatori bilan moslanadi). */
export type HolatRang = 'info' | 'warn' | 'ok' | 'danger' | 'mute';
export const BUYURTMA_HOLAT_RANG: Readonly<Record<BuyurtmaHolat, HolatRang>> = {
  yuborildi: 'warn', qabul_qilindi: 'info', rad: 'danger', bajarilmoqda: 'info', tayyor: 'info',
  topshirildi: 'warn', qabul_qilindi_yakuniy: 'ok', qisman: 'warn', nizo: 'danger', bekor: 'mute',
};

/** `_t2_buyurtma_otish_ruxsat` jadvali (dan, ga, tomon). `tayyor -> tayyor` va `qabul_qilindi_yakuniy -> o'zi` faqat BOSQICH almashtiradi. */
const OTISH: readonly (readonly [BuyurtmaHolat, BuyurtmaHolat, BuyurtmaTomon])[] = [
  ['yuborildi', 'qabul_qilindi', 'ijrochi'], ['yuborildi', 'rad', 'ijrochi'], ['yuborildi', 'bekor', 'xaridor'],
  ['qabul_qilindi', 'bajarilmoqda', 'ijrochi'], ['qabul_qilindi', 'bekor', 'xaridor'],
  ['bajarilmoqda', 'tayyor', 'ijrochi'], ['bajarilmoqda', 'bekor', 'xaridor'],
  ['tayyor', 'tayyor', 'ijrochi'], ['tayyor', 'topshirildi', 'ijrochi'],
  ['topshirildi', 'qabul_qilindi_yakuniy', 'xaridor'], ['topshirildi', 'qisman', 'xaridor'], ['topshirildi', 'nizo', 'xaridor'],
  ['qisman', 'qabul_qilindi_yakuniy', 'xaridor'], ['nizo', 'qabul_qilindi_yakuniy', 'xaridor'],
  ['qabul_qilindi_yakuniy', 'qabul_qilindi_yakuniy', 'ijrochi'],
];
export const BUYURTMA_OTISHLAR = OTISH;

export function mumkinOtish(dan: BuyurtmaHolat, ga: BuyurtmaHolat, tomon: BuyurtmaTomon): boolean {
  return OTISH.some(([a, b, t]) => a === dan && b === ga && t === tomon);
}
/** Shu tomon hozir bajara oladigan keyingi holatlar (o'zini-o'zi bosqich almashtirishsiz). */
export function keyingiHolatlar(dan: BuyurtmaHolat, tomon: BuyurtmaTomon): BuyurtmaHolat[] {
  return OTISH.filter(([a, b, t]) => a === dan && t === tomon && a !== b).map(([, b]) => b);
}
export const buyurtmaYakunlandi = (h: BuyurtmaHolat) => h === 'qabul_qilindi_yakuniy' || h === 'bekor' || h === 'rad';

/** Yetkazuvchi kabineti: har holatda BITTA asosiy tugma (oddiy interfeys, egasi talabi). `rad` - ikkinchi darajali, faqat `yuborildi` da. */
export const IJROCHI_QADAM: Readonly<Partial<Record<BuyurtmaHolat, { ga: BuyurtmaHolat; tugma: string }>>> = {
  yuborildi: { ga: 'qabul_qilindi', tugma: 'Qabul qilish' },
  qabul_qilindi: { ga: 'bajarilmoqda', tugma: 'Bajarishni boshlash' },
  bajarilmoqda: { ga: 'tayyor', tugma: 'Tayyor' },
  tayyor: { ga: 'topshirildi', tugma: 'Topshirdim' },
};

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
