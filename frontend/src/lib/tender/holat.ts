/**
 * TENDER holat mashinasi (sof funksiyalar). Baza (`_t2_tender_otish_ruxsat`, 20261122000000) bilan AYNAN bir xil jadval:
 * o'zgarsa ikkalasi birga o'zgaradi (holat.test.ts jadvalni qat'iy tekshiradi).
 * qoralama → tasdiqlashda → elon → (takliflar_yopildi) → baholash → golib_tanlandi → shartnoma → bajarilmoqda → yopildi; bekor.
 */
export const TENDER_HOLATLAR = ['qoralama', 'tasdiqlashda', 'elon', 'takliflar_yopildi', 'baholash', 'golib_tanlandi', 'shartnoma', 'bajarilmoqda', 'yopildi', 'bekor'] as const;
export type TenderHolat = typeof TENDER_HOLATLAR[number];

export const OTISHLAR: readonly (readonly [TenderHolat, TenderHolat])[] = [
  ['qoralama', 'tasdiqlashda'], ['tasdiqlashda', 'qoralama'], ['tasdiqlashda', 'elon'],
  ['elon', 'takliflar_yopildi'], ['elon', 'baholash'], ['takliflar_yopildi', 'baholash'],
  ['baholash', 'elon'], ['baholash', 'golib_tanlandi'], ['baholash', 'yopildi'],
  ['golib_tanlandi', 'shartnoma'], ['golib_tanlandi', 'bajarilmoqda'], ['shartnoma', 'bajarilmoqda'],
  ['bajarilmoqda', 'yopildi'], ['golib_tanlandi', 'yopildi'],
  ['qoralama', 'bekor'], ['tasdiqlashda', 'bekor'], ['elon', 'bekor'], ['takliflar_yopildi', 'bekor'], ['baholash', 'bekor'],
  ['golib_tanlandi', 'bekor'], ['shartnoma', 'bekor'], ['bajarilmoqda', 'bekor'],
];

export const yakunlandi = (h: TenderHolat): boolean => h === 'yopildi' || h === 'bekor';
export function otishMumkin(dan: TenderHolat, ga: TenderHolat): boolean {
  return OTISHLAR.some(([a, b]) => a === dan && b === ga);
}
export function keyingiHolatlar(dan: TenderHolat): TenderHolat[] {
  return OTISHLAR.filter(([a]) => a === dan).map(([, b]) => b);
}

/** Muddati o'tgan `elon` — xaridor/yetkazuvchi ko'zida `takliflar_yopildi` (baza ham shunday ko'rsatadi). */
export function effektivHolat(holat: TenderHolat, muddat: string | null | undefined, hozir: number = Date.now()): TenderHolat {
  if (holat !== 'elon' || !muddat) return holat;
  const t = Date.parse(muddat);
  return Number.isFinite(t) && t <= hozir ? 'takliflar_yopildi' : holat;
}

/** Holat o'tishiga izoh (sabab) majburiymi — baza (`IZOH_KERAK`) bilan bir xil. */
export function izohKerak(dan: TenderHolat, ga: TenderHolat): boolean {
  return ga === 'qoralama' || ga === 'takliflar_yopildi' || ga === 'bekor' || (ga === 'yopildi' && dan === 'baholash');
}

/** Qaysi capability kerak (baza ichida ham shunday): tasdiqlashda/shartnoma/bajarilmoqda — yozish, qolgani — tasdiqlash. */
export type OtishRuxsat = 'yoz' | 'tasdiq';
export function otishRuxsati(ga: TenderHolat): OtishRuxsat {
  return ga === 'tasdiqlashda' || ga === 'shartnoma' || ga === 'bajarilmoqda' ? 'yoz' : 'tasdiq';
}

export type Harakat = 'tahrir' | 'tasdiqga' | 'qaytarish' | 'elon' | 'erta_yopish' | 'ochish' | 'baholash_saqlash' | 'raund' | 'golib' | 'shartnoma' | 'bajarilmoqda' | 'yopish' | 'bekor';
export type Ruxsatlar = { yoz: boolean; tasdiq: boolean };

/** Ekranda ko'rsatiladigan tugmalar (xaridor tomoni): holat + ruxsat + muddat bo'yicha. */
export function harakatlar(holat: TenderHolat, ruxsat: Ruxsatlar, muddatOtdi: boolean): Harakat[] {
  const r: Harakat[] = [];
  const yoz = (h: Harakat) => { if (ruxsat.yoz) r.push(h); };
  const tas = (h: Harakat) => { if (ruxsat.tasdiq) r.push(h); };
  switch (holat) {
    case 'qoralama': yoz('tahrir'); yoz('tasdiqga'); tas('bekor'); break;
    case 'tasdiqlashda': tas('elon'); tas('qaytarish'); tas('bekor'); break;
    case 'elon': if (muddatOtdi) tas('ochish'); else tas('erta_yopish'); tas('bekor'); break;
    case 'takliflar_yopildi': tas('ochish'); tas('bekor'); break;
    case 'baholash': yoz('baholash_saqlash'); tas('raund'); tas('golib'); tas('yopish'); tas('bekor'); break;
    case 'golib_tanlandi': yoz('shartnoma'); yoz('bajarilmoqda'); tas('yopish'); tas('bekor'); break;
    case 'shartnoma': yoz('bajarilmoqda'); tas('bekor'); break;
    case 'bajarilmoqda': tas('yopish'); tas('bekor'); break;
    default: break;
  }
  return r;
}

/** Yetkazuvchi taklif bera oladimi: faqat `elon`, muddat o'tmagan. */
export function taklifBerishMumkin(holat: TenderHolat, muddat: string | null | undefined, hozir: number = Date.now()): boolean {
  return effektivHolat(holat, muddat, hozir) === 'elon';
}
