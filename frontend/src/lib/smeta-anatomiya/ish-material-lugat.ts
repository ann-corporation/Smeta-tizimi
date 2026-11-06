/**
 * SMETA YADROSI — ish ↔ material bog'lanishi uchun kalit so'z lug'atlari (egasi 2026-11-06, «ish–material muvofiqligi»).
 * Yagona joy: boshqa modul o'z lug'atini yozmaydi. Barcha qoliplar `nomKaliti` dan o'tgan matnga qo'llanadi
 * (katta harf, Ё→Е, lotin o'xshash harflar kirillga, bo'shliqlar bitta).
 */

const LOTIN: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };

/** Nom kaliti: katta harf, Ё→Е, lotin o'xshash harflar kirillga, bo'shliqlar bitta. */
export function nomKaliti(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ABCEHKMOPTXY]/g, (c) => LOTIN[c] ?? c).replace(/\s+/g, ' ').trim();
}

/** Materialsiz ishlar (sinov, yuvish, sozlash, o'lchash, demontaj, yuk tashish …) — keyingi material ularga bog'lanmaydi. */
export const MATERIALSIZ_ISH = /(ИСПЫТАН|ПРОМЫВК|ДЕЗИНФЕК|ПУСКОНАЛАД|НАЛАДК|ИЗМЕРЕН|ПРОВЕРК|ДЕМОНТАЖ|РАЗБОРК|ПОГРУЗ|ПЕРЕВОЗ|ТРАНСПОРТ)/;

/** O'rnatish ishi — uskuna faqat shunday ishga bog'lanishi mumkin. */
export const ORNATISH_ISH = /(МОНТАЖ|УСТАНОВК|ПОДКЛЮЧ|ПРОКЛАДК|ПОДВЕСК|КРЕПЛЕН)/;

/**
 * Mustaqil (ishga ergashmaydigan) materiallar: mebel, furnitura, MDF panellar, elektronika. Umumiy o'zak bo'lmasa —
 * ishga bog'lanmaydi (FaktJurnal ularni boshqa ishga taklif qilmaydi).
 */
export const MUSTAQIL_MATERIAL = /(^|[^А-Я])(МЕБЕЛ|ШКАФ|СТОЛ(Ы|А|ОВ)?([^А-Я]|$)|СТУЛ|КРЕСЛ|ДИВАН|ТУМБ|СТЕЛЛАЖ|КРОВАТ|ФУРНИТУР|МДФ|ВИДЕОРЕГИСТРАТОР|РЕГИСТРАТОР|ДИСК|НАКОПИТЕЛ|КОМПЬЮТЕР|НОУТБУК|МОНИТОР|ТЕЛЕВИЗОР|ПРИНТЕР|ИНВЕНТАР)/;

/** Ma'no guruhi: ish nomi va material nomi bir guruhga tushsa — umumiy o'zak bor. Tartib muhim (birinchi mos guruh). */
export type ManoGuruh = { kalit: string; ish: RegExp; mat: RegExp; istisno?: RegExp };

export const MANO_GURUHLARI: readonly ManoGuruh[] = [
  { kalit: 'VITRAJ', ish: /ВИТРАЖ/, mat: /ВИТРАЖ/ },
  { kalit: 'OKNO', ish: /(ОКОН|ОКН[ОАЫ])/, mat: /(ОКОН|ОКН[ОАЫ])/ },
  { kalit: 'DVER', ish: /ДВЕР/, mat: /ДВЕР/ },
  { kalit: 'KABEL', ish: /КАБЕЛ/, mat: /КАБЕЛ/ },
  { kalit: 'PROVOD', ish: /(^|[^А-Я])ПРОВОД/, mat: /(^|[^А-Я])ПРОВОД/ },
  { kalit: 'GOFR', ish: /ГОФР/, mat: /ГОФР/ },
  { kalit: 'TRUBA', ish: /ТРУБ/, mat: /ТРУБ/ },
  { kalit: 'GKL', ish: /(ГКЛ|ГВЛ|ГИПСОКАРТОН|ГИПСОВОЛОКН)/, mat: /(ГКЛ|ГВЛ|ГИПСОКАРТОН|ГИПСОВОЛОКН)/ },
  { kalit: 'BLOK', ish: /БЛОК/, mat: /БЛОК/, istisno: /(ОКОН|ДВЕР|УПРАВЛЕН|ПИТАН|РОЗЕТ)/ },
  { kalit: 'KIRPICH', ish: /КИРПИЧ/, mat: /КИРПИЧ/ },
  {
    kalit: 'ARMATURA',
    ish: /(АРМАТУР|АРМИРОВ|ЖЕЛЕЗОБЕТОН|МОНОЛИТ|БЕТОН|ФУНДАМЕНТ|КОЛОНН|РИГЕЛ|БАЛ(ОК|К)|ПЕРЕКРЫТ|РОСТВЕРК|ДИАФРАГМ)/,
    mat: /АРМАТУР/,
    istisno: /(ЗАПОРН|ТРУБОПРОВОДН|РЕГУЛИРУЮЩ|САНТЕХН|ОСВЕТИТ|ВОДОРАЗБОР)/,
  },
  { kalit: 'UTEPL', ish: /(УТЕПЛ|ТЕПЛОИЗОЛ|МИНВАТ|МИНЕРАЛОВАТ|ПЕНОПЛЕКС|ПЕНОПОЛИСТИР|ЭКСТРУД)/, mat: /(УТЕПЛ|ТЕПЛОИЗОЛ|МИНВАТ|МИНЕРАЛОВАТ|ПЕНОПЛЕКС|ПЕНОПОЛИСТИР|ЭКСТРУД)/ },
  { kalit: 'IZOL', ish: /(ГИДРОИЗОЛ|ПАРОИЗОЛ|ИЗОЛЯЦ|ИЗОЛИР)/, mat: /(ГИДРОИЗОЛ|ПАРОИЗОЛ|ИЗОЛЯЦ|ИЗОЛИР)/ },
  { kalit: 'BETON', ish: /(БЕТОН|МОНОЛИТ)/, mat: /БЕТОН/, istisno: /(ГАЗОБЕТОН|ПЕНОБЕТОН)/ },
  { kalit: 'RASTVOR', ish: /РАСТВОР/, mat: /РАСТВОР/ },
  { kalit: 'PLITKA', ish: /(ПЛИТК|КЕРАМОГРАНИТ|КАФЕЛ)/, mat: /(ПЛИТК|КЕРАМОГРАНИТ|КАФЕЛ)/ },
  { kalit: 'POL', ish: /(ЛИНОЛЕУМ|ЛАМИНАТ|ПАРКЕТ)/, mat: /(ЛИНОЛЕУМ|ЛАМИНАТ|ПАРКЕТ)/ },
  { kalit: 'PROFLIST', ish: /(ПРОФНАСТИЛ|ПРОФЛИСТ|ПРОФИЛИРОВАН)/, mat: /(ПРОФНАСТИЛ|ПРОФЛИСТ|ПРОФИЛИРОВАН)/ },
  { kalit: 'KRASKA', ish: /(ОКРАС|ОКРАШ|КРАСК|ЭМАЛ)/, mat: /(КРАСК|ЭМАЛ)/ },
  { kalit: 'SHTUKATUR', ish: /(ШТУКАТУР|ШПАКЛ|ШПАТЛ)/, mat: /(ШТУКАТУР|ШПАКЛ|ШПАТЛ)/ },
  { kalit: 'SVET', ish: /(СВЕТИЛЬН|ЛАМП|ПРОЖЕКТОР)/, mat: /(СВЕТИЛЬН|ЛАМП|ПРОЖЕКТОР)/ },
  { kalit: 'RADIATOR', ish: /(РАДИАТОР|КОНВЕКТОР)/, mat: /(РАДИАТОР|КОНВЕКТОР)/ },
  { kalit: 'INERT', ish: /(ПЕС(ОК|КА|ЧАН)|ЩЕБ|ГРАВИ|ПГС)/, mat: /(ПЕС(ОК|КА|ЧАН)|ЩЕБ|ГРАВИ|ПГС)/ },
  { kalit: 'ASFALT', ish: /АСФАЛЬТ/, mat: /АСФАЛЬТ/ },
  { kalit: 'BORT', ish: /(БОРТОВ|БОРДЮР)/, mat: /(БОРТОВ|БОРДЮР)/ },
];

/** Umumiy o'zak qidirishda e'tiborsiz qoldiriladigan 6 harfli boshlar (ish fe'llari va umumiy so'zlar). */
const UMUMIY_BOSH = new Set([
  'УСТАНО', 'УСТРОЙ', 'МОНТАЖ', 'ПРОКЛА', 'ОБЛИЦО', 'ОКРАСК', 'ПОКРЫТ', 'РАЗМЕР', 'ДИАМЕТ', 'ТОЛЩИН', 'СЕЧЕНИ', 'ПРОЧИЕ',
  'ПРОЧИХ', 'МАТЕРИ', 'ИЗДЕЛИ', 'ВНУТРЕ', 'НАРУЖН', 'ПРОЕКТ', 'СТАЛЬН', 'ПЛОЩАД', 'ОТДЕЛЬ', 'МЕТАЛЛ', 'ЭЛЕМЕН', 'КОНСТР',
  'ПОМЕЩЕ', 'ЗДАНИЯ', 'ЗДАНИЙ', 'ПРИМЕН', 'КРЕПЛЕ', 'ПОДКЛЮ', 'ПОВЕРХ', 'ОСНОВА', 'ЗАПОЛН', 'РАБОТЫ', 'ГОТОВЫ', 'МАРКИР',
  'ВЫСОТО', 'ДЛИНОЙ', 'ШИРИНО', 'ПЛОСКИ', 'КАЖДЫЙ', 'КАЖДЫЕ', 'ОДНОГО', 'ИЗМЕНЕ', 'ДОБАВЛ', 'ИСКЛЮЧ', 'ТИПОВО', 'СБОРНЫ',
]);

const tokenlar = (s: string) => s.match(/[А-Я]{6,}/g) ?? [];

/**
 * Ish va material nomidagi umumiy ma'no kaliti: avval lug'at guruhi, bo'lmasa umumiy 6 harfli o'zak (umumiy so'zlarsiz).
 * Topilmasa null. Natija D-guruh kaliti sifatida ham ishlatiladi.
 */
export function manoKaliti(ishNom: string | null | undefined, matNom: string | null | undefined): string | null {
  const i = nomKaliti(ishNom); const m = nomKaliti(matNom);
  if (!i || !m) return null;
  for (const g of MANO_GURUHLARI) {
    if (g.istisno && g.istisno.test(m)) continue;
    if (g.ish.test(i) && g.mat.test(m)) return g.kalit;
  }
  const ishBosh = new Set(tokenlar(i).map((t) => t.slice(0, 6)).filter((t) => !UMUMIY_BOSH.has(t)));
  const umumiy = tokenlar(m).map((t) => t.slice(0, 6)).find((t) => ishBosh.has(t));
  return umumiy ? `oz:${umumiy}` : null;
}

export const materialsizIshmi = (nom: string | null | undefined) => MATERIALSIZ_ISH.test(nomKaliti(nom));
export const ornatishIshimi = (nom: string | null | undefined) => ORNATISH_ISH.test(nomKaliti(nom));
export const mustaqilMaterialmi = (nom: string | null | undefined) => MUSTAQIL_MATERIAL.test(nomKaliti(nom));

/**
 * Farqli o'lchamlar uchun ma'lum smeta nisbatlari (asos birliklarda: material / ish). Ro'yxatda yo'q juftlik — noma'lum
 * (bog'lanish «shubhali», signal chiqmaydi). Armatura: 5–300 kg/м³ = 0,005–0,3 т/м³.
 */
export const OLCHAM_ORALIQ: Readonly<Record<string, readonly [number, number]>> = {
  'Т/М3': [0.005, 0.3],
  'М3/М2': [0.001, 0.3],
  'ШТ/М3': [5, 1000],
};
