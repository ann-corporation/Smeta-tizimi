/**
 * Ranked text retrieval (BM25) for the smeta AI — one engine for normative works AND price-catalogue rows.
 *
 * Why: estimate wording and catalogue wording differ ("бетонирование ленточных фундаментов" vs
 * "УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ ЖЕЛЕЗОБЕТОННЫХ"; "ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ" vs
 * "Песок для строительных работ (природный) крупный, фр. 0-5 мм"). An all-words substring search misses
 * most of them, so the model never sees the right candidate. Here every document is scored by how many
 * meaningful word stems it shares with ANY of the model's phrasings (rare words weigh more), the leading
 * action word is rewarded, and the model then chooses among the top candidates. Nothing is chosen here.
 */

const LAT2CYR: Record<string, string> = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
/** Russian inflection endings, longest first (light stemmer — enough for catalogue wording). */
const ENDINGS = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'ий', 'ый', 'ой', 'ей', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие',
  'ых', 'их', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ию', 'ью', 'ия', 'ья', 'ии', 'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й'];
const STOP = new Set(['для', 'из', 'на', 'по', 'при', 'без', 'или', 'кроме', 'тип', 'марки', 'марка', 'класс', 'класса', 'гост', 'ту', 'до', 'от',
  'со', 'с', 'в', 'и', 'к', 'не', 'мм', 'м', 'шт', 'общего', 'назначения', 'более', 'менее', 'свыше', 'том', 'числе', 'др', 'прочие', 'прочих']);

/** Lower-case Cyrillic word tokens (Latin look-alikes inside Cyrillic words folded; digits kept as spec tokens). */
export function sozlar(matn: string): string[] {
  const s = matn.toLowerCase().replace(/ё/g, 'е').replace(/(\d),(\d)/g, '$1.$2');
  const out: string[] = [];
  for (const raw of s.split(/[^0-9a-zа-я.]+/)) {
    const w = raw.replace(/^\.+|\.+$/g, '');
    if (!w) continue;
    // A mostly-Cyrillic token with Latin look-alikes ("бетoн") is folded to Cyrillic; pure Latin stays (brands).
    const folded = /[а-я]/.test(w) ? w.replace(/[abcehkmoptxy]/g, ch => LAT2CYR[ch]) : w;
    out.push(folded);
  }
  return out;
}

/** Stem of one token; null for stop words and 1-letter noise. Numbers stay as exact spec tokens. */
export function ildiz(w: string): string | null {
  if (/\d/.test(w)) return w.length <= 12 ? w : null;
  if (w.length < 2 || STOP.has(w)) return null;
  if (!/[а-я]/.test(w)) return w.length >= 2 ? w : null;
  let s = w;
  for (const e of ENDINGS) if (s.length - e.length >= 4 && s.endsWith(e)) { s = s.slice(0, -e.length); break; }
  return s.slice(0, 7);
}

export function ildizlar(matn: string): string[] {
  const out: string[] = [];
  for (const w of sozlar(matn)) { const st = ildiz(w); if (st) out.push(st); }
  return out;
}

export type Hujjat = { id: number; matn: string; /** Optional weaker context (table/collection title). */ kontekst?: string | null };
export type Topilma = { id: number; ball: number; mos: number };

/** In-memory BM25 index; built once per catalogue (≈50k docs → well under a second). */
export class MatnIndeks {
  private post = new Map<string, Array<[number, number]>>();
  private len: Float32Array;
  private bosh: Array<string | null>;
  private avg: number;
  readonly soni: number;
  constructor(docs: Hujjat[]) {
    this.soni = docs.length;
    this.len = new Float32Array(docs.length);
    this.bosh = new Array(docs.length).fill(null);
    let total = 0;
    docs.forEach((d, i) => {
      const tf = new Map<string, number>();
      const asosiy = ildizlar(d.matn);
      this.bosh[i] = asosiy[0] ?? null;
      for (const st of asosiy) tf.set(st, (tf.get(st) ?? 0) + 1);
      // Context words count half: they say what KIND of work/material, not which variant.
      if (d.kontekst) for (const st of ildizlar(d.kontekst)) tf.set(st, (tf.get(st) ?? 0) + 0.5);
      let l = 0;
      for (const [st, n] of tf) { l += n; const p = this.post.get(st); if (p) p.push([i, n]); else this.post.set(st, [[i, n]]); }
      this.len[i] = l; total += l;
    });
    this.avg = docs.length ? total / docs.length : 1;
  }
  private idf(st: string) { const df = this.post.get(st)?.length ?? 0; return df ? Math.log(1 + (this.soni - df + 0.5) / (df + 0.5)) : 0; }

  /**
   * Scores every document against several phrasings (best phrasing wins per document).
   * `mos` = share of the phrase's weighted stems the document covers (0..1) — used for confidence.
   * `filtr` limits candidates (e.g. allowed collections / units).
   */
  qidir(iboralar: string[], limit = 30, filtr?: (i: number) => boolean): Topilma[] {
    const best = new Map<number, Topilma>();
    const k1 = 1.2, b = 0.75;
    for (const ibora of iboralar) {
      const q = [...new Set(ildizlar(ibora))];
      if (!q.length) continue;
      const w = q.map(st => this.idf(st));
      const wSum = w.reduce((a, x) => a + x, 0) || 1;
      const score = new Map<number, number>(), cover = new Map<number, number>();
      q.forEach((st, qi) => {
        const p = this.post.get(st); if (!p) return;
        for (const [i, tf] of p) {
          const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * this.len[i] / this.avg));
          score.set(i, (score.get(i) ?? 0) + w[qi] * norm);
          cover.set(i, (cover.get(i) ?? 0) + w[qi]);
        }
      });
      for (const [i, s0] of score) {
        if (filtr && !filtr(i)) continue;
        const mos = (cover.get(i) ?? 0) / wSum;
        // The leading action/product word must agree ("УСТРОЙСТВО…" ≠ "РАЗБОРКА…"; "ПЕСОК" ≠ "ПЛИТЫ…").
        const s = s0 * (0.35 + mos) * (this.bosh[i] && this.bosh[i] === q[0] ? 1.5 : 1);
        const cur = best.get(i);
        if (!cur || s > cur.ball) best.set(i, { id: i, ball: s, mos });
      }
    }
    return [...best.values()].sort((a, b) => b.ball - a.ball || a.id - b.id).slice(0, limit);
  }
}
