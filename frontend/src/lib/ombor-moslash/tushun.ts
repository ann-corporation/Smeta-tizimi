/**
 * Omborchi gapini tushunish (sof funksiyalar, tarmoq/DB yo'q): «10 qop sement keldi», «Akmaldan 2 tonna armatura 12 lik oldik 8 mln»,
 * «5 ta lampa chiqdi 3-blokka», «пришло 20 мешков цемента».
 *
 * 1) `xomOqi` — deterministik qism-qism ajratish: yo'nalish (kirim/chiqim so'zlari, imlo xatosi bilan), miqdor+birlik (raqam so'zlari ham),
 *    material nomi, yetkazuvchi/qabul qiluvchi, obyekt (blok), sana, narx (ming/mln, QQS bilan/siz, birlik yoki jami).
 * 2) `tarixdanMosla` — nomni (material/yetkazuvchi) kompaniyaning O'Z tarixiga noaniq moslash (lotin/kirill, imlo xatosi, rus kelishigi).
 * 3) `savolYasa` — tushunib bo'lmagan/noaniq joyda BITTA qisqa aniqlovchi savol + takliflar («tushunmadim» o'rniga).
 *
 * Hech narsa o'ylab topilmaydi: topilmagan maydon null. Server (ombor-buyruq.ts) shu natijani PREVIEW + tasdiq tokeniga aylantiradi; yozuv faqat tasdiqdan keyin.
 */
import { yaxlit2 } from '../hisob-yadro/yaxlit';
import { narxRejimMatndan, type NarxRejim } from './narx';
import { nomTokenlari, trigramO_xshashlik } from './moslash';
import type { TaklifYozuv } from './taklif';

export type Yonalish = 'prixod' | 'chiqim';
export type Qisman = {
  /** matnda aniq aytilgan yo'nalish */
  yonalish: Yonalish | null;
  /** aniq so'z yo'q, lekin ishora bor («Akmaldan» → kirim, «3-blokka» → chiqim) */
  taxmin: Yonalish | null;
  miqdor: number | null;
  /** miqdor raqam so'zidan («o'n besh») olindi — LLM tekshiruvi tavsiya */
  miqdorSozdan: boolean;
  birlik: string | null;
  nomi: string | null;
  kontragent: string | null;
  obyekt: string | null;
  sana: string | null;
  /** BIRLIK narxi, matndagi rejimda (QQS bilan/siz); jami summadan miqdorga bo'lib hisoblanadi */
  narx: number | null;
  narx_rejim: NarxRejim | null;
  narx_jami: number | null;
  eslatmalar: string[];
};

const L = '(?<![\\p{L}\\d])';
const R = '(?![\\p{L}\\d])';
const rx = (s: string, f = 'iu') => new RegExp(s, f);

/* ───────────── birliklar ───────────── */
const BIRLIKLAR: [string, string][] = [
  ['qop(?:lar)?|қоп(?:лар)?|мешк\\p{L}*|мешок|meshok\\p{L}*|bag', 'мешок'],
  ['tonna\\p{L}*|tonn\\p{L}*|тонн\\p{L}*|тн|tn|т|t', 'тн'],
  ['kg|kgr|kilogramm\\p{L}*|kilo|кг|килограмм\\p{L}*|кило', 'кг'],
  ['dona\\p{L}*|дона\\p{L}*|ta|та|шт|штук\\p{L}*|sht|pcs', 'шт'],
  ['m3|м3|m³|м³|kub\\p{L}*|куб\\p{L}*', 'м3'],
  ['m2|м2|m²|м²|kv\\.?\\s*m|кв\\.?\\s*м|kvadrat\\p{L}*|квадрат\\p{L}*', 'м2'],
  ['metr\\p{L}*|метр\\p{L}*|m|м|pm', 'м'],
  ['litr\\p{L}*|литр\\p{L}*|l|л', 'л'],
  ['rulon\\p{L}*|рулон\\p{L}*', 'рулон'],
  ['komplekt\\p{L}*|комплект\\p{L}*', 'комплект'],
  ['upakovka\\p{L}*|упаковк\\p{L}*|упак', 'упак'],
  ['pochka\\p{L}*|pachka\\p{L}*|пачк\\p{L}*|почк\\p{L}*', 'почка'],
  ['korobka\\p{L}*|коробк\\p{L}*|quti\\p{L}*', 'коробка'],
  ['list(?:lar)?|лист\\p{L}*', 'лист'],
  ['buxta\\p{L}*|бухт\\p{L}*', 'бухта'],
  ['juft\\p{L}*|пар[аы]?', 'пара'],
];
const BIRLIK_HAMMASI = BIRLIKLAR.map(([a]) => `(?:${a})`).join('|');
const BIRLIK_RE = BIRLIKLAR.map(([a, k]) => [rx(`^(?:${a})$`), k] as [RegExp, string]);
const birlikKanon = (s: string): string => {
  const x = s.toLowerCase().replace(/\s+/g, '');
  return BIRLIK_RE.find(([re]) => re.test(x))?.[1] ?? x;
};
/** Ruscha birlikning ko'plik/jinsiy kelishigi («мешков», «штук», «тонн»): undan keyingi so'z ham jinsiy kelishikda («цемента») */
const RUS_JINSIY = /^(?:мешков|мешка|штук|тонн|тонны|метров|литров|килограмм|рулонов|кубов|комплектов|пачек|упаковок|листов|пар)$/iu;

const KOP_SOZ = 'ming|тыс\\p{L}*|mln|million\\p{L}*|млн|миллион\\p{L}*|mlrd|млрд|миллиард\\p{L}*';
const KOP_QIYMAT = (s: string): number => (/^(?:ming|тыс)/i.test(s) ? 1e3 : /^(?:mlrd|млрд|миллиард)/i.test(s) ? 1e9 : 1e6);
const PUL_BIRLIK = "so'm\\p{L}*|som|sum|сум(?:а|ы|ов)?|сўм\\p{L}*|uzs";
const SON = '\\d+(?:[.,]\\d+)?';
const PUL_SON = '\\d+(?:[ \\u00a0]\\d{3})*(?:[.,]\\d+)?';
const sonOl = (s: string): number => Number(s.replace(/[\s ]/g, '').replace(',', '.'));

/* ───────────── raqam so'zlari (1–99, 100): «o'n besh qop» ───────────── */
const BIR: Record<string, number> = { bir: 1, ikki: 2, uch: 3, "to'rt": 4, tort: 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, "to'qqiz": 9, toqqiz: 9, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, бир: 1, икки: 2, уч: 3, тўрт: 4, беш: 5, олти: 6, етти: 7, саккиз: 8, тўққиз: 9 };
const ON: Record<string, number> = { "o'n": 10, on: 10, yigirma: 20, "o'ttiz": 30, ottiz: 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90, десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, ўн: 10, йигирма: 20, ўттиз: 30, қирқ: 40, эллик: 50, юз: 100, yuz: 100, сто: 100 };
const SOZ_SON = Object.keys({ ...BIR, ...ON }).sort((a, b) => b.length - a.length).join('|');
function sozlarSoni(s: string): number | null {
  let j = 0, bor = false;
  for (const t of s.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (t in ON) { j += ON[t]; bor = true; } else if (t in BIR) { j += BIR[t]; bor = true; } else return null;
  }
  return bor && j > 0 ? j : null;
}

/* ───────────── yo'nalish so'zlari ───────────── */
const KIRIM_FEL = ['keldi', 'kelti', 'keldik', 'kelgan', 'keltirildi', 'keltirdik', 'oldik', 'oldim', 'olindi', 'qabul', 'kirim', 'kirdi', 'tushdi', 'tushti', 'yetkazildi', 'prixod', 'prihod',
  'приход', 'пришло', 'пришел', 'пришли', 'пришла', 'прибыло', 'привезли', 'завезли', 'получили', 'получено', 'получил', 'принято', 'принял', 'поступило', 'поступил', 'келди', 'келган', 'олдик', 'олдим', 'кирим', 'тушди', 'кирди'];
const CHIQIM_FEL = ['chiqdi', 'chiqim', 'chiqarildi', 'chiqardik', 'berildi', 'berdik', 'berdim', 'berdi', 'bering', 'ketdi', 'ketti', 'sarflandi', 'sarfladik', 'ishlatildi', 'ishlatdik', 'rasxod', 'rashod', 'sarf', "jo'natildi", 'yuborildi', 'yubordik', 'oldi', 'olishdi',
  'расход', 'выдано', 'выдали', 'выдал', 'выдан', 'отпущено', 'отпустили', 'отпущен', 'списано', 'списали', 'ушло', 'ушли', 'потрачено', 'потратили', 'взял', 'взяли', 'забрали', 'кетди', 'чикди', 'чиқди', 'берилди', 'бердик', 'бердим', 'чиқим', 'олди'];

function edit(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
/** Token yo'nalish so'zimi: aniq/prefiks, yoki 1 harf xato (faqat uzun so'zlar: «oldi»/«oldik» chalkashmasin). */
function felTur(tok: string): Yonalish | null {
  const t = tok.toLowerCase().replace(/[.,;:!?]+$/g, '');
  if (t.length < 3) return null;
  const mos = (arr: string[]): boolean => arr.some((f) => t === f || (f.length >= 5 && t.length <= f.length + 4 && t.startsWith(f)) || (f.length >= 5 && t.length >= 4 && edit(t, f) <= 1));
  const k = mos(KIRIM_FEL), c = mos(CHIQIM_FEL);
  return k && !c ? 'prixod' : c && !k ? 'chiqim' : k && c ? (CHIQIM_FEL.includes(t) ? 'chiqim' : 'prixod') : null;
}

const TO_XTASH = new Set(['bugun', 'bugungi', 'kecha', 'kechagi', 'ombor', 'omborga', 'omborda', 'ombordan', 'omborni', 'sklad', 'skladga', 'склад', 'склада', 'на', 'в', 'из', 'со', 'для', 'по', 'от', 'за', 'у', 'и', 'va', 'bilan', 'uchun', 'ham', 'yana', 'mana', 'bizga', 'biz', 'bu', 'это',
  'iltimos', 'пожалуйста', 'please', 'dan', 'ga', 'ni', 'ning', 'da', 'ta', 'dona', 'qqs', 'nds', 'ндс', 'narxi', 'narx', 'цена', 'цене', 'jami', 'umumiy', 'hammasi', 'summa', 'итого', 'всего', 'сумма', 'so\'m', 'som', 'сум', 'сўм', 'uzs', 'har', 'bir', 'po', 'шт', 'kg', 'кг', 'сегодня', 'вчера', 'бугун', 'кеча', 'ham', 'hozir', 'только', 'тоже', 'мы', 'нам', 'мне']);
const KONTRAGENT_RAD = new Set(['ombor', 'sklad', 'склад', 'bugun', 'kecha', 'bozor', 'baza', 'база', 'sex', 'uy', 'tonna', 'dona']);
const RUS_ISTISNO: Record<string, string> = { песка: 'песок', щебня: 'щебень', гвоздей: 'гвозди', кирпича: 'кирпич', цемента: 'цемент' };
function rusJinsiy(t: string): string {
  const l = t.toLowerCase();
  if (RUS_ISTISNO[l]) return RUS_ISTISNO[l];
  if (!/^[а-я]+$/i.test(t) || t.length < 5) return t;
  if (/[ыи]$/i.test(t)) return t.slice(0, -1) + 'а';
  if (/ов$|ев$/i.test(t)) return t.slice(0, -2);
  if (/а$/i.test(t)) return t.slice(0, -1);
  return t;
}

const sanaHisobla = (hozir: Date, farq: number): string => new Date(hozir.getTime() + 5 * 3600_000 + farq * 86400_000).toISOString().slice(0, 10);
const sanaYaroq = (y: number, o: number, k: number): string | null => {
  const s = `${y}-${String(o).padStart(2, '0')}-${String(k).padStart(2, '0')}`; const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
};
const bosh = (v: string | null | undefined, n = 200): string | null => { const s = (v ?? '').replace(/\s+/g, ' ').replace(/^[\s,;:.\-–]+|[\s,;:.\-–]+$/g, ''); return s ? s.slice(0, n) : null; };

/** Gapni qism-qism ajratadi. Yo'nalish/miqdor/nom topilmasa tegishli maydon null (chaqiruvchi savol beradi yoki LLM ga o'tadi). */
export function xomOqi(matn: string, hozir: Date = new Date()): Qisman {
  let w = String(matn ?? '').normalize('NFKC').replace(/[ʻʼ’‘`´]/g, "'").replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const q: Qisman = { yonalish: null, taxmin: null, miqdor: null, miqdorSozdan: false, birlik: null, nomi: null, kontragent: null, obyekt: null, sana: null, narx: null, narx_rejim: null, narx_jami: null, eslatmalar: [] };
  const olib = (re: RegExp, fn?: (m: RegExpExecArray) => void): boolean => { const m = re.exec(w); if (!m) return false; fn?.(m); w = w.slice(0, m.index) + ' ' + w.slice(m.index + m[0].length); return true; };

  // QQS rejimi («QQS bilan», «ndssiz», «с НДС»)
  const rj = narxRejimMatndan(w); q.narx_rejim = rj.rejim; w = rj.qolgan;
  // sana
  olib(rx(`${L}(kecha|вчера|кеча)${R}`), () => { q.sana = sanaHisobla(hozir, -1); });
  olib(rx(`${L}(bugun|сегодня|бугун)${R}`), () => { q.sana ??= sanaHisobla(hozir, 0); });
  olib(rx('\\b(\\d{4})-(\\d{2})-(\\d{2})\\b'), (m) => { q.sana = sanaYaroq(+m[1], +m[2], +m[3]); });
  olib(rx(`${L}(\\d{1,2})[./](\\d{1,2})[./](\\d{4})${R}`), (m) => { q.sana = sanaYaroq(+m[3], +m[2], +m[1]); });
  // obyekt: «3-blokka», «blok 3», «объект Тест»
  if (!olib(rx(`(?<![\\p{L}\\d.,])(\\d{1,3})\\s*-?\\s*(?:chi\\s*|чи\\s*)?(blok|блок|korpus|корпус)\\p{L}*`), (m) => { q.obyekt = `${m[1]}-${m[2].toLowerCase()}`; })) {
    if (!olib(rx(`${L}(blok|блок|korpus|корпус)\\s*-?\\s*(\\d{1,3})${R}`), (m) => { q.obyekt = `${m[2]}-${m[1].toLowerCase()}`; })) {
      olib(rx(`${L}(?:obyekt\\p{L}*|объект\\p{L}*|uchastka\\p{L}*|участок\\p{L}*)\\s+([\\p{L}][\\p{L}\\d'-]*)`), (m) => { q.obyekt = bosh(m[1].replace(/(?:ga|ka|qa)$/i, '') || m[1]); });
    }
  }
  if (q.obyekt) q.taxmin = 'chiqim';

  // yetkazuvchi / qabul qiluvchi
  const KOMP = 'MChJ|OOO|ООО|ИП|ЯТТ|АЖ|AJ|firma|фирма|savdo|trans|group|qurilish|строй|трейд|snab|снаб';
  const kirimFelBor = w.split(/[\s,;:!?]+/).some((t) => felTur(t) === 'prixod');
  const rolM = /(?<![\p{L}\d])(?:от|поставщик\p{L}*|postavshik\p{L}*|yetkazuvchi\p{L}*|kimdan)\s+(?:(?:ООО|ИП|MChJ|OOO)\s+)?([\p{L}][\p{L}\d'’-]*)/iu.exec(w);
  if (rolM && !KONTRAGENT_RAD.has(rolM[1].toLowerCase())) {
    let son = rolM.index + rolM[0].length; let nomi = rolM[1];
    // bosh harfli bo'lsa, keyingi bosh harfli so'zlar ham nomga kiradi (ko'pi bilan 2 ta)
    if (/^\p{Lu}/u.test(nomi)) for (let i = 0; i < 2; i++) { const e = /^\s+(\p{Lu}[\p{L}\d'’-]*)/u.exec(w.slice(son)); if (!e) break; nomi += ' ' + e[1]; son += e[0].length; }
    q.kontragent = bosh(nomi); w = w.slice(0, rolM.index) + ' ' + w.slice(son); q.taxmin ??= 'prixod';
  }
  if (!q.kontragent) {
    const dm = new RegExp(`(?<![\\p{L}\\d])([\\p{L}][\\p{L}\\d'’-]*?)((?:\\s+(?:${KOMP})(?![\\p{L}\\d]))*)\\s*(?:dan|дан|tan|тан)(?![\\p{L}\\d])`, 'iu').exec(w);
    if (dm && dm[1].length >= 2 && !KONTRAGENT_RAD.has(dm[1].toLowerCase()) && !rx(`^(?:${BIRLIK_HAMMASI})$`).test(dm[1])) {
      q.kontragent = bosh(dm[1] + dm[2]); w = w.slice(0, dm.index) + ' ' + w.slice(dm.index + dm[0].length); q.taxmin ??= 'prixod';
    }
  }
  if (!q.kontragent) {
    const rm = /(?<![\p{L}\d])(?:prorab(?:ga)?|прораб(?:у)?|brigada(?:ga)?|бригад\p{L}*|bригадир\p{L}*|usta(?:ga)?|мастер\p{L}*|для|kimga)\s+(\p{Lu}[\p{L}\d'’-]*)/u.exec(w)
      ?? (kirimFelBor ? null : /(?<![\p{L}\d])(\p{Lu}[\p{L}'’-]{2,}?)(?:ga|ka|qa)(?![\p{L}\d])/u.exec(w));
    if (rm) { q.kontragent = bosh(rm[1].replace(/(?:ga|ka|qa)$/i, '').replace(/(?<=[а-я]{4})[уюУЮ]$/, '')); w = w.slice(0, rm.index) + ' ' + w.slice(rm.index + rm[0].length); q.taxmin ??= 'chiqim'; }
  }

  // o'lcham: «12 lik», «12-li», «12 mm» → nomga raqam sifatida
  const olcham: string[] = [];
  w = w.replace(rx(`(?<![\\p{L}\\d.,§])(${SON})\\s*-?\\s*(?:lik|li|лик|ли|mm|мм)(?![\\p{L}\\d])`), (_m, n: string) => { olcham.push(n.replace(',', '.')); return ' §' + (olcham.length - 1) + '§ '; });

  // raqam so'zi + birlik → raqam («o'n besh qop» → 15 qop)
  let sozdanSon: number | null = null;
  w = w.replace(rx(`${L}((?:(?:${SOZ_SON})\\s+){0,2}(?:${SOZ_SON}))\\s+(?=(?:${BIRLIK_HAMMASI})${R})`), (m, s: string) => { const n = sozlarSoni(s); if (!n) return m; sozdanSon = n; return ` ${n} `; });

  // miqdor + birlik
  let birlikXom: string | null = null;
  olib(rx(`(?<![\\p{L}\\d.,§-])(${SON})\\s*(ming|тыс\\p{L}*)?\\s*(${BIRLIK_HAMMASI})${R}`), (m) => {
    q.miqdor = sonOl(m[1]) * (m[2] ? 1000 : 1); birlikXom = m[3]; q.birlik = birlikKanon(m[3]);
    q.miqdorSozdan = sozdanSon != null && sonOl(m[1]) === sozdanSon;
  });

  // narx
  const rejimAniq = q.narx_rejim != null;
  // Narx: yalang'och («8 mln», «45 ming») va «narxi/цена/по» — BIRLIK narxi (#611 qoidasi); «jami/umumiy/итого/всего/за 14 млн» — jami summa (miqdorga bo'linadi).
  let narxXom = null as number | null; let narxTur: 'birlik' | 'jami' = 'birlik';
  const BIRLIK_NARX = "narx\\p{L}*|цена|цене|цену|baho\\p{L}*|po|по|har\\s*bir\\p{L}*|har\\s+dona\\p{L}*|за\\s+(?:шт|штуку|единицу|кг|тонну|мешок)";
  const JAMI_NARX = "jami|umumiy|hammasi|barchasi|summa\\p{L}*|сумма|сумму|итого|всего|на\\s+сумму|за|stoimost\\p{L}*|стоимост\\p{L}*|to'lov|oplata|оплат\\p{L}*";
  const nm = rx(`(?<![\\p{L}\\d])(?:(${BIRLIK_NARX})|(${JAMI_NARX}))\\s*[:=-]?\\s*(${PUL_SON})(?:\\s*(${KOP_SOZ}))?(?:\\s*(?:${PUL_BIRLIK}))?(?!\\s*(?:${BIRLIK_HAMMASI})${R})(?![\\p{L}\\d])`).exec(w);
  const pulOl = (m: RegExpExecArray, i: number, kop: number | null) => { narxXom = Math.round(sonOl(m[i]) * (kop ?? 1) * 100) / 100; };
  if (nm) { narxTur = nm[1] ? 'birlik' : 'jami'; pulOl(nm, 3, nm[4] ? KOP_QIYMAT(nm[4]) : null); w = w.slice(0, nm.index) + ' ' + w.slice(nm.index + nm[0].length); }
  if (narxXom == null) {
    const p2 = rx(`(?<![\\p{L}\\d.,§])(${SON})\\s*(${KOP_SOZ})(?![\\p{L}\\d])(?:\\s*(?:${PUL_BIRLIK}))?(?!\\s*(?:${BIRLIK_HAMMASI})${R})`).exec(w);
    if (p2) { pulOl(p2, 1, KOP_QIYMAT(p2[2])); w = w.slice(0, p2.index) + ' ' + w.slice(p2.index + p2[0].length); }
  }
  if (narxXom == null) {
    const p3 = rx(`(?<![\\p{L}\\d.,§])(${PUL_SON})\\s*(?:${PUL_BIRLIK})(?![\\p{L}\\d])`).exec(w);
    if (p3) { pulOl(p3, 1, null); w = w.slice(0, p3.index) + ' ' + w.slice(p3.index + p3[0].length); }
  }
  if (narxXom == null) {
    // QQS aytilgan yoki katta yalang'och son (≥ 5 raqam): narx
    const p4 = rx(`(?<![\\p{L}\\d.,§])(${rejimAniq ? '\\d{4,}|\\d{1,3}(?:[ \\u00a0]\\d{3})+' : '\\d{5,}|\\d{1,3}(?:[ \\u00a0]\\d{3}){2,}'}(?:[.,]\\d+)?)(?![\\p{L}\\d.,])`).exec(w);
    if (p4) { pulOl(p4, 1, null); w = w.slice(0, p4.index) + ' ' + w.slice(p4.index + p4[0].length); }
  }
  // birlik so'zisiz miqdor: qolgan birinchi oddiy son
  if (q.miqdor == null) {
    olib(rx(`(?<![\\p{L}\\d.,§-])(${SON})(?![\\p{L}\\d.,])`), (m) => { q.miqdor = sonOl(m[1]); });
  }
  if (q.miqdor != null && !(q.miqdor > 0 && q.miqdor <= 1e9)) q.miqdor = null;
  if (narxXom != null) {
    if (narxTur === 'birlik') q.narx = yaxlit2(narxXom);
    else {
      q.narx_jami = narxXom;
      if (q.miqdor) { q.narx = yaxlit2(narxXom / q.miqdor); q.eslatmalar.push(`Narx jami summa deb olindi (${narxXom.toLocaleString('ru-RU')}): birligiga ${q.narx.toLocaleString('ru-RU')}.`); }
      else q.eslatmalar.push('Narx qaysi miqdorga ekani noma’lum — narxsiz yoziladi.');
    }
  }

  // yo'nalish so'zlari va nom
  const toklar = w.split(/[\s,;:!?«»"()]+/).filter(Boolean);
  const nomToklar: string[] = [];
  for (const t of toklar) {
    const fe = felTur(t);
    if (fe) { q.yonalish ??= fe; continue; }
    if (/^(?:olib|olib\s*ket\p{L}*|keltir\p{L}*|yetkaz\p{L}*|qildik|qildim|qilindi|bo'ldi|boldi)$/iu.test(t)) continue;
    if (TO_XTASH.has(t.toLowerCase()) || /^[-.]+$/.test(t)) continue;
    nomToklar.push(t.replace(/^[-.]+|[-.]+$/g, ''));
  }
  const rusBirl = birlikXom != null && RUS_JINSIY.test(birlikXom);
  let nom = nomToklar.filter(Boolean).map((t) => (/^§\d+§$/.test(t) ? t : /^(.{4,}?)ni$/i.test(t) && !/^\d/.test(t) ? t.slice(0, -2) : t)).map((t) => (rusBirl ? rusJinsiy(t) : t));
  // «12 lik armatura» → «armatura 12»
  const olchamIdx = (t: string) => /^§\d+§$/.test(t);
  const sozlar = nom.filter((t) => !olchamIdx(t)), olchamlar = nom.filter(olchamIdx);
  nom = sozlar.length ? [...sozlar, ...olchamlar] : olchamlar;
  const nomMatn = nom.map((t) => (olchamIdx(t) ? olcham[Number(t.slice(1, -1))] : t)).join(' ');
  q.nomi = bosh(nomMatn, 500) && nomTokenlari(nomMatn).length ? bosh(nomMatn, 500) : null;
  q.taxmin = q.yonalish ? null : q.taxmin;
  return q;
}

/* ───────────── tarixga noaniq moslash ───────────── */
const KOMP_TOKEN = new Set(['mchj', 'ooo', 'ip', 'yatt', 'aj', 'firma']);
const SONMI = /^\d+(?:\.\d+)?$/;
function yaqinlik(sorov: string, nomzod: string): { ball: number; aniq: boolean } {
  const qt = nomTokenlari(sorov).filter((t) => !KOMP_TOKEN.has(t)), ct = nomTokenlari(nomzod).filter((t) => !KOMP_TOKEN.has(t));
  if (!qt.length || !ct.length) return { ball: 0, aniq: false };
  if (qt.join(' ') === ct.join(' ')) return { ball: 1, aniq: true };
  let yig = 0; const ishl = new Set<number>();
  for (const x of qt) {
    let eng = 0, ei = -1;
    ct.forEach((y, j) => {
      if (ishl.has(j)) return;
      let b = 0;
      if (x === y) b = 1;
      else if (SONMI.test(x) || SONMI.test(y)) b = 0;
      else if (x.length >= 3 && y.length >= 3 && (y.startsWith(x) || x.startsWith(y))) b = 0.9;
      else if (x.length >= 4 && y.length >= 4 && edit(x, y) <= 1) b = 0.8;
      else { const t = trigramO_xshashlik(x, y); b = t >= 0.5 ? t : 0; }
      if (b > eng) { eng = b; ei = j; }
    });
    if (ei >= 0) ishl.add(ei);
    yig += eng;
  }
  let ball = yig / qt.length;
  const qs = qt.filter((t) => SONMI.test(t)), cs = ct.filter((t) => SONMI.test(t));
  if (qs.length || cs.length) {
    const farq = qs.some((x) => !cs.includes(x)) && cs.length > 0; const yoq = qs.length > 0 && !cs.length;
    if (farq) ball *= 0.3; else if (yoq) ball *= 0.75; else if (!qs.length && cs.length) ball *= 0.95;
  }
  const ortiqcha = ct.filter((t, j) => !ishl.has(j) && !SONMI.test(t) && t.length > 2).length;
  ball *= 1 - 0.06 * Math.min(3, ortiqcha);
  return { ball: Math.round(ball * 1000) / 1000, aniq: false };
}

export type Mosla = { holat: 'aniq' | 'noaniq' | 'yoq'; tanlangan: string | null; nomzodlar: string[] };
/** Nomni kompaniya tarixidagi nomlarga moslaydi: `aniq` — ishonchli yakka moslik; `noaniq` — bir nechta yaqin (savol kerak); `yoq` — yangi nom. */
export function tarixdanMosla(sorov: string, nomlar: readonly string[]): Mosla {
  const noyob = [...new Set(nomlar.map((x) => x.trim()).filter(Boolean))];
  const bal = noyob.map((n) => ({ n, ...yaqinlik(sorov, n) })).filter((x) => x.ball >= 0.45).sort((a, b) => b.ball - a.ball || a.n.localeCompare(b.n));
  if (!bal.length) return { holat: 'yoq', tanlangan: null, nomzodlar: [] };
  const [a, b] = bal;
  const nomzodlar = bal.slice(0, 3).map((x) => x.n);
  if (a.aniq) return { holat: 'aniq', tanlangan: a.n, nomzodlar };
  if (a.ball >= 0.85 && (!b || a.ball - b.ball >= 0.12)) return { holat: 'aniq', tanlangan: a.n, nomzodlar };
  return { holat: 'noaniq', tanlangan: null, nomzodlar };
}

export type TarixNomlari = { materiallar: string[]; birlik: Map<string, string>; kontragentlar: string[] };
/** Tarix yozuvlaridan (shu yo'nalish) noyob material nomlari, ularning odatiy birligi va kontragent nomlari. */
export function tarixNomlari(yoz: readonly TaklifYozuv[], tur: Yonalish): TarixNomlari {
  const op = tur === 'prixod' ? 'prixod' : 'rasxod';
  const mat = new Map<string, number>(), birl = new Map<string, string>(), kon = new Map<string, number>();
  for (const y of yoz) {
    if (y.operatsiya !== op) continue;
    const n = (y.nomi ?? '').replace(/\s+/g, ' ').trim();
    if (n) { mat.set(n, (mat.get(n) ?? 0) + 1); if (y.birligi && !birl.has(n)) birl.set(n, String(y.birligi).trim()); }
    const k = String((tur === 'prixod' ? y.postavshik : y.qabul_qiluvchi) ?? '').replace(/\s+/g, ' ').trim();
    if (k) kon.set(k, (kon.get(k) ?? 0) + 1);
  }
  const tartib = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([n]) => n);
  return { materiallar: tartib(mat), birlik: birl, kontragentlar: tartib(kon) };
}

/* ───────────── aniqlovchi savol ───────────── */
export type SavolVariant = { yorliq: string; tanlov: { amal?: Yonalish; kontragent?: string; nomi?: string; birligi?: string } };
export type Savol = { kod: 'yonalish' | 'miqdor' | 'nomi' | 'kontragent' | 'bosh'; savol: string; variantlar: SavolVariant[] };

const MISOL = 'Masalan: «10 qop sement keldi» yoki «5 ta lampa 3-blokka chiqdi».';
/** Eng muhim yetishmayotgan/noaniq narsa bo'yicha BITTA qisqa savol; hammasi aniq bo'lsa null. */
export type SavolKirish = Pick<Qisman, 'yonalish' | 'taxmin' | 'nomi' | 'miqdor' | 'kontragent'>;
export function savolYasa(q: SavolKirish | null, ctx: { materiallar?: string[]; kontragent?: Mosla | null; odatiyMiqdor?: number | null } = {}): Savol | null {
  if (!q || (!q.nomi && q.miqdor == null && !q.kontragent && !q.yonalish)) return { kod: 'bosh', savol: `Nima qilish kerak? ${MISOL}`, variantlar: [] };
  if (!q.yonalish) {
    const t = q.taxmin;
    const yorlik = (a: Yonalish) => (a === 'prixod' ? 'Kirim' : 'Chiqim');
    const tartib: Yonalish[] = t === 'chiqim' ? ['chiqim', 'prixod'] : ['prixod', 'chiqim'];
    return { kod: 'yonalish', savol: `${q.nomi ? `«${q.nomi}»` : 'Bu'} — kirimmi yoki chiqimmi? («keldi» yoki «chiqdi» deb yozing)`, variantlar: tartib.map((a) => ({ yorliq: yorlik(a), tanlov: { amal: a } })) };
  }
  if (!q.nomi) return { kod: 'nomi', savol: 'Qaysi material? Nomini yozing.', variantlar: (ctx.materiallar ?? []).slice(0, 4).map((n) => ({ yorliq: n, tanlov: { nomi: n } })) };
  if (q.miqdor == null) return { kod: 'miqdor', savol: `«${q.nomi}» qancha${ctx.odatiyMiqdor ? ` (odatda ${ctx.odatiyMiqdor})` : ''}? Masalan: «10 qop».`, variantlar: [] };
  if (ctx.kontragent?.holat === 'noaniq' && ctx.kontragent.nomzodlar.length > 1) {
    const [a, b, c] = ctx.kontragent.nomzodlar;
    return { kod: 'kontragent', savol: `Qaysi ${q.yonalish === 'prixod' ? 'yetkazuvchi' : 'qabul qiluvchi'}: ${[a, b, c].filter(Boolean).map((x) => `«${x}»`).join(' yoki ')}?`, variantlar: ctx.kontragent.nomzodlar.map((n) => ({ yorliq: n, tanlov: { kontragent: n } })) };
  }
  return null;
}
