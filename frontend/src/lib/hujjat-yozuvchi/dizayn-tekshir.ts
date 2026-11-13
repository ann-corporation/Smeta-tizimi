/**
 * hujjat-yozuvchi/dizayn-tekshir.ts — tayyor .xlsx ning HUJJAT DIZAYNI talablariga mosligini tekshiradi
 * (`hujjatTekshir` ning ko'rinish tomoni; testlar uchun). Pul/formulaga qaramaydi — faqat uslub:
 *   1. «Тип» belgi ustuni yashirin (dizaynda `tipKorsat` o'chiq bo'lsa);
 *   2. daraja shrifti: BL qalin, RS kursiv, MAT/OB qalin (dizayn sozlamasiga ko'ra);
 *   3. har daraja katagida to'rt tomonlama ramka (dizaynda ramka yoqilgan bo'lsa);
 *   4. hech bir ustun o'z sonidan tor emas (formatlangan son, minglik ajratgich bilan);
 *   5. uzun matn katagi o'ralgan (wrap); shrinkToFit YO'Q (egasi 2026-11-13: «katta matn juda kichik ko'rinyapti»);
 *   6. yashirin ustun (Тип, Кат., КАЛИТ …) katagi o'ralmagan; son katagi o'ralmagan va kichraymaydi;
 *   7. qator balandligi: ht yo'q qator bir qatorga sig'adi; jadval qatori balandligi FAQAT ko'rinadigan ustunlardan;
 *   8. chop etish: A4, bir sahifa eniga (fitToWidth=1), yo'nalish, sarlavha qatorlari har sahifada (Print_Titles).
 */
import { strFromU8, unzipSync } from 'fflate';
import { unEsc } from './ooxml';
import { sonUzunligi, type DarajaKalit, type HujjatDizayn } from './dizayn';
import { uslubniOch } from './rasmiy';
import { qatorBalandligi, SUKUT_QATOR_PT, type BalandlikKatak } from './qator-balandlik';

export type TekshirKatak = { ref: string; col: number; qator: number; s: number; matn: string | null; son: number | null; daraja: DarajaKalit | null };
export type XfOqildi = {
  numFmtId: number; fontId: number; fillId: number; borderId: number;
  wrap: boolean; /** shrinkToFit="1" */ shrink: boolean; indent: number; horizontal: string | null;
};
export type DizaynVaraq = {
  ustunlar: Array<{ kenglik: number; yashirin: boolean }>;
  birlashgan: Set<string>;
  /** Birlashma diapazonlari: boshlang'ich katak → oxirgi ustun indeksi (bir qatorli birlashma). */
  birlashmaOxiri: Map<string, number>;
  /** Print_Titles (workbook defined name) bormi. */
  chopSarlavha: boolean;
  chop: { bittaEnli: boolean; yonalish: string | null; qogoz: string | null };
  qatorlar: Array<{ r: number; ht: number | null; kataklar: TekshirKatak[] }>;
};
export type DizaynOqildi = {
  numFmts: Map<number, string>;
  fontlar: Array<{ qalin: boolean; kursiv: boolean; sz: number; rang: string | null }>;
  fonlar: Array<string | null>;
  chegaralar: Array<{ l: boolean; r: boolean; t: string; b: string }>;
  xflar: XfOqildi[];
  varaqlar: DizaynVaraq[];
};

const attr = (s: string, n: string): string | null => new RegExp(`(?:^|\\s)${n}="([^"]*)"`).exec(s)?.[1] ?? null;
const ustunRaqami = (ref: string): number => [...ref.replace(/\d+/g, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export function dizaynOqi(bytes: Uint8Array): DizaynOqildi {
  const z = unzipSync(bytes);
  const st = strFromU8(z['xl/styles.xml']);
  const numFmts = new Map<number, string>();
  for (const m of st.matchAll(/<numFmt\s[^>]*?\/>/g)) numFmts.set(Number(attr(m[0], 'numFmtId')), (attr(m[0], 'formatCode') ?? '').replace(/&quot;/g, '"'));
  const blok = (tag: string) => st.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
  const fontlar = [...blok('fonts').matchAll(/<font>([\s\S]*?)<\/font>/g)].map((m) => ({
    qalin: /<b\/>/.test(m[1]), kursiv: /<i\/>/.test(m[1]), sz: Number(/<sz val="([\d.]+)"/.exec(m[1])?.[1] ?? 10), rang: /<color rgb="FF([0-9A-F]{6})"/.exec(m[1])?.[1] ?? null,
  }));
  const fonlar = [...blok('fills').matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => /patternType="solid"/.test(m[1]) ? (/fgColor rgb="FF([0-9A-F]{6})"/.exec(m[1])?.[1] ?? null) : null);
  const chegaralar = [...blok('borders').matchAll(/<border>([\s\S]*?)<\/border>/g)].map((m) => {
    const yon = (t: string) => new RegExp(`<${t}\\s+style="([a-zA-Z]+)"`).exec(m[1])?.[1] ?? '';
    return { l: yon('left') !== '', r: yon('right') !== '', t: yon('top'), b: yon('bottom') };
  });
  const xflar = [...blok('cellXfs').matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map((m) => ({
    numFmtId: Number(attr(m[1], 'numFmtId') ?? 0), fontId: Number(attr(m[1], 'fontId') ?? 0), fillId: Number(attr(m[1], 'fillId') ?? 0), borderId: Number(attr(m[1], 'borderId') ?? 0),
    wrap: /wrapText="1"/.test(m[2] ?? ''), shrink: /shrinkToFit="1"/.test(m[2] ?? ''), indent: Number(/indent="(\d+)"/.exec(m[2] ?? '')?.[1] ?? 0), horizontal: /horizontal="(\w+)"/.exec(m[2] ?? '')?.[1] ?? null,
  }));
  const wbXml = z['xl/workbook.xml'] ? strFromU8(z['xl/workbook.xml']) : '';
  const varaqlar: DizaynVaraq[] = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1])).map((k, vi) => {
    const x = strFromU8(z[k]);
    const ustunlar: DizaynVaraq['ustunlar'] = [];
    for (const m of x.matchAll(/<col\s[^>]*?\/>/g)) ustunlar[Number(attr(m[0], 'min')) - 1] = { kenglik: Number(attr(m[0], 'width') ?? 9), yashirin: attr(m[0], 'hidden') === '1' };
    const birlashgan = new Set<string>();
    const birlashmaOxiri = new Map<string, number>();
    for (const m of x.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+)(\d+)"\/>/g)) { birlashgan.add(m[1]); birlashmaOxiri.set(m[1], ustunRaqami(m[2])); }
    const chopSarlavha = new RegExp(`<definedName\\b[^>]*name="_xlnm\\.Print_Titles"[^>]*localSheetId="${vi}"|<definedName\\b[^>]*localSheetId="${vi}"[^>]*name="_xlnm\\.Print_Titles"`).test(wbXml);
    const ps = /<pageSetup\b[^>]*\/>/.exec(x)?.[0] ?? '';
    const chop = { bittaEnli: /<pageSetUpPr\b[^>]*fitToPage="1"/.test(x) && (attr(ps, 'fitToWidth') ?? '1') === '1', yonalish: attr(ps, 'orientation'), qogoz: attr(ps, 'paperSize') };
    const qatorlar = [...x.matchAll(/<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)].map((rm) => {
      const kataklar = [...(rm[2] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((cm): TekshirKatak => {
        const ref = attr(cm[1], 'r')!;
        const s = Number(attr(cm[1], 's') ?? 0);
        const ichki = cm[2] ?? '';
        const matn = /<t[^>]*>([\s\S]*?)<\/t>/.exec(ichki)?.[1] ?? null;
        const v = /<v>([^<]*)<\/v>/.exec(ichki)?.[1];
        const tur = attr(cm[1], 't');
        const son = matn == null && v != null && tur !== 'str' && Number.isFinite(Number(v)) ? Number(v) : null;
        return { ref, col: ustunRaqami(ref), qator: Number(attr(rm[1], 'r')), s, matn: matn ?? (tur === 'str' ? v ?? null : null), son, daraja: uslubniOch(s).daraja };
      });
      return { r: Number(attr(rm[1], 'r')), ht: attr(rm[1], 'ht') != null ? Number(attr(rm[1], 'ht')) : null, kataklar };
    });
    return { ustunlar, birlashgan, birlashmaOxiri, chopSarlavha, chop, qatorlar };
  });
  return { numFmts, fontlar, fonlar, chegaralar, xflar, varaqlar };
}

/** Son formatidan (kod yoki o'rnatilgan id) o'nlik xonalar chegarasi. */
function formatXonalari(id: number, kodlar: Map<number, string>): { min: number; max: number } | null {
  if (id === 0) return null;
  const kod = kodlar.get(id) ?? (id === 4 ? '#,##0.00' : id === 2 ? '0.00' : id === 3 ? '#,##0' : id === 1 ? '0' : null);
  if (!kod) return null;
  const n = kod.indexOf('.');
  if (n < 0) return { min: 0, max: 0 };
  const fr = kod.slice(n + 1);
  return { min: (fr.match(/0/g) ?? []).length, max: (fr.match(/[0#]/g) ?? []).length };
}

/** Katak o'rash/kichraytirish/balandlik/chop qoidalari (egasi 2026-11-13) — bitta varaq uchun. */
function qoidaXatolari(o: DizaynOqildi, v: DizaynVaraq, nom: string, d: HujjatDizayn): string[] {
  const xato: string[] = [];
  const eni = (k: TekshirKatak): number => {
    const oxir = v.birlashmaOxiri.get(k.ref) ?? k.col;
    let e = 0;
    for (let c = k.col; c <= oxir; c++) if (!v.ustunlar[c]?.yashirin) e += v.ustunlar[c]?.kenglik ?? 9;
    return e;
  };
  const balandlikKatak = (k: TekshirKatak, korinadiganFaqat: boolean): BalandlikKatak | null => {
    const xf = o.xflar[k.s];
    if (!xf?.wrap || k.matn == null || k.son != null) return null;
    const yashirin = v.ustunlar[k.col]?.yashirin === true;
    if (korinadiganFaqat && yashirin) return null;
    const f = o.fontlar[xf.fontId];
    return { matn: unEsc(k.matn), eni: eni(k), yashirin, qalin: f?.qalin, sz: f?.sz, otstup: xf.indent };
  };
  for (const q of v.qatorlar) {
    for (const k of q.kataklar) {
      const xf = o.xflar[k.s];
      if (!xf) continue;
      if (xf.shrink) xato.push(`${nom}: ${k.ref} shrinkToFit (matn kichrayadi — o'rash kerak)`);
      const yashirin = v.ustunlar[k.col]?.yashirin === true;
      if (yashirin && xf.wrap) xato.push(`${nom}: ${k.ref} yashirin ustun katagi o'ralgan (qatorni shishiradi)`);
      if (k.son != null && xf.wrap && !yashirin) xato.push(`${nom}: ${k.ref} son katagi o'ralgan (son o'ralmaydi — ustun kengayadi)`);
    }
    // 7) qator balandligi. Birlashmali qatorlar (sarlavha, imzo, bo'lim) o'z hisobi bilan — tekshirilmaydi.
    if (q.kataklar.some((k) => v.birlashgan.has(k.ref))) continue;
    const hamma = qatorBalandligi(q.kataklar.map((k) => balandlikKatak(k, false)).filter((x): x is BalandlikKatak => !!x), { maks: d.qatorMaks });
    const korinadi = qatorBalandligi(q.kataklar.map((k) => balandlikKatak(k, true)).filter((x): x is BalandlikKatak => !!x), { maks: d.qatorMaks });
    if (q.ht == null && korinadi != null) xato.push(`${nom}: ${q.r}-qator o'ralgan matn uchun balandlik berilmagan (matn kesiladi)`);
    const jadvalQatori = q.kataklar.some((k) => k.daraja != null);
    if (jadvalQatori && q.ht != null && (korinadi == null ? q.ht > SUKUT_QATOR_PT + 0.5 : Math.abs(q.ht - korinadi) > 0.6)) {
      xato.push(`${nom}: ${q.r}-qator balandligi ${q.ht} — ko'rinadigan ustunlardan kutilgan ${korinadi ?? 'sukut'}${hamma != null && hamma !== korinadi ? ' (yashirin ustun semirtirgan)' : ''}`);
    }
  }
  // 8) chop etish sozlamasi
  if (!v.chop.bittaEnli) xato.push(`${nom}: chop — bir sahifa eniga (fitToPage + fitToWidth=1) o'rnatilmagan`);
  if (v.chop.yonalish !== 'portrait' && v.chop.yonalish !== 'landscape') xato.push(`${nom}: chop yo'nalishi (orientation) berilmagan`);
  if (v.chop.qogoz == null) xato.push(`${nom}: qog'oz o'lchami (paperSize) berilmagan`);
  if (!v.chopSarlavha && v.qatorlar.length > 2) xato.push(`${nom}: sarlavha qatorlari har sahifada takrorlanmaydi (Print_Titles yo'q)`);
  return xato;
}

/**
 * Dizayn talablarini tekshiradi; bo'sh ro'yxat — hammasi joyida. `d` — hujjat yozilgan dizayn.
 */
export function hujjatDizaynTekshir(bytes: Uint8Array, d: HujjatDizayn): string[] {
  const o = dizaynOqi(bytes);
  const xato: string[] = [];
  o.varaqlar.forEach((v, vi) => {
    const nom = `varaq ${vi + 1}`;
    // 1) «Тип» belgi ustuni
    if (!d.tipKorsat) {
      for (const q of v.qatorlar) for (const k of q.kataklar) {
        if (k.matn === 'Тип' && !v.ustunlar[k.col]?.yashirin) xato.push(`${nom}: «Тип» ustuni (${k.ref}) yashirin emas`);
      }
    }
    for (const q of v.qatorlar) for (const k of q.kataklar) {
      const xf = o.xflar[k.s];
      if (!xf) { xato.push(`${nom}: ${k.ref} uslubi yo'q (s=${k.s})`); continue; }
      const ust = v.ustunlar[k.col];
      // 4) son sig'ishi
      if (k.son != null && ust && !ust.yashirin && !v.birlashgan.has(k.ref)) {
        const x = formatXonalari(xf.numFmtId, o.numFmts);
        const uz = x ? sonUzunligi(k.son, x.min, x.max) : String(k.son).length;
        if (ust.kenglik < uz + 1) xato.push(`${nom}: ${k.ref} soni (${uz} belgi) ustun eniga (${ust.kenglik}) sig'maydi`);
      }
      if (!k.daraja) continue;
      const u = d.daraja[k.daraja];
      const f = o.fontlar[xf.fontId];
      // 2) shrift
      if (f.qalin !== u.qalin) xato.push(`${nom}: ${k.ref} (${k.daraja}) qalinligi ${f.qalin} (kutilgan ${u.qalin})`);
      if (!uslubniOch(k.s).rang?.match(/almashtirilgan/) && f.kursiv !== u.kursiv) xato.push(`${nom}: ${k.ref} (${k.daraja}) kursivi ${f.kursiv} (kutilgan ${u.kursiv})`);
      // 3) ramka
      const b = o.chegaralar[xf.borderId];
      if (d.chegara !== 'none' && !(b.l && b.r && b.t && b.b)) xato.push(`${nom}: ${k.ref} (${k.daraja}) to'rt tomonlama ramkasiz`);
      // 5) o'rash
      if (k.matn != null && !v.birlashgan.has(k.ref) && ust && !ust.yashirin && k.matn.length > ust.kenglik && !xf.wrap) xato.push(`${nom}: ${k.ref} uzun matn o'ralmagan`);
    }
    xato.push(...qoidaXatolari(o, v, nom, d));
  });
  return xato;
}

/** Darajalar bo'yicha: nechta katak, qalin/kursiv qiymatlari (generator testlari uchun: BL qalin, RS kursiv, MAT/OB qalin). */
export function darajaHisobot(bytes: Uint8Array): Partial<Record<DarajaKalit, { soni: number; qalin: Set<boolean>; kursiv: Set<boolean> }>> {
  const o = dizaynOqi(bytes);
  const r: Partial<Record<DarajaKalit, { soni: number; qalin: Set<boolean>; kursiv: Set<boolean> }>> = {};
  for (const v of o.varaqlar) for (const q of v.qatorlar) for (const k of q.kataklar) {
    if (!k.daraja) continue;
    const f = o.fontlar[o.xflar[k.s].fontId];
    const x = r[k.daraja] ??= { soni: 0, qalin: new Set(), kursiv: new Set() };
    x.soni++; x.qalin.add(f.qalin); x.kursiv.add(f.kursiv);
  }
  return r;
}

/** «Тип» sarlavhali ustunlar yashirinmi: har bir shunday ustun uchun true/false (bo'lmasa — bo'sh ro'yxat). */
export function tipUstunlariYashirin(bytes: Uint8Array): boolean[] {
  const o = dizaynOqi(bytes);
  return o.varaqlar.flatMap((v) => v.qatorlar.flatMap((q) => q.kataklar.filter((k) => k.matn === 'Тип').map((k) => v.ustunlar[k.col]?.yashirin === true)));
}