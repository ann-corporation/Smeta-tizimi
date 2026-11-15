/**
 * hujjat-yozuvchi/korinish.ts — tayyor hujjatni (.xlsx) saytda AYNAN hujjatdagiday
 * ko'rsatish uchun modelga aylantiradi (egasi, 2026-09-25: "hamma hujjatni saytda
 * har bir qatorini aynan hujjatdagiday qulay ko'ra olishimiz, tushuna olishimiz,
 * ajrata olishimiz kerak").
 *
 * Ikkinchi haqiqat manbai yo'q: ko'rinish — yuklab olinadigan fayldan o'qiladi
 * (keshlangan qiymatlar = Excel ochganda ko'radigan sonlar). Rasmiy hujjatlar ham,
 * asl fayl davomi (Oferta, LRV) ham bir xil o'qiladi: kataklar, birlashmalar,
 * ustun kengligi, yashirin ustunlar, qalin shrift, son formati.
 */
import { strFromU8, unzipSync } from 'fflate';
import { ustunIndeksi, unEsc } from './ooxml';
import { varaqYollari } from './kitob';

export type KorinishKatak = {
  /** 0-asosli ustun. */
  c: number;
  matn: string;
  /** Son bo'lsa — qiymat (formatlash uchun). */
  son: number | null;
  qalin: boolean;
  /** Kursiv shrift (RS qatorlar) — qurilmada PDF chizishda kerak. */
  kursiv: boolean;
  /** Katak foni (RRGGBB, '#'siz) yoki null — sarlavha/jami qatorlari ranglari. */
  fon: string | null;
  tekis: 'left' | 'center' | 'right';
  /** Birlashma: nechta ustun egallaydi (yashirinlarsiz). */
  span: number;
  formula: boolean;
};

export type KorinishQatorTuri = 'sarlavha' | 'bolim' | 'jami' | 'oddiy' | 'bosh';

export type KorinishQator = { r: number; turi: KorinishQatorTuri; kataklar: KorinishKatak[] };

export type KorinishVaraq = {
  nom: string;
  /** Ko'rinadigan ustunlar (0-asosli) va kengligi (belgilar). */
  ustunlar: Array<{ c: number; kenglik: number }>;
  qatorlar: KorinishQator[];
  /** Jadval raqamlash qatori (1 | 2 | 3 …) — bundan keyingi qatorlar ma'lumot. */
  raqamQatori: number | null;
};

const atr = (tag: string, nom: string): string | null => tag.match(new RegExp(`\\b${nom}="([^"]*)"`))?.[1] ?? null;

type Uslub = { qalin: boolean; kursiv: boolean; fon: string | null; tekis: 'left' | 'center' | 'right' | null; numFmt: number; fmtKod: string | null };

function uslublar(files: Record<string, Uint8Array>): Uslub[] {
  const x = files['xl/styles.xml'] ? strFromU8(files['xl/styles.xml']) : '';
  const fmt = new Map<number, string>();
  for (const m of x.matchAll(/<(?:\w+:)?numFmt\b([^>]*?)\/?>/g)) fmt.set(Number(atr(m[1], 'numFmtId')), unEsc(atr(m[1], 'formatCode') ?? ''));
  const fontlar = [...(x.match(/<(?:\w+:)?fonts\b[^>]*>([\s\S]*?)<\/(?:\w+:)?fonts>/)?.[1] ?? '').matchAll(/<(?:\w+:)?font\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?font>)/g)]
    .map((m) => ({
      qalin: /<(?:\w+:)?b(?:\s[^>]*)?\/?>/.test(m[1] ?? '') && !/<(?:\w+:)?b\s+val="(?:0|false)"/.test(m[1] ?? ''),
      kursiv: /<(?:\w+:)?i(?:\s[^>]*)?\/?>/.test(m[1] ?? '') && !/<(?:\w+:)?i\s+val="(?:0|false)"/.test(m[1] ?? ''),
    }));
  const fonlar = [...(x.match(/<(?:\w+:)?fills\b[^>]*>([\s\S]*?)<\/(?:\w+:)?fills>/)?.[1] ?? '').matchAll(/<(?:\w+:)?fill\b[^>]*>([\s\S]*?)<\/(?:\w+:)?fill>/g)]
    .map((m) => { const rgb = m[1].match(/<(?:\w+:)?fgColor\b[^>]*\brgb="([0-9A-Fa-f]{6,8})"/)?.[1]; return rgb && /<(?:\w+:)?patternFill\b[^>]*patternType="solid"/.test(m[1]) ? rgb.slice(-6).toUpperCase() : null; });
  const xfs = x.match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/)?.[1] ?? '';
  return [...xfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?xf>)/g)].map((m) => {
    const numFmt = Number(atr(m[1], 'numFmtId') ?? 0);
    const al = (m[2] ?? '').match(/<(?:\w+:)?alignment\b([^>]*?)\/?>/)?.[1] ?? '';
    const h = atr(al, 'horizontal');
    return {
      qalin: fontlar[Number(atr(m[1], 'fontId') ?? 0)]?.qalin ?? false,
      kursiv: fontlar[Number(atr(m[1], 'fontId') ?? 0)]?.kursiv ?? false,
      fon: fonlar[Number(atr(m[1], 'fillId') ?? 0)] ?? null,
      tekis: h === 'center' || h === 'centerContinuous' ? 'center' : h === 'right' ? 'right' : h === 'left' ? 'left' : null,
      numFmt, fmtKod: fmt.get(numFmt) ?? null,
    };
  });
}

/** Son formatlash — ru-RU (bo'sh joy bilan), formatdagi kasr xonalari soni bo'yicha. */
export function sonMatni(v: number, u: Pick<Uslub, 'numFmt' | 'fmtKod'> | undefined): string {
  const kod = u?.fmtKod ?? (u?.numFmt === 4 || u?.numFmt === 2 ? '#,##0.00' : u?.numFmt === 3 ? '#,##0' : null);
  let min = 0, max = 10;
  if (kod) {
    const kasr = kod.split(';')[0].split('.')[1] ?? '';
    min = (kasr.match(/0/g) ?? []).length;
    max = min + (kasr.match(/#/g) ?? []).length;
  } else if (!Number.isInteger(v)) { max = 6; }
  return v.toLocaleString('ru-RU', { minimumFractionDigits: min, maximumFractionDigits: Math.max(min, max) });
}

export function hujjatKorinishi(bytes: Uint8Array): KorinishVaraq[] {
  const files = unzipSync(bytes);
  const ss = (() => {
    const x = files['xl/sharedStrings.xml'];
    if (!x) return [] as string[];
    return [...strFromU8(x).matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) =>
      [...m[1].matchAll(/<(?:\w+:)?t\b[^>]*>([^<]*)<\/(?:\w+:)?t>/g)].map((t) => unEsc(t[1])).join(''));
  })();
  const us = uslublar(files);
  const wb = files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : '';
  const tags = [...wb.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)].map((m) => m[1]);
  const out: KorinishVaraq[] = [];
  varaqYollari(files).forEach((y, i) => {
    if (/\bstate="(hidden|veryHidden)"/.test(tags[i] ?? '')) return;
    const xml = files[y.path] ? strFromU8(files[y.path]) : '';
    // Ustunlar: kenglik va yashirinlik.
    const kenglik = new Map<number, number>();
    const yashirin = new Set<number>();
    for (const c of xml.matchAll(/<(?:\w+:)?col\b([^>]*?)\/?>/g)) {
      const a = Number(atr(c[1], 'min')), b = Number(atr(c[1], 'max'));
      const w = Number(atr(c[1], 'width') ?? 9);
      const h = /\bhidden="(?:1|true)"/.test(c[1]);
      for (let k = a; k <= Math.min(b, a + 200); k++) { kenglik.set(k - 1, w); if (h) yashirin.add(k - 1); }
    }
    // Birlashmalar: chap-yuqori katak → oxirgi ustun.
    const merge = new Map<string, number>();
    const yopiq = new Set<string>();
    for (const m of xml.matchAll(/<(?:\w+:)?mergeCell\b[^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
      const c1 = ustunIndeksi(m[1]), r1 = Number(m[2]), c2 = ustunIndeksi(m[3]), r2 = Number(m[4]);
      merge.set(`${r1}:${c1}`, c2);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) yopiq.add(`${r}:${c}`);
    }
    let maxC = 0;
    const qatorlar: KorinishQator[] = [];
    let raqamQatori: number | null = null;
    for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
      const r = Number(atr(rm[1], 'r'));
      const kataklar: KorinishKatak[] = [];
      for (const cm of (rm[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const ref = atr(cm[1], 'r') ?? '';
        const c = ustunIndeksi(ref.replace(/\d+/g, ''));
        if (yashirin.has(c) || yopiq.has(`${r}:${c}`)) continue;
        const inner = cm[2] ?? '';
        const t = atr(cm[1], 't');
        const u = us[Number(atr(cm[1], 's') ?? 0)];
        const vM = inner.match(/<(?:\w+:)?v>([^<]*)<\/(?:\w+:)?v>/);
        let matn = '';
        let son: number | null = null;
        if (t === 'inlineStr') matn = [...inner.matchAll(/<(?:\w+:)?t\b[^>]*>([^<]*)<\/(?:\w+:)?t>/g)].map((x) => unEsc(x[1])).join('');
        else if (t === 's' && vM) matn = ss[Number(vM[1])] ?? '';
        else if (t === 'str' && vM) matn = unEsc(vM[1]);
        else if (t === 'b' && vM) matn = vM[1] === '1' ? 'ИСТИНА' : 'ЛОЖЬ';
        else if (vM && vM[1] !== '') { son = Number(vM[1]); matn = Number.isFinite(son) ? sonMatni(son, u) : vM[1]; }
        const oxir = merge.get(`${r}:${c}`) ?? c;
        let span = 0;
        for (let k = c; k <= oxir; k++) if (!yashirin.has(k)) span++;
        maxC = Math.max(maxC, oxir);
        kataklar.push({ c, matn, son, qalin: u?.qalin ?? false, kursiv: u?.kursiv ?? false, fon: u?.fon ?? null, tekis: u?.tekis ?? (son != null ? 'right' : 'left'), span: Math.max(1, span), formula: /<(?:\w+:)?f\b/.test(inner) });
      }
      const matnlar = kataklar.map((k) => k.matn.trim()).filter(Boolean);
      if (raqamQatori == null && matnlar.length >= 4 && matnlar.every((m, j) => m === String(j + 1))) raqamQatori = r;
      const birinchi = matnlar[0] ?? '';
      const turi: KorinishQatorTuri = !matnlar.length ? 'bosh'
        : raqamQatori == null || r <= raqamQatori ? 'sarlavha'
          : /^(ИТОГО|ВСЕГО|ЖАМИ|ИТОГ\b)/i.test(matnlar.find((m) => /^(ИТОГО|ВСЕГО|ЖАМИ|ИТОГ\b)/i.test(m)) ?? '') ? 'jami'
            : kataklar.length === 1 && kataklar[0].span > 3 && kataklar[0].qalin ? 'bolim'
              : /^(РАЗДЕЛ|СМЕТА|БЎЛИМ|БОЛИМ)/i.test(birinchi) && kataklar[0]?.qalin ? 'bolim' : 'oddiy';
      qatorlar.push({ r, turi, kataklar });
    }
    const ustunlar: KorinishVaraq['ustunlar'] = [];
    for (let c = 0; c <= maxC; c++) if (!yashirin.has(c)) ustunlar.push({ c, kenglik: kenglik.get(c) ?? 9 });
    out.push({ nom: y.name, ustunlar, qatorlar, raqamQatori });
  });
  return out;
}
