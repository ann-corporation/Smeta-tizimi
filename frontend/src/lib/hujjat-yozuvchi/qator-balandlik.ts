/**
 * hujjat-yozuvchi/qator-balandlik.ts — o'ralgan (wrap) matn uchun qator balandligini HISOBLASH (yagona manba).
 *
 * Egasi (2026-11-13): «katta matn yacheykaga sig'magani uchun juda kichik ko'rinayapdi» (shrinkToFit) va
 * «Тип / Кат. / КАЛИТ — ichkariga skrit bo'lib turadi-ku, ular qatorni semirtirmasin». Qoidalar:
 *   1. Matn katagi shrift o'lchamini KICHRAYTIRMAYDI: o'raladi (wrap), qator balandligi shunga yarasha hisoblanadi.
 *   2. Son katagi hech qachon o'ralmaydi va kichraytirilmaydi — ustun kengaytiriladi (`RasmiyVaraq.kerakYangila`).
 *   3. Yashirin / texnik ustun (Тип, Кат., КАЛИТ …) o'ralmaydi va qator balandligiga TA'SIR QILMAYDI.
 * Excel yuklashda o'ralgan matn uchun balandlikni o'zi kattalashtirmaydi (customHeight), shuning uchun oldindan.
 */

/** Bir matn qatorining balandligi (pt) — 10 pt shrift uchun. */
export const QATOR_PT = 13;
/** Excel sukut qator balandligi (pt) — bir qatorli qator shu balandlikda qoladi (ht yozilmaydi). */
export const SUKUT_QATOR_PT = 13.2;
/** Ustun eni birligi (belgi) → 10 pt Times/Calibri matnining o'rtacha sig'imi. */
export const BELGI_KOEF = 1.15;

/**
 * Matn o'ralganda nechta qator egallaydi. So'z bo'yicha o'rash (Excel kabi): sig'magan uzun so'z harf bo'yicha
 * bo'linadi. `kenglik` — ustun eni (belgi birligi, birlashgan katak uchun yig'indi).
 */
export function matnQatorSoni(matn: string, kenglik: number): number {
  if (!matn) return 1;
  const sigadi = Math.max(8, Math.floor(kenglik * BELGI_KOEF));
  const qatorSoni = (q: string): number => {
    let n = 1;
    let joy = 0;
    for (const soz of q.split(/\s+/).filter(Boolean)) {
      const l = soz.length;
      if (joy === 0) { n += Math.ceil(l / sigadi) - 1; joy = l % sigadi || sigadi; continue; }
      if (joy + 1 + l <= sigadi) { joy += 1 + l; continue; }
      n += Math.ceil(l / sigadi); joy = l % sigadi || sigadi;
    }
    return n;
  };
  return matn.split('\n').reduce((a, s) => a + qatorSoni(s), 0);
}

/**
 * Matn uzunligi bo'yicha qator balandligi (pt); bir qator sig'sa — undefined (ht yozilmaydi, Excel sukuti).
 * `maks` > 0 — eng ko'p N matn qatori (dizayn `qatorMaks`): uzun nom qatorni cheksiz shishirmaydi.
 */
export function balandlik(matn: string, kenglik: number, ptQator = QATOR_PT, maks = 0): number | undefined {
  if (!matn) return undefined;
  const xom = matnQatorSoni(matn, kenglik);
  const qatorlar = maks > 0 ? Math.min(maks, xom) : xom;
  return qatorlar > 1 ? Math.min(409, qatorlar * ptQator + 2) : undefined;
}

/** Qator balandligini belgilaydigan bitta katak: matn, ustun/birlashma eni va uslubi. */
export type BalandlikKatak = {
  matn: string | number | null | undefined;
  /** Ustun eni (birlashgan katak uchun — ko'rinadigan ustunlar yig'indisi). */
  eni: number;
  /** Yashirin / texnik ustun: balandlikka ta'sir QILMAYDI. */
  yashirin?: boolean;
  qalin?: boolean;
  /** Shrift o'lchami (pt); sukut 10. */
  sz?: number;
  /** alignment.indent (nom ustuni). */
  otstup?: number;
};

const KATTA = (m: string) => m.length > 8 && m === m.toUpperCase() && /[А-ЯЁ]/.test(m);

/**
 * Qator balandligi — FAQAT ko'rinadigan matn kataklaridan. Yashirin ustun, son (hech qachon o'ralmaydi) va bo'sh
 * katak hisobga olinmaydi. Bir qator sig'sa — undefined.
 */
export function qatorBalandligi(kataklar: readonly BalandlikKatak[], o?: { maks?: number }): number | undefined {
  let ht: number | undefined;
  for (const k of kataklar) {
    if (k.yashirin || typeof k.matn !== 'string' || !k.matn) continue;
    const sz = k.sz ?? 10;
    const eni = Math.max(4, k.eni - (k.otstup ?? 0) * 1.5) * (10 / sz) * (k.qalin ? 0.88 : 1) * (KATTA(k.matn) ? 0.72 : 1);
    const b = balandlik(k.matn, eni, QATOR_PT * (sz / 10), o?.maks ?? 0);
    if (b) ht = Math.max(ht ?? 0, b);
  }
  return ht;
}
