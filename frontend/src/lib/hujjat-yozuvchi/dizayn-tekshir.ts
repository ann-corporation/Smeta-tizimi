/**
 * hujjat-yozuvchi/dizayn-tekshir.ts — tayyor .xlsx ning HUJJAT DIZAYNI talablariga mosligini tekshiradi
 * (`hujjatTekshir` ning ko'rinish tomoni; testlar uchun). Pul/formulaga qaramaydi — faqat uslub:
 *   1. «Тип» belgi ustuni yashirin (dizaynda `tipKorsat` o'chiq bo'lsa);
 *   2. daraja shrifti: BL qalin, RS kursiv, MAT/OB qalin (dizayn sozlamasiga ko'ra);
 *   3. har daraja katagida to'rt tomonlama ramka (dizaynda ramka yoqilgan bo'lsa);
 *   4. hech bir ustun o'z sonidan tor emas (formatlangan son, minglik ajratgich bilan);
 *   5. uzun matn katagi o'ralgan (wrap).
 */
import { strFromU8, unzipSync } from 'fflate';
import { sonUzunligi, type DarajaKalit, type HujjatDizayn } from './dizayn';
import { uslubniOch } from './rasmiy';

export type TekshirKatak = { ref: string; col: number; qator: number; s: number; matn: string | null; son: number | null; daraja: DarajaKalit | null };
export type XfOqildi = {
  numFmtId: number; fontId: number; fillId: number; borderId: number;
  wrap: boolean; indent: number; horizontal: string | null;
};
export type DizaynVaraq = {
  ustunlar: Array<{ kenglik: number; yashirin: boolean }>;
  birlashgan: Set<string>;
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
    wrap: /wrapText="1"/.test(m[2] ?? ''), indent: Number(/indent="(\d+)"/.exec(m[2] ?? '')?.[1] ?? 0), horizontal: /horizontal="(\w+)"/.exec(m[2] ?? '')?.[1] ?? null,
  }));
  const varaqlar: DizaynVaraq[] = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1])).map((k) => {
    const x = strFromU8(z[k]);
    const ustunlar: DizaynVaraq['ustunlar'] = [];
    for (const m of x.matchAll(/<col\s[^>]*?\/>/g)) ustunlar[Number(attr(m[0], 'min')) - 1] = { kenglik: Number(attr(m[0], 'width') ?? 9), yashirin: attr(m[0], 'hidden') === '1' };
    const birlashgan = new Set<string>();
    for (const m of x.matchAll(/<mergeCell ref="([A-Z]+\d+):[A-Z]+\d+"\/>/g)) birlashgan.add(m[1]);
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
    return { ustunlar, birlashgan, qatorlar };
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
  });
  return xato;
}
