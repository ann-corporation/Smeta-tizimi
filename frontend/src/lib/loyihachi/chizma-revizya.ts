/**
 * LOYIHACHI: chizma varaqlari revizyasi - qaysi revizya JORIY, qaysi ESKIRGAN, qaysi hali ishlab chiqarishga RUXSATSIZ.
 *
 * Sof mantiq (DB va UI'dan mustaqil). PTO va prorab smetani/ishni faqat joriy revizya bo'yicha olib borsin,
 * eskirgan revizyadan foydalanilsa ogohlantirilsin.
 *
 * Qoidalar:
 *  - joriy = (marka, varaq) bo'yicha "ruxsat" holatidagi ENG YUQORI revizya;
 *  - undan past ruxsatli revizyalar - eskirgan; bekor qilingan - bekor;
 *  - joriydan yuqori, lekin ruxsatsiz (qoralama) revizya - "ruxsatsiz" (ishda ishlatilmaydi, ogohlantirish bilan);
 *  - ruxsat berish uchun 1-dan boshlab revizyada o'zgarish izohi majburiy (nima o'zgargani yo'q revizya tasdiqlanmaydi).
 */

/** Chizma markalari (rasmiy ruscha belgilar o'zgarmaydi). */
export const CHIZMA_MARKALARI = ['ПЗ', 'ГП', 'АР', 'АС', 'КЖ', 'КМ', 'ВК', 'НВК', 'ОВ', 'ЭС', 'ЭО', 'СС', 'ТХ', 'ПОС'] as const;
export type ChizmaMarka = (typeof CHIZMA_MARKALARI)[number];

/** Loyiha bosqichi: ПД (loyiha hujjati) yoki РД (ishchi hujjat). */
export type LoyihaBosqich = 'PD' | 'RD';

export type RevizyaHolat = 'qoralama' | 'ruxsat' | 'bekor';

export interface ChizmaVaraq {
  id: string;
  marka: ChizmaMarka | string;
  bosqich: LoyihaBosqich;
  /** Varaq raqami (masalan "12" yoki "KJ-3.2"). */
  varaq: string;
  nom?: string;
  /** 0 = birinchi chiqarish. */
  revizya: number;
  holat: RevizyaHolat;
  /** Nima o'zgargani (revizya >= 1 uchun majburiy). */
  ozgarishIzohi?: string;
  ruxsatVaqti?: string;
}

export type RevizyaKorinish = 'joriy' | 'eskirgan' | 'ruxsatsiz' | 'bekor';

export const varaqKaliti = (v: Pick<ChizmaVaraq, 'marka' | 'bosqich' | 'varaq'>): string =>
  `${v.bosqich}|${String(v.marka).trim().toUpperCase()}|${v.varaq.trim().toLowerCase()}`;

/** Har revizyaga ko'rinish holatini beradi (kirish tartibi saqlanadi, kirish o'zgartirilmaydi). */
export function revizyaKorinishlari(varaqlar: readonly ChizmaVaraq[]): Map<string, RevizyaKorinish> {
  const joriy = new Map<string, number>();
  for (const v of varaqlar) {
    if (v.holat !== 'ruxsat') continue;
    const k = varaqKaliti(v);
    if (v.revizya > (joriy.get(k) ?? -1)) joriy.set(k, v.revizya);
  }
  const natija = new Map<string, RevizyaKorinish>();
  for (const v of varaqlar) {
    const j = joriy.get(varaqKaliti(v));
    let h: RevizyaKorinish;
    if (v.holat === 'bekor') h = 'bekor';
    else if (v.holat === 'qoralama') h = 'ruxsatsiz';
    else h = v.revizya === j ? 'joriy' : 'eskirgan';
    natija.set(v.id, h);
  }
  return natija;
}

/** Varaqning joriy (ruxsatli, eng yuqori) revizyasi; yo'q bo'lsa null. */
export function joriyRevizya(varaqlar: readonly ChizmaVaraq[], kalit: string): ChizmaVaraq | null {
  let eng: ChizmaVaraq | null = null;
  for (const v of varaqlar) {
    if (v.holat !== 'ruxsat' || varaqKaliti(v) !== kalit) continue;
    if (!eng || v.revizya > eng.revizya) eng = v;
  }
  return eng;
}

export type FoydalanishNatija =
  | { holat: 'joriy' }
  | { holat: 'eskirgan'; joriyRevizya: number }
  | { holat: 'ruxsatsiz' }
  | { holat: 'topilmadi' };

/**
 * PTO/prorab biror revizyadan (masalan, smeta qatori yoki akt yoniga yozilgan) foydalanayapti - to'g'rimi?
 * `ishlatilgan` - ishda ko'rsatilgan revizya raqami.
 */
export function foydalanishniTekshir(
  varaqlar: readonly ChizmaVaraq[],
  ref: Pick<ChizmaVaraq, 'marka' | 'bosqich' | 'varaq'>,
  ishlatilgan: number,
): FoydalanishNatija {
  const kalit = varaqKaliti(ref);
  const mavjud = varaqlar.filter((v) => varaqKaliti(v) === kalit && v.holat !== 'bekor');
  if (mavjud.length === 0) return { holat: 'topilmadi' };
  const joriy = joriyRevizya(mavjud, kalit);
  if (!joriy) return { holat: 'ruxsatsiz' };
  const ishlatilganRuxsatli = mavjud.some((v) => v.revizya === ishlatilgan && v.holat === 'ruxsat');
  if (!ishlatilganRuxsatli) return { holat: 'ruxsatsiz' };
  return ishlatilgan === joriy.revizya ? { holat: 'joriy' } : { holat: 'eskirgan', joriyRevizya: joriy.revizya };
}

export type RuxsatXatosi = 'IZOH_KERAK' | 'ALLAQACHON_RUXSAT' | 'BEKOR' | 'ESKIRGAN_REVIZYA';

/**
 * "Ishlab chiqarishga ruxsat" shtampini qo'yish mumkinmi? null = mumkin.
 * Undan yuqori ruxsatli revizya mavjud bo'lsa eski revizyaga ruxsat berilmaydi.
 */
export function ruxsatBerishXatosi(varaqlar: readonly ChizmaVaraq[], id: string): RuxsatXatosi | null {
  const v = varaqlar.find((x) => x.id === id);
  if (!v) return null;
  if (v.holat === 'ruxsat') return 'ALLAQACHON_RUXSAT';
  if (v.holat === 'bekor') return 'BEKOR';
  if (v.revizya >= 1 && !(v.ozgarishIzohi ?? '').trim()) return 'IZOH_KERAK';
  const j = joriyRevizya(varaqlar, varaqKaliti(v));
  if (j && j.revizya > v.revizya) return 'ESKIRGAN_REVIZYA';
  return null;
}

export interface RevizyaXulosa {
  joriy: number;
  eskirgan: number;
  ruxsatsiz: number;
  bekor: number;
}

export function revizyaXulosa(varaqlar: readonly ChizmaVaraq[]): RevizyaXulosa {
  const x: RevizyaXulosa = { joriy: 0, eskirgan: 0, ruxsatsiz: 0, bekor: 0 };
  for (const h of revizyaKorinishlari(varaqlar).values()) x[h]++;
  return x;
}
