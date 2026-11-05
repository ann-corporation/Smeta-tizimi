/**
 * Narx birligini smeta birligiga o'tkazish — YAGONA sof funksiya (egasi: "birlik mos emas" — narx taxmin qilinmaydi).
 *
 * smetaNarx = manbaNarx × koef.
 *   • o'lcham guruhi bir xil bo'lsa — aniq ko'paytuvchi: кг ↔ т, м ↔ п.м ↔ км, л ↔ м3, шт ↔ 10 шт ↔ 100 шт ↔ 1000 шт,
 *     "10 м", "100 м2", "100 кг" kabi smeta birliklari ham;
 *   • qadoq birligi (мешок, лист, рулон, упак, баллон, ведро…) faqat qadoq tarkibi aniq berilsa: "1 мешок = 50 кг" → т;
 *     "лист 1,2×2,5 = 3 м2" → м2; tarkib bermasa — rad (taxmin yo'q);
 *   • шт ↔ компл, т ↔ м3 (zichlik), mashina-soat — hech qachon.
 * Mavjud `priceUnitFactor` (katalog moslash) ham shu funksiyaga tayanadi.
 */
import { birlikKalit } from '../narx-katalog/kalit';

type Guruh = 'massa' | 'uzunlik' | 'yuza' | 'hajm' | 'dona' | 'komplekt';
/** Birlik kaliti → [guruh, asosiy birlikdagi miqdori]. Kalit = upper + Latin o'xshash harflar kirillga + bo'sh joy/tinish belgilarisiz. */
const ASOS: Record<string, [Guruh, number]> = {
  КГ: ['massa', 1], КИЛОГРАММ: ['massa', 1], Т: ['massa', 1000], ТН: ['massa', 1000], ТОННА: ['massa', 1000], ТОНН: ['massa', 1000], Г: ['massa', 0.001], ЦН: ['massa', 100],
  М: ['uzunlik', 1], ПМ: ['uzunlik', 1], ПОГМ: ['uzunlik', 1], МП: ['uzunlik', 1], МЕТР: ['uzunlik', 1], КМ: ['uzunlik', 1000],
  М2: ['yuza', 1], КВМ: ['yuza', 1], МКВ: ['yuza', 1],
  М3: ['hajm', 1], КУБМ: ['hajm', 1], МКУБ: ['hajm', 1], Л: ['hajm', 0.001], ЛИТР: ['hajm', 0.001],
  ШТ: ['dona', 1], ШТУК: ['dona', 1], ШТУКА: ['dona', 1], ДОНА: ['dona', 1], ЕД: ['dona', 1], ТЫСШТ: ['dona', 1000],
  КОМПЛ: ['komplekt', 1], КОМПЛЕКТ: ['komplekt', 1], КОМП: ['komplekt', 1],
};
/** Qadoq birliklari — narx ularga berilsa, tarkib (qadoq) majburiy. */
const QADOQ = new Set(['МЕШОК', 'МЕШ', 'ЛИСТ', 'РУЛОН', 'УПАК', 'УПАКОВКА', 'ПАЧКА', 'БАЛЛОН', 'ВЕДРО', 'КОРОБКА', 'КАНИСТРА', 'БУХТА', 'ТЮБИК', 'БАНКА', 'ПАЛЛЕТ', 'ПОДДОН', 'ХЛЫСТ']);
/** Uzbek Latin / English unit words are read letter by letter (dona → ДОНА, kubometr → КУБОМЕТР, qop → КОП). */
const LAT: Record<string, string> = { A: 'А', B: 'Б', C: 'С', D: 'Д', E: 'Е', F: 'Ф', G: 'Г', H: 'Х', I: 'И', J: 'Ж', K: 'К', L: 'Л', M: 'М', N: 'Н',
  O: 'О', P: 'П', Q: 'К', R: 'Р', S: 'С', T: 'Т', U: 'У', V: 'В', X: 'Х', Y: 'Й', Z: 'З' };
/** Spelled-out units → the short key. */
const SOZ: Record<string, string> = { КУБМЕТР: 'М3', КУБОМЕТР: 'М3', КУБ: 'М3', МЕТРКУБ: 'М3', КУБИЧЕСКИЙМЕТР: 'М3', КВМЕТР: 'М2', КВАДРАТМЕТР: 'М2',
  КВАДРАТНЫЙМЕТР: 'М2', МЕТРКВ: 'М2', ПОГОННЫЙМЕТР: 'ПМ', ПОГМЕТР: 'ПМ', ТОНН: 'Т', ТОННА: 'Т', ТОННУ: 'Т', КИЛОГРАММ: 'КГ', ЛИТР: 'Л', ШТУКУ: 'ШТ', КОП: 'МЕШОК' };

/** Birlik kaliti: "т." → Т, "м³" → М3, "п.м" → ПМ, "10 шт" → 10ШТ, "тыс. шт" → ТЫСШТ, "kg" → КГ, "so'm/kubometr" → М3. */
export function birlikNormKalit(v: string | null | undefined): string {
  const s = (v ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/(\d),(\d)/g, '$1.$2').replace(/[A-Z]/g, ch => LAT[ch] ?? ch)
    .replace(/[³]/g, '3').replace(/[²]/g, '2')
    // "сум/т", "so'm / kubometr", "за 1 т", "1 т uchun" — the currency and the preposition are not the unit.
    .replace(/^\s*(?:СУМ|СЎМ|СО.?М|УЗС)\s*\/\s*/, '').replace(/^\s*ЗА\s+/, '').replace(/\s+УЧУН\s*$/, '');
  const k = birlikKalit(s.replace(/\./g, ' ')).replace(/^0+(?=\d)/, '');
  const m = /^(\d+(?:\.\d+)?)?(.*)$/.exec(k)!;
  return (m[1] ?? '') + (SOZ[m[2]] ?? m[2]);
}

/** Ko'paytuvchi va asos: "100ШТ" → {n:100, asos:'ШТ'}, "1000М" → {n:1000, asos:'М'}, "М2" → {n:1, asos:'М2'}. */
function ajrat(k: string): { n: number; asos: string } | null {
  if (!k) return null;
  const m = /^(\d+(?:\.\d+)?)?([А-ЯA-Z_]+\d?)$/.exec(k);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 1;
  return Number.isFinite(n) && n > 0 ? { n, asos: m[2] } : null;
}

function olcham(v: string | null | undefined, manba = false): { guruh: Guruh; miqdor: number } | { qadoq: string } | null {
  const p = ajrat(birlikNormKalit(v));
  if (!p) return null;
  // A count in the SOURCE unit ("100 м" in a catalogue) may describe a coil/package — not converted; estimate units
  // ("1000 м", "10 шт", "100 м2") are exact multiples.
  if (manba && p.n !== 1) return null;
  if (QADOQ.has(p.asos)) return { qadoq: p.asos };
  const a = ASOS[p.asos];
  return a ? { guruh: a[0], miqdor: p.n * a[1] } : null;
}

export type Qadoq = { miqdor: number; birlik: string };
export type BirlikOtkazish = { koef: number; izoh: string | null } | { koef: null; sabab: string };

const yaxlit = (v: number) => Number(v.toPrecision(12));

/**
 * Price factor from the source unit to the estimate unit. `qadoq` — the stated content of ONE source unit
 * (a bag of 50 kg, a sheet of 3 m2, a 3 m profile piece); it is used only when the direct conversion is not exact.
 */
export function narxBirlikKoef(manbaBirlik: string | null | undefined, smetaBirlik: string | null | undefined, qadoq?: Qadoq | null): BirlikOtkazish {
  const s = olcham(smetaBirlik);
  if (!s || 'qadoq' in s) return { koef: null, sabab: `smeta birligi noma'lum (${smetaBirlik ?? '—'})` };
  const m = olcham(manbaBirlik, true);
  if (m && 'guruh' in m && m.guruh === s.guruh) {
    const k = yaxlit(s.miqdor / m.miqdor);
    return { koef: k, izoh: k === 1 ? null : `${manbaBirlik} → ${smetaBirlik}: ×${k}` };
  }
  // Package / piece with a stated content: price per package ÷ content → price per content unit → estimate unit.
  if (qadoq && Number.isFinite(qadoq.miqdor) && qadoq.miqdor > 0 && (m == null || 'qadoq' in m || m.guruh !== s.guruh)) {
    const q = olcham(qadoq.birlik);
    if (q && 'guruh' in q && q.guruh === s.guruh && (m == null || 'qadoq' in m || m.guruh === 'dona')) {
      const k = yaxlit(s.miqdor / (qadoq.miqdor * q.miqdor));
      return { koef: k, izoh: `1 ${manbaBirlik ?? 'qadoq'} = ${qadoq.miqdor} ${qadoq.birlik} → ${smetaBirlik}: ×${k}` };
    }
  }
  if (!m) return { koef: null, sabab: `manba birligi noma'lum (${manbaBirlik ?? '—'})` };
  if ('qadoq' in m) return { koef: null, sabab: `qadoq tarkibi berilmagan (${manbaBirlik} → ${smetaBirlik})` };
  return { koef: null, sabab: `birlik mos emas (${manbaBirlik} → ${smetaBirlik})` };
}
