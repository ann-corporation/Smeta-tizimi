/**
 * Norm matching pipeline (owner 2026-11-16: "it does not find the right work/norm and does not mark it itself;
 * for some lines it offers 15 variants and none fit").
 *
 *   1. DETERMINISTIC retrieval: BM25 over norm names (+ table title as weak context) - one engine, lib/smeta-ai/matn-qidiruv.
 *   2. STRICT unit filter: a work whose measure base is KNOWN and different from the line's unit is never offered.
 *   3. Re-rank by evidence: numbers of the line (50 мм, 0,025 т) must be in the norm; extra numbers in the norm
 *      (another size variant) cost; repair/special collections only when the line or its heading says so;
 *      the smeta heading ("Отопление") and the collections of lines already matched in the same heading boost
 *      the collections whose title/code agree.
 *   4. At most THREE candidates, each with a calibrated confidence. Above AVTO_CHEGARA the top one is selected
 *      automatically; below MIN_CHEGARA nothing is shown ("mos topilmadi") instead of junk.
 *   5. An optional LLM rerank (server, fast tier) sees only the <= 20 shortlist of UNSURE lines - see `llmShortlist`.
 * Nothing here chooses silently between different readings: the choice is a candidate + confidence the user can overrule.
 */
import type { NormWork } from '../catalog-extraction/norm-catalog';
import { MatnIndeks, ildizlar } from './matn-qidiruv';
import { uzRuAlias } from './norm-lugat';
import { kodKalit } from './resurs-kalit';
import { qisqartmaOch, sinonimlar } from './norm-sinonim';
import { xotiraBall, type Xotira } from './norm-xotira';

export type NormManba = {
  allWorks(): NormWork[];
  tableLabel(workId: string): string | null;
  collectionTitle?(code: string | null): string | null;
};

export type IshSorovi = {
  /** The work line as written (any wording; Russian normative wording works best). */
  nom: string;
  /** The line's unit exactly as written ("100М2", "м3", "т", "шт."). */
  birlik: string | null;
  /** Smeta heading path, outermost first ("Конструктивная часть", "Отопление"). */
  bolim?: string[];
  /** Extra free text (description) used only as heading-like context. */
  tavsif?: string | null;
  /** Collections ("Е15") of the lines ALREADY matched in the same heading (confirmed or auto-selected). */
  qoshni?: string[];
  /** Other phrasings of the same work (the model's 2nd/3rd normative wording): each document is scored by its best phrasing. */
  qoshimcha?: string[];
  /** Text whose numbers (0,5 м3, 380 мм, group 2) count as the line's own numbers although they are not in `nom`. */
  sonlarMatn?: string | null;
  /** Company memory (compact counters): a code confirmed before for similar text is retrieved and ranked first. */
  xotira?: Xotira | null;
};

export type MoslashNomzod = { id: string; kod: string; nom: string; birlik: string | null; jadval: string | null; toplam: string | null;
  /** 0..1, calibrated on approved smetas (see moslash eval). */
  ishonch: number; sabab: string[] };
export type MoslashNatija = { nomzodlar: MoslashNomzod[]; tanlangan: MoslashNomzod | null;
  holat: 'AVTO' | 'TEKSHIRISH' | 'TOPILMADI'; ms: number };

/** Confidence at/above which the top candidate is selected automatically (set from the eval precision curve). */
export const AVTO_CHEGARA = 0.7;
/** Below this the line is answered «mos topilmadi». */
export const MIN_CHEGARA = 0.12;
export const MAX_NOMZOD = 3;
/** A runner-up is shown only while its evidence score is within this distance of the top one. */
export const RAQIB_FARQ = 0.3;

// ---------------------------------------------------------------- units
export type Asos = 'М3' | 'М2' | 'М' | 'КМ' | 'Т' | 'КГ' | 'ШТ' | 'КОМПЛ' | 'Л';
const BASES: Array<[RegExp, Asos]> = [
  [/(?:^|[^а-яa-z0-9])(?:м\s?3|куб\.?\s?м|м\s?куб|м³)(?![а-яa-z])/, 'М3'],
  [/(?:^|[^а-яa-z0-9])(?:м\s?2|кв\.?\s?м|м\s?кв|м²)(?![а-яa-z])/, 'М2'],
  [/(?:^|[^а-яa-z0-9])(?:км)(?![а-яa-z])/, 'КМ'],
  [/(?:^|[^а-яa-z0-9])(?:п\.?\s?м|пог\.?\s?м|м\.?\s?п|м)(?![а-яa-z0-9²³])/, 'М'],
  [/(?:^|[^а-яa-z0-9])(?:т|тн|тонн[аы]?)(?![а-яa-z0-9])/, 'Т'],
  [/(?:^|[^а-яa-z0-9])(?:кг)(?![а-яa-z])/, 'КГ'],
  [/(?:^|[^а-яa-z0-9])(?:шт|штук[аи]?|к-т|компл|комплект)(?![а-яa-z])/, 'ШТ'],
  [/(?:^|[^а-яa-z0-9])(?:л|литр)(?![а-яa-z])/, 'Л'],
];
/** Count-like nouns used as a measure ("1 вентилятор", "1 изделие", "стык"): a piece. */
const DONA_SOZ = /^(?:\d+(?:[.,]\d+)?\s*)?(?:вентилятор|изделие|опора|узел|пост|прибор|стык|шкаф|аппарат|агрегат|установка|точка|светильник|насос|счетчик|скважина|колодец|кран|бак|емкость|ванна|унитаз|мойка|умывальник|люк|дверь|окно|блок)/;

function lat2cyr(s: string): string {
  const m: Record<string, string> = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
  return s.replace(/[abcehkmoptxy]/g, ch => m[ch]);
}
/**
 * Set of measure bases of a unit/measure text; empty = unknown. «100 м 2 окрашиваемой поверхности» → {М2};
 * «т (нормы 1-3), 100 шт. (нормы 4-15)» → {Т, ШТ}; «1 вентилятор» → {ШТ}.
 */
export function birlikAsoslari(text: string | null | undefined): Set<Asos> {
  const out = new Set<Asos>();
  const t = (text ?? '').toLowerCase().replace(/ё/g, 'е').replace(/­/g, '-');
  if (!t.trim()) return out;
  const parts = t.split(/[;,](?![^()]*\))|\s+\(\s*норм[^)]*\)\s*,?/).map(p => p.trim()).filter(Boolean);
  for (const p0 of parts.length ? parts : [t]) {
    const p = lat2cyr(p0.replace(/^\d+(?:[.,]\d+)?\s*/, ' ').replace(/\([^)]*\)/g, ' ')).replace(/\s+/g, ' ');
    const probe = ` ${p} `;
    for (const [re, a] of BASES) if (re.test(probe)) { out.add(a); break; }
    if (!out.size && DONA_SOZ.test(p0.trim())) out.add('ШТ');
  }
  if (!out.size && DONA_SOZ.test(t.trim())) out.add('ШТ');
  return out;
}
/** true = same base; false = known and different; null = unknown on either side. */
export function birlikMosmi(smeta: Set<Asos>, norma: Set<Asos>): boolean | null {
  if (!smeta.size || !norma.size) return null;
  for (const a of smeta) if (norma.has(a)) return true;
  // м and км are one dimension but different bases: never silently the same measure.
  return false;
}

// ---------------------------------------------------------------- numbers
const sonlar = (s: string): string[] => [...new Set((s.toLowerCase().replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) ?? []).map(x => String(Number(x))))];

// ---------------------------------------------------------------- collections
const MAXSUS = new Set(['E29', 'E30', 'E31', 'E35', 'E37', 'E42', 'E43', 'E44', 'E45', 'E46', 'E47', 'E48']);
const collKey = (c: string | null | undefined) => (c ?? '').replace(/^Е/, 'E');
const TAMIR = (c: string) => { const m = /^E(\d+)$/.exec(c); return !!m && Number(m[1]) >= 51 && Number(m[1]) <= 69; };
const TAMIR_SOZ = /ремонт|восстанов|реконструкц|ta['’]?mir|tamirlash/i;

/** Re-rank weights (tuned on half of the approved smetas by file, checked on the other half; see the eval report). */
export const OGIRLIK = { bm: 0.15, mos: 0.45, birlik: 0.12, sonYes: 0.08, sonNo: 0.10, extra: 0.015, extraMax: 0.06, boshi: 0.06,
  bolim: 0.08, maxsus: 0.22, tamir: 0.18, qoshni: 0.07, prec: 0.10, bigram: 0.26, tabRef: 0.30, xotira: 0.10 };
export type Ogirlik = typeof OGIRLIK;

type Hujjat = { w: NormWork; coll: string; kodK: string; jadvalK: string; birlik: Set<Asos>; sonlar: string[]; boshi: string | null; stems: Set<string>; bigrams: Set<string> };
const bigramlar = (stems: string[]) => { const s = new Set<string>(); for (let i = 0; i + 1 < stems.length; i++) s.add(stems[i] + ' ' + stems[i + 1]); return s; };
type Hit = { d: Hujjat; z: number; mos: number; sabab: string[]; birlik: boolean | null };
/** Everything about one query that does not depend on the weights (retrieval is the slow part: done once). */
export type Kontekst = { smeta: Set<Asos>; tamir: boolean; hint: Set<string>; qSon: string[]; qBosh: string | null; qoshni: Map<string, number>;
  qStems: Set<string>; qBigrams: Set<string>; hits: Array<{ id: number; ball: number; mos: number }>;
  /** Tables the line itself points to («К НОРМЕ 11-01-011-01»): canonical «Е11-1-11». */ tabRefs: Set<string>;
  /** Company memory score per canonical code. */ xotira: Map<string, number>; iboralar: string[] };

export class NormMoslash {
  private idx: MatnIndeks;
  private docs: Hujjat[];
  private collIdx: MatnIndeks | null = null;
  private collCodes: string[] = [];
  private m: NormManba;
  private og: Ogirlik;
  private jadvalIdx = new Map<string, number[]>();
  private kodIdx = new Map<string, number[]>();
  constructor(m: NormManba, og: Ogirlik = OGIRLIK) {
    this.m = m; this.og = og;
    const works = m.allWorks();
    // Uzbek-named works are searchable by the Russian words of their glossary hits (their own name is never changed).
    const matnlar = works.map(w => { const nom = w.name ?? ''; const a = uzRuAlias(nom); return a ? `${nom} ${a}` : nom; });
    this.docs = works.map((w, i) => {
      const st = ildizlar(matnlar[i]);
      const kodK = kodKalit(w.code) ?? '';
      return { w, coll: collKey(w.collection), kodK, jadvalK: kodK.split('-').slice(0, 3).join('-'), birlik: birlikAsoslari(workMeasure(w)), sonlar: sonlar(w.name ?? ''), boshi: st[0] ?? null,
        stems: new Set(st), bigrams: bigramlar(st) };
    });
    this.docs.forEach((d, i) => {
      const l = this.jadvalIdx.get(d.jadvalK) ?? []; l.push(i); this.jadvalIdx.set(d.jadvalK, l);
      const c = this.kodIdx.get(d.kodK) ?? []; c.push(i); this.kodIdx.set(d.kodK, c);
    });
    this.idx = new MatnIndeks(works.map((w, i) => ({ id: i, matn: matnlar[i], kontekst: m.tableLabel(w.id) })));
    if (m.collectionTitle) {
      const codes = [...new Set(this.docs.map(d => d.coll).filter(Boolean))];
      this.collCodes = codes;
      this.collIdx = new MatnIndeks(codes.map((c, i) => ({ id: i, matn: m.collectionTitle!(c) ?? '' })));
    }
  }
  get size() { return this.docs.length; }
  /** Replace the weights (the local eval tunes them without rebuilding the index). */
  ogirlikQoy(og: Ogirlik) { this.og = og; }

  /** Collections whose title matches the heading path (empty when the heading says nothing). */
  private bolimToplamlari(q: IshSorovi): Set<string> {
    const out = new Set<string>();
    const text = [...(q.bolim ?? []), q.tavsif ?? ''].join(' ').trim();
    if (!text || !this.collIdx) return out;
    for (const h of this.collIdx.qidir([text], 3)) if (h.mos >= 0.5) out.add(this.collCodes[h.id]);
    return out;
  }

  /** Retrieval half: independent of the weights, so it is computed once per line and reused. */
  kontekst(q: IshSorovi): Kontekst {
    // "#…" starts the estimator's own comment ("… #ДОРАБОТКА ВРУЧНУЮ …"): the norm wording is before it.
    const asosiy = q.nom.split('#')[0].trim() || q.nom;
    const tozaNom = asosiy.replace(/\[[^\]]*\]|\/[^/]*\//g, m2 => ` ${m2.slice(1, -1)} `);
    const qoshni = new Map<string, number>();
    for (const c of q.qoshni ?? []) { const k = collKey(c); qoshni.set(k, (qoshni.get(k) ?? 0) + 1); }
    const qst = ildizlar(asosiy);
    // Abbreviations opened («ж/б» -> железобетонный) and everyday words translated («рытье» -> разработка): extra PHRASINGS, the line stays as written.
    const qisqa = qisqartmaOch(tozaNom), sin = sinonimlar(qisqa);
    const iboralar = [...new Set([asosiy, tozaNom, qisqa, sin ? `${qisqa} ${sin}` : '', ...(q.qoshimcha ?? [])])].filter(Boolean);
    // The line may name its own table («ДОБАВЛЯТЬ К НОРМЕ 11-01-011-01»): the answer is a variant of that table.
    const tabRefs = new Set<string>();
    for (const m of asosiy.matchAll(/(?<![\d.-])(\d{1,2})-(\d{1,2})-(\d{1,3})(?:-\d{1,2})?(?![\d-])/g)) {
      for (const harf of ['Е', 'Ц']) { const key = `${harf}${Number(m[1])}-${Number(m[2])}-${Number(m[3])}`; if (this.jadvalIdx.has(key)) tabRefs.add(key); }
    }
    const xotira = xotiraBall(q.xotira, asosiy);
    const hits = this.idx.qidir(iboralar, 200);
    const mavjud = new Set(hits.map(h => h.id));
    const top = hits[0]?.ball ?? 1;
    const qosh = (i: number, ball: number) => { if (!mavjud.has(i)) { mavjud.add(i); hits.push({ id: i, ball, mos: 0.5 }); } };
    for (const key of tabRefs) for (const i of this.jadvalIdx.get(key) ?? []) qosh(i, top * 0.6);
    for (const [kod, s] of xotira) if (s >= 0.5) for (const i of this.kodIdx.get(kod) ?? []) qosh(i, top * 0.7);
    return { smeta: birlikAsoslari(q.birlik), tamir: TAMIR_SOZ.test(`${asosiy} ${(q.bolim ?? []).join(' ')} ${q.tavsif ?? ''}`),
      hint: this.bolimToplamlari(q), qSon: sonlar(`${asosiy} ${q.sonlarMatn ?? ''}`), qBosh: qst[0] ?? null, qoshni, qStems: new Set(qst), qBigrams: bigramlar(qst),
      hits, tabRefs, xotira, iboralar };
  }

  /**
   * Second retrieval restricted to the collections the section already uses (confirmed / auto-selected neighbours + the heading):
   * a work from the right sbornik that the global top-200 missed is added. Cheap: runs only when such collections exist.
   */
  kengaytir(k: Kontekst, toplamlar: Iterable<string>): Kontekst {
    const set = new Set([...toplamlar].map(collKey).filter(Boolean));
    if (!set.size) return k;
    const extra = this.idx.qidir(k.iboralar, 80, i => set.has(this.docs[i].coll));
    if (!extra.length) return k;
    const mavjud = new Set(k.hits.map(h => h.id));
    const top = k.hits[0]?.ball ?? extra[0].ball;
    const hits = [...k.hits];
    for (const h of extra) if (!mavjud.has(h.id)) hits.push({ id: h.id, ball: Math.min(h.ball, top * 0.8), mos: h.mos });
    return { ...k, hits };
  }

  /** Evidence re-rank of the retrieved hits. Pure and deterministic. */
  rerank(k: Kontekst, limit = 20, og: Ogirlik = this.og): Hit[] {
    if (!k.hits.length) return [];
    const top = k.hits[0].ball || 1;
    const qoshniJami = [...k.qoshni.values()].reduce((a, b) => a + b, 0);
    const out: Hit[] = [];
    for (const h of k.hits) {
      const d = this.docs[h.id];
      const bm = birlikMosmi(k.smeta, d.birlik);
      if (bm === false) continue;
      const sabab: string[] = [];
      let z = og.bm * (h.ball / top) + og.mos * h.mos;
      if (bm === true) { z += og.birlik; sabab.push('birlik mos'); }
      if (k.qSon.length) {
        const cover = k.qSon.filter(n => d.sonlar.includes(n)).length / k.qSon.length;
        z += og.sonYes * cover - og.sonNo * (1 - cover);
        if (cover === 1) sabab.push('sonlar mos');
      }
      const extra = d.sonlar.filter(n => !k.qSon.includes(n)).length;
      z -= Math.min(og.extraMax, og.extra * extra);
      if (k.qBosh && d.boshi === k.qBosh) z += og.boshi;
      // Candidate precision (how much of ITS wording the line covers) and phrase order (shared word pairs).
      let sh = 0; for (const s of d.stems) if (k.qStems.has(s)) sh++;
      z += og.prec * (sh / Math.max(1, d.stems.size));
      if (k.qBigrams.size) { let bg = 0; for (const b of k.qBigrams) if (d.bigrams.has(b)) bg++; z += og.bigram * (bg / k.qBigrams.size); }
      if (k.hint.has(d.coll)) { z += og.bolim; sabab.push("bo'lim mos"); }
      if (qoshniJami) { const s = (k.qoshni.get(d.coll) ?? 0) / qoshniJami; if (s > 0) { z += og.qoshni * Math.min(1, 0.5 + s); sabab.push("qo'shni qatorlar mos"); } }
      if (k.tabRefs.has(d.jadvalK)) { z += og.tabRef; sabab.push('jadval shifri qatorda'); }
      const xb = k.xotira.get(d.kodK); if (xb) { z += og.xotira * xb; sabab.push('kompaniya tajribasi'); }
      if (MAXSUS.has(d.coll) && !k.hint.has(d.coll)) z -= og.maxsus;
      if (TAMIR(d.coll) && !k.tamir) z -= og.tamir;
      out.push({ d, z, mos: h.mos, sabab, birlik: bm });
    }
    return out.sort((a, b) => b.z - a.z || a.d.w.code.localeCompare(b.d.w.code)).slice(0, limit);
  }

  /** Retrieval + re-rank in one call. */
  qidir(q: IshSorovi, limit = 20): Hit[] { return this.rerank(this.kontekst(q), limit); }

  /** Candidates + confidence from an already re-ranked list. */
  natija(raw: Hit[], ms = 0, koef: IshonchKoef = ISHONCH_KOEF, chegara = AVTO_CHEGARA): MoslashNatija {
    const nomzodlar = raw.slice(0, MAX_NOMZOD).map((r, i): MoslashNomzod => {
      const w = r.d.w;
      const margin = r.z - (raw[i + 1]?.z ?? 0);
      return { id: w.id, kod: w.code, nom: w.name ?? '', birlik: workMeasure(w), jadval: this.m.tableLabel(w.id),
        toplam: this.m.collectionTitle?.(w.collection) ?? w.collection ?? null,
        ishonch: ishonchHisobla({ z: r.z, margin, mos: r.mos, birlikTrue: r.birlik === true, orin: i }, koef), sabab: r.sabab };
    });
    // The top candidate decides whether anything is shown; the runners-up stay only while they are real alternatives.
    const top = nomzodlar[0] && nomzodlar[0].ishonch >= MIN_CHEGARA ? nomzodlar[0] : null;
    if (!top) return { nomzodlar: [], tanlangan: null, holat: 'TOPILMADI', ms };
    const topZ = raw[0].z;
    const korsat = nomzodlar.filter((_, i) => i === 0 || raw[i].z >= topZ - RAQIB_FARQ);
    const holat = top.ishonch >= chegara ? 'AVTO' : 'TEKSHIRISH';
    return { nomzodlar: korsat, tanlangan: holat === 'AVTO' ? top : null, holat, ms };
  }

  /** The full pipeline: <= 3 candidates with confidence, or «mos topilmadi». */
  moslash(q: IshSorovi): MoslashNatija {
    const t0 = performance.now();
    const raw = this.qidir(q, 20);
    return this.natija(raw, Math.round((performance.now() - t0) * 100) / 100);
  }

  /** <= 20 raw candidates for the server's LLM rerank (only for lines the pipeline is unsure about). */
  llmShortlist(q: IshSorovi, limit = 20): MoslashNomzod[] {
    return this.qidir(q, limit).map((r, i) => ({ id: r.d.w.id, kod: r.d.w.code, nom: r.d.w.name ?? '', birlik: workMeasure(r.d.w), jadval: this.m.tableLabel(r.d.w.id),
      toplam: this.m.collectionTitle?.(r.d.w.collection) ?? r.d.w.collection ?? null, ishonch: 0, sabab: [`#${i + 1}`] }));
  }
}

const workMeasure = (w: NormWork) => w.unitCode;

/**
 * Calibrated confidence: logistic over (z of the candidate, its margin over the next one, query coverage, unit evidence).
 * Coefficients are fitted by the local eval on half of the approved smetas and checked on the other half.
 */
export const ISHONCH_KOEF = { b0: -3.1218, z: 3.5746, margin: 5.2307, mos: -0.2747, birlik: -0.4264, orin: -2.097 };
export type IshonchKoef = typeof ISHONCH_KOEF;
export function ishonchHisobla(f: { z: number; margin: number; mos: number; birlikTrue: boolean; orin: number }, k: IshonchKoef = ISHONCH_KOEF): number {
  const x = k.b0 + k.z * f.z + k.margin * Math.max(0, Math.min(0.6, f.margin)) + k.mos * f.mos + (f.birlikTrue ? k.birlik : 0) + k.orin * f.orin;
  return Math.round(100 / (1 + Math.exp(-x))) / 100;
}
