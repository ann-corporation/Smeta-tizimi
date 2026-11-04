/**
 * Smeta podvalidan NAKRUTKA parametrlarini o'qish (egasi 2026-10-26: «nakrutka podvalini
 * smetaning O'ZIDAN o'qib olishi kerak — hamma smeta, hamma loyihada foizlar bir xil bo'lmaydi»).
 *
 * Yagona smeta yadrosining bir qismi (parallel aniqlagich emas): kirish — `KirishKitob`
 * (qiymatlar + formulalar), chiqish — har podval qatori: nom (asl matn), foiz, hujjat summasi,
 * katak manzili, dalil turi:
 *   - `formula`       — foiz summa katagining formulasidan (`*0.18`, `*18%`, `*F12/100`, `*1.12`);
 *   - `yorliq`        — foiz faqat qator nomida («-18%», «=2%», «НДС 12%»);
 *   - `summa_nisbati` — foiz yo'q, lekin hujjat summalari nisbatidan isbotlandi (НДС / ИТОГО).
 * Isbotsiz qiymat uydirilmaydi: topilmasa — `null` + review. Bir xil parametr turli varaq/bloklarda
 * turlicha bo'lsa — `null` + review (operator tanlaydi).
 *
 * Arifmetik isbot: (1) formulali qator — formula hujjat qiymatlari bilan qayta hisoblanadi;
 * (2) zanjir — o'qilgan foizlar bilan ИТОГО-1→2, ИТОГО-3→4, ИТОГО-4→НДС→ВСЕГО qayta hisoblanib,
 * hujjat summalariga ±1 (hujjat birligida: so'm yoki ming so'm) solishtiriladi. Nomos — ogohlantirish,
 * bloklamaydi.
 */
import { yaxlit2 } from '../hisob-yadro';
import { kalit, son, xom } from './matn';
import type { Katak, KirishKitob, KirishVaraq, Manzil, ReviewBand } from './turlar';
import { resBloklari, type ResBlok, type ResBlokKat } from './res-blok';
import { allToplamRollari } from './all-toplam';

/** `t2_nakrutka_koef` / `NakrutkaKoeffitsientlar` kodlari (server bilan bir xil). */
export type NakrutkaKoefKodi =
  | 'ТРАНСПОРТ_МАТЕРИАЛ' | 'СКЛАДСКИЕ_МАТЕРИАЛ' | 'СКЛАДСКИЕ_МК' | 'ТРАНСПОРТ_КАБЕЛЬ' | 'ПРОЧИЕ_ПОДРЯДЧИК'
  | 'ТРАНСПОРТ_ОБОРУД' | 'ЗАГОТ_СКЛАД_ОБОРУД' | 'СТРАХОВАНИЕ' | 'РИСК' | 'НДС';

export const NAKRUTKA_FOIZ_KODLARI: readonly NakrutkaKoefKodi[] = [
  'ТРАНСПОРТ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МК', 'ТРАНСПОРТ_КАБЕЛЬ', 'ПРОЧИЕ_ПОДРЯДЧИК',
  'ТРАНСПОРТ_ОБОРУД', 'ЗАГОТ_СКЛАД_ОБОРУД', 'СТРАХОВАНИЕ', 'РИСК', 'НДС',
];

export type PodvalQatorKodi =
  | 'pryamye' | 'tr_mat' | 'skl_mat' | 'tr_kab' | 'itogo1' | 'prochie' | 'itogo2' | 'tr_ob' | 'zag_ob'
  | 'itogo3' | 'strax' | 'risk' | 'itogo4' | 'nds' | 'vsego' | 'zimnee' | 'kf'
  /** «Tizim 1» (eski LRV_PLUS) podvali: kategoriya bazasi qatorlari (foizlar shularga qo'llanadi) — faqat isbot uchun, saqlanmaydi. */
  | 'chel' | 'mash' | 'mat' | 'kab' | 'ob';

/** `kolvo_ustun` — ALL RES podvali: foiz КОЛ-ВО ustunida, summa СУММА da, blok ИТОГО ga isbotlangan. */
export type NakrutkaDalilTuri = 'formula' | 'yorliq' | 'summa_nisbati' | 'kolvo_ustun';

export type ResursKfKat = 'ЧЕЛ' | 'МАШ' | 'МАТ' | 'ОБ' | 'М/К' | 'КАБ' | 'БЕЗ СКЛАД';

export interface NakrutkaFoiz {
  koefKod: NakrutkaKoefKodi;
  foiz: number;
  dalil: NakrutkaDalilTuri;
}

export interface NakrutkaPodvalQatori {
  kod: PodvalQatorKodi;
  /** Qator nomi — asl matn. */
  xom: string;
  /** Hujjatdagi summa (hujjat birligida); bo'sh — null (NULL ≠ 0). */
  summa: number | null;
  /** Shu qatordan o'qilgan foiz(lar): skl_mat qatorida asosiy % va М/К % bo'lishi mumkin. */
  foizlar: NakrutkaFoiz[];
  /** Yorliqdagi foiz formuladagidan farq qilsa — yorliq qiymati (ma'lumot uchun). */
  yorliqFoiz?: number[];
  formula?: string;
  manzil: Manzil;
  /** Qator turgan varaq birligi (1 — so'm, 1000 — ming so'm). */
  masshtab: 1 | 1000;
  /** Formula hujjat qiymatlari bilan qayta hisoblandi: true — mos, false — nomos, null — tekshirib bo'lmadi. */
  formulaIsbot: boolean | null;
  /** Resurs koeffitsienti qatori («КОЭФФИЦИЕНТ К ОПЛАТЕ: МАТ») — kategoriya va qiymat. */
  kf?: { kat: ResursKfKat; qiymat: number };
}

export interface NakrutkaIsbot {
  /** Masalan «ИТОГО-4 × НДС 12% = НДС». */
  nom: string;
  kutilgan: number;
  hujjat: number;
  farq: number;
  mos: boolean;
  manzil: Manzil;
}

export interface NakrutkaPodvalOqish {
  fayl: string;
  varaqlar: string[];
  /** Hujjat birligi: 1 — so'm, 1000 — ming so'm (sarlavhada «тыс.»). */
  masshtab: 1 | 1000;
  qatorlar: NakrutkaPodvalQatori[];
  /** Isbotli (bir ma'noli) foizlar. Yo'q kod — topilmadi yoki ziddiyatli (review'da). */
  koeffitsientlar: Partial<Record<NakrutkaKoefKodi, number>>;
  /** Har kodning dalili: qaysi qator(lar)dan. */
  manba: Partial<Record<NakrutkaKoefKodi, { dalil: NakrutkaDalilTuri; manzil: Manzil; xom: string }>>;
  /** Hujjatdagi resurs koeffitsientlari («к оплате» Kf). */
  resursKf: Partial<Record<ResursKfKat, { qiymat: number; manzil: Manzil }>>;
  /** Standart kaskadga kirmaydigan foizli qatorlar (зимнее удорожание…) — operator qo'lda qo'shadi. */
  nostandart: Array<{ xom: string; foiz: number | null; summa: number | null; manzil: Manzil }>;
  isbot: NakrutkaIsbot[];
  review: ReviewBand[];
  /** `topildi` — kamida prochie/НДС/transport topildi; `qisman` — ba'zisi; `topilmadi` — podval yo'q. */
  holat: 'topildi' | 'qisman' | 'topilmadi';
  /** Lokal smeta podvali: faqat material/uskuna (transport, zagot) foizlari, prochie/НДС yo'q — ular meros qoladi. */
  lokal?: boolean;
  /** RES «ALL» bloklari (kategoriya, baza, foiz, summa) — svodka bilan solishtirish va БЕЗ СКЛАД uchun. */
  resBloklar?: Array<{ varaq: string; qator: number; kat: ResBlokKat; baza: number | null; transport: number | null; zagot: number | null; transportSumma: number | null; zagotSumma: number | null }>;
}

// ─── Yorliq tasnifi ──────────────────────────────────────────────────────────

const OB_SOZ = /ОБОРУД/;

function yorliqTuri(k: string): PodvalQatorKodi | null {
  if (/КОЭФФИЦИЕНТ\s+К\s+ОПЛАТ|^КФ(\s|$)/.test(k)) return 'kf';
  if (/ЗАКАЗЧИК/.test(k)) return null;
  // «ШАФФОФ ҚУРИЛИШ ФОНДИ» (ochiq qurilish jamg'armasi) — buyurtmachi ajratmasi, pudratchi nakrutkasi emas.
  if (/ШАФФОФ|ШАФФОФ\s+ҚУРИЛИШ|ҚУРИЛИШ\s+ФОНДИ/.test(k)) return null;
  if (/^ИТОГО\s*[-–—]?\s*1(?!\d)/.test(k)) return 'itogo1';
  if (/^ИТОГО\s*[-–—]?\s*2(?!\d)/.test(k)) return 'itogo2';
  if (/^ИТОГО\s*[-–—]?\s*3(?!\d)/.test(k)) return 'itogo3';
  if (/^ИТОГО\s*[-–—]?\s*4(?!\d)/.test(k)) return 'itogo4';
  if (/^(НДС|ҚҚС|QQS)\b|^НАЛОГ НА ДОБАВЛ/.test(k) || /^НДС/.test(k)) return 'nds';
  if (/СТРАХОВАН/.test(k) && !/ТРОС|ПОЯС/.test(k)) return 'strax';
  if (/(^|\s)РИСК|НЕПРЕДВИДЕН/.test(k)) return 'risk';
  if (/ЗИМН[А-ЯЁ]*\s+УДОРОЖ/.test(k)) return 'zimnee';
  if (/ПРОЧИЕ\s+(ЗАТРАТЫ|РАСХОДЫ)|НАКЛАДНЫЕ\s+РАСХОДЫ/.test(k)) return 'prochie';
  if (/^(ИТОГО\s+|ВСЕГО\s+)?(ТРАН?С?ПОРТ|ТРАСПОРТ)/.test(k) && !/С УЧЕТОМ/.test(k)) {
    if (/КАБЕЛ/.test(k)) return 'tr_kab';
    return OB_SOZ.test(k) ? 'tr_ob' : 'tr_mat';
  }
  if (/^(ИТОГО\s+)?(ЗАГОТОВИТЕЛЬНО|СКЛАДСК)/.test(k) && !/С УЧЕТОМ/.test(k)) return OB_SOZ.test(k) ? 'zag_ob' : 'skl_mat';
  if (/^ИТОГО\s+ПРЯМЫЕ|^ПРЯМЫЕ\s+ЗАТРАТЫ/.test(k)) return 'pryamye';
  // «Tizim 1» (eski LRV_PLUS) podvali: kategoriya bazasi qatorlari — foiz qatorlari shularning ustiga turadi.
  if (/^ЗАТРАТЫ ТРУДА/.test(k)) return 'chel';
  if (/^ЗАТРАТЫ МАШИН/.test(k)) return 'mash';
  if (/^МАТЕРИАЛЫ(\s*\(.*\))?$/.test(k)) return 'mat';
  if (/^КАБЕЛИ( И ПРОВОДА)?(\s*\(.*\))?$/.test(k)) return 'kab';
  if (/^ОБОРУДОВАНИ[ЕЯ](\s*\(.*\))?$/.test(k)) return 'ob';
  if (/^(ВСЕГО|ИТОГО|ВСЕГОГО)/.test(k) && /С\s+НДС|К\s+ОПЛАТЕ/.test(k)) return 'vsego';
  if (/^ВСЕГО\s+(СТОИМОСТЬ|К ОПЛАТЕ)/.test(k)) return 'vsego';
  if (/^(ИТОГО|ВСЕГО)/.test(k) && /БЕЗ\s+НДС/.test(k)) return 'itogo4';
  // «ИТОГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ» (НДС dan oldingi jami, PTO-UZ `_СТАРТ`).
  if (/^ИТОГО\s+СТОИМОСТ/.test(k)) return 'itogo4';
  return null;
}

const BAZA_KODLARI: ReadonlySet<PodvalQatorKodi> = new Set<PodvalQatorKodi>(['chel', 'mash', 'mat', 'kab', 'ob']);

/** Qator kodi → koeffitsient kodi (skl_mat qatorida М/К alohida). */
const KOEF: Partial<Record<PodvalQatorKodi, NakrutkaKoefKodi>> = {
  tr_mat: 'ТРАНСПОРТ_МАТЕРИАЛ', skl_mat: 'СКЛАДСКИЕ_МАТЕРИАЛ', tr_kab: 'ТРАНСПОРТ_КАБЕЛЬ', prochie: 'ПРОЧИЕ_ПОДРЯДЧИК',
  tr_ob: 'ТРАНСПОРТ_ОБОРУД', zag_ob: 'ЗАГОТ_СКЛАД_ОБОРУД', strax: 'СТРАХОВАНИЕ', risk: 'РИСК', nds: 'НДС',
};

function kfKategoriya(k: string): ResursKfKat | null {
  if (/БЕЗ\s*СКЛАД/.test(k)) return 'БЕЗ СКЛАД';
  if (/М\/К|МЕТАЛЛОКОНСТР/.test(k)) return 'М/К';
  if (/КАБЕЛ/.test(k)) return 'КАБ';
  if (/ЧЕЛ|ТРУД|ЗАРАБОТН/.test(k)) return 'ЧЕЛ';
  if (/МАШ|МЕХАНИЗМ/.test(k)) return 'МАШ';
  if (/ОБОРУД|(^|\W)ОБ(\W|$)/.test(k)) return 'ОБ';
  if (/МАТ/.test(k)) return 'МАТ';
  return null;
}

// ─── Formula ─────────────────────────────────────────────────────────────────

const harfDan = (h: string): number => h.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const ustunHarfi = (c: number): string => { let s = ''; let n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const sonOl = (s: string): number => Number(s.replace(',', '.'));
const y6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Formula ichidagi foiz ko'paytuvchilari (ketma-ket). `*0.18`, `*18%`, `*18/100`, `/100*18`, `*F12/100`, `*F12%`.
 * `*1.12` (с НДС) — alohida `ndsKoef`. Hech biri bo'lmasa bo'sh.
 */
export function formulaFoizlari(f: string, katakQiymati: (manzil: string) => number | null): { foizlar: number[]; ndsKoef: number | null } {
  const foizlar: number[] = [];
  const g = f.replace(/\$/g, '').replace(/\s+/g, '');
  const re = /\*\(?(\d+(?:[.,]\d+)?)%|\*\(?(\d+(?:[.,]\d+)?)\/100(?![\d.])|\/100\*(\d+(?:[.,]\d+)?)|\*\(?([A-Z]{1,3}\d+)(?:\/100|%)|\*\(?(0(?:[.,]\d+)?)(?![\d.,%/])/g;
  for (let m = re.exec(g); m; m = re.exec(g)) {
    if (m[1] ?? m[2] ?? m[3]) foizlar.push(sonOl((m[1] ?? m[2] ?? m[3])!));
    else if (m[4]) { const v = katakQiymati(m[4]); if (v != null) foizlar.push(v); }
    else if (m[5] != null) foizlar.push(y6(sonOl(m[5]) * 100));
  }
  const n = g.match(/\*\(?1[.,](\d{1,2})\)?$/);
  return { foizlar: foizlar.map(y6), ndsKoef: n ? Number(`0.${n[1]}`) * 100 : null };
}

/** Yorliqdagi foizlar: «-18%», «=2% И М/К=0,75%», «18,0 %». */
export function yorliqFoizlari(xomMatn: string): number[] {
  return [...xomMatn.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => sonOl(m[1]));
}

type Kitob = Map<string, KirishVaraq>;

function katakQiymati(kitob: Kitob, varaq: string, manzil: string): number | null {
  const m = manzil.match(/^([A-Z]{1,3})(\d+)$/);
  const v = kitob.get(varaq);
  if (!m || !v) return null;
  const x = v.rows[Number(m[2]) - 1]?.[harfDan(m[1])];
  if (typeof x === 'number') return x;
  if (x == null || x === '') {
    // Natijasi saqlanmagan formula («=G61*0.015»): oddiy chiziqli havolalar hisoblanadi; tushunilmasa — noma'lum (0 EMAS).
    const f = v.formulalar?.[Number(m[2]) - 1]?.[harfDan(m[1])];
    if (!f) return 0;
    if (f.startsWith('#') || formulaChuqurligi >= 40) return null;
    formulaChuqurligi++;
    try { return formulaniHisobla(kitob, varaq, f); } finally { formulaChuqurligi--; }
  }
  return son(x as Katak);
}
let formulaChuqurligi = 0;

/**
 * Kichik formula hisoblagich (faqat isbot uchun): sonlar, kataklar (`A1`, `Varaq!A1`, `'Varaq nom'!A1`),
 * `SUM(A1:B9, …)`, `ROUND(x,n)`, `+ - * / %`, qavslar. Tushunmasa — null (tekshirib bo'lmadi).
 */
export function formulaniHisobla(kitob: Kitob, varaq: string, formula: string): number | null {
  const s = formula.replace(/\$/g, '').replace(/^=/, '');
  let i = 0;
  const bo = () => { while (s[i] === ' ') i++; };
  const havola = (): { varaq: string; a: string; b?: string } | null => {
    const qism = s.slice(i);
    const m = qism.match(/^(?:'((?:[^']|'')+)'!|([^\s!'=+\-*/(),;:&<>^"%]+)!)?([A-Z]{1,3}\d+)(?::([A-Z]{1,3}\d+))?/);
    if (!m) return null;
    i += m[0].length;
    return { varaq: (m[1]?.replace(/''/g, "'") ?? m[2] ?? varaq), a: m[3], b: m[4] };
  };
  const oraliq = (h: { varaq: string; a: string; b?: string }): number[] | null => {
    if (!h.b) { const v = katakQiymati(kitob, h.varaq, h.a); return v == null ? null : [v]; }
    const a = h.a.match(/^([A-Z]+)(\d+)$/)!; const b = h.b.match(/^([A-Z]+)(\d+)$/)!;
    const out: number[] = [];
    for (let r = Math.min(+a[2], +b[2]); r <= Math.max(+a[2], +b[2]); r++) {
      for (let c = Math.min(harfDan(a[1]), harfDan(b[1])); c <= Math.max(harfDan(a[1]), harfDan(b[1])); c++) {
        const v = katakQiymati(kitob, h.varaq, `${ustunHarfi(c)}${r}`);
        if (v == null) return null;
        out.push(v);
      }
    }
    return out;
  };
  const birlamchi = (): number | null => {
    bo();
    if (s[i] === '(') { i++; const v = ifoda(); bo(); if (s[i] !== ')') return null; i++; return v; }
    if (s[i] === '-') { i++; const v = birlamchi(); return v == null ? null : -v; }
    if (s[i] === '+') { i++; return birlamchi(); }
    const fn = s.slice(i).match(/^(SUM|ROUND)\(/i);
    if (fn) {
      i += fn[0].length;
      const args: number[][] = [];
      for (;;) {
        bo();
        const saq = i;
        const h = havola();
        let qiymat: number[] | null = null;
        if (h && /^\s*[,;)]/.test(s.slice(i))) qiymat = oraliq(h);
        else { i = saq; const v = ifoda(); qiymat = v == null ? null : [v]; }
        if (qiymat == null) return null;
        args.push(qiymat); bo();
        if (s[i] === ',' || s[i] === ';') { i++; continue; }
        if (s[i] === ')') { i++; break; }
        return null;
      }
      if (/^SUM/i.test(fn[1])) return args.flat().reduce((t, x) => t + x, 0);
      const x = args[0]?.[0]; const n = args[1]?.[0] ?? 0;
      return x == null ? null : Math.round(x * 10 ** n) / 10 ** n;
    }
    const num = s.slice(i).match(/^\d+(?:\.\d+)?(?:E[+-]?\d+)?/i);
    if (num) { i += num[0].length; return Number(num[0]); }
    const h = havola();
    if (h && !h.b) return katakQiymati(kitob, h.varaq, h.a);
    return null;
  };
  const foizli = (): number | null => { let v = birlamchi(); bo(); while (v != null && s[i] === '%') { i++; v /= 100; bo(); } return v; };
  const kopaytma = (): number | null => {
    let v = foizli();
    for (;;) {
      bo();
      const op = s[i];
      if (op !== '*' && op !== '/') return v;
      i++;
      const w = foizli();
      if (v == null || w == null) return null;
      v = op === '*' ? v * w : w === 0 ? null : v / w;
    }
  };
  const ifoda = (): number | null => {
    let v = kopaytma();
    for (;;) {
      bo();
      const op = s[i];
      if (op !== '+' && op !== '-') return v;
      i++;
      const w = kopaytma();
      if (v == null || w == null) return null;
      v = op === '+' ? v + w : v - w;
    }
  };
  try {
    const v = ifoda();
    bo();
    return i === s.length && v != null && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

// ─── O'qish ─────────────────────────────────────────────────────────────────

const harfli = (v: Katak): v is string => typeof v === 'string' && /[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]{3,}/.test(v);
const XATO = /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!|ERROR!)/;

function masshtabi(v: KirishVaraq): 1 | 1000 {
  for (const row of v.rows.slice(0, 15)) for (const c of row ?? []) if (typeof c === 'string' && /ТЫС\.?\s*(СУМ|СЎМ|SO.M)|МИНГ\s+СЎМ/i.test(c)) return 1000;
  return 1;
}

/**
 * Qatorning ob (оборудование) kontekstida turganini aniqlash:
 *  1) keyingi 4 qatordagi birinchi «ИТОГО/ВСЕГО» nomida ОБОРУД bo'lsa — ha;
 *  2) qo'shni (±3) qatorda kabel transporti yoki «М/К» склад qatori bo'lsa — material bloki;
 *  3) aks holda yuqoriga qarab eng yaqin bo'lim sarlavhasi (sonsiz matnli qator): ОБОРУДОВАН — ha, МАТЕРИАЛ — yo'q.
 */
function obKontekst(v: KirishVaraq, r: number): boolean {
  const matn = (k: number) => kalit((v.rows[k] ?? []).find(harfli) ?? '');
  for (let k = r + 1; k <= r + 4 && k < v.rows.length; k++) {
    const t = matn(k);
    if (/^(ИТОГО|ВСЕГО)/.test(t)) { if (OB_SOZ.test(t)) return true; break; }
  }
  for (let k = Math.max(0, r - 3); k <= Math.min(v.rows.length - 1, r + 3); k++) {
    if (k !== r && (/ТРАН?С?ПОРТ.*КАБЕЛ|М\/К/.test(matn(k)))) return false;
  }
  for (let k = r - 1; k >= Math.max(0, r - 1500); k--) {
    const row = v.rows[k] ?? [];
    if (row.some((x) => typeof x === 'number')) continue;
    const t = matn(k);
    if (/ОБОРУДОВАН/.test(t)) return true;
    if (/МАТЕРИАЛ|ИЗДЕЛИ|КОНСТРУКЦИ/.test(t)) return false;
  }
  return false;
}

/**
 * Kitobdan podval o'qiladigan varaqlar (operator teg qo'ymagan bo'lsa): asosiy LRV, RES va svod rolidagi
 * varaqlar; LRV dublikatlari (ishchi nusxalar) kirmaydi — ular ziddiyatli foiz bermasin.
 */
export function nakrutkaVaraqlari(
  kitob: KirishKitob,
  a: { varaqlar: ReadonlyArray<{ varaq: string; rol: string }>; asosiyLrv: string | null; dublikat: ReadonlyArray<{ varaq: string }> },
  /** Svod havolasi bo'lmasa — operator (yoki import) tanlagan LRV/RES varaqlari asosiy LRV o'rniga. */
  tegli?: readonly string[],
): string[] {
  // Eng kuchli dalil — svod formulalari: svod qaysi varaqlarni o'qisa, podval o'shalardan (ekspertiza
  // kitoblarida o'nlab ishchi nusxa varaq bor — ular ziddiyatli foiz bermasin).
  const svodlar = a.varaqlar.filter((v) => v.rol === 'svod').map((v) => v.varaq);
  const nomlar = new Set(kitob.varaqlar.map((v) => v.nom));
  const tanlangan = new Set<string>(svodlar);
  for (const s of svodlar) {
    const v = kitob.varaqlar.find((x) => x.nom === s);
    for (const row of v?.formulalar ?? []) {
      for (const f of row ?? []) {
        if (!f) continue;
        for (const m of f.matchAll(/(?:'((?:[^']|'')+)'|([^\s!'=+\-*/(),;:&<>^"]+))!/g)) {
          const nom = (m[1] ?? m[2]).replace(/''/g, "'");
          if (nomlar.has(nom)) tanlangan.add(nom);
        }
      }
    }
  }
  if (tanlangan.size > svodlar.length) return kitob.varaqlar.map((v) => v.nom).filter((n) => tanlangan.has(n));
  const dub = new Set(a.dublikat.map((d) => d.varaq));
  // ALL to'plam: VED (hajm vedomosti) va TNDR (tender narxi) podval manbai emas.
  const all = allToplamRollari(kitob.varaqlar);
  if (all) for (const [n, t] of Object.entries(all.teglar)) if (t === 'etibor_bermaslik') dub.add(n);
  return a.varaqlar
    .filter((v) => !dub.has(v.varaq) && (v.varaq === a.asosiyLrv || tegli?.includes(v.varaq) || v.rol === 'res' || v.rol === 'svod' || v.varaq === all?.f5 || v.varaq === all?.res))
    .map((v) => v.varaq);
}

export interface NakrutkaOqishOpsiya {
  /** Faqat shu varaqlar (import tanlagan LRV/RES va svod). Berilmasa — kitobdagi hammasi. */
  varaqlar?: readonly string[];
}

export function nakrutkaPodvaliniOqi(kitob: KirishKitob, o: NakrutkaOqishOpsiya = {}): NakrutkaPodvalOqish {
  const xarita: Kitob = new Map(kitob.varaqlar.map((v) => [v.nom, v]));
  const varaqlar = kitob.varaqlar.filter((v) => !o.varaqlar || o.varaqlar.includes(v.nom));
  const qatorlar: NakrutkaPodvalQatori[] = [];
  const review: ReviewBand[] = [];
  const resBloklar: NonNullable<NakrutkaPodvalOqish['resBloklar']> = [];
  for (const v of varaqlar) {
    const mv = masshtabi(v);
    const aniqItogo = v.rows.some((row) => { const t = kalit((row ?? []).find(harfli) ?? ''); return /^ИТОГО\s*[-–—]?\s*[1-4](?!\d)/.test(t); });
    const bosh0 = qatorlar.length;
    // ALL RES bloklari: foiz КОЛ-ВО ustunidan, blok kategoriyasi guruh/sarlavha/zagotdan (res-blok.ts).
    const rb = resBloklari(v.rows);
    review.push(...rb.review.map((x) => ({ ...x, izoh: `«${v.nom}»: ${x.izoh}` })));
    const blokQator = new Map<number, { b: ResBlok; tur: 'transport' | 'zagot' }>();
    for (const b of rb.bloklar) {
      if (b.transport) blokQator.set(b.transport.qator, { b, tur: 'transport' });
      if (b.zagot) blokQator.set(b.zagot.qator, { b, tur: 'zagot' });
      resBloklar.push({ varaq: v.nom, qator: b.itogoQator + 1, kat: b.kat, baza: b.baza, transport: b.transport?.foiz ?? null, zagot: b.zagot?.foiz ?? null, transportSumma: b.transport?.summa ?? null, zagotSumma: b.zagot?.summa ?? null });
      // Zagotsiz blok: transport isbotli bo'lsa — hujjat aytgan БЕЗСКЛАД (resurslar shu kategoriyaga, zagot yo'q).
      // Isbotsiz bo'lsa — kategoriya berilmaydi, operator tekshiradi (bloklovchi).
      if (b.kat === 'БЕЗ СКЛАД' && !b.transport?.isbot) {
        review.push({ kod: 'bez_sklad_isbotsiz', bloklovchi: true, izoh: `«${v.nom}» ${b.itogoQator + 1}-qator bloki («${(b.sarlavha ?? '—').slice(0, 50)}», baza ${b.baza ?? '?'}) zagot-skladsiz, lekin transport foizi isbotlanmadi — БЕЗСКЛАД avtomatik berilmadi; operator tekshiradi`, manzil: { fayl: kitob.fayl, varaq: v.nom, qator: b.itogoQator + 1, ustun: 1 } });
      }
    }
    for (let r = 0; r < v.rows.length; r++) {
      const row = v.rows[r] ?? [];
      const yorliqU = row.findIndex(harfli);
      if (yorliqU < 0) continue;
      const yorliq = xom(row[yorliqU]);
      const k = kalit(yorliq);
      const bq = blokQator.get(r);
      if (bq) {
        const satr = bq.tur === 'transport' ? bq.b.transport! : bq.b.zagot!;
        const kat = bq.b.kat;
        const kod: PodvalQatorKodi = bq.tur === 'transport'
          ? (kat === 'ОБ' ? 'tr_ob' : kat === 'КАБ' ? 'tr_kab' : 'tr_mat')
          : (kat === 'ОБ' ? 'zag_ob' : 'skl_mat');
        const koefKod: NakrutkaKoefKodi = bq.tur === 'transport'
          ? (kat === 'ОБ' ? 'ТРАНСПОРТ_ОБОРУД' : kat === 'КАБ' ? 'ТРАНСПОРТ_КАБЕЛЬ' : 'ТРАНСПОРТ_МАТЕРИАЛ')
          : (kat === 'ОБ' ? 'ЗАГОТ_СКЛАД_ОБОРУД' : kat === 'М/К' ? 'СКЛАДСКИЕ_МК' : 'СКЛАДСКИЕ_МАТЕРИАЛ');
        const manzil: Manzil = { fayl: kitob.fayl, varaq: v.nom, qator: r + 1, ustun: satr.ustun + 1 };
        const q: NakrutkaPodvalQatori = { kod, xom: yorliq, summa: satr.summa, foizlar: [], manzil, masshtab: mv, formulaIsbot: null };
        if (satr.foiz != null) q.foizlar.push({ koefKod, foiz: satr.foiz, dalil: 'kolvo_ustun' });
        qatorlar.push(q);
        continue;
      }
      let kod = yorliqTuri(k);
      // «Tizim 1» podvalida ИТОГО-1..4 raqamsiz: yalang «ИТОГО» qatori o'zidan oldingi podval qatoriga qarab belgilanadi.
      if (!kod && k === 'ИТОГО' && !aniqItogo) kod = yalangItogo(qatorlar, v.nom, r + 1);
      if (!kod) continue;
      // Kategoriya bazasi qatorlari faqat ИТОГО ПРЯМЫЕ dan keyingi (40 qator ichidagi) podvaldagina — ish qatorlari nomlari bilan aralashmasin.
      if (BAZA_KODLARI.has(kod)) {
        const pr = qatorlar.slice(bosh0).filter((q) => q.kod === 'pryamye').pop();
        if (!pr || r + 1 - pr.manzil.qator > 40) continue;
      }
      // Summa: yorliqdan o'ngdagi birinchi son katagi.
      let su = -1;
      for (let c = yorliqU + 1; c < row.length; c++) {
        const x = row[c];
        if (typeof x === 'string' && XATO.test(x)) { su = -2; break; }
        if (typeof x === 'number') { su = c; break; }
      }
      if (su === -2) continue; // xatoli (#REF!) ishchi nusxa — dalil emas
      // Natijasi saqlanmagan formula (keshsiz katak): oddiy chiziqli formula hisoblanadi; tushunilmasa — summa noma'lum (null, 0 emas).
      let hisoblangan: number | null = null;
      if (su === -1) {
        for (let c = yorliqU + 1; c < row.length; c++) {
          const f = v.formulalar?.[r]?.[c];
          if (row[c] != null || !f || f.startsWith('#')) continue;
          const h = formulaniHisobla(xarita, v.nom, f);
          if (h != null) { su = c; hisoblangan = h; }
          break;
        }
      }
      if (kod === 'tr_mat' && obKontekst(v, r)) kod = 'tr_ob';
      if (kod === 'skl_mat' && !/М\/К/.test(k) && obKontekst(v, r)) kod = 'zag_ob';
      const manzil: Manzil = { fayl: kitob.fayl, varaq: v.nom, qator: r + 1, ustun: (su >= 0 ? su : yorliqU) + 1 };
      const summa = su >= 0 ? (hisoblangan ?? (row[su] as number)) : null;
      const formula = su >= 0 ? v.formulalar?.[r]?.[su] ?? undefined : undefined;
      const yf = yorliqFoizlari(yorliq);
      const q: NakrutkaPodvalQatori = { kod, xom: yorliq, summa, foizlar: [], manzil, masshtab: mv, formulaIsbot: null };
      if (formula && !formula.startsWith('#')) {
        q.formula = formula;
        const h = formulaniHisobla(xarita, v.nom, formula);
        q.formulaIsbot = h == null || summa == null ? null : Math.abs(h - summa) <= Math.max(1, Math.abs(summa) * 1e-9);
      }
      if (kod === 'kf') {
        const kat = kfKategoriya(k);
        if (kat && summa != null) q.kf = { kat, qiymat: summa };
        qatorlar.push(q);
        continue;
      }
      // Foiz formulasi: avval summa katagi; u faqat SUM bo'lsa (ko'p ustunli svod: C = SUM(D:G)) —
      // shu qatordagi boshqa formulali kataklardan birinchisi.
      let ff: ReturnType<typeof formulaFoizlari> = { foizlar: [], ndsKoef: null };
      for (let c = Math.max(su, yorliqU + 1); c < row.length; c++) {
        const f = v.formulalar?.[r]?.[c];
        if (!f || f.startsWith('#') || (typeof row[c] !== 'number' && row[c] != null)) continue;
        const x = formulaFoizlari(f, (m) => katakQiymati(xarita, v.nom, m));
        if (x.foizlar.length || x.ndsKoef != null) { ff = x; if (c !== su) q.formula ??= f; break; }
      }
      const koefKod = KOEF[kod];
      if (kod === 'vsego' && ff.ndsKoef != null) {
        q.foizlar.push({ koefKod: 'НДС', foiz: ff.ndsKoef, dalil: 'formula' });
      } else if (koefKod) {
        const ikki = kod === 'skl_mat' && (ff.foizlar.length >= 2 || yf.length >= 2 || /М\/К/.test(k));
        const manba = ff.foizlar.length ? ff.foizlar : yf;
        const dalil: NakrutkaDalilTuri = ff.foizlar.length ? 'formula' : 'yorliq';
        if (ikki) {
          // «… =2% И М/К=0,75%»: asosiy — birinchi, М/К — ikkinchi (formulada ham shu tartib).
          if (manba[0] != null) q.foizlar.push({ koefKod: 'СКЛАДСКИЕ_МАТЕРИАЛ', foiz: manba[0], dalil });
          // Formulada faqat asosiy foiz bo'lsa («=(G58)*0.02») М/К foizi yorliqdan («… И М/К 0,75%»).
          const mk = manba[1] ?? (dalil === 'formula' ? yf[1] : undefined);
          if (mk != null) q.foizlar.push({ koefKod: 'СКЛАДСКИЕ_МК', foiz: mk, dalil: manba[1] != null ? dalil : 'yorliq' });
        } else if (manba.length) {
          q.foizlar.push({ koefKod, foiz: manba[0], dalil });
        }
        if (ff.foizlar.length && yf.length && yf.some((x, j) => ff.foizlar[j] != null && Math.abs(x - ff.foizlar[j]) > 1e-9)) {
          q.yorliqFoiz = yf;
          review.push({ kod: 'nakrutka_yorliq_formula_farq', izoh: `«${yorliq.slice(0, 60)}»: yorliqda ${yf.join('/')}%, formulada ${ff.foizlar.join('/')}% — formula olindi`, manzil });
        }
      } else if (kod === 'zimnee') {
        if (ff.foizlar.length || yf.length) q.yorliqFoiz = ff.foizlar.length ? ff.foizlar : yf;
      }
      if (q.formulaIsbot === false) review.push({ kod: 'nakrutka_formula_nomos', izoh: `«${yorliq.slice(0, 60)}»: formula qayta hisobi hujjat summasiga teng emas`, manzil });
      qatorlar.push(q);
    }
    // Bo'sh «КОЭФФИЦЕНТ РИСКА» (summa ham, foiz ham yo'q) — risk yo'q = 0%: faqat podval ИТОГО-4 bilan tugagan bo'lsa.
    const buVaraq = qatorlar.slice(bosh0);
    if (buVaraq.some((q) => q.kod === 'itogo4' && q.summa != null)) {
      for (const q of buVaraq) {
        if (q.kod === 'risk' && q.summa == null && !q.foizlar.length && !yorliqFoizlari(q.xom).length) q.foizlar.push({ koefKod: 'РИСК', foiz: 0, dalil: 'yorliq' });
      }
    }
  }

  // Bir ma'noli koeffitsientlar.
  const koeffitsientlar: NakrutkaPodvalOqish['koeffitsientlar'] = {};
  const manba: NakrutkaPodvalOqish['manba'] = {};
  for (const kk of NAKRUTKA_FOIZ_KODLARI) {
    const topilgan = qatorlar.flatMap((q) => q.foizlar.filter((f) => f.koefKod === kk).map((f) => ({ f, q })));
    // Summasi 0 va foizi bor qator (bo'sh blok) ham dalil; lekin foizsiz qator — yo'q.
    if (!topilgan.length) continue;
    const qiymatlar = [...new Set(topilgan.map((t) => t.f.foiz))];
    if (qiymatlar.length > 1) {
      review.push({ kod: 'nakrutka_ziddiyat', izoh: `${kk}: hujjatda turli foizlar — ${qiymatlar.join('% / ')}% (${topilgan.map((t) => `${t.q.manzil.varaq}!${t.q.manzil.qator}`).slice(0, 6).join(', ')}) — operator tanlaydi`, manzil: topilgan[0].q.manzil });
      continue;
    }
    // Formula dalili yorliqdan kuchli.
    const eng = topilgan.find((t) => t.f.dalil === 'formula') ?? topilgan[0];
    koeffitsientlar[kk] = qiymatlar[0];
    manba[kk] = { dalil: eng.f.dalil, manzil: eng.q.manzil, xom: eng.q.xom };
  }

  // Resurs koeffitsientlari.
  const resursKf: NakrutkaPodvalOqish['resursKf'] = {};
  for (const q of qatorlar) if (q.kf && !resursKf[q.kf.kat]) resursKf[q.kf.kat] = { qiymat: q.kf.qiymat, manzil: q.manzil };

  const nostandart = qatorlar.filter((q) => q.kod === 'zimnee').map((q) => ({ xom: q.xom, foiz: q.yorliqFoiz?.[0] ?? null, summa: q.summa, manzil: q.manzil }));
  for (const n of nostandart) {
    if (n.summa) review.push({ kod: 'nakrutka_nostandart_qator', izoh: `«${n.xom.slice(0, 60)}» (${n.foiz ?? '?'}%, summa ${n.summa}) — standart kaskadda yo'q; konstruktorda qo'lda qo'shing`, manzil: n.manzil });
  }

  const masshtab = (qatorlar.find((q) => (q.kod === 'vsego' || q.kod === 'nds') && q.summa != null) ?? qatorlar.find((q) => q.summa != null))?.masshtab ?? 1;
  // НДС yorliq/formulasiz bo'lsa — summa nisbatidan (ИТОГО-4 → НДС) isbotlanadi.
  if (koeffitsientlar.НДС == null) {
    const n = ndsNisbati(qatorlar);
    if (n) { koeffitsientlar.НДС = n.foiz; manba.НДС = { dalil: 'summa_nisbati', manzil: n.manzil, xom: n.xom }; }
  }
  const isbot = zanjirIsboti(qatorlar, koeffitsientlar, manba);
  for (const b of isbot) if (!b.mos) review.push({ kod: 'nakrutka_isbot_nomos', izoh: `${b.nom}: qayta hisob ${b.kutilgan} ≠ hujjat ${b.hujjat} (farq ${b.farq})`, manzil: b.manzil });
  const soni = Object.keys(koeffitsientlar).length;
  // Lokal smeta podvali (faqat material/uskuna bloklari): prochie/НДС bu hujjatda yo'q — meros qoladi, «topilmadi» emas.
  const lokal = soni > 0 && koeffitsientlar.ПРОЧИЕ_ПОДРЯДЧИК == null && koeffitsientlar.НДС == null && !qatorlar.some((q) => q.kod === 'prochie' || q.kod === 'nds');
  for (const kk of ['ПРОЧИЕ_ПОДРЯДЧИК', 'НДС', 'ТРАНСПОРТ_МАТЕРИАЛ'] as const) {
    if (koeffitsientlar[kk] == null && !review.some((x) => x.izoh.startsWith(kk))) {
      review.push(lokal && kk !== 'ТРАНСПОРТ_МАТЕРИАЛ'
        ? { kod: 'nakrutka_lokal_meros', izoh: `${kk}: lokal smeta podvalida yo'q (faqat material/uskuna ustamalari) — obyekt/shartnoma qiymati meros qoladi` }
        : { kod: 'nakrutka_topilmadi', izoh: `${kk}: smeta podvalida isbotli foiz topilmadi — shartnoma/sukut qiymati qoladi` });
    }
  }
  const holat = soni === 0 ? 'topilmadi' : (['ПРОЧИЕ_ПОДРЯДЧИК', 'НДС'] as const).every((x) => koeffitsientlar[x] != null) ? 'topildi' : 'qisman';
  return { fayl: kitob.fayl, varaqlar: varaqlar.map((v) => v.nom), masshtab, qatorlar, koeffitsientlar, manba, resursKf, nostandart, isbot, review, holat, ...(lokal ? { lokal } : {}), ...(resBloklar.length ? { resBloklar } : {}) };
}

/**
 * Yalang «ИТОГО» (raqamsiz) qatori qaysi bosqich jami ekani: shu varaqdagi eng oxirgi podval qatoriga qarab
 * (kategoriya/transport/склад → ИТОГО-1; ПРОЧИЕ → ИТОГО-2; оборудование → ИТОГО-3; страхование/риск → ИТОГО-4).
 * Faqat ИТОГО ПРЯМЫЕ dan keyin va 12 qator ichida; boshqa holatda — null (qator e'tiborsiz).
 */
function yalangItogo(qatorlar: readonly NakrutkaPodvalQatori[], varaq: string, qator: number): PodvalQatorKodi | null {
  const barchasi = qatorlar.filter((q) => q.manzil.varaq === varaq && q.manzil.qator < qator);
  const bosh = barchasi.map((q) => q.kod).lastIndexOf('pryamye');
  if (bosh < 0) return null;
  const oldingi = barchasi.slice(bosh); // oxirgi ИТОГО ПРЯМЫЕ dan boshlangan podval bloki
  const oxirgi = oldingi[oldingi.length - 1];
  if (qator - oxirgi.manzil.qator > 12) return null;
  switch (oxirgi.kod) {
    case 'tr_mat': case 'skl_mat': case 'tr_kab': case 'mat': case 'kab': return oldingi.some((q) => q.kod === 'itogo1') ? null : 'itogo1';
    case 'prochie': return oldingi.some((q) => q.kod === 'itogo2') ? null : 'itogo2';
    case 'tr_ob': case 'zag_ob': case 'ob': return oldingi.some((q) => q.kod === 'itogo3') ? null : 'itogo3';
    case 'strax': case 'risk': return oldingi.some((q) => q.kod === 'itogo4') ? null : 'itogo4';
    default: return null;
  }
}

/** Bir varaq/ustundagi oldingi jami qator (НДС bazasi): yaqin 4 qator ichida, summali. */
function oldingiJami(qatorlar: readonly NakrutkaPodvalQatori[], q: NakrutkaPodvalQatori): NakrutkaPodvalQatori | null {
  const idx = qatorlar.indexOf(q);
  for (let j = idx - 1; j >= 0; j--) {
    const p = qatorlar[j];
    if (p.manzil.varaq !== q.manzil.varaq || p.manzil.ustun !== q.manzil.ustun || q.manzil.qator - p.manzil.qator > 4) break;
    if (p.kod === 'itogo4' && p.summa != null) return p;
  }
  return null;
}

const ndsBazasi = (qatorlar: readonly NakrutkaPodvalQatori[], nds: NakrutkaPodvalQatori) => oldingiJami(qatorlar, nds);

function ndsNisbati(qatorlar: readonly NakrutkaPodvalQatori[]): { foiz: number; manzil: Manzil; xom: string } | null {
  for (const q of qatorlar) {
    if (q.kod !== 'nds' || q.summa == null) continue;
    const b = ndsBazasi(qatorlar, q);
    if (!b?.summa) continue;
    const foiz = Math.round((q.summa / b.summa) * 1e4) / 1e2;
    // Faqat butun stavka (12 / 15 / 20) — tasodifiy nisbat isbot emas.
    if ([12, 15, 20].includes(foiz) && Math.abs(b.summa * foiz / 100 - q.summa) <= 1) return { foiz, manzil: q.manzil, xom: q.xom };
  }
  return null;
}

function zanjirIsboti(
  qatorlar: readonly NakrutkaPodvalQatori[],
  nk: NakrutkaPodvalOqish['koeffitsientlar'],
  _manba: NakrutkaPodvalOqish['manba'],
): NakrutkaIsbot[] {
  void _manba;
  const isbot: NakrutkaIsbot[] = [];
  /** `nisbiy` — «tizim 1» kategoriya tekshiruvlari: ±1 yoki 0,01% (qaysi biri katta). */
  const tekshir = (nom: string, kutilgan: number, q: NakrutkaPodvalQatori, nisbiy = false): boolean | null => {
    if (q.summa == null) return null;
    const farq = yaxlit2(q.summa - kutilgan);
    const mos = Math.abs(farq) <= (nisbiy ? Math.max(1, Math.abs(kutilgan) * 1e-4) : 1);
    isbot.push({ nom, kutilgan: yaxlit2(kutilgan), hujjat: q.summa, farq, mos, manzil: q.manzil });
    return mos;
  };
  // Bir varaq + ustun bo'yicha guruhlab, ketma-ketlikdagi qatorlarni bog'laymiz.
  const guruhlar = new Map<string, NakrutkaPodvalQatori[]>();
  for (const q of qatorlar) {
    const g = `${q.manzil.varaq}|${q.manzil.ustun}`;
    (guruhlar.get(g) ?? guruhlar.set(g, []).get(g)!).push(q);
  }
  const pc = (k: NakrutkaKoefKodi) => (nk[k] ?? null) == null ? null : (nk[k] as number) / 100;
  for (const g of guruhlar.values()) {
    const top = (kod: PodvalQatorKodi) => g.find((q) => q.kod === kod && q.summa != null);
    const i1 = top('itogo1'); const pr = top('prochie'); const i2 = top('itogo2'); const i3 = top('itogo3');
    const st = top('strax'); const rk = top('risk'); const i4 = top('itogo4'); const nd = top('nds'); const vs = top('vsego');
    const P = pc('ПРОЧИЕ_ПОДРЯДЧИК'); const S = pc('СТРАХОВАНИЕ'); const R = pc('РИСК'); const N = pc('НДС');
    if (i1 && pr && P != null) tekshir(`ИТОГО-1 × ПРОЧИЕ ${nk.ПРОЧИЕ_ПОДРЯДЧИК}%`, i1.summa! * P, pr);
    if (i1 && i2 && P != null) tekshir(`ИТОГО-1 × (1 + ${nk.ПРОЧИЕ_ПОДРЯДЧИК}%) = ИТОГО-2`, i1.summa! * (1 + P), i2);
    if (i3 && st && S != null) tekshir(`ИТОГО-3 × СТРАХОВАНИЕ ${nk.СТРАХОВАНИЕ}%`, i3.summa! * S, st);
    if (i3 && rk && R != null) tekshir(`ИТОГО-3 × РИСК ${nk.РИСК}%`, i3.summa! * R, rk);
    if (i3 && i4 && S != null && R != null) tekshir(`ИТОГО-3 × (1 + ${nk.СТРАХОВАНИЕ}% + ${nk.РИСК}%) = ИТОГО-4`, i3.summa! * (1 + S + R), i4);
    const baza = i4 ?? (nd ? ndsBazasi(qatorlar, nd) : null);
    if (baza?.summa != null && nd && N != null) tekshir(`ИТОГО-4 × НДС ${nk.НДС}%`, baza.summa * N, nd);
    if (baza?.summa != null && nd?.summa != null && vs) tekshir('ИТОГО-4 + НДС = ВСЕГО', baza.summa + nd.summa, vs);
    else if (baza?.summa != null && vs && N != null && !nd) tekshir(`ИТОГО-4 × (1 + НДС ${nk.НДС}%) = ВСЕГО`, baza.summa * (1 + N), vs);

    // «Tizim 1» kaskadi: har foiz o'z kategoriya bazasiga (МАТЕРИАЛЫ / КАБЕЛИ / ОБОРУДОВАНИЯ) qo'llanadi; ±1 so'm yoki 0,01%.
    const oldin = (q: NakrutkaPodvalQatori, kod: PodvalQatorKodi): NakrutkaPodvalQatori | undefined => {
      let b: NakrutkaPodvalQatori | undefined;
      for (const p of g) { if (p === q) break; if (p.kod === kod && q.manzil.qator - p.manzil.qator <= 12) b = p; }
      return b;
    };
    const BAZALI: Array<[PodvalQatorKodi, PodvalQatorKodi, NakrutkaKoefKodi]> = [
      ['tr_mat', 'mat', 'ТРАНСПОРТ_МАТЕРИАЛ'], ['skl_mat', 'mat', 'СКЛАДСКИЕ_МАТЕРИАЛ'], ['tr_kab', 'kab', 'ТРАНСПОРТ_КАБЕЛЬ'],
      ['tr_ob', 'ob', 'ТРАНСПОРТ_ОБОРУД'], ['zag_ob', 'ob', 'ЗАГОТ_СКЛАД_ОБОРУД'],
    ];
    for (const q of g) {
      for (const [kod, bk, kk] of BAZALI) {
        const f = nk[kk];
        if (q.kod !== kod || q.summa == null || f == null) continue;
        const b = oldin(q, bk);
        if (!b || b.summa == null) continue; // baza noma'lum (keshsiz/formulasiz) — isbot yo'q, lekin podval yiqilmaydi
        const kut = yaxlit2((b.summa * f) / 100);
        const nom = `${bk === 'mat' ? 'МАТЕРИАЛЫ' : bk === 'kab' ? 'КАБЕЛИ' : 'ОБОРУДОВАНИЯ'} × ${f}% = ${kod}`;
        // «2% И М/К 0,75%»: М/К ulushi bazada ajratilmagan — mos kelmasa nomos emas, tekshirib bo'lmadi.
        if (kod === 'skl_mat' && q.foizlar.some((x) => x.koefKod === 'СКЛАДСКИЕ_МК') && Math.abs(q.summa - kut) > Math.max(1, Math.abs(kut) * 1e-4)) continue;
        tekshir(nom, kut, q, true);
      }
    }
    if (i1) {
      const qat = (kod: PodvalQatorKodi) => oldin(i1, kod);
      const [chel, mash, mat, trm, skl, trk, kab] = (['chel', 'mash', 'mat', 'tr_mat', 'skl_mat', 'tr_kab', 'kab'] as const).map(qat);
      const hammasi = [chel, mash, mat, trm, skl, trk];
      if (chel && mash && mat && i1.summa != null && hammasi.every((x) => !x || x.summa != null) && (!kab || kab.summa != null)) {
        const s = hammasi.reduce((t, x) => t + (x?.summa ?? 0), 0);
        const kabsiz = Math.abs(i1.summa - s) <= Math.max(1, Math.abs(s) * 1e-4);
        tekshir('ЧЕЛ + МАШ + МАТ + транспорт + склад = ИТОГО-1', kabsiz || !kab ? s : s + (kab.summa ?? 0), i1, true);
      }
    }
    if (i2 && i3 && i2.summa != null) {
      const [ob, tro, zgo] = (['ob', 'tr_ob', 'zag_ob'] as const).map((kod) => oldin(i3, kod));
      // Оборудование qatorlari bo'lmasa (ИТОГО-3 boshqa tarkibda) — bu tekshiruv ma'nosiz, o'tkaziladi.
      if ((ob || tro || zgo) && [ob, tro, zgo].every((x) => !x || x.summa != null)) {
        tekshir('ИТОГО-2 + ОБОРУДОВАНИЯ + транспорт + заготовительно-складские = ИТОГО-3', i2.summa + (ob?.summa ?? 0) + (tro?.summa ?? 0) + (zgo?.summa ?? 0), i3, true);
      }
    }
  }
  return isbot;
}
