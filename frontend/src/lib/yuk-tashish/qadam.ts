/** Reys qadamlari (server bilan bir xil tartib: 20261216400000 t2_yb_p1_qadam_v1). Sof funksiyalar. */
export const QADAM_NOM = ['bron', 'keldi', 'yuklandi', 'yolda', 'yetkazdi'] as const;
export type Qadam = (typeof QADAM_NOM)[number];

/** Keyingi qadam (bitta tugma). Oxirgisidan keyin yo'q. */
export function keyingiQadam(joriy: string): Exclude<Qadam, 'bron'> | null {
  const i = QADAM_NOM.indexOf(joriy as Qadam);
  if (i < 0 || i >= QADAM_NOM.length - 1) return null;
  return QADAM_NOM[i + 1] as Exclude<Qadam, 'bron'>;
}

/** Bekor qilish sabablari (kalit = o'zbek matni; serverda bekor_sabab matni sifatida yoziladi). */
export const YT_BEKOR_SABAB = ['Mashina buzildi', 'Yuk egasi bilan kelisha olmadik', 'Manzil noto‘g‘ri', 'Shaxsiy sabab', 'Boshqa'] as const;

/** Narx rejimi: qat'iy narx (birinchi qabul qilgan yutadi) yoki taklif so'rash (auktsion). Bitta sozlama: shipper formasi sukut qiymati. */
export const SUKUT_NARX_REJIMI: 'qat_iy' | 'taklif' = 'qat_iy';

/** Masofa bo'yicha tartib (yaqin yuk birinchi); bir xil masofada id kichigi. */
export function masofaBilanTartib<T extends { id: number; joydan_km: number }>(q: readonly T[]): T[] {
  return [...q].sort((a, b) => a.joydan_km - b.joydan_km || a.id - b.id);
}
