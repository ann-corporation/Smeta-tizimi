/**
 * hujjat-aylanish/zanjir.ts — tasdiq zanjiri holat mashinasi (bazadagi RPC bilan AYNAN bir xil qoida; UI tugmalarni shundan ko'rsatadi,
 * lekin haqiqiy ruxsat va o'tish bazada tekshiriladi). Sof funksiya: DB ham, tarmoq ham yo'q.
 *
 *   jarayonda --tasdiqlash--> (keyingi qadam navbatda | oxirgisi bo'lsa tasdiqlandi)
 *   jarayonda --rad--> rad (yakuniy)            jarayonda --qaytarish--> qaytarildi --qayta yuborish (egasi)--> jarayonda, raund+1
 *   jarayonda | qaytarildi --bekor (egasi)--> bekor
 */
export type ZanjirHolat = 'jarayonda' | 'tasdiqlandi' | 'rad' | 'qaytarildi' | 'bekor';
export type QadamHolat = 'kutilmoqda' | 'navbat' | 'tasdiqlandi' | 'rad' | 'qaytarildi';
export type Qaror = 'tasdiqlash' | 'rad' | 'qaytarish';

export type ZanjirQadam = { tartib: number; holat: QadamHolat; men: boolean; muddat?: string | null };
export type ZanjirModel = { holat: ZanjirHolat; meniki: boolean; qadamlar: readonly ZanjirQadam[] };

export const YAKUNIY: readonly ZanjirHolat[] = ['tasdiqlandi', 'rad', 'bekor'];

/** Hozir qaror kutilayotgan qadam (yo'q bo'lsa null). */
export function navbatdagiQadam(z: ZanjirModel): ZanjirQadam | null {
  return z.holat === 'jarayonda' ? (z.qadamlar.find((q) => q.holat === 'navbat') ?? null) : null;
}

/** Foydalanuvchi (kompaniyasi nomidan) hozir qaror chiqara oladimi — tugmalar uchun. */
export function menQarorChiqaraman(z: ZanjirModel): boolean {
  return navbatdagiQadam(z)?.men === true;
}

/** Egasi qayta yuborishi / bekor qilishi mumkinmi. */
export function egasiAmallari(z: ZanjirModel): { qayta: boolean; bekor: boolean } {
  return { qayta: z.meniki && z.holat === 'qaytarildi', bekor: z.meniki && (z.holat === 'jarayonda' || z.holat === 'qaytarildi') };
}

/** Qaror natijasida zanjir va qadamlar qanday bo'ladi (bazadagi t2_hujjat_zanjir_qaror_v1 ning aks-sadosi; test uchun). */
export function qarorQollash(z: ZanjirModel, qaror: Qaror, izoh?: string | null): { ok: true; zanjir: ZanjirModel } | { ok: false; code: 'NAVBAT_EMAS' | 'IZOH_KERAK' } {
  const q = navbatdagiQadam(z);
  if (!q) return { ok: false, code: 'NAVBAT_EMAS' };
  if (qaror !== 'tasdiqlash' && (izoh ?? '').trim().length < 3) return { ok: false, code: 'IZOH_KERAK' };
  if (qaror === 'tasdiqlash') {
    const keyingi = z.qadamlar.find((x) => x.tartib === q.tartib + 1);
    const qadamlar = z.qadamlar.map((x): ZanjirQadam => (x.tartib === q.tartib ? { ...x, holat: 'tasdiqlandi' } : keyingi && x.tartib === keyingi.tartib ? { ...x, holat: 'navbat' } : x));
    return { ok: true, zanjir: { ...z, holat: keyingi ? 'jarayonda' : 'tasdiqlandi', qadamlar } };
  }
  const yangi: QadamHolat = qaror === 'rad' ? 'rad' : 'qaytarildi';
  return { ok: true, zanjir: { ...z, holat: yangi, qadamlar: z.qadamlar.map((x) => (x.tartib === q.tartib ? { ...x, holat: yangi } : x)) } };
}

/** Qayta yuborish: hamma qadam boshidan, birinchisi navbatda. */
export function qaytaYuborish(z: ZanjirModel): ZanjirModel | null {
  if (z.holat !== 'qaytarildi') return null;
  return { ...z, holat: 'jarayonda', qadamlar: z.qadamlar.map((q) => ({ ...q, holat: q.tartib === 1 ? 'navbat' : 'kutilmoqda' })) };
}

/** Standart qurilish zanjirlari (shablon): qaysi tomonlar qaysi tartibda. Rol kalitlari — t2_yonalish katalogi. */
export const STANDART_ZANJIRLAR: Readonly<Record<string, readonly string[]>> = {
  aosr: ['texnadzor', 'buyurtmachi'],
  lab_protokol: ['texnadzor'],
  akt_osvidetelstvovaniya: ['texnadzor', 'buyurtmachi'],
  loyiha_ozgarish: ['loyihachi', 'buyurtmachi'],
  ekspertiza_javob: ['loyihachi', 'ekspertiza'],
};
