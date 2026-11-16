/**
 * Exemplar kNN over the experience index: "which norm did estimators use for a line that reads like THIS, in a section like THIS".
 *
 * First-stage candidate source next to the catalogue retrieval (norm-moslash merges both before the evidence re-rank):
 *   1. BM25 over exemplar wordings (matn-qidiruv: the same engine and stemmer as the catalogue) with the line's phrasings plus the
 *      Russian words of the learned uz->ru pairs, so an Uzbek wording reaches Russian exemplars and back;
 *   2. every hit is scored by word coverage both ways, character-trigram similarity (typos, word forms), unit agreement, numbers
 *      (sizes decide the variant) and context (hashed section words, neighbouring collections);
 *   3. scores move to the codes the exemplar was used with (share of that exemplar's lines x how often = support).
 * The reason text is the owner's wording: «ilgari N ta smetada shu shifr ishlatilgan».
 */
import { MatnIndeks, ildizlar } from './matn-qidiruv';
import { birlikKalit } from './resurs-kalit';
import { bolimBelgilari, matnKalit, normaKodi, toplamKalit, type KompaktMisol } from './tajriba-indeks';
import { uzRuIbora, uzRuXarita, type UzRu } from './tajriba-uzru';

export type TajribaSorov = { nom: string; birlik?: string | null; bolim?: string[]; /** codes or collections of the neighbouring lines */ qoshni?: string[] };
export type TajribaNomzod = {
  /** canonical code */ kod: string;
  /** 0..1 */ ball: number;
  /** lines that used the code under the best exemplar */ n: number;
  /** distinct objects (0 = only Studio confirmations) */ obyekt: number;
  kompaniya: number;
  /** the exemplar wording that matched */ misol: string;
  sabab: string;
};

export const MIN_SIM = 0.45;
export const TAJRIBA_VAZN = { mos: 0.30, prec: 0.20, dice: 0.20, birlik: 0.10, son: 0.10, bolim: 0.05, qoshni: 0.05 } as const;

export const tajribaSabab = (obyekt: number, n: number): string =>
  obyekt > 0 ? `ilgari ${obyekt} ta smetada shu shifr ishlatilgan` : `Studio'da ${n} marta shu shifr tanlangan`;

const trigramlar = (t: string): Set<string> => {
  const s = ` ${t.toLowerCase().replace(/\s+/g, ' ')} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
};
const dice = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let k = 0; for (const x of a) if (b.has(x)) k++;
  return 2 * k / (a.size + b.size);
};
const sonlar = (s: string): string[] => [...new Set((s.toLowerCase().replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) ?? []).map(x => String(Number(x))))];

type Doc = { m: KompaktMisol; stems: Set<string>; son: string[]; bolim: Set<string>; qoshni: Set<string>; jami: number; tri?: Set<string> };

export class TajribaIndeks {
  private docs: Doc[];
  private idx: MatnIndeks;
  private uzru: Map<string, string[]>;
  constructor(misollar: readonly KompaktMisol[], uzru: UzRu | null = null) {
    this.docs = misollar.map(m => ({ m, stems: new Set(ildizlar(m[0])), son: sonlar(m[0]), bolim: new Set(m[3].map(x => x[0])), qoshni: new Set(m[4].map(x => x[0])),
      jami: m[2].reduce((a, k) => a + k[1], 0) || 1 }));
    this.idx = new MatnIndeks(this.docs.map((d, i) => ({ id: i, matn: d.m[0] })));
    this.uzru = uzRuXarita(uzru);
  }
  get size() { return this.docs.length; }
  get uzruSoni() { return this.uzru.size; }

  /** Candidate codes, best first (at most `limit`). */
  qidir(q: TajribaSorov, limit = 8): TajribaNomzod[] {
    if (!this.docs.length) return [];
    const asosiy = matnKalit(q.nom);
    if (asosiy.length < 3) return [];
    const alias = uzRuIbora(asosiy, this.uzru);
    const iboralar = [asosiy, alias ? `${asosiy} ${alias}` : ''].filter(Boolean);
    const hits = this.idx.qidir(iboralar, 60);
    if (!hits.length) return [];
    const qSt = new Set(ildizlar(asosiy)), qSon = sonlar(asosiy), qTri = trigramlar(asosiy);
    const qBirlik = birlikKalit(q.birlik ?? null);
    const qBolim = new Set(bolimBelgilari(q.bolim));
    const qQoshni = new Set<string>();
    for (const c of q.qoshni ?? []) { const k = normaKodi(c); qQoshni.add(k ? toplamKalit(k) : c.toUpperCase()); }
    const W = TAJRIBA_VAZN;
    const best = new Map<string, TajribaNomzod>();
    for (const h of hits) {
      const d = this.docs[h.id];
      let sh = 0; for (const s of d.stems) if (qSt.has(s)) sh++;
      // the alias phrasing may cover stems the line itself lacks: coverage of the better phrasing is already in h.mos
      const prec = sh / Math.max(1, d.stems.size);
      d.tri ??= trigramlar(d.m[0]);
      const dc = dice(qTri, d.tri);
      const birlik = !qBirlik || !d.m[1] ? 0.5 : qBirlik === d.m[1] ? 1 : 0;
      let son = 1;
      if (qSon.length || d.son.length) {
        const cover = qSon.length ? qSon.filter(n => d.son.includes(n)).length / qSon.length : 1;
        const extra = d.son.filter(n => !qSon.includes(n)).length;
        son = Math.max(0, cover - 0.25 * Math.min(2, extra));
      }
      let cb = 0; if (qBolim.size) { let k = 0; for (const x of qBolim) if (d.bolim.has(x)) k++; cb = k / qBolim.size; }
      let cq = 0; if (qQoshni.size) { let k = 0; for (const x of qQoshni) if (d.qoshni.has(x)) k++; cq = Math.min(1, k / qQoshni.size); }
      const sim = W.mos * h.mos + W.prec * prec + W.dice * dc + W.birlik * birlik + W.son * son + W.bolim * cb + W.qoshni * cq;
      if (sim < MIN_SIM) continue;
      for (const [kod, n, obyekt, kompaniya] of d.m[2]) {
        const p = n / d.jami;
        const ball = Math.min(1, sim * (0.55 + 0.45 * p) * (0.6 + 0.4 * Math.min(1, Math.log2(1 + n) / 3)));
        const cur = best.get(kod);
        if (!cur || ball > cur.ball) best.set(kod, { kod, ball: Math.round(ball * 1000) / 1000, n, obyekt, kompaniya, misol: d.m[0], sabab: tajribaSabab(obyekt, n) });
      }
    }
    return [...best.values()].sort((a, b) => b.ball - a.ball || b.n - a.n || (a.kod < b.kod ? -1 : 1)).slice(0, limit);
  }
}

// ---------------------------------------------------------------- the loaded index (set by the loader, read by norm-moslash)
let YUKLANGAN: TajribaIndeks | null = null;
export const tajribaQoy = (x: TajribaIndeks | null): void => { YUKLANGAN = x; };
export const tajribaOl = (): TajribaIndeks | null => YUKLANGAN;
