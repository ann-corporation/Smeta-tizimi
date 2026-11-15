/**
 * Price unit calculation (owner 2026-11-16: "when AI finds a price but the unit differs — per t vs per m3, per 100 m2 vs m2,
 * per piece vs per kg — it does not convert. It cannot use its head to make a calculation").
 *
 * ONE pure function turns «a price found in unit A» into «the price in the smeta unit B, without VAT» and returns the
 * calculation as readable lines:
 *   «12 500 so'm/kg (QQS siz) × 1000 = 12 500 000 so'm/t»
 * Rules (exact arithmetic, never a silent guess):
 *   • exact dimensional multiples (kg↔t, 100 m2↔m2, 1000 pcs↔pcs, l↔m3) — lib/smeta-ai/narx-birlik, the single converter;
 *   • a COUNT in the source unit («100 м2») is read as «price per 100 m2» and flagged as an assumption (a coil / pack could
 *     also be meant) — the line is usable but the estimator sees the flag;
 *   • a package («мешок») only with its stated content («1 мешок = 50 кг»);
 *   • mass ↔ volume (t ↔ m3) ONLY through a density: written in the material name («плотность 1,6 т/м3») = evidence, or the
 *     reference table below = an ASSUMPTION flag; no density → refused;
 *   • machine-hours / labour hours are never converted;
 *   • price is always WITHOUT VAT: with-VAT or unknown VAT → ÷ 1,12 (owner rule), unknown is flagged.
 */
import { NDS_SUKUT_FOIZ, qqsSizNarx, yaxlit2 } from '../hisob-yadro';
import { birlikNormKalit, narxBirlikKoef, type Qadoq } from './narx-birlik';

export type Zichlik = { /** tonnes per m3 */ tm3: number; /** where it comes from */ manba: string; /** true when it comes from a reference table (an assumption), false when written in the source text */ taxmin: boolean };

/**
 * Bulk density references (t/m3) of common construction materials: typical handbook values, used ONLY when the name carries
 * no density of its own, and every use is flagged as an assumption the estimator must confirm.
 */
const ZICHLIK_JADVAL: Array<[RegExp, number, string]> = [
  [/ПЕСОК/, 1.6, 'песок природный, насыпная плотность ≈ 1,6 т/м3 (справочное значение)'],
  [/ЩЕБ[ЕЁ]Н|ЩЕБНЯ/, 1.45, 'щебень, насыпная плотность ≈ 1,45 т/м3 (справочное значение)'],
  [/ГРАВИ/, 1.6, 'гравий, насыпная плотность ≈ 1,6 т/м3 (справочное значение)'],
  [/ЦЕМЕНТ/, 1.3, 'цемент, насыпная плотность ≈ 1,3 т/м3 (справочное значение)'],
  [/АСФАЛЬТ/, 2.35, 'асфальтобетон, плотность ≈ 2,35 т/м3 (справочное значение)'],
  [/ЖЕЛЕЗОБЕТОН/, 2.5, 'железобетон, плотность ≈ 2,5 т/м3 (справочное значение)'],
  [/БЕТОН/, 2.4, 'тяжелый бетон, плотность ≈ 2,4 т/м3 (справочное значение)'],
  [/ВОДА/, 1.0, 'вода, плотность 1,0 т/м3'],
  [/БИТУМ/, 1.0, 'битум, плотность ≈ 1,0 т/м3 (справочное значение)'],
];

const KANON = (s: string) => s.toUpperCase().replace(/Ё/g, 'Е');
/** «плотность 1,6 т/м3», «объемная масса 1600 кг/м3», «насыпная плотность 1,45 г/см3»: density written in the material name. */
export function nomdagiZichlik(nom: string | null | undefined): Zichlik | null {
  const m = /(?:плотност\w*|объемн\w*\s+масс\w*|насыпн\w*\s+масс\w*|zichlig\w*)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*(т\s*\/\s*м\s*3|кг\s*\/\s*м\s*3|г\s*\/\s*см\s*3|t\s*\/\s*m3|kg\s*\/\s*m3)/i.exec(nom ?? '');
  if (!m) return null;
  const v = Number(m[1].replace(',', '.')), u = m[2].toLowerCase().replace(/\s+/g, '');
  const tm3 = /^(?:кг|kg)/.test(u) ? v / 1000 : v; // т/м3 = г/см3 = t/m3
  return Number.isFinite(tm3) && tm3 > 0.05 && tm3 < 25 ? { tm3, manba: `nomda yozilgan: ${m[0].trim()}`, taxmin: false } : null;
}
/** Density: written in the name (evidence) → reference table (assumption) → null. */
export function zichlikTop(nom: string | null | undefined): Zichlik | null {
  const own = nomdagiZichlik(nom);
  if (own) return own;
  const n = KANON(nom ?? '');
  const hit = ZICHLIK_JADVAL.find(([re]) => re.test(n));
  return hit ? { tm3: hit[1], manba: hit[2], taxmin: true } : null;
}

export type NarxKirish = {
  /** Price as found (in `manbaBirlik`). */
  narx: number;
  manbaBirlik: string | null;
  smetaBirlik: string | null;
  nds?: 'bilan' | 'siz' | 'nomalum';
  /** Content of ONE source unit when the source sells a package / piece. */
  qadoq?: Qadoq | null;
  /** Material name: density may be written in it. */
  nom?: string | null;
  /** Explicit density (e.g. from the catalogue). */
  zichlik?: Zichlik | null;
};
export type NarxHisob = {
  ok: true;
  /** VAT-free price in the smeta unit. */
  narx: number;
  /** VAT-free price in the source unit. */
  qqsSiz: number;
  koef: number;
  usul: 'bir' | 'olcham' | 'miqyos' | 'qadoq' | 'zichlik';
  /** The calculation, one readable line per step (shown to the estimator). */
  qadamlar: string[];
  /** Assumptions the estimator must see (empty = nothing assumed). */
  taxmin: string[];
};
export type NarxHisobXato = { ok: false; sabab: string };

/** 12500000 → «12 500 000», 11160.714 → «11 160,71». */
export function pulMatni(v: number): string {
  const r = Math.round(v * 100) / 100;
  const [a, b] = Math.abs(r).toFixed(2).split('.');
  return (r < 0 ? '-' : '') + a.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (b === '00' ? '' : ',' + b.replace(/0$/, ''));
}
const sonMatni = (v: number) => String(Number(v.toPrecision(12))).replace('.', ',');
const birlikMatni = (b: string | null | undefined) => (b ?? '').trim() || '—';

/** «100 м2» → {n: 100, asos: 'м2'}; a plain unit → {n: 1}. */
function miqyos(b: string | null): { n: number; asos: string } | null {
  const k = birlikNormKalit(b);
  const m = /^(\d+(?:\.\d+)?)(.+)$/.exec(k);
  if (!m) return k ? { n: 1, asos: k } : null;
  const n = Number(m[1]);
  return n > 0 && Number.isFinite(n) ? { n, asos: m[2] } : null;
}

export function narxHisobla(k: NarxKirish): NarxHisob | NarxHisobXato {
  if (!Number.isFinite(k.narx) || k.narx < 0) return { ok: false, sabab: 'narx noto‘g‘ri' };
  const taxmin: string[] = [];
  const qadamlar: string[] = [];
  const nds = k.nds ?? 'nomalum';
  // 1. VAT: the price is always VAT-free.
  const qqsSiz = nds === 'siz' ? k.narx : yaxlit2(qqsSizNarx(k.narx, NDS_SUKUT_FOIZ));
  const src = `${pulMatni(k.narx)} so'm/${birlikMatni(k.manbaBirlik)}`;
  if (nds === 'siz') qadamlar.push(`${src} (QQS siz)`);
  else {
    qadamlar.push(`${src} (${nds === 'bilan' ? 'QQS bilan' : 'QQS holati noma‘lum — QQS bilan deb olindi'}) ÷ ${String(1 + NDS_SUKUT_FOIZ / 100).replace('.', ',')} = ${pulMatni(qqsSiz)} so'm/${birlikMatni(k.manbaBirlik)} (QQS siz)`);
    if (nds === 'nomalum') taxmin.push('QQS holati noma‘lum: narx QQS bilan deb olindi va ÷ 1,12 qilindi');
  }
  const done = (koef: number, usul: NarxHisob['usul'], narx: number): NarxHisob => ({ ok: true, narx: yaxlit2(narx), qqsSiz, koef, usul, qadamlar, taxmin });
  const same = birlikNormKalit(k.manbaBirlik) === birlikNormKalit(k.smetaBirlik);
  if (same && birlikNormKalit(k.smetaBirlik)) return done(1, 'bir', qqsSiz);

  // 2. exact dimensional multiple (single converter)
  const o = narxBirlikKoef(k.manbaBirlik, k.smetaBirlik, k.qadoq ?? null);
  if (o.koef != null) {
    const usul = k.qadoq && narxBirlikKoef(k.manbaBirlik, k.smetaBirlik).koef == null ? 'qadoq' : 'olcham';
    qadamlar.push(`× ${sonMatni(o.koef)} = ${pulMatni(qqsSiz * o.koef)} so'm/${birlikMatni(k.smetaBirlik)}${o.izoh ? ` (${o.izoh})` : ''}`);
    return done(o.koef, usul, qqsSiz * o.koef);
  }

  // 3. a count in the source unit ("100 м2"): price per N units — flagged
  const m = miqyos(k.manbaBirlik);
  if (m && m.n !== 1) {
    const base = narxBirlikKoef(m.asos, k.smetaBirlik);
    if (base.koef != null) {
      const koef = base.koef / m.n;
      taxmin.push(`manba birligi «${k.manbaBirlik}» narx ${sonMatni(m.n)} ${m.asos} uchun deb o‘qildi (bir dona/o‘ram uchun bo‘lishi ham mumkin) — tekshiring`);
      qadamlar.push(`${pulMatni(qqsSiz)} so'm/${k.manbaBirlik} = ${pulMatni(qqsSiz / m.n)} so'm/${m.asos}${base.koef !== 1 ? `; × ${sonMatni(base.koef)}` : ''} = ${pulMatni(qqsSiz * koef)} so'm/${birlikMatni(k.smetaBirlik)}`);
      return done(koef, 'miqyos', qqsSiz * koef);
    }
  }

  // 4. mass <-> volume: only through a density
  const smeta = miqyos(k.smetaBirlik);
  if (m && smeta) {
    const manbaT = narxBirlikKoef(m.n === 1 ? m.asos : k.manbaBirlik, 'т').koef;      // price per source unit -> per tonne factor
    const manbaV = narxBirlikKoef(m.n === 1 ? m.asos : k.manbaBirlik, 'м3').koef;
    const smetaT = narxBirlikKoef('т', k.smetaBirlik).koef;                              // per tonne -> per smeta unit
    const smetaV = narxBirlikKoef('м3', k.smetaBirlik).koef;
    const z = k.zichlik ?? zichlikTop(k.nom);
    const massaToHajm = manbaT != null && smetaV != null;
    const hajmToMassa = manbaV != null && smetaT != null;
    if (massaToHajm || hajmToMassa) {
      if (!z) return { ok: false, sabab: `zichlik noma‘lum (${birlikMatni(k.manbaBirlik)} → ${birlikMatni(k.smetaBirlik)}: massa ↔ hajm faqat zichlik bilan)` };
      if (z.taxmin) taxmin.push(`zichlik taxmin qilindi: ${z.manba} — tasdiqlang`);
      if (massaToHajm) {
        const perT = qqsSiz * manbaT!;          // so'm per tonne
        const perM3 = perT * z.tm3;             // so'm per m3  (1 m3 = z t)
        const narx = perM3 * smetaV!;
        qadamlar.push(`${pulMatni(qqsSiz)} so'm/${birlikMatni(k.manbaBirlik)}${manbaT !== 1 ? ` × ${sonMatni(manbaT!)}` : ''} = ${pulMatni(perT)} so'm/t; × ${sonMatni(z.tm3)} t/m3 (${z.manba}) = ${pulMatni(perM3)} so'm/m3${smetaV !== 1 ? `; × ${sonMatni(smetaV!)}` : ''} = ${pulMatni(narx)} so'm/${birlikMatni(k.smetaBirlik)}`);
        return done(narx / qqsSiz, 'zichlik', narx);
      }
      const perM3 = qqsSiz * manbaV!;
      const perT = perM3 / z.tm3;
      const narx = perT * smetaT!;
      qadamlar.push(`${pulMatni(qqsSiz)} so'm/${birlikMatni(k.manbaBirlik)}${manbaV !== 1 ? ` × ${sonMatni(manbaV!)}` : ''} = ${pulMatni(perM3)} so'm/m3; ÷ ${sonMatni(z.tm3)} t/m3 (${z.manba}) = ${pulMatni(perT)} so'm/t${smetaT !== 1 ? `; × ${sonMatni(smetaT!)}` : ''} = ${pulMatni(narx)} so'm/${birlikMatni(k.smetaBirlik)}`);
      return done(narx / qqsSiz, 'zichlik', narx);
    }
  }
  return { ok: false, sabab: o.sabab };
}

/** One readable block: the steps joined, assumptions marked. */
export function kalkulyatsiyaMatni(h: NarxHisob): string {
  return [...h.qadamlar, ...h.taxmin.map(t => `⚠ ${t}`)].join('\n');
}
