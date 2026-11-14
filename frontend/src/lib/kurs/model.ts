/**
 * KURS (o'rganish) MODELI вЂ” dars = MA'LUMOT (React yo'q). Darslar tizimning o'z reestrlaridan (sahifa reestri, rol ruxsatlari)
 * tekshiriladi (kurs.qoriqchi.test.ts): sahifa o'zgarib dars buzilsa CI yiqiladi va qaysi dars yangilanishi kerakligini aytadi.
 *
 * Til: asosiy matn вЂ” o'zbek lotin (i18n kaliti); ru/en вЂ” i18n/lugat/qism/kurs.json. Matnlar qisqa, oddiy (quruvchi uchun, telefonda ham).
 */

/**
 * Qadam ko'rsatkichi (ekranda nimani yoritish):
 *   'menyu:<sahifa kaliti>' вЂ” chap menyudagi shu sahifa havolasi (reestrdan);
 *   'kurs:<id>'             вЂ” manbada `data-kurs="<id>"` turgan element;
 *   'testid:<id>'           вЂ” manbada `data-testid="<id>"` turgan element (barqaror).
 * Qadamda ko'rsatkich bo'lmasa вЂ” faqat matn (sahifa ochiladi).
 */
export type Korsatkich = string;

export type DarsQadam = {
  /** Nima qilish вЂ” bitta gap, oddiy so'zlar. */
  matn: string;
  /** Sahifa reestri kaliti (SAHIFALAR.kalit) вЂ” qadam shu sahifada bajariladi. */
  sahifa: string;
  korsatkich?: Korsatkich;
  /** Natija tekshiruvi: В«shunday bo'lsa вЂ” to'g'riВ». */
  natija?: string;
};

export type Dars = {
  id: string;
  /** Guruh sarlavhasi uchun: birinchi | pto | usta | prorab | direktor | buxgalter | tomon | yetkazuvchi | subpudratchi. */
  guruh: DarsGuruh;
  /** Qaysi rollar uchun ('*' вЂ” hamma). */
  rollar: readonly string[];
  /** Faqat shu tomon (kompaniya turi) uchun: 'subpudratchi' | 'yetkazuvchi' | ... — berilmasa rol bo‘yicha. */
  tomonlar?: readonly string[];
  /** Kerakli capability lar (hammasi bo'lishi shart) вЂ” rolning ruxsatidan tekshiriladi. */
  talab: readonly string[];
  nom: string;
  /** Maqsad вЂ” bitta gap. */
  maqsad: string;
  /** Nega kerak вЂ” bir qator. */
  nega: string;
  /** Oldindan o'tilishi kerak darslar. */
  oldin: readonly string[];
  qadamlar: readonly DarsQadam[];
  /** Odatiy xatolar (haqiqiy topilmalardan, egasi qoidalaridan). */
  xatolar: readonly string[];
  daqiqa: number;
  /** Ishqalanish kalitlari (usage-learning tsikli): shu joyda odamlar qiyinalsa dars tavsiya etiladi. */
  ishqalanish?: readonly string[];
  /** Jarvis (tutor) uchun qo'shimcha so'zlar (lotin, kichik harf). */
  sozlar?: readonly string[];
  /** Telefonda bajariladigan dars. */
  telefon?: true;
  /** Mashq obyektida (sinov) bajarish tavsiya etiladi вЂ” dars o'zi ma'lumot yozmaydi. */
  mashq?: true;
};

export type DarsGuruh = 'birinchi' | 'pto' | 'usta' | 'prorab' | 'direktor' | 'buxgalter' | 'tomon' | 'yetkazuvchi' | 'subpudratchi';

export const GURUH_NOM: Readonly<Record<DarsGuruh, string>> = {
  birinchi: 'Birinchi kun', pto: 'PTO: smetadan F2 gacha', usta: 'Usta: bugungi ish', prorab: 'Prorab: nazorat',
  direktor: 'Direktor: pult', buxgalter: 'Buxgalter: pul', tomon: 'Buyurtmachi va texnik nazorat',
  yetkazuvchi: 'Yetkazuvchi', subpudratchi: 'Subpudratchi',
};

/** Qadam ko'rsatkichini ajratadi. */
export function korsatkichAjrat(k: Korsatkich): { tur: 'menyu' | 'kurs' | 'testid'; id: string } | null {
  const i = k.indexOf(':');
  if (i < 0) return null;
  const tur = k.slice(0, i);
  const id = k.slice(i + 1);
  if ((tur === 'menyu' || tur === 'kurs' || tur === 'testid') && id) return { tur, id };
  return null;
}

/** Dars ma'lumotini tuzatuvchi yordamchi (yozuvni qisqartiradi). */
export const q = (sahifa: string, matn: string, korsatkich?: Korsatkich, natija?: string): DarsQadam => ({ sahifa, matn, ...(korsatkich ? { korsatkich } : {}), ...(natija ? { natija } : {}) });
