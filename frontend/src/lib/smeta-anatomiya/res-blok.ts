/**
 * RES podval BLOKLARI (ekspertiza «ALL» shakli) — yagona smeta yadrosining bir qismi (parallel aniqlagich emas):
 * `nakrutka.ts` (podval foizlari) va `SmetaYuklaNative.resSatrlariniOl` (resurs kategoriyasi) shu yerdan o'qiydi.
 *
 * Tuzilma (har material bloki):
 *   <bo'lim sarlavhasi>            (МЕСТНЫЕ МАТЕРИАЛЫ…, КАБЕЛЬНАЯ ПРОДУКЦИЯ, МЕТАЛЛОКОНСТРУКЦИИ, ОБОРУДОВАНИЕ…)
 *   <resurs qatorlari>
 *   ИТОГО                          | СУМ |   | B      (blok bazasi)
 *   ТРАНСПОРТНЫЕ РАСХОДЫ           | СУМ | p | S      (foiz — КОЛ-ВО ustunida, summa — СУММА ustunida)
 *   ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХ. | СУМ | p | S      (ixtiyoriy; yo'q bo'lsa — БЕЗ СКЛАД bloki)
 *   ВСЕГО                          | СУМ |   | …
 * Bloklar guruhi «ВСЕГО МАТЕРИАЛОВ» / «ВСЕГО ОБОРУДОВАНИЯ» bilan yopiladi.
 *
 * Qoidalar: foiz faqat |B·p/100 − S| ≤ 1 bo'lsa isbotli (dalil `kolvo_ustun`); isbotsiz — null + review
 * (uydirilmaydi). Foizlar kodda qattiq yozilmaydi. Blok kategoriyasi tartibi: (1) uni yopgan guruh,
 * (2) bo'lim sarlavhasi, (3) material ichida — zagot 0,75% → М/К, zagot qatori yo'q → БЕЗ СКЛАД,
 * resurslari kabel/provod → КАБ. Foiz faqat tasdiqlovchi; ziddiyat → review.
 */
import { kalit, son, xom } from './matn';
import type { Katak, ReviewBand } from './turlar';
import { resBolimKategoriya } from '../res-kategoriya';

export type ResBlokKat = 'МАТ' | 'М/К' | 'КАБ' | 'ОБ' | 'БЕЗ СКЛАД';

export interface ResPodvalSatri {
  /** 0-asosli qator indeksi. */
  qator: number;
  xom: string;
  /** КОЛ-ВО ustunidagi foiz; isbotsiz — null. */
  foiz: number | null;
  /** Hujjatdagi foiz (isbotlanmagan bo'lsa ham — review uchun). */
  foizXom: number | null;
  summa: number | null;
  /** 0-asosli ustun (summa katagi). */
  ustun: number;
  /** |B·p/100 − S| ≤ 1: true — isbotli, false — buzilgan, null — tekshirib bo'lmadi. */
  isbot: boolean | null;
}

export interface ResBlok {
  /** Blok segmenti boshi (oldingi ИТОГО/ВСЕГО dan keyingi qator), 0-asosli. */
  boshi: number;
  itogoQator: number;
  oxiri: number;
  sarlavha: string | null;
  sarlavhaKat: ResBlokKat | 'ЧЕЛ' | 'МАШ' | null;
  /** Blokni yopgan guruh: «ВСЕГО ОБОРУДОВАНИЯ» → ОБ, «ВСЕГО МАТЕРИАЛОВ» → МАТ. */
  guruh: 'ОБ' | 'МАТ' | null;
  baza: number | null;
  transport: ResPodvalSatri | null;
  zagot: ResPodvalSatri | null;
  vsego: number | null;
  /** Yakuniy kategoriya (tartib: guruh → sarlavha → foiz/resurs). */
  kat: ResBlokKat;
  katDalil: 'guruh' | 'sarlavha' | 'zagot_foizi' | 'zagotsiz' | 'kabel_resurslar' | 'sukut';
  /** Blok ichidagi resurs qatorlari (0-asosli). */
  resursQatorlari: number[];
}

export interface ResBloklarNatija {
  bloklar: ResBlok[];
  /** Resurs qatori (0-asosli) → blok kategoriyasi. */
  qatorKat: Map<number, ResBlokKat>;
  review: ReviewBand[];
}

const HARFLI = /[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]{3,}/;
const harfli = (v: Katak): v is string => typeof v === 'string' && HARFLI.test(v);
const BIRLIK_SUM = /^(СУМ|СЎМ|SO.M|ТЫС\.?\s*СУМ|МИНГ\s+СЎМ|%)\.?$/;
const KAB_NOM = /^(КАБЕЛ|ПРОВОД)/;

export type PodvalYorliq = 'itogo' | 'transport' | 'zagot' | 'vsego' | 'guruh_mat' | 'guruh_ob' | 'boshqa_jami';

/** Qator yorlig'i (birinchi matnli katak) — faqat ALL podval yorliqlari, aynan moslik. */
export function podvalYorligi(k: string): PodvalYorliq | null {
  if (/^ИТОГО:?$/.test(k)) return 'itogo';
  if (/^ТРАН?С?ПОРТНЫЕ\s+(РАСХОДЫ|УСЛУГИ)(?![А-ЯЁA-Z])/.test(k)) return 'transport';
  if (/^ЗАГОТОВИТЕЛЬНО[\s-]*СКЛАДСКИЕ\s+РАСХОДЫ(?![А-ЯЁA-Z])/.test(k)) return 'zagot';
  if (/^ВСЕГО:?$/.test(k)) return 'vsego';
  if (/^ВСЕГО\s+МАТЕРИАЛОВ(?![А-ЯЁA-Z])/.test(k)) return 'guruh_mat';
  if (/^ВСЕГО\s+ОБОРУДОВАНИЯ(?![А-ЯЁA-Z])/.test(k)) return 'guruh_ob';
  if (/^(ИТОГО|ВСЕГО|ЖАМИ)/.test(k)) return 'boshqa_jami';
  return null;
}

/**
 * «ТРАНСПОРТНЫЕ РАСХОДЫ | СУМ | 5 | 50»: birlik katagi СУМ/% va ikki son (p ≤ 100 va S) bo'lsa — foiz p, summa S.
 * Bitta son — faqat summa. Yorliqdan o'ngdagi kataklar o'qiladi.
 */
export function podvalFoizSumma(row: readonly Katak[], yorliqU: number): { birlik: string | null; foiz: number | null; summa: number | null; summaU: number } {
  let birlik: string | null = null;
  const sonlar: Array<{ v: number; u: number }> = [];
  for (let c = yorliqU + 1; c < row.length; c++) {
    const x = row[c];
    if (x == null || x === '') continue;
    const n = typeof x === 'number' ? (Number.isFinite(x) ? x : null) : son(x);
    if (n != null) { sonlar.push({ v: n, u: c }); continue; }
    if (birlik == null && typeof x === 'string' && !sonlar.length) birlik = kalit(x);
  }
  if (!sonlar.length) return { birlik, foiz: null, summa: null, summaU: -1 };
  const oxirgi = sonlar[sonlar.length - 1];
  if (birlik && BIRLIK_SUM.test(birlik) && sonlar.length >= 2 && sonlar[0].v >= 0 && sonlar[0].v <= 100) {
    return { birlik, foiz: sonlar[0].v, summa: oxirgi.v, summaU: oxirgi.u };
  }
  return { birlik, foiz: null, summa: oxirgi.v, summaU: oxirgi.u };
}

const yorliqU = (row: readonly Katak[]) => row.findIndex(harfli);

/** Faqat matnli (sonsiz, bitta katakli) qator — bo'lim sarlavhasi nomzodi. */
function sarlavhami(row: readonly Katak[]): string | null {
  const toliq = row.filter((c) => c != null && xom(c) !== '');
  if (toliq.length !== 1 || !harfli(toliq[0])) return null;
  return xom(toliq[0]);
}

function resursmi(row: readonly Katak[]): boolean {
  return row.some((c) => typeof c === 'number' || (typeof c === 'string' && son(c) != null)) && row.some(harfli);
}

/**
 * RES varag'idagi podval bloklari. Tuzilma topilmasa — bo'sh natija (eski varaqlarga ta'sir yo'q).
 * `masshtabTolerans` — isbot toleransi hujjat birligida (sukut 1).
 */
export function resBloklari(rows: readonly (readonly Katak[] | null | undefined)[], masshtabTolerans = 1): ResBloklarNatija {
  const bloklar: ResBlok[] = [];
  const review: ReviewBand[] = [];
  let segBoshi = 0;
  let sarlavhalar: string[] = [];
  let resurslar: number[] = [];
  let ochiq: (Omit<ResBlok, 'kat' | 'katDalil' | 'guruh' | 'oxiri' | 'vsego'> & { vsego?: number | null }) | null = null;
  let kutilayotgan: ResBlok[] = [];
  const guruhYop = (g: 'ОБ' | 'МАТ' | null) => { for (const b of kutilayotgan) b.guruh = g; kutilayotgan = []; };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row.some((c) => c != null && xom(c) !== '')) continue;
    const u = yorliqU(row);
    const yk = u >= 0 ? podvalYorligi(kalit(row[u])) : null;
    if (yk === 'itogo') {
      const p = podvalFoizSumma(row, u);
      ochiq = {
        boshi: segBoshi, itogoQator: r, sarlavha: null, sarlavhaKat: null, baza: p.summa,
        transport: null, zagot: null, resursQatorlari: resurslar,
      };
      const hk = [...sarlavhalar].reverse().map((s) => ({ s, k: resBolimKategoriya(s) })).find((x) => x.k && x.k !== 'YAKUN');
      ochiq.sarlavha = hk?.s ?? sarlavhalar[sarlavhalar.length - 1] ?? null;
      ochiq.sarlavhaKat = (hk?.k ?? null) as ResBlok['sarlavhaKat'];
      continue;
    }
    if ((yk === 'transport' || yk === 'zagot') && ochiq) {
      const p = podvalFoizSumma(row, u);
      const b = ochiq.baza;
      const isbot = p.foiz == null || p.summa == null || b == null ? null : Math.abs((b * p.foiz) / 100 - p.summa) <= masshtabTolerans;
      const satr: ResPodvalSatri = { qator: r, xom: xom(row[u]), foiz: isbot ? p.foiz : null, foizXom: p.foiz, summa: p.summa, ustun: p.summaU >= 0 ? p.summaU : u, isbot };
      if (yk === 'transport') ochiq.transport = satr; else ochiq.zagot = satr;
      continue;
    }
    if (yk === 'vsego' && ochiq) {
      if (ochiq.transport || ochiq.zagot) {
        bloklar.push({ ...ochiq, oxiri: r, vsego: podvalFoizSumma(row, u).summa, guruh: null, kat: 'МАТ', katDalil: 'sukut' });
        kutilayotgan.push(bloklar[bloklar.length - 1]);
      }
      ochiq = null; segBoshi = r + 1; sarlavhalar = []; resurslar = [];
      continue;
    }
    if (yk === 'guruh_mat' || yk === 'guruh_ob') {
      guruhYop(yk === 'guruh_ob' ? 'ОБ' : 'МАТ');
      ochiq = null; segBoshi = r + 1; sarlavhalar = []; resurslar = [];
      continue;
    }
    if (yk) {
      // «ИТОГО С ОБОРУДОВАНИЕМ», yolg'iz ВСЕГО va h.k. — segment yopiladi (kutilayotgan bloklar guruhsiz qoladi).
      ochiq = null; segBoshi = r + 1; sarlavhalar = []; resurslar = [];
      continue;
    }
    if (ochiq) {
      // ИТОГО dan keyin podval bo'lmagan qator — bu blok emas (ЧЕЛ/МАШ bo'limi): segment yopiladi.
      ochiq = null; segBoshi = r; sarlavhalar = []; resurslar = [];
    }
    const s = sarlavhami(row);
    if (s) { sarlavhalar.push(s); continue; }
    if (resursmi(row)) resurslar.push(r);
  }

  const qatorKat = new Map<number, ResBlokKat>();
  for (const b of bloklar) {
    const hk = b.sarlavhaKat;
    const zagotFoiz = b.zagot?.foiz ?? b.zagot?.foizXom ?? null;
    if (b.guruh === 'ОБ') {
      b.kat = 'ОБ'; b.katDalil = 'guruh';
      if (hk && hk !== 'ОБ' && hk !== 'ЧЕЛ' && hk !== 'МАШ') review.push({ kod: 'res_blok_ziddiyat', izoh: `RES blok (${b.itogoQator + 1}-qator): sarlavha «${b.sarlavha}» ${hk}, lekin blok «ВСЕГО ОБОРУДОВАНИЯ» guruhida — ОБ olindi` });
    } else if (hk === 'ОБ' && b.guruh === 'МАТ') {
      b.kat = 'МАТ'; b.katDalil = 'guruh';
      review.push({ kod: 'res_blok_ziddiyat', izoh: `RES blok (${b.itogoQator + 1}-qator): sarlavha «${b.sarlavha}» ОБ, lekin blok «ВСЕГО МАТЕРИАЛОВ» guruhida — МАТ olindi` });
    } else if (hk === 'ОБ') {
      b.kat = 'ОБ'; b.katDalil = 'sarlavha';
    } else if (hk === 'КАБ' || hk === 'М/К') {
      b.kat = hk; b.katDalil = 'sarlavha';
    } else if (!b.zagot && b.transport) {
      b.kat = 'БЕЗ СКЛАД'; b.katDalil = 'zagotsiz';
    } else if (hk === 'МАТ') {
      b.kat = 'МАТ'; b.katDalil = 'sarlavha';
    } else if (zagotFoiz === 0.75) {
      b.kat = 'М/К'; b.katDalil = 'zagot_foizi';
    } else {
      const nomlar = b.resursQatorlari.map((q) => { const row = rows[q] ?? []; const i = yorliqU(row); return i >= 0 ? kalit(row[i]) : ''; });
      const kab = nomlar.filter((n) => KAB_NOM.test(n)).length;
      if (nomlar.length && kab * 2 > nomlar.length) { b.kat = 'КАБ'; b.katDalil = 'kabel_resurslar'; }
      else { b.kat = 'МАТ'; b.katDalil = 'sukut'; }
    }
    for (const q of b.resursQatorlari) qatorKat.set(q, b.kat);
    for (const p of [b.transport, b.zagot]) {
      if (p && p.isbot === false) review.push({ kod: 'nakrutka_kolvo_isbotsiz', izoh: `«${p.xom.slice(0, 60)}» (${p.qator + 1}-qator): ${b.baza} × ${p.foizXom}% ≠ ${p.summa} — foiz olinmadi, operator tekshiradi` });
    }
  }
  return { bloklar, qatorKat, review };
}
