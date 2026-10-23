/**
 * ТН·КМ (т·км) TRANSPORT YORDAMCHISI — toza mantiq (koordinator dizayni 2026-10-24).
 *
 * Transport qatori (birlik ТН·КМ / Т·КМ / ТКМ / т.км — normBir bitta kalit «ТКМ») yonida TAKLIF (blok emas):
 *  - nomdan material kalit so'zi va masofa (km) olinadi («Перевозка: грунт, 120 тн × 15 км»,
 *    «ПЕРЕВОЗКА ГРУНТА АВТОМОБИЛЕМ, РАССТОЯНИЕ ПЕРЕВОЗКИ 15 КМ»);
 *  - A = shu F2 dagi tonnali (Т/ТН) mos material qatorlari Σ tonna × km;
 *  - B = (shu material F2 hajmi ÷ smeta hajmi) × smeta т·км hajmi;
 *  ikkalasi izoh bilan; operator tanlaydi yoki o'zi yozadi. Kalit/masofa aniqlanmasa — taklif yo'q.
 */
import { normBir, normNom } from '../f2-match-engine';

export interface TkmQator { nom: string; birlik: string | null; hajm: number | null }
export interface TkmVariant { qiymat: number; izoh: string }
export interface TkmTaklif { kalit: string; km: number; a: TkmVariant | null; b: TkmVariant | null }

/** Birlik ТН·КМ (ko'paytuvchi bilan ham: «1000 ТН·КМ»). */
export const tkmBirlikmi = (birlik: unknown): boolean => /^\d*ТКМ$/.test(normBir(birlik));

const TONNA = new Set(['Т', 'ТН', 'ТОНН', 'ТОННА', 'ТОННЫ', 'TN']);
const tonnaBirlikmi = (b: unknown): boolean => TONNA.has(normBir(b));
const R6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Masofa (km): «РАССТОЯНИЕ ПЕРЕВОЗКИ 15 КМ» ustuvor, aks holda nomdagi birinchi «N км». */
export function tkmMasofa(nom: string): number | null {
  const s = String(nom ?? '').replace(/ /g, ' ');
  const re = (p: string) => s.match(new RegExp(p, 'i'));
  const m = re('РАССТОЯНИ[ЕЯ][^\\d]{0,30}(\\d+(?:[.,]\\d+)?)\\s*КМ') ?? re('(\\d+(?:[.,]\\d+)?)\\s*КМ(?![А-Яа-яA-Za-z])');
  const v = m ? Number(m[1].replace(',', '.')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Material kalit so'zi (o'zak): «Перевозка: грунт, …» / «ПЕРЕВОЗКА ГРУНТА АВТОМОБИЛЕМ …» → «ГРУНТ». */
export function tkmMaterialKalit(nom: string): string | null {
  const s = String(nom ?? '');
  const i = s.search(/ПЕРЕВОЗК|ПЕРЕВОЗ|TASHISH|ТРАНСПОРТИРОВК/i);
  if (i < 0) return null;
  const qolgan = s.slice(i).replace(/^[^\s:]*[\s:]*/, '');
  for (const w of qolgan.split(/[\s,;:()]+/)) {
    const n = normNom(w);
    if (n.length < 4 || /^\d+$/.test(n) || /^(АВТОМ|АВТОТ|РАССТ|КЛАСС|ГРУЗА|ТОННО|КМ)/.test(n)) continue;
    return n.slice(0, 5);
  }
  return null;
}

const mosMi = (q: TkmQator, kalit: string) => normNom(q.nom).includes(kalit);

export function tkmTaklif(
  tkm: Pick<TkmQator, 'nom'>,
  f2: readonly TkmQator[],
  smeta?: { materiallar: readonly TkmQator[]; tkmHajm: number | null },
): TkmTaklif | null {
  const kalit = tkmMaterialKalit(tkm.nom);
  const km = tkmMasofa(tkm.nom);
  if (!kalit || km == null) return null;

  // A: shu F2 dagi tonnali mos material qatorlari.
  const tonnali = f2.filter((q) => !tkmBirlikmi(q.birlik) && tonnaBirlikmi(q.birlik) && q.hajm != null && q.hajm > 0 && mosMi(q, kalit));
  const tonna = tonnali.reduce((s, q) => s + (q.hajm ?? 0), 0);
  const a: TkmVariant | null = tonnali.length
    ? { qiymat: R6(tonna * km), izoh: `A: ${tonnali.length} ta tonnali «${kalit}…» qator Σ ${R6(tonna)} т × ${km} км` }
    : null;

  // B: (F2 hajmi ÷ smeta hajmi) × smeta т·км — bir xil birlikdagi eng katta smeta materiali bo'yicha.
  let b: TkmVariant | null = null;
  if (smeta && smeta.tkmHajm != null && smeta.tkmHajm > 0) {
    const smetaBirlik = new Map<string, number>();
    for (const q of smeta.materiallar) if (q.hajm != null && q.hajm > 0 && mosMi(q, kalit) && !tkmBirlikmi(q.birlik)) smetaBirlik.set(normBir(q.birlik), (smetaBirlik.get(normBir(q.birlik)) ?? 0) + q.hajm);
    const eng = [...smetaBirlik].sort((x, y) => y[1] - x[1])[0];
    if (eng) {
      const [birlik, smetaH] = eng;
      const f2H = f2.filter((q) => !tkmBirlikmi(q.birlik) && q.hajm != null && q.hajm > 0 && mosMi(q, kalit) && normBir(q.birlik) === birlik).reduce((s, q) => s + (q.hajm ?? 0), 0);
      if (f2H > 0) b = { qiymat: R6((f2H / smetaH) * smeta.tkmHajm), izoh: `B: F2 ${R6(f2H)} ÷ smeta ${R6(smetaH)} (${birlik}) × smeta ${R6(smeta.tkmHajm)} т·км` };
    }
  }
  return a || b ? { kalit, km, a, b } : null;
}
