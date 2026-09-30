/**
 * hujjat-yozuvchi/rasmiy.ts — NOLDAN yasaladigan rasmiy PTO hujjati (H2–H9).
 *
 * Asl fayl yo'q bo'lganda (Ostatka, АКТ Ф-2, Накопительная ведомость,
 * Ресурсная ведомость, paket svodi) hujjat shu quruvchi bilan chiqadi:
 *
 *   1. Sarlavha (qalin, markazda) + ixtiyoriy ost-sarlavhalar;
 *   2. Titul: Объект / Заказчик / Подрядчик / Договор / Период … (qiymat
 *      bo'sh bo'lsa — to'ldirish chizig'i, o'ylab topilmaydi);
 *   3. Jadval sarlavhasi (bir yoki ikki qatorli, guruhlar birlashtirilgan) va
 *      1 | 2 | 3 … raqamlash qatori — ikkalasi har sahifada takrorlanadi
 *      (`_xlnm.Print_Titles`);
 *   4. Ramkali jadval: bo'lim (РАЗДЕЛ) qatorlari, ish/resurs qatorlari
 *      (Excel outline — yig'iladigan guruhlar), ИТОГО va ВСЕГО qalin;
 *      son formatlari `# ##0,00` (pul), `# ##0,000` (hajm);
 *   5. "ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ" — hal qilinmagan joylar ochiq (H7);
 *   6. Imzo bloki: ЗАКАЗЧИК / ПОДРЯДЧИК (+ ТЕХНАДЗОР / СОСТАВИЛ / ПРОВЕРИЛ),
 *      "(подпись)", "М.П." (H3);
 *   7. Chop etish: A4, bir sahifa eniga (fitToWidth=1), Print_Area butun
 *      hujjat + imzo, sahifa raqami pastda (H4).
 *
 * Formulalar nisbiy (`$` siz) va keshlangan `<v>` qiymati bilan yoziladi;
 * workbook `fullCalcOnLoad=1` — Excel/LibreOffice ochilganda qayta hisoblaydi,
 * natija sayt ko'rsatgan son bilan bir xil (H6). Rang (fill) ishlatilmaydi —
 * hujjat rasmiy: qora matn, ingichka ramka, qalin jami.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import { num, sheetRef, ustunHarfi, xmlEsc } from './ooxml';
import { sumRefs } from './formula';
import { IMZO_IMZO_CHIZIQ, IMZO_IZOH, IMZO_IZOH_SHAXS, IMZO_MP, IMZO_PODPIS, imzoMatni, imzoMuhrli, type ImzoTomon } from './imzo';

/** Barcha rasmiy hujjatlar kolontituli — tizim nomi (egasi: hujjatlarda tizim reklamasi bo'lsin). */
export const HUJJAT_KOLONTITUL = 'Сформировано в системе «Smeta tizimi» — smeta-tizimi.pages.dev';

export type UstunTuri = 'tartib' | 'kod' | 'matn' | 'birlik' | 'hajm' | 'narx' | 'pul' | 'foiz' | 'norma' | 'texnik';

export type RasmiyUstun = {
  sarlavha: string;
  /** Excel ustun kengligi (belgilar). */
  kenglik: number;
  tur: UstunTuri;
  /** Ikki qatorli sarlavha: bir xil `guruh` li qo'shni ustunlar ustida umumiy nom. */
  guruh?: string;
  /** Texnik ustun (masalan yashirin belgi) — chop etilmaydi, ko'rinmaydi, raqamlanmaydi. */
  yashirin?: boolean;
};

export type RasmiyQatorTuri = 'oddiy' | 'ish' | 'bolim' | 'jami' | 'vsego';

/** Katak qiymati: matn, son, bo'sh (null) yoki formula + keshlangan natija. */
export type Qiymat = string | number | null | undefined
  | { f: string; v: number | string | null; uslub?: KatakUslub }
  /** Formulasiz son, lekin boshqa son formati bilan (masalan foiz, koeffitsient). */
  | { n: number | null; uslub: KatakUslub };
/** Katak darajasidagi son formati: `norma` — 0.0000## (koeffitsient), `foiz` — foiz. */
export type KatakUslub = 'norma' | 'foiz';

export type RasmiyVaraqSozlama = {
  /** Varaq (list) nomi — Excel cheklovi 31 belgi. */
  nom: string;
  /** Hujjat nomi, masalan "АКТ ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ (ФОРМА № 2)". */
  sarlavha: string;
  ostSarlavha?: readonly string[];
  /** Titul: [yorliq, qiymat]. Qiymat bo'sh — chiziq. */
  titul?: ReadonlyArray<readonly [string, string | null | undefined]>;
  /**
   * Ikki tomon rekvizitlari — YONMA-YON (chap ПОДРЯДЧИК, o'ng ЗАКАЗЧИК),
   * haqiqiy SPRAVKA-SCHET-FAKTURA blankasidagi kabi: "Подрядчик: … | Заказчик: …",
   * "Адрес: … | Адрес: …", "р/с: … | Основной счёт: …" va h.k. Qiymat bo'sh —
   * chiziq emas, qator o'zi tashlab ketiladi (rekvizit hali kiritilmagan bo'lishi
   * mumkin — bo'sh joy majburlanmaydi).
   */
  ikkiTomonRekvizit?: ReadonlyArray<readonly [string, string | null | undefined, string, string | null | undefined]>;
  /** Sarlavhadan keyin, rekvizitdan oldin erkin qatorlar (masalan Форма № 3 dagi
   *  «Номер документа | Дата составления | Отчетный период» ramkali qutisi). */
  oldBloklar?: ReadonlyArray<ReadonlyArray<BlokKatak>>;
  /** Maxsus ko'p qavatli jadval sarlavhasi (masalan Форма № 3 — uch qavat, 16 grafa).
   *  Berilsa, `guruh` asosidagi avtomatik sarlavha o'rniga shu yoziladi. */
  maxsusSarlavha?: { qatorSoni: number; kataklar: ReadonlyArray<SarlavhaKatak>; balandliklar?: readonly number[] };
  ustunlar: readonly RasmiyUstun[];
  yonalish?: 'portrait' | 'landscape';
};

/** Erkin blok katagi: c1..c2 ustunlar birlashtiriladi. */
export type BlokKatak = {
  c1: number; c2?: number; matn: Qiymat;
  /** yorliq — qalin chap; qiymat — oddiy chap; quti — ramkali markaz; qutiQalin — ramkali qalin;
   *  imzo — imzo matni; izoh — mayda kursiv markaz; ost — markaz; qalin — qalin chap. */
  tur?: 'yorliq' | 'qiymat' | 'quti' | 'qutiQalin' | 'imzo' | 'izoh' | 'ost' | 'qalin';
};
/** Maxsus sarlavha katagi: `qator` — sarlavha ichidagi 0-asosli qator; `qatorlar` — vertikal birlashma. */
export type SarlavhaKatak = { c1: number; c2?: number; qator: number; qatorlar?: number; matn: string };

type Katak = { col: number; s: number; xml: (ref: string) => string };
type Qator = { cells: Katak[]; daraja?: number; ht?: number };

export type RasmiyVaraqMeta = {
  nom: string;
  /** Jadval sarlavhasining birinchi qatori (Print_Titles boshi). */
  sarlavhaQatori: number;
  /** 1 | 2 | 3 raqamlash qatori (Print_Titles oxiri). */
  raqamQatori: number;
  /** Birinchi ma'lumot qatori. */
  malumotBoshi: number;
  /** Oxirgi band qator (imzo bilan). */
  oxirgiQator: number;
  /** Oxirgi ko'rinadigan ustun indeksi (Print_Area eni). */
  oxirgiUstun: number;
};

// ───────────────────────── uslublar ─────────────────────────

/** cellXfs indekslari (quyidagi STYLES_XML bilan aynan mos). */
export const RS = {
  oddiy: 0, sarlavha: 1, ost: 2, titulYorliq: 3, titulQiymat: 4,
  header: 5, raqam: 6, matn: 7, markaz: 8, pul: 9, hajm: 10, norma: 11, foiz: 12,
  bolimMatn: 13, bolimPul: 14, jamiMatn: 15, jamiPul: 16, vsegoMatn: 17, vsegoPul: 18,
  imzoMatn: 19, imzoIzoh: 20, bolimSarlavha: 21, izoh: 22, bolimHajm: 23, bolimMarkaz: 24,
  jamiMarkaz: 25, vsegoMarkaz: 26, jamiHajm: 27, qutiMarkaz: 28,
} as const;

const B1 = '<left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/>';
const B2 = '<left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="medium"><color auto="1"/></top><bottom style="medium"><color auto="1"/></bottom><diagonal/>';

const xf = (numFmt: number, font: number, border: number, al: string) =>
  `<xf numFmtId="${numFmt}" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment ${al}/></xf>`;
const L = 'horizontal="left" vertical="top" wrapText="1"';
const C = 'horizontal="center" vertical="center" wrapText="1"';
const R = 'horizontal="right" vertical="top"';

export const RASMIY_STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2"><numFmt numFmtId="165" formatCode="#,##0.000"/><numFmt numFmtId="166" formatCode="0.0000##"/></numFmts>'
  + '<fonts count="5">'
  + '<font><sz val="10"/><name val="Times New Roman"/><family val="1"/><charset val="204"/></font>'
  + '<font><b/><sz val="10"/><name val="Times New Roman"/><family val="1"/><charset val="204"/></font>'
  + '<font><b/><sz val="13"/><name val="Times New Roman"/><family val="1"/><charset val="204"/></font>'
  + '<font><i/><sz val="8"/><name val="Times New Roman"/><family val="1"/><charset val="204"/></font>'
  + '<font><i/><sz val="10"/><name val="Times New Roman"/><family val="1"/><charset val="204"/></font>'
  + '</fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border>${B1}</border><border>${B2}</border></borders>`
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="29">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' // 0 oddiy
  + xf(0, 2, 0, 'horizontal="center" vertical="center" wrapText="1"') // 1 sarlavha
  + xf(0, 0, 0, 'horizontal="center" vertical="center" wrapText="1"') // 2 ost
  + xf(0, 1, 0, 'horizontal="left" vertical="top"') // 3 titul yorliq
  + xf(0, 0, 0, 'horizontal="left" vertical="top" wrapText="1"') // 4 titul qiymat
  + xf(0, 1, 1, C) // 5 header
  + xf(0, 3, 1, 'horizontal="center" vertical="center"') // 6 raqam
  + xf(0, 0, 1, L) // 7 matn
  + xf(0, 0, 1, 'horizontal="center" vertical="top" wrapText="1"') // 8 markaz
  + xf(4, 0, 1, R) // 9 pul
  + xf(165, 0, 1, R) // 10 hajm
  + xf(166, 0, 1, R) // 11 norma
  + xf(2, 0, 1, R) // 12 foiz
  + xf(0, 1, 1, L) // 13 bolim matn
  + xf(4, 1, 1, R) // 14 bolim pul
  + xf(0, 1, 1, 'horizontal="left" vertical="top" wrapText="1"') // 15 jami matn
  + xf(4, 1, 1, R) // 16 jami pul
  + xf(0, 1, 2, 'horizontal="left" vertical="top" wrapText="1"') // 17 vsego matn
  + xf(4, 1, 2, R) // 18 vsego pul
  + xf(0, 0, 0, 'horizontal="left" vertical="bottom"') // 19 imzo matn
  + xf(0, 3, 0, 'horizontal="center" vertical="top"') // 20 imzo izoh
  + xf(0, 1, 0, 'horizontal="left" vertical="center"') // 21 bo'lim sarlavhasi (jadvaldan tashqari)
  + xf(0, 4, 0, 'horizontal="left" vertical="top" wrapText="1"') // 22 izoh
  + xf(165, 1, 1, R) // 23 bolim hajm
  + xf(0, 1, 1, 'horizontal="center" vertical="top" wrapText="1"') // 24 bolim markaz
  + xf(0, 1, 1, 'horizontal="center" vertical="top"') // 25 jami markaz
  + xf(0, 1, 2, 'horizontal="center" vertical="top"') // 26 vsego markaz
  + xf(165, 1, 1, R) // 27 jami hajm
  + xf(0, 0, 1, C) // 28 quti (ramkali, oddiy, markaz)
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

function uslub(tur: RasmiyQatorTuri, ut: UstunTuri): number {
  const sonmi = ut === 'pul' || ut === 'narx';
  const hajmmi = ut === 'hajm';
  const markaz = ut === 'tartib' || ut === 'kod' || ut === 'birlik';
  switch (tur) {
    case 'oddiy':
      return sonmi ? RS.pul : hajmmi ? RS.hajm : ut === 'norma' ? RS.norma : ut === 'foiz' ? RS.foiz : markaz ? RS.markaz : RS.matn;
    case 'ish':
    case 'bolim':
      return sonmi ? RS.bolimPul : hajmmi ? RS.bolimHajm : ut === 'norma' ? RS.norma : ut === 'foiz' ? RS.foiz : markaz ? RS.bolimMarkaz : RS.bolimMatn;
    case 'jami':
      return sonmi ? RS.jamiPul : hajmmi ? RS.jamiHajm : ut === 'foiz' ? RS.foiz : markaz ? RS.jamiMarkaz : RS.jamiMatn;
    case 'vsego':
      return sonmi || hajmmi ? RS.vsegoPul : markaz ? RS.vsegoMarkaz : RS.vsegoMatn;
  }
}

function katakXml(col: number, s: number, q: Qiymat): Katak {
  return {
    col, s, xml: (ref) => {
      if (q == null || q === '') return `<c r="${ref}" s="${s}"/>`;
      if (typeof q === 'number') return Number.isFinite(q) ? `<c r="${ref}" s="${s}"><v>${num(q)}</v></c>` : `<c r="${ref}" s="${s}"/>`;
      if (typeof q === 'string') return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(q)}</t></is></c>`;
      if ('n' in q) return q.n == null || !Number.isFinite(q.n) ? `<c r="${ref}" s="${s}"/>` : `<c r="${ref}" s="${s}"><v>${num(q.n)}</v></c>`;
      const f = q.f.replace(/^=/, '');
      if (q.v == null) return `<c r="${ref}" s="${s}"><f>${xmlEsc(f)}</f></c>`;
      if (typeof q.v === 'string') return `<c r="${ref}" s="${s}" t="str"><f>${xmlEsc(f)}</f><v>${xmlEsc(q.v)}</v></c>`;
      return `<c r="${ref}" s="${s}"><f>${xmlEsc(f)}</f><v>${num(q.v)}</v></c>`;
    },
  };
}

/** Matn uzunligi bo'yicha qator balandligi (pt) — Excel yuklashda o'ralgan
 * matn uchun balandlikni o'zi kattalashtirmaydi, shuning uchun oldindan. */
function balandlik(matn: string, kenglik: number, ptQator = 13): number | undefined {
  if (!matn) return undefined;
  const sigadi = Math.max(8, Math.floor(kenglik * 1.15));
  const qatorlar = matn.split('\n').reduce((a, s) => a + Math.max(1, Math.ceil(s.length / sigadi)), 0);
  return qatorlar > 1 ? Math.min(409, qatorlar * ptQator + 2) : undefined;
}

// ───────────────────────── varaq quruvchi ─────────────────────────

export class RasmiyVaraq {
  readonly nom: string;
  readonly ustunlar: readonly RasmiyUstun[];
  private readonly qatorlar: Qator[] = [];
  private readonly merges: string[] = [];
  private readonly yonalish: 'portrait' | 'landscape';
  readonly sarlavhaQatori: number;
  readonly raqamQatori: number;
  private readonly korinadigan: number[];

  constructor(o: RasmiyVaraqSozlama) {
    this.nom = o.nom.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
    this.ustunlar = o.ustunlar;
    this.yonalish = o.yonalish ?? 'landscape';
    this.korinadigan = o.ustunlar.map((u, i) => (u.yashirin ? -1 : i)).filter((i) => i >= 0);
    const oxir = this.oxirgiUstun;

    this.put([katakXml(0, RS.sarlavha, o.sarlavha)], balandlik(o.sarlavha, this.kenglikJami(0, oxir), 18));
    this.merge(0, this.r - 1, oxir);
    for (const s of o.ostSarlavha ?? []) {
      this.put([katakXml(0, RS.ost, s)]);
      this.merge(0, this.r - 1, oxir);
    }
    if (o.oldBloklar?.length) {
      this.put([]);
      for (const b of o.oldBloklar) this.blok(b);
    }
    if (o.ikkiTomonRekvizit?.length) {
      this.put([]);
      // Ikki blok: chap (ПОДРЯДЧИК) 0..yarim, o'ng (ЗАКАЗЧИК) yarim+1..oxir.
      // Tituldan OLDIN — haqiqiy SPRAVKA-SCHET-FAKTURA blankasida ham tomonlar
      // rekvizitlari avval, obyekt/shartnoma qatorlari keyin keladi.
      const yarim = Math.max(1, Math.floor((oxir + 1) / 2)) - 1;
      let chapYorliqOxiri = 0;
      while (chapYorliqOxiri < yarim && this.kenglikJami(0, chapYorliqOxiri) < 13) chapYorliqOxiri++;
      let ongYorliqOxiri = yarim + 1;
      while (ongYorliqOxiri < oxir && this.kenglikJami(yarim + 1, ongYorliqOxiri) < 13) ongYorliqOxiri++;
      for (const [chapYorliq, chapQiymat, ongYorliq, ongQiymat] of o.ikkiTomonRekvizit) {
        const cq = (chapQiymat ?? '').trim();
        const oq = (ongQiymat ?? '').trim();
        // Ikkalasi ham bo'sh — rekvizit hali kiritilmagan, qator o'zi tashlab ketiladi
        // (titul kabi "________" chizig'i emas: bu blok butunlay ixtiyoriy).
        if (!cq && !oq) continue;
        const r = this.put([
          katakXml(0, RS.titulYorliq, chapYorliq),
          katakXml(chapYorliqOxiri + 1, RS.titulQiymat, cq || null),
          katakXml(yarim + 1, RS.titulYorliq, ongYorliq),
          katakXml(ongYorliqOxiri + 1, RS.titulQiymat, oq || null),
        ], Math.max(balandlik(cq, this.kenglikJami(chapYorliqOxiri + 1, yarim)) ?? 0, balandlik(oq, this.kenglikJami(ongYorliqOxiri + 1, oxir)) ?? 0) || undefined);
        if (chapYorliqOxiri > 0) this.merge(0, r, chapYorliqOxiri);
        this.merge(chapYorliqOxiri + 1, r, yarim);
        if (ongYorliqOxiri > yarim + 1) this.merge(yarim + 1, r, ongYorliqOxiri);
        this.merge(ongYorliqOxiri + 1, r, oxir);
      }
    }
    if (o.titul?.length) {
      this.put([]);
      // Yorliq ustun(lar)i: chapdan kamida 16 belgi eni (tor № ustunida kesilmasin).
      let yorliqOxiri = 0;
      while (yorliqOxiri < oxir - 1 && this.kenglikJami(0, yorliqOxiri) < 16) yorliqOxiri++;
      for (const [yorliq, qiymat] of o.titul) {
        const q = (qiymat ?? '').trim() || '________________________________________';
        const r = this.put([katakXml(0, RS.titulYorliq, yorliq), katakXml(yorliqOxiri + 1, RS.titulQiymat, q)], balandlik(q, this.kenglikJami(yorliqOxiri + 1, oxir)));
        if (yorliqOxiri > 0) this.merge(0, r, yorliqOxiri);
        this.merge(yorliqOxiri + 1, r, oxir);
      }
    }
    this.put([]);

    // Maxsus ko'p qavatli sarlavha (Форма № 3): kataklar aniq joyi va birlashmalari bilan.
    if (o.maxsusSarlavha) {
      const ms = o.maxsusSarlavha;
      const h0 = this.r;
      this.sarlavhaQatori = h0;
      for (let k = 0; k < ms.qatorSoni; k++) {
        const kat = ms.kataklar.filter((x) => x.qator === k);
        const cells: Katak[] = [];
        // Ramka uzluksiz bo'lishi uchun har ko'rinadigan ustunga katak (bo'shi ham).
        for (let i = 0; i <= oxir; i++) {
          if (o.ustunlar[i]?.yashirin) continue;
          const t = kat.find((x) => x.c1 === i);
          cells.push(katakXml(i, RS.header, t ? t.matn : null));
        }
        this.put(cells, ms.balandliklar?.[k]);
      }
      for (const x of ms.kataklar) {
        const r1 = h0 + x.qator, r2 = r1 + Math.max(1, x.qatorlar ?? 1) - 1, c2 = x.c2 ?? x.c1;
        if (r2 > r1 || c2 > x.c1) this.merges.push(`${ustunHarfi(x.c1)}${r1}:${ustunHarfi(c2)}${r2}`);
      }
      let n = 0;
      this.raqamQatori = this.put(o.ustunlar.map((u, i) => katakXml(i, RS.raqam, u.yashirin ? null : ++n)));
      return;
    }
    // Jadval sarlavhasi (guruh bo'lsa — ikki qator).
    const ikki = o.ustunlar.some((u) => u.guruh);
    const h1 = this.r;
    this.sarlavhaQatori = h1;
    const bir: Katak[] = [];
    const ikkinchi: Katak[] = [];
    for (let i = 0; i < o.ustunlar.length; i++) {
      const u = o.ustunlar[i];
      if (!ikki || !u.guruh) {
        bir.push(katakXml(i, RS.header, u.sarlavha));
        if (ikki) { ikkinchi.push(katakXml(i, RS.header, null)); this.merges.push(`${ustunHarfi(i)}${h1}:${ustunHarfi(i)}${h1 + 1}`); }
        continue;
      }
      let j = i;
      while (j + 1 < o.ustunlar.length && o.ustunlar[j + 1].guruh === u.guruh) j++;
      bir.push(katakXml(i, RS.header, u.guruh));
      for (let k = i + 1; k <= j; k++) bir.push(katakXml(k, RS.header, null));
      if (j > i) this.merges.push(`${ustunHarfi(i)}${h1}:${ustunHarfi(j)}${h1}`);
      for (let k = i; k <= j; k++) ikkinchi.push(katakXml(k, RS.header, o.ustunlar[k].sarlavha));
      i = j;
    }
    const hBal = Math.max(...o.ustunlar.map((u) => balandlik(u.sarlavha, u.kenglik) ?? 15));
    this.put(bir, ikki ? balandlik(o.ustunlar.map((u) => u.guruh ?? '').sort((a, b) => b.length - a.length)[0], 20) : hBal);
    if (ikki) this.put(ikkinchi, hBal);
    // 1 | 2 | 3 … raqamlash (yashirin ustun raqamlanmaydi).
    let n = 0;
    this.raqamQatori = this.put(o.ustunlar.map((u, i) => katakXml(i, RS.raqam, u.yashirin ? null : ++n)));
  }

  /** Keyingi yoziladigan qator raqami (1-asosli). */
  get r(): number { return this.qatorlar.length + 1; }
  get oxirgiUstun(): number { return this.korinadigan[this.korinadigan.length - 1] ?? 0; }
  get malumotBoshi(): number { return this.raqamQatori + 1; }
  /** Nom (matn) ustuni indeksi — bo'lim va jami yorlig'i shu yerda. */
  get matnUstuni(): number { const i = this.ustunlar.findIndex((u) => u.tur === 'matn'); return i < 0 ? 0 : i; }
  /** Ustun harfi (tur yoki indeks bo'yicha). */
  harf(i: number): string { return ustunHarfi(i); }

  private kenglikJami(a: number, b: number): number {
    let s = 0;
    for (let i = a; i <= b; i++) if (!this.ustunlar[i]?.yashirin) s += this.ustunlar[i]?.kenglik ?? 9;
    return s;
  }

  private put(cells: Katak[], ht?: number, daraja?: number): number {
    this.qatorlar.push({ cells, ht, daraja });
    return this.qatorlar.length;
  }

  private merge(c1: number, r: number, c2: number): void {
    if (c2 > c1) this.merges.push(`${ustunHarfi(c1)}${r}:${ustunHarfi(c2)}${r}`);
  }

  /** Jadval qatori. `qiymatlar` ustunlar tartibida; funksiya berilsa — qator
   * raqamini oladi (nisbiy formulalar o'z qatoriga havola qilishi uchun). */
  qator(tur: RasmiyQatorTuri, qiymatlar: readonly Qiymat[] | ((r: number) => readonly Qiymat[]), o?: { daraja?: number }): number {
    const r = this.r;
    const q = typeof qiymatlar === 'function' ? qiymatlar(r) : qiymatlar;
    const cells = this.ustunlar.map((u, i) => {
      const v = q[i];
      const ku = v != null && typeof v === 'object' ? v.uslub : undefined;
      return katakXml(i, ku === 'norma' ? RS.norma : ku === 'foiz' ? RS.foiz : uslub(tur, u.tur), v);
    });
    let ht: number | undefined;
    this.ustunlar.forEach((u, i) => {
      const v = q[i];
      if (typeof v === 'string' && (u.tur === 'matn' || u.tur === 'kod')) ht = Math.max(ht ?? 0, balandlik(v, u.kenglik) ?? 0) || undefined;
    });
    return this.put(cells, ht, o?.daraja);
  }

  /** Bo'lim (РАЗДЕЛ) sarlavhasi — butun jadval eni bo'ylab birlashtirilgan. */
  bolim(matn: string, o?: { daraja?: number }): number {
    const oxir = this.oxirgiUstun;
    const cells = this.ustunlar.map((_u, i) => katakXml(i, RS.bolimMatn, i === 0 ? matn : null));
    const r = this.put(cells, balandlik(matn, this.kenglikJami(0, oxir)), o?.daraja);
    this.merge(0, r, oxir);
    return r;
  }

  bosh(): number { return this.put([]); }

  /** Erkin qator: har katak c1..c2 ga birlashtiriladi (quti — ramkali). */
  blok(kataklar: ReadonlyArray<BlokKatak>, ht?: number): number {
    const S: Record<NonNullable<BlokKatak['tur']>, number> = {
      yorliq: RS.titulYorliq, qiymat: RS.titulQiymat, quti: RS.qutiMarkaz, qutiQalin: RS.header,
      imzo: RS.imzoMatn, izoh: RS.imzoIzoh, ost: RS.ost, qalin: RS.bolimSarlavha,
    };
    const cells: Katak[] = [];
    for (const k of kataklar) {
      const s = S[k.tur ?? 'qiymat'];
      cells.push(katakXml(k.c1, s, k.matn));
      // Ramkali katak birlashmasi — ichki kataklar ham ramkali (chegara uzilmasin).
      if (k.tur === 'quti' || k.tur === 'qutiQalin') for (let i = k.c1 + 1; i <= (k.c2 ?? k.c1); i++) cells.push(katakXml(i, s, null));
    }
    const r = this.put(cells, ht);
    for (const k of kataklar) this.merge(k.c1, r, k.c2 ?? k.c1);
    return r;
  }

  /** Jadvaldan tashqaridagi qalin sarlavha (masalan "ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ"). */
  sarlavhaMatn(matn: string): number {
    const r = this.put([katakXml(0, RS.bolimSarlavha, matn)]);
    this.merge(0, r, this.oxirgiUstun);
    return r;
  }

  /** Izoh (kursiv) — butun eni bo'ylab. */
  izoh(matn: string): number {
    const r = this.put([katakXml(0, RS.izoh, matn)], balandlik(matn, this.kenglikJami(0, this.oxirgiUstun)));
    this.merge(0, r, this.oxirgiUstun);
    return r;
  }

  /**
   * "ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ (n)" — hal qilinmagan joylar ro'yxati (H7).
   * Ro'yxat bo'sh bo'lsa hech narsa yozilmaydi.
   */
  diqqat(bandlar: ReadonlyArray<{ nom: string; sabab: string; joy?: string }>, sarlavha = 'ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ'): void {
    if (!bandlar.length) return;
    this.bosh();
    this.sarlavhaMatn(`${sarlavha} (${bandlar.length})`);
    bandlar.forEach((b, i) => this.izoh(`${i + 1}. ${b.nom}${b.joy ? ` — ${b.joy}` : ''}: ${b.sabab}`));
  }

  /** Imzo bloki (H3): har tomon — "РОЛЬ:  Nom yoki chiziq" | "____" | "(подпись)" | "М.П.". */
  imzo(tomonlar: readonly ImzoTomon[]): void {
    this.bosh();
    const oxir = this.oxirgiUstun;
    const mc = this.matnUstuni;
    // Imzo chizig'i jadval o'ng yarmida: matn ustunidan keyingi birinchi ko'rinadigan ustun.
    const vis = this.korinadigan.filter((c) => c > mc);
    const imzoC = vis[Math.floor(vis.length / 2)] ?? oxir;
    tomonlar.forEach((t, i) => {
      if (i) this.put([], 8);
      const r = this.put([katakXml(0, RS.imzoMatn, imzoMatni(t.rol, t.nom)), katakXml(imzoC, RS.imzoMatn, IMZO_IMZO_CHIZIQ)], 24);
      this.merge(0, r, Math.max(mc, imzoC - 1));
      const r2 = this.put([
        katakXml(0, RS.imzoIzoh, imzoMuhrli(t.rol) ? IMZO_IZOH : IMZO_IZOH_SHAXS),
        katakXml(imzoC, RS.imzoIzoh, IMZO_PODPIS),
        ...(imzoMuhrli(t.rol) && oxir > imzoC ? [katakXml(oxir, RS.imzoIzoh, IMZO_MP)] : []),
      ]);
      this.merge(0, r2, Math.max(mc, imzoC - 1));
    });
  }

  meta(): RasmiyVaraqMeta {
    return { nom: this.nom, sarlavhaQatori: this.sarlavhaQatori, raqamQatori: this.raqamQatori, malumotBoshi: this.malumotBoshi, oxirgiQator: this.qatorlar.length, oxirgiUstun: this.oxirgiUstun };
  }

  /** Varaq XML (worksheet). */
  xml(): string {
    const maxD = Math.max(0, ...this.qatorlar.map((q) => q.daraja ?? 0));
    const rows = this.qatorlar.map((q, i) => {
      const r = i + 1;
      const attrs = `${q.ht ? ` ht="${q.ht}" customHeight="1"` : ''}${q.daraja ? ` outlineLevel="${Math.min(7, q.daraja)}"` : ''}`;
      if (!q.cells.length) return `<row r="${r}"${attrs}/>`;
      return `<row r="${r}"${attrs}>${[...q.cells].sort((a, b) => a.col - b.col).map((c) => c.xml(`${ustunHarfi(c.col)}${r}`)).join('')}</row>`;
    }).join('');
    const cols = this.ustunlar.map((u, i) => `<col min="${i + 1}" max="${i + 1}" width="${u.kenglik}" customWidth="1"${u.yashirin ? ' hidden="1"' : ''}/>`).join('');
    const oxirgiQ = Math.max(1, this.qatorlar.length);
    const pane = `<pane ySplit="${this.raqamQatori}" topLeftCell="A${this.raqamQatori + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.raqamQatori + 1}" sqref="A${this.raqamQatori + 1}"/>`;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetPr><outlinePr summaryBelow="0"/><pageSetUpPr fitToPage="1"/></sheetPr>'
      + `<dimension ref="A1:${ustunHarfi(this.ustunlar.length - 1)}${oxirgiQ}"/>`
      + `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>`
      + `<sheetFormatPr defaultRowHeight="13.2"${maxD ? ` outlineLevelRow="${Math.min(7, maxD)}"` : ''}/>`
      + `<cols>${cols}</cols>`
      + `<sheetData>${rows}</sheetData>`
      + (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
      + '<printOptions horizontalCentered="1"/>'
      + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>'
      + `<pageSetup paperSize="9" orientation="${this.yonalish}" fitToWidth="1" fitToHeight="0"/>`
      + '<headerFooter><oddFooter>' + xmlEsc('&L&7' + HUJJAT_KOLONTITUL + '&C&8Страница &P из &N') + '</oddFooter></headerFooter>'
      + '</worksheet>';
  }
}

// ───────────────────────── kitob ─────────────────────────

export type RasmiyKitobNatija = { bytes: Uint8Array; varaqlar: RasmiyVaraqMeta[] };

/** Bir yoki bir nechta rasmiy varaqdan .xlsx yasaydi (Print_Area, Print_Titles,
 * fullCalcOnLoad). Varaq nomlari takrorlansa raqam qo'shiladi. */
export function rasmiyKitob(varaqlar: readonly RasmiyVaraq[]): RasmiyKitobNatija {
  if (!varaqlar.length) throw new Error('RASMIY_KITOB_BOSH');
  const nomlar: string[] = [];
  for (const v of varaqlar) {
    let nom = v.nom || 'Лист';
    for (let i = 2; nomlar.some((x) => x.toUpperCase() === nom.toUpperCase()); i++) nom = `${v.nom.slice(0, 28)} ${i}`;
    nomlar.push(nom);
  }
  const metas = varaqlar.map((v, i) => ({ ...v.meta(), nom: nomlar[i] }));
  const sheets = nomlar.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const dn = metas.flatMap((m, i) => [
    `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${xmlEsc(`${sheetRef(m.nom)}!$A$1:$${ustunHarfi(m.oxirgiUstun)}$${m.oxirgiQator}`)}</definedName>`,
    `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xmlEsc(`${sheetRef(m.nom)}!$${m.sarlavhaQatori}:$${m.raqamQatori}`)}</definedName>`,
  ]).join('');
  const files: Zippable = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + varaqlar.map((_v, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
    'docProps/core.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xmlEsc(nomlar[0])}</dc:title></cp:coreProperties>`),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets}</sheets><definedNames>${dn}</definedNames><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + varaqlar.map((_v, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${varaqlar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(RASMIY_STYLES_XML),
  };
  varaqlar.forEach((v, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(v.xml()); });
  return { bytes: zipSync(files, { level: 6 }), varaqlar: metas };
}

/** Ro'yxatdagi qatorlar yig'indisi formulasi: `SUM(H5:H9,H12)`; bo'sh bo'lsa null. */
export function sumFormula(harf: string, qatorlar: readonly number[]): string | null {
  return qatorlar.length ? sumRefs(harf, qatorlar) : null;
}

/** Pul yaxlitlash — Excel ROUND(x;2) bilan bir xil: yarmi noldan uzoqqa,
 * 15 muhim raqamgacha tozalab (1,005 → 1,01; −2,345 → −2,35). */
export function yaxlit2(x: number): number {
  if (!Number.isFinite(x)) return x;
  const a = Number((Math.abs(x) * 100).toPrecision(15));
  const r = Math.round(a) / 100;
  return x < 0 ? -r : r;
}
