/** Kesishma tekshiruvi kodlari → interfeys matni (4 til, t() orqali). Faqat brauzer; Pages Function import qilmaydi. */
import { t } from '../../i18n/til';
import type { Tekshiruv, TekshiruvKod } from './kesishma';

const MATN: Record<TekshiruvKod, string> = {
  UZUNLIK_QADAM: 'Uzunlik {uzunlik_m} m / qadam {qadam_m} m = {oraliqlar} oraliq; tayanchlar: {tayanchlar}',
  UZUNLIK_QADAMGA_KARRALI_EMAS: 'Uzunlik qadamga karrali emas: {uzunlik_m} / {qadam_m} = {nisbat}; {oraliqlar} oraliq olindi',
  PARAMETR_ZIDDIYAT: 'Varaqlarda «{parametr}» har xil: {qiymatlar}',
  ORALIQ_SONI_MOS: 'Varaqdagi seksiyalar soni {yozilgan}, uzunlik/qadam bo‘yicha {hisoblangan}',
  TAYANCH_SONI: 'Tayanchlar soni: chizmada {topilgan}, geometriya bo‘yicha {kutilgan}',
  IKKI_MARTA_SANALGAN: 'Oraliq spetsifikatsiyasida {oraliqda} ta tayanch — qo‘shni oraliq bilan umumiy: {sodda} emas, {tuzatilgan}',
  TAYANCH_MOSLIGI: 'Ustunlar ({ustun}) va stakanlar ({stakan}) soni teng bo‘lishi kerak',
  LENTA_ORALIQ: 'Lenta uzunligi oraliqda: {topilgan} m (kutilgan {kutilgan} m)',
  LENTA_STAKAN_AYIRILMAGAN: 'Lenta {topilgan} m — stakan eni ({stakan_eni} m) ayirilmagan; kutilgan {kutilgan} m',
  PROFIL_MASSA: 'Profil massasi: jadvalda {topilgan} kg, hisob bo‘yicha {hisoblangan} kg ({farq_foiz} %)',
  HAJM_OLCHAM: 'Hajm: jadvalda {topilgan} m3, o‘lchamlar bo‘yicha {kutilgan} m3',
  BIRLIK_YOQ: 'Miqdor {miqdor} birliksiz',
  BIRLIK_TURGA_MOS_EMAS: '«{birlik}» birligi bu element turiga mos emas',
  TAYANCH_KASR: 'Oraliqda {oraliqda} dona {tayanch} tayanchga bo‘linmaydi — oraliq detali deb hisoblandi',
  OTA_TOPILMADI: 'Yig‘ma birlik «{ota_marka}» varaqda topilmadi',
  ORALIQ_SONI_NOMALUM: 'Oraliq spetsifikatsiyasi bor, lekin umumiy uzunlik yoki qadam topilmadi',
  ISHONCH_PAST: 'AI ishonchi past ({ishonch}) — varaqni ko‘zdan kechiring',
  MANBA_YOQ: 'Raqamning varaq/pozitsiyasi ko‘rsatilmagan (sahifa {sahifa})',
};

export function tekshiruvXabari(tk: Tekshiruv): string {
  const p = Object.fromEntries(Object.entries(tk.qiymat).map(([k, v]) => [k, v == null ? '—' : v]));
  switch (tk.kod) {
    case 'UZUNLIK_QADAM': return t('Uzunlik {uzunlik_m} m / qadam {qadam_m} m = {oraliqlar} oraliq; tayanchlar: {tayanchlar}', p);
    case 'UZUNLIK_QADAMGA_KARRALI_EMAS': return t('Uzunlik qadamga karrali emas: {uzunlik_m} / {qadam_m} = {nisbat}; {oraliqlar} oraliq olindi', p);
    case 'PARAMETR_ZIDDIYAT': return t('Varaqlarda «{parametr}» har xil: {qiymatlar}', p);
    case 'ORALIQ_SONI_MOS': return t('Varaqdagi seksiyalar soni {yozilgan}, uzunlik/qadam bo‘yicha {hisoblangan}', p);
    case 'TAYANCH_SONI': return t('Tayanchlar soni: chizmada {topilgan}, geometriya bo‘yicha {kutilgan}', p);
    case 'IKKI_MARTA_SANALGAN': return t('Oraliq spetsifikatsiyasida {oraliqda} ta tayanch — qo‘shni oraliq bilan umumiy: {sodda} emas, {tuzatilgan}', p);
    case 'TAYANCH_MOSLIGI': return t('Ustunlar ({ustun}) va stakanlar ({stakan}) soni teng bo‘lishi kerak', p);
    case 'LENTA_ORALIQ': return t('Lenta uzunligi oraliqda: {topilgan} m (kutilgan {kutilgan} m)', p);
    case 'LENTA_STAKAN_AYIRILMAGAN': return t('Lenta {topilgan} m — stakan eni ({stakan_eni} m) ayirilmagan; kutilgan {kutilgan} m', p);
    case 'PROFIL_MASSA': return t('Profil massasi: jadvalda {topilgan} kg, hisob bo‘yicha {hisoblangan} kg ({farq_foiz} %)', p);
    case 'HAJM_OLCHAM': return t('Hajm: jadvalda {topilgan} m3, o‘lchamlar bo‘yicha {kutilgan} m3', p);
    case 'BIRLIK_YOQ': return t('Miqdor {miqdor} birliksiz', p);
    case 'BIRLIK_TURGA_MOS_EMAS': return t('«{birlik}» birligi bu element turiga mos emas', p);
    case 'TAYANCH_KASR': return t('Oraliqda {oraliqda} dona {tayanch} tayanchga bo‘linmaydi — oraliq detali deb hisoblandi', p);
    case 'OTA_TOPILMADI': return t('Yig‘ma birlik «{ota_marka}» varaqda topilmadi', p);
    case 'ORALIQ_SONI_NOMALUM': return t('Oraliq spetsifikatsiyasi bor, lekin umumiy uzunlik yoki qadam topilmadi', p);
    case 'ISHONCH_PAST': return t('AI ishonchi past ({ishonch}) — varaqni ko‘zdan kechiring', p);
    case 'MANBA_YOQ': return t('Raqamning varaq/pozitsiyasi ko‘rsatilmagan (sahifa {sahifa})', p);
    default: return MATN[tk.kod as TekshiruvKod] ?? String(tk.kod);
  }
}

/** Test uchun: har kodning manba matni (t() kaliti bilan bir xil bo'lishi shart). */
export const TEKSHIRUV_MATNLARI = MATN;
