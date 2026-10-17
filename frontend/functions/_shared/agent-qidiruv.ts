/**
 * Jarvis aniq qidiruvi (egasi 2026-10-15: "«Amfiteatrda M200 beton smetada qanchadan berilgan?» → «menda bunaqa ma'lumot
 * yo'q» — kompaniya ma'lumotidan to'g'ridan-to'g'ri qidirib javob bersin"). Savoldan ikki xil so'z olinadi:
 *   - obyekt nomi uchun lotin/kirill o'zaklar (kichik harf) — obyekt nomlari bilan solishtiriladi;
 *   - smeta resurslari uchun RUSCHA o'zaklar va markalar (katta harf, kirill): o'zbekcha qurilish so'zlari lug'at orqali,
 *     qolganlari transliteratsiya bilan ("beton M200" → БЕТОН, М200). Model chaqirilmaydi — token sarflanmaydi.
 */
const SOZLUK: Record<string, string> = {
  sement: 'ЦЕМЕНТ', tsement: 'ЦЕМЕНТ', gisht: 'КИРПИЧ', "g'isht": 'КИРПИЧ', 'g‘isht': 'КИРПИЧ', qum: 'ПЕСОК', shagal: 'ЩЕБЕН', "shag'al": 'ЩЕБЕН', 'shag‘al': 'ЩЕБЕН',
  suv: 'ВОДА', yogoch: 'ЛЕСОМАТ', "yog'och": 'ЛЕСОМАТ', 'yog‘och': 'ЛЕСОМАТ', taxta: 'ДОСК', temir: 'СТАЛ', boyoq: 'КРАСК', "bo'yoq": 'КРАСК', 'bo‘yoq': 'КРАСК',
  kafel: 'ПЛИТК', plitka: 'ПЛИТК', oyna: 'СТЕКЛ', shisha: 'СТЕКЛ', eshik: 'ДВЕР', deraza: 'ОКН', mix: 'ГВОЗД', sim: 'ПРОВОЛОК', quvur: 'ТРУБ', truba: 'ТРУБ',
  ohak: 'ИЗВЕСТ', gips: 'ГИПС', beton: 'БЕТОН', armatura: 'АРМАТУР', kabel: 'КАБЕЛ', elektrod: 'ЭЛЕКТРОД', qorishma: 'РАСТВОР', rastvor: 'РАСТВОР',
  kran: 'КРАН', ekskavator: 'ЭКСКАВАТОР', buldozer: 'БУЛЬДОЗЕР', samosval: 'САМОСВАЛ', avtomobil: 'АВТОМОБИЛ', mehnat: 'ЗАТРАТЫ', ishchi: 'ЗАТРАТЫ',
  bitum: 'БИТУМ', asfalt: 'АСФАЛЬТ', faner: 'ФАНЕР', profil: 'ПРОФИЛ', list: 'ЛИСТ', setka: 'СЕТК', izolyatsiya: 'ИЗОЛЯЦ', penoplast: 'ПЕНОПЛАСТ',
};
/** Question words that never name a resource or an object. */
const TOXTA = new Set(['qancha', 'qanchadan', 'qanchaga', 'narx', 'narxi', 'narxda', 'narxlar', 'smeta', 'smetada', 'smetadagi', 'smetasi', 'berilgan', 'berildi', 'nima', 'qaysi',
  'bormi', 'necha', 'uchun', 'bilan', 'ham', 'va', 'yoki', 'obyekt', 'obyektda', 'obyektdagi', 'qilingan', 'qilib', 'kerak', 'menga', 'bizda', 'hozir', 'jami', 'summa',
  'summasi', 'hajm', 'hajmi', 'qanday', 'qayerda', 'ayting', 'aytib', 'ber', 'bering', 'korsat', "ko'rsat", 'ko‘rsat', 'sum', "so'm", 'so‘m', 'som', 'dona', 'tonna', 'kub',
  'сколько', 'стоит', 'стоимостью', 'покажи', 'какие', 'есть', 'цена', 'цены', 'смета', 'смете', 'объект', 'объекте', 'какая', 'какой', 'стоимость', 'по', 'на', 'в', 'и', 'для']);
const LAT: Array<[RegExp, string]> = [[/sh/g, 'Ш'], [/ch/g, 'Ч'], [/o['‘’ʻ]/g, 'О'], [/g['‘’ʻ]/g, 'Г'], [/ya/g, 'Я'], [/yu/g, 'Ю'], [/yo/g, 'Ё']];
const HARF: Record<string, string> = { a: 'А', b: 'Б', c: 'Ц', d: 'Д', e: 'Е', f: 'Ф', g: 'Г', h: 'Х', i: 'И', j: 'Ж', k: 'К', l: 'Л', m: 'М', n: 'Н', o: 'О', p: 'П',
  q: 'К', r: 'Р', s: 'С', t: 'Т', u: 'У', v: 'В', w: 'В', x: 'Х', y: 'Й', z: 'З' };
const kirillga = (w: string) => LAT.reduce((s, [re, ch]) => s.replace(re, ch), w.toLowerCase()).replace(/[a-z]/g, ch => HARF[ch] ?? '').toUpperCase().replace(/Ё/g, 'Е');
/** Grade / size marks: M200, В25, A500C, Д10, ПЦ400 — Latin look-alikes become Cyrillic, as in estimate names. */
const MARKA = /^([a-zа-яё]{1,3})-?(\d{1,4})([a-zа-яё]?)$/i;
const LATKIR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У', D: 'Д' };

export function qidiruvSozlari(savol: string): { obyekt: string[]; resurs: string[] } {
  const sozlar = savol.toLowerCase().replace(/[«»"“”()[\],.!?;:]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 40);
  const obyekt = new Set<string>(), resurs = new Set<string>();
  for (const s of sozlar) {
    const toza = s.replace(/^['‘’ʻ]+|['‘’ʻ]+$/g, '');
    if (!toza || TOXTA.has(toza)) continue;
    const m = toza.match(MARKA);
    if (m && /\d/.test(toza)) {
      resurs.add((m[1].toUpperCase().replace(/[A-Z]/g, ch => LATKIR[ch] ?? ch) + m[2] + m[3].toUpperCase().replace(/[A-Z]/g, ch => LATKIR[ch] ?? ch)).replace(/Ё/g, 'Е'));
      continue;
    }
    if (/^\d/.test(toza) || toza.length < 3) continue;
    // Dictionary first (also with Uzbek suffixes: betonni, armaturadan, sementga…).
    const lug = Object.keys(SOZLUK).find(k => toza === k || (toza.startsWith(k) && toza.length - k.length <= 5));
    if (lug) { resurs.add(SOZLUK[lug]); continue; }
    if (/[а-яё]/.test(toza)) { if (toza.length >= 4) { resurs.add(toza.toUpperCase().replace(/Ё/g, 'Е').slice(0, 6)); obyekt.add(toza.slice(0, 5)); } continue; }
    if (toza.length >= 4) {
      obyekt.add(toza.slice(0, 5));
      // Object words are also tried transliterated (Амфитеатр is written in Cyrillic in some objects).
      obyekt.add(kirillga(toza).toLowerCase().slice(0, 5));
    }
  }
  return { obyekt: [...obyekt].slice(0, 8), resurs: [...resurs].slice(0, 6) };
}
