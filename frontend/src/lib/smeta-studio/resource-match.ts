/**
 * Automatic resource ↔ price-catalogue matching by CHARACTERISTICS (owner, 2026-10-06:
 * "the system must find it itself, look at the region, and offer exactly matching characteristics").
 *
 *   1. Normalise both names (Latin/Cyrillic look-alikes, decimal comma, spacing).
 *   2. Extract characteristics: concrete/mortar class (B15, М200), rebar class (А500С, А-III),
 *      diameter, all numeric spec tokens ("10 Т", "8.0-10.0 ММ", "М-10ДМ").
 *   3. Hard gates — a candidate is REJECTED when a known characteristic differs (B15 ≠ B25,
 *      Ø12 ≠ Ø16), product families differ, or units have no exact dimensional conversion.
 *   4. Score = word similarity + spec-token coverage; the object's region wins among equals.
 *   5. Confidence: EXACT (same name+unit) · HIGH (gates pass, clear winner) · REVIEW (left for the
 *      AI agent / operator). Only EXACT/HIGH are applied automatically — as a CATALOG_CANDIDATE
 *      price with full provenance, in one undoable batch.
 */
import { birlikKalit } from '../narx-katalog/kalit';
import type { KatalogQatori } from '../narx-katalog/types';

/** Minimal catalogue view the matcher needs (PriceCatalog satisfies it via `matchView`). */
export type MatchCatalog = {
  size: number;
  name(i: number): string; unit(i: number): string | null; region(i: number): string | null; price(i: number): number | null;
  row(i: number): KatalogQatori;
};

const LAT2CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
/** Upper-case, Ё→Е, Latin look-alikes → Cyrillic, decimal comma → dot, punctuation → space. */
export function normName(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ABCEHKMOPTXY]/g, ch => LAT2CYR[ch])
    .replace(/(\d),(\d)/g, '$1.$2').replace(/[«»"'()[\]{};:!?/\\|_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export type Characteristics = {
  /** Explicit product family, never inferred from a catalogue code. */
  family: string | null;
  /** Explicit crushed-stone fraction range in mm. */
  fraction: string | null;
  /** Concrete/mortar strength class (В15, В7.5) or mark (М200) — only for concrete/mortar-like names. */
  grade: string | null;
  /** Rebar class (А500С, АIII, А240). */
  rebar: string | null;
  /** Diameter in mm when explicitly stated (Д=12, Ø12, ДИАМЕТРОМ 12, 12 ММ for rebar/pipe). */
  diameter: string | null;
  /** Cable/wire cross-section, e.g. "4Х2.5" or "3Х10+1Х6" (normalised). */
  section: string | null;
  /** Brand/type code after МАРКИ/МАРКА (АВВГ, ПМБ, …). */
  brand: string | null;
  /** Explicit electrode type (Э42, Э46, Э50А), compared as a full token. */
  electrodeGrade: string | null;
  /** Stated machine capacity/power with its dimension, not bare model digits. */
  machineRatings: string[];
  /** Every digit-bearing token (spec tokens) — must be covered by a good candidate. */
  specs: string[];
  /** Content words (stems) for similarity. */
  words: string[];
};

const STOP = new Set(['ДЛЯ', 'ИЗ', 'НА', 'ПО', 'ПРИ', 'БЕЗ', 'ИЛИ', 'КРОМЕ', 'ТИП', 'МАРКИ', 'МАРКА', 'КЛАСС', 'КЛАССА', 'ГОСТ', 'ТУ', 'ВИДОВ', 'ДРУГИХ', 'ОБЩЕГО', 'НАЗНАЧЕНИЯ']);
const stem = (w: string) => w.slice(0, 6);
const MATERIAL_WITH_GRADE = /БЕТОН|РАСТВОР|ЖЕЛЕЗОБЕТОН|СМЕСЬ\s+БЕТОН/;
const MACHINE_FAMILIES = new Set(['excavator', 'generator', 'crane', 'loader', 'bulldozer', 'truck', 'dump-truck', 'vibrator', 'welding', 'saw']);

function productFamily(n: string): string | null {
  // Explicit mesh material/use precedes generic mesh and loose reinforcing bar.
  // Unknown trade names (e.g. "Сетка Дыня") never imply a reinforcing mesh.
  if (/(?:^|\s)СЕТК/.test(n)) {
    if (/СТЕКЛОВОЛОК|СТЕКЛОПЛАСТ|СТЕКЛОТКАН|СТЕКЛОСЕТК/.test(n)) return 'fiberglass-mesh';
    if (/ПЛАСТИК|ПЛАСТМАСС|ПОЛИМЕР|ПОЛИПРОПИЛЕН|ПОЛИЭТИЛЕН/.test(n)) return 'plastic-mesh';
    if (/ДЕКОРАТИВ/.test(n)) return 'decorative-mesh';
    if (/АРМАТУР/.test(n)) return 'reinforcing-mesh';
    if (/СВАРН/.test(n)) return 'welded-mesh';
    if (/СТАЛЬН|МЕТАЛЛИЧ/.test(n)) return 'metal-mesh';
    return 'mesh';
  }
  const families: Array<[string, RegExp]> = [
    ['operator-labour', /(?:^|\s)(?:МАШИНИСТ|ОПЕРАТОР)/],
    ['worker-labour', /(?:^|\s)РАБОЧ(?:ИЕ|ИХ|ИЙ|ЕГО)(?=$|[\s-])/],
    ['electrode', /(?:^|\s)ЭЛЕКТРОД/],
    ['lime', /(?:^|\s)ИЗВЕСТЬ(?=$|\s)/], ['shield', /(?:^|\s)ЩИТ/],
    ['duct', /(?:^|\s)ВОЗДУХОВОД/], ['excavator', /(?:^|\s)ЭКСКАВАТОР/],
    ['generator', /(?:^|\s)(?:ГЕНЕРАТОР|ДИЗЕЛЬ.ГЕНЕРАТОР|ЭЛЕКТРОГЕНЕРАТОР)/],
    ['crane', /(?:^|\s)(?:КРАН|АВТОКРАН)/], ['loader', /(?:^|\s)ПОГРУЗЧИК/],
    ['bulldozer', /(?:^|\s)БУЛЬДОЗЕР/], ['dump-truck', /(?:^|\s)(?:САМОСВАЛ|АВТОМОБИЛ[А-Я]*[-\s]+САМОСВАЛ)/],
    ['truck', /(?:^|\s)(?:ГРУЗОВ[А-Я]*\s+АВТОМОБИЛ|АВТОМОБИЛ[А-Я]*\s+(?:БОРТОВ|ГРУЗОВ))/],
    ['vibrator', /(?:^|\s)ВИБРАТОР/],
    ['welding', /(?:^|\s)(?:СВАРОЧН|АППАРАТ[А-Я]*\s+ДЛЯ\s+СВАРК|УСТАНОВК[А-Я]*\s+ДЛЯ\s+СВАРК)/],
    ['saw', /(?:^|\s)(?:ПИЛ(?:А|Ы|ЬНЫ)[А-Я]*|БЕНЗОПИЛ[А-Я]*|ЭЛЕКТРОПИЛ[А-Я]*)(?=$|\s)/],
    ['crushed-stone', /(?:^|\s)ЩЕБ/], ['reinforced-concrete', /(?:^|\s)ЖЕЛЕЗОБЕТОН/],
    ['concrete', /(?:^|\s)БЕТОН/], ['mortar', /(?:^|\s)РАСТВОР/],
    ['rebar', /(?:^|\s)АРМАТУР|(?:^|\s)СТАЛЬ\s+АРМАТУР/],
  ];
  return families.find(([, pattern]) => pattern.test(n))?.[0] ?? null;
}

export function characteristics(nameRaw: string | null | undefined): Characteristics {
  const n = normName(nameRaw);
  let family = productFamily(n);
  const range = family === 'crushed-stone' ? n.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)(?![\d.])/) : null;
  const fraction = range ? `${Number(range[1])}-${Number(range[2])}` : null;
  let grade: string | null = null, rebar: string | null = null, diameter: string | null = null;
  if (MATERIAL_WITH_GRADE.test(n)) {
    const b = n.match(/(?:^|[\s-])В\s?(\d{1,2}(?:\.\d)?)(?![\d.])/);
    const m = n.match(/(?:^|[\s-])М\s?-?\s?(\d{2,3})(?!\d)/);
    grade = b ? 'В' + b[1] : m ? 'М' + m[1] : null;
  }
  const r = n.match(/(?:^|[\s-])А\s?-?\s?(I{1,3}V?|IV|[2-9]\d{2}\s?С?)(?![\dА-Я])/);
  if (r && /АРМАТУР|СТАЛЬ|ПРОКАТ|СЕТК|КАРКАС/.test(n)) rebar = 'А' + r[1].replace(/\s/g, '');
  if (!family && rebar && /СТАЛЬ|ПРОКАТ/.test(n)) family = 'rebar';
  // JS \w and \b are ASCII-only, so Cyrillic word edges are spelled out explicitly.
  const d = n.match(/(?:^|[^А-Я])(?:Д|Ø|ДИАМ[А-Я]*|ДУ)\s?=?\s?(\d+(?:\.\d+)?)/)
    ?? (rebar || /ТРУБ|АРМАТУР|КАБЕЛ|ПРОВОД/.test(n) ? n.match(/(\d+(?:\.\d+)?)\s?ММ(?![А-Я])/) : null);
  if (d) diameter = String(Number(d[1]));
  const sec = n.match(/(\d+(?:\.\d+)?\s?Х\s?\d+(?:\.\d+)?(?:\s?\+\s?\d+(?:\.\d+)?\s?Х\s?\d+(?:\.\d+)?)?)/);
  const section = sec && /КАБЕЛ|ПРОВОД|ПРОВОЛОК|ШНУР/.test(n) ? sec[1].replace(/\s/g, '') : null;
  const br = n.match(/МАРК[АИ]\s+([А-ЯA-Z][А-ЯA-Z0-9.-]{1,15})/);
  const brand = br ? br[1].replace(/[.-]+$/, '') : null;
  const electrode = family === 'electrode' ? n.match(/(?:^|[^А-ЯA-Z0-9])Э\s*(\d+А?)(?![А-ЯA-Z0-9])/): null;
  const electrodeGrade = electrode ? 'Э' + electrode[1] : null;
  const machineRatings = family && MACHINE_FAMILIES.has(family)
    ? [...n.matchAll(/(?:^|[\s=])(\d+(?:\.\d+)?)\s*(М3|КГ|КВТ|Т)(?=$|[^А-Я0-9])/g)].map(m => `${Number(m[1])}:${m[2]}`) : [];
  const tokens = n.split(' ').filter(Boolean);
  const specs = [...new Set(tokens.filter(t => /\d/.test(t)).map(t => t.replace(/^[-=]+|[-=.]+$/g, '')).filter(Boolean))];
  const words = [...new Set(tokens.filter(t => !/\d/.test(t) && t.length >= 3 && !STOP.has(t)).map(stem))];
  return { family, fraction, grade, rebar, diameter, section, brand, electrodeGrade, machineRatings, specs, words };
}

export type MatchConfidence = 'EXACT' | 'HIGH' | 'REVIEW';
/** Price-only scaling; resource consumption is never converted. */
export type PriceUnitConversion = { sourceUnit: string; targetUnit: string; sourcePrice: number; priceFactor: number; evidence: string };
export type MatchPriceRow = KatalogQatori & { unitConversion?: PriceUnitConversion };
export type MatchCandidate = { index: number; row: MatchPriceRow; score: number; regional: boolean; reasons: string[]; extraSpecs: number; unitConversion?: PriceUnitConversion };
export type MatchResult = { confidence: MatchConfidence | 'NONE'; best: MatchCandidate | null; candidates: MatchCandidate[]; gateRejected: number; candidateTotal: number };

/** Why a candidate fails the hard gates (null = passes). */
/** Unit key with common synonyms (т = тн = тонна, м3 = куб.м, п.м = м, шт = штука). */
export function unitKey(v: string | null | undefined): string {
  const k = birlikKalit(normName(v));
  const SYN: Record<string, string> = { 'КG': 'КГ', ТН: 'Т', ТОННА: 'Т', ТОНН: 'Т', КУБМ: 'М3', М3: 'М3', ПМ: 'М', ПОГМ: 'М', МП: 'М', ШТУК: 'ШТ', ШТУКА: 'ШТ', КВМ: 'М2', '1000ШТ': 'ТЫСШТ' };
  return SYN[k] ?? k;
}

/** Only exact dimensional factors, with no density, package or machine-hour assumptions. */
function priceUnitFactor(source: string | null, target: string | null): number | null {
  const from = unitKey(source), to = unitKey(target);
  if (!from || !to) return null;
  if (from === to) return 1;
  if ((from === 'Т' && to === 'КГ') || (from === 'КМ' && to === 'М')) return 0.001;
  if ((from === 'КГ' && to === 'Т') || (from === 'М' && to === 'КМ')) return 1000;
  return null;
}

export function gateFailure(src: Characteristics, cand: Characteristics, srcUnit: string | null, candUnit: string | null, candNorm = ''): string | null {
  if (unitKey(srcUnit) && unitKey(candUnit) && priceUnitFactor(candUnit, srcUnit) == null) return 'UNIT';
  if (src.family && cand.family !== src.family) return 'FAMILY';
  if (src.fraction && cand.fraction !== src.fraction) return 'FRACTION';
  // Abbreviated machine names must still cover every stated capacity/power/model token.
  if (src.family && MACHINE_FAMILIES.has(src.family) && src.specs.some(t => !cand.specs.includes(t))) return 'MACHINE_SPEC';
  if (src.machineRatings.some(r => !cand.machineRatings.includes(r))) return 'MACHINE_CAPACITY';
  if (src.electrodeGrade && cand.electrodeGrade !== src.electrodeGrade) return 'ELECTRODE_GRADE';
  if (src.section && cand.section !== src.section) return 'SECTION';
  // Brand: catalogue names rarely say МАРКИ, so the code must appear as a token (АВВГ ≠ ВВГ: aluminium vs copper).
  if (src.brand && (cand.brand ? !cand.brand.startsWith(src.brand) : !candNorm.split(' ').some(t => t.startsWith(src.brand!)))) return 'BRAND';
  if (src.grade && cand.grade !== src.grade) return 'GRADE';
  if (src.rebar && cand.rebar !== src.rebar) return 'REBAR_CLASS';
  if (src.diameter && cand.diameter && cand.diameter !== src.diameter) return 'DIAMETER';
  if (src.diameter && !cand.diameter && !cand.specs.some(t => t === src.diameter || t.startsWith(src.diameter + '.'))) return 'DIAMETER';
  return null;
}

type Index = { stems: Map<string, number[]>; chars: Characteristics[]; norm: string[] };
const cache = new WeakMap<MatchCatalog, Index>();
/** Built once per catalogue revision: stem → row indices (only priced rows). */
function indexOf(cat: MatchCatalog): Index {
  let ix = cache.get(cat);
  if (ix) return ix;
  const stems = new Map<string, number[]>(), chars: Characteristics[] = new Array(cat.size), norm: string[] = new Array(cat.size);
  for (let i = 0; i < cat.size; i++) {
    if (cat.price(i) == null) continue;
    const c = characteristics(cat.name(i));
    chars[i] = c; norm[i] = normName(cat.name(i));
    for (const w of c.words) { const l = stems.get(w); if (l) l.push(i); else stems.set(w, [i]); }
  }
  ix = { stems, chars, norm };
  cache.set(cat, ix);
  return ix;
}

/** Rank catalogue rows for one resource. Pure and deterministic. */
export function matchResource(cat: MatchCatalog, name: string | null, unit: string | null, region?: string | null, limit = 8): MatchResult {
  const ix = indexOf(cat);
  const src = characteristics(name), srcNorm = normName(name);
  if (!src.words.length && !src.specs.length) return { confidence: 'NONE', best: null, candidates: [], gateRejected: 0, candidateTotal: 0 };
  // Candidate pool: rows sharing the rarest stems (bounded), so 200k rows are never fully scanned.
  const lists = src.words.map(w => ix.stems.get(w) ?? []).filter(l => l.length).sort((a, b) => a.length - b.length);
  const pool = new Map<number, number>();
  for (const l of lists.slice(0, 3)) for (const i of l.length > 20000 ? [] : l) pool.set(i, (pool.get(i) ?? 0) + 1);
  if (!pool.size && lists[0]) for (const i of lists[0].slice(0, 20000)) pool.set(i, 1);
  let gateRejected = 0;
  const scored: MatchCandidate[] = [];
  for (const i of pool.keys()) {
    const c = ix.chars[i];
    const fail = gateFailure(src, c, unit, cat.unit(i), ix.norm[i]);
    if (fail) { gateRejected++; continue; }
    const shared = src.words.filter(w => c.words.includes(w)).length;
    // Source words matter most: a short catalogue name that covers the official long name is a good match.
    const wordSim = 0.7 * (shared / Math.max(1, src.words.length)) + 0.3 * (shared / Math.max(1, c.words.length));
    const specCover = src.specs.length ? src.specs.filter(t => c.specs.includes(t)).length / src.specs.length : 1;
    const extraSpecs = c.specs.filter(t => !src.specs.includes(t)).length;
    const exact = ix.norm[i] === srcNorm;
    const score = exact ? 1 : Math.max(0, 0.6 * wordSim + 0.4 * specCover - 0.03 * extraSpecs);
    const regional = !!region && cat.region(i) === region;
    const reasons = [exact ? 'nom aynan mos' : `so‘z mosligi ${Math.round(wordSim * 100)}%`, src.specs.length ? `xarakteristika ${Math.round(specCover * 100)}%` : '',
      src.grade ? `klass ${src.grade}` : '', src.rebar ? `armatura ${src.rebar}` : '', src.diameter ? `Ø${src.diameter}` : '', regional ? 'obyekt hududi' : ''].filter(Boolean);
    const original = cat.row(i);
    const priceFactor = priceUnitFactor(original.birlik, unit);
    let row: MatchPriceRow = original;
    let unitConversion: PriceUnitConversion | undefined;
    if (priceFactor != null && priceFactor !== 1 && original.narx != null && original.birlik && unit) {
      const normalizedPrice = original.narx * priceFactor;
      if (!Number.isFinite(normalizedPrice)) { gateRejected++; continue; }
      const evidence = `${original.narx}/${original.birlik} × ${priceFactor} = ${normalizedPrice}/${unit} (birlik konversiyasi)`;
      unitConversion = { sourceUnit: original.birlik, targetUnit: unit, sourcePrice: original.narx, priceFactor, evidence };
      row = { ...original, narx: normalizedPrice, birlik: unit, unitConversion,
        nds_izoh: [evidence, original.nds_izoh].filter(Boolean).join(' · ') };
      reasons.push(evidence);
    }
    scored.push({ index: i, row, score, regional, reasons, extraSpecs, ...(unitConversion ? { unitConversion } : {}) });
  }
  scored.sort((a, b) => b.score - a.score || Number(b.regional) - Number(a.regional) || (a.row.narx ?? 0) - (b.row.narx ?? 0) || a.index - b.index);
  const candidates = scored.slice(0, limit);
  const best = scored[0] ?? null;
  if (!best) return { confidence: 'NONE', best: null, candidates, gateRejected, candidateTotal: scored.length };
  // Ties are already ordered object-region first. A rival is a DIFFERENT product (another normalised name).
  const rival = scored.find(c => ix.norm[c.index] !== ix.norm[best.index]);
  const margin = rival ? best.score - rival.score : 1;
  // Strong identity: the decisive characteristics were stated and verified by the gates, and only ONE
  // product survives them (e.g. "АВВГ 4х2,5") — then a long official name vs a short catalogue name is fine.
  const strong = !!(src.grade || (src.section && src.brand) || (src.rebar && src.diameter));
  const uniqueProduct = !rival || rival.score < 0.35;
  const knownUnits = priceUnitFactor(cat.unit(best.index), unit) != null;
  const generic = (src.family === 'concrete' && !src.grade) || (src.family === 'rebar' && (!src.rebar || !src.diameter));
  const machine = src.family != null && MACHINE_FAMILIES.has(src.family);
  const confidence: MatchConfidence = !generic && knownUnits && best.score === 1 ? 'EXACT'
    : !generic && knownUnits && (!machine || src.machineRatings.length > 0) && ((best.score >= 0.85 && margin >= 0.1 && src.words.length >= 2 && best.extraSpecs === 0) || (strong && uniqueProduct && best.score >= 0.35)) ? 'HIGH' : 'REVIEW';
  return { confidence, best, candidates, gateRejected, candidateTotal: scored.length };
}

export type AutoPriceLine = { occurrenceId: string; recipeId: string; name: string; unit: string | null; result: MatchResult };

/**
 * Run the matcher over every priced-less resource line. EXACT/HIGH become one BATCH of
 * CATALOG_CANDIDATE prices; REVIEW/NONE are returned for the AI agent / operator.
 */
export function autoPrice(lines: Array<{ occurrenceId: string; recipeId: string; name: string | null; unit: string | null }>,
  cat: MatchCatalog, region?: string | null) {
  const applied: AutoPriceLine[] = [], review: AutoPriceLine[] = [];
  for (const l of lines) {
    const result = matchResource(cat, l.name, l.unit, region);
    const line = { occurrenceId: l.occurrenceId, recipeId: l.recipeId, name: l.name ?? '', unit: l.unit, result };
    (result.confidence === 'EXACT' || result.confidence === 'HIGH' ? applied : review).push(line);
  }
  return { applied, review };
}
