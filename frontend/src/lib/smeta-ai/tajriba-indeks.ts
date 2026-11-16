/**
 * Tajriba indeksi (experience index): exemplar-based memory learned from every approved smeta.
 *
 * Owner idea (PTO engineer 2026-11-16): "we already have lots of finished smetas - teach the studio which norm the estimators
 * used in which situation, and make it learn systematically and continuously".
 *
 * One EXEMPLAR = one distinct work wording (normalised text + unit). For every canonical norm code actually used under that wording
 * we keep CONTRIBUTIONS, one per source object: how many lines of that object used the code, plus tiny context features
 * (hashed words of the nearest section names, collections of the neighbouring lines). Contributions are keyed by (company, object),
 * so re-ingesting an object REPLACES its earlier contribution (idempotent nightly rebuilds, edits propagate) and the distinct-object /
 * distinct-company counts the k-anonymity rule needs are always exact.
 *
 *   company layer : everything one company produced (its own prefix in R2).
 *   global layer  : only (exemplar, code) pairs seen in >= MIN_OBYEKT objects OR >= MIN_KOMPANIYA companies; no company/object
 *                   identity, section words are hashes - nothing but counts leaves a company.
 *
 * Pure data code (no I/O). The R2 packing is tajriba-paket.ts, matching is tajriba-qidir.ts, the nightly job is
 * functions/_shared/tajriba-tick.ts. Repo tests use tiny synthetic fixtures only (the repository is public).
 */
import { ildiz, sozlar } from './matn-qidiruv';
import { birlikKalit, ishKodKalit, kodKalit, nomKalit } from './resurs-kalit';
import { stemHash } from './norm-xotira';

export const TAJRIBA_FORMAT = 'tajriba-v1';
/** k-anonymity: a (exemplar, code) pair is shared across companies only when this many objects ... */
export const MIN_OBYEKT = 3;
/** ... or this many companies used it. */
export const MIN_KOMPANIYA = 2;
const MAX_HISSA = 16;
const MAX_MATN = 240;
const MAX_BOLIM_BELGI = 8;
const MAX_QOSHNI = 4;

/** One approved smeta line as the source (DB or file) delivers it. */
export type TajribaQator = {
  nom: string;
  birlik: string | null;
  /** Norm code as written ("Е16-2-12-8 ШНК.ДОП.15"); the annotation is dropped. */
  kod: string;
  /** Section names, outermost first. */
  bolim?: string[];
  /** Codes of the neighbouring lines (previous and next), any spelling. */
  qoshni?: string[];
};

/** One object's (or Studio's) contribution under one (exemplar, code). */
export type Hissa = { n: number; /** hashed section words */ b?: string[]; /** neighbouring collections ("Е16") */ q?: string[] };
export type Misol = { t: string; u: string; c: Record<string, Record<string, Hissa>> };
export type Holat = { v: 1; m: Record<string, Misol>; /** contribution key -> number of lines (the object registry) */ o: Record<string, number> };

export const holatBosh = (): Holat => ({ v: 1, m: {}, o: {} });

// ---------------------------------------------------------------- keys
/** Canonical norm code of a smeta line: the estimator's code, annotation stripped; only real norm codes ("Е16-2-12-8"). */
export function normaKodi(kod: string | null | undefined): string | null {
  const k = ishKodKalit(kod) ?? kodKalit(kod);
  return k && /^[ЕСЦУ]\d+(?:-\d+)+$/.test(k) ? k : null;
}
/** Collection of a canonical code: "Е16-2-12-8" -> "Е16". */
export const toplamKalit = (kodK: string) => kodK.split('-')[0];
/** Normalised work wording: the estimator's own comment after "#" is not part of the wording. */
export function matnKalit(nom: string | null | undefined): string {
  return nomKalit((nom ?? '').split('#')[0]).slice(0, MAX_MATN);
}
export const misolId = (t: string, u: string) => `${u}|${t}`;
/** (company, object) -> opaque contribution key; a studio confirmation stream of a company is "<company>.s". */
export const hissaKalit = (kompaniya: string, obyekt: string) => `${stemHash(kompaniya)}.${stemHash(obyekt)}`;
export const studioKalit = (kompaniya: string) => `${stemHash(kompaniya)}.s`;
const studioMi = (k: string) => k.endsWith('.s');
const kompaniyaHash = (k: string) => k.slice(0, k.indexOf('.'));

/** Hashed word stems of the nearest two section names (the outermost one is usually the object's own name: only hashes leave). */
export function bolimBelgilari(bolim: readonly string[] | undefined): string[] {
  const out = new Set<string>();
  for (const s of (bolim ?? []).slice(-2)) for (const w of sozlar(s)) { const st = ildiz(w); if (st && !/\d/.test(st) && st.length >= 3) out.add(stemHash(st)); }
  return [...out].slice(0, MAX_BOLIM_BELGI);
}
const qoshniToplamlari = (qoshni: readonly string[] | undefined): string[] => {
  const out = new Set<string>();
  for (const c of qoshni ?? []) { const k = normaKodi(c); if (k) out.add(toplamKalit(k)); }
  return [...out].slice(0, MAX_QOSHNI);
};

// ---------------------------------------------------------------- ingestion
function hissaQosh(h: Holat, t: string, u: string, kodK: string, key: string, qator: Pick<TajribaQator, 'bolim' | 'qoshni'>) {
  const id = misolId(t, u);
  const m = h.m[id] ?? (h.m[id] = { t, u, c: {} });
  const hs = m.c[kodK] ?? (m.c[kodK] = {});
  const cur = hs[key] ?? (hs[key] = { n: 0 });
  cur.n++;
  const b = bolimBelgilari(qator.bolim), q = qoshniToplamlari(qator.qoshni);
  if (b.length) cur.b = [...new Set([...(cur.b ?? []), ...b])].slice(0, MAX_BOLIM_BELGI * 2);
  if (q.length) cur.q = [...new Set([...(cur.q ?? []), ...q])].slice(0, MAX_QOSHNI * 2);
  const keys = Object.keys(hs);
  if (keys.length > MAX_HISSA) {
    // keep the strongest contributions (studio stream is never evicted: it is the only record of confirmations)
    const del = keys.filter(k => !studioMi(k)).sort((a, b2) => hs[a].n - hs[b2].n).slice(0, keys.length - MAX_HISSA);
    for (const k of del) delete hs[k];
  }
}

/** Removes every contribution of one key (object re-ingestion = replace). Drops emptied entries. */
export function hissaOchir(h: Holat, key: string): void {
  for (const [id, m] of Object.entries(h.m)) {
    for (const [kod, hs] of Object.entries(m.c)) {
      if (hs[key]) delete hs[key];
      if (!Object.keys(hs).length) delete m.c[kod];
    }
    if (!Object.keys(m.c).length) delete h.m[id];
  }
  delete h.o[key];
}

/**
 * Ingest the lines of one approved smeta object (REPLACES the object's earlier contribution). Lines without a real norm code or
 * with too short a wording are skipped. Returns the number of lines used.
 */
export function obyektQosh(h: Holat, kompaniya: string, obyekt: string, qatorlar: readonly TajribaQator[]): number {
  const key = hissaKalit(kompaniya, obyekt);
  hissaOchir(h, key);
  let used = 0;
  for (const q of qatorlar) {
    const kodK = normaKodi(q.kod), t = matnKalit(q.nom);
    if (!kodK || t.length < 4) continue;
    hissaQosh(h, t, birlikKalit(q.birlik), kodK, key, q);
    used++;
  }
  if (used) h.o[key] = used;
  return used;
}

/** Studio confirmations (the user picked / overrode a code): ADDS to the company's studio stream (caller advances its own cursor). */
export function studioQosh(h: Holat, kompaniya: string, tanlovlar: ReadonlyArray<{ nom: string | null; birlik: string | null; kod: string }>): number {
  const key = studioKalit(kompaniya);
  let used = 0;
  for (const q of tanlovlar) {
    const kodK = normaKodi(q.kod), t = matnKalit(q.nom);
    if (!kodK || t.length < 4) continue;
    hissaQosh(h, t, birlikKalit(q.birlik), kodK, key, {});
    used++;
  }
  if (used) h.o[key] = (h.o[key] ?? 0) + used;
  return used;
}

/** Union of several companies' states (their contribution keys never collide). */
export function holatlarniBirlashtir(hs: readonly Holat[]): Holat {
  const out = holatBosh();
  for (const h of hs) {
    Object.assign(out.o, h.o);
    for (const [id, m] of Object.entries(h.m)) {
      const t = out.m[id] ?? (out.m[id] = { t: m.t, u: m.u, c: {} });
      for (const [kod, hs2] of Object.entries(m.c)) {
        const d = t.c[kod] ?? (t.c[kod] = {});
        for (const [k, v] of Object.entries(hs2)) d[k] = v;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- compact (served) form
/** [code, lines, distinct objects, distinct companies] */
export type KodSoni = [kod: string, n: number, obyekt: number, kompaniya: number];
/** [text, unit, codes, section hashes with counts, neighbour collections with counts] */
export type KompaktMisol = [t: string, u: string, kodlar: KodSoni[], b: Array<[string, number]>, q: Array<[string, number]>];

export type Kanon = { minObyekt: number; minKompaniya: number };
export const KANON: Kanon = { minObyekt: MIN_OBYEKT, minKompaniya: MIN_KOMPANIYA };
const TOP_B = 12, TOP_Q = 6;

function top<T extends string>(m: Map<T, number>, n: number): Array<[T, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

/**
 * Compact form of a state. `kanon` = apply the k-anonymity rule per (exemplar, code) pair (global layer); null = keep everything
 * (a company's own layer). Deterministic order, so identical input gives identical shards.
 */
export function kompaktla(h: Holat, kanon: Kanon | null): KompaktMisol[] {
  const out: KompaktMisol[] = [];
  for (const m of Object.values(h.m)) {
    const kodlar: KodSoni[] = [];
    const b = new Map<string, number>(), q = new Map<string, number>();
    for (const [kod, hs] of Object.entries(m.c)) {
      const keys = Object.keys(hs);
      const obyekt = keys.filter(k => !studioMi(k)).length;
      const kompaniya = new Set(keys.map(kompaniyaHash)).size;
      if (kanon && obyekt < kanon.minObyekt && kompaniya < kanon.minKompaniya) continue;
      kodlar.push([kod, keys.reduce((a, k) => a + hs[k].n, 0), obyekt, kompaniya]);
      for (const k of keys) {
        for (const x of hs[k].b ?? []) b.set(x, (b.get(x) ?? 0) + 1);
        for (const x of hs[k].q ?? []) q.set(x, (q.get(x) ?? 0) + 1);
      }
    }
    if (!kodlar.length) continue;
    kodlar.sort((a, c) => c[1] - a[1] || (a[0] < c[0] ? -1 : 1));
    out.push([m.t, m.u, kodlar, top(b, TOP_B), top(q, TOP_Q)]);
  }
  return out.sort((a, c) => (a[1] + '|' + a[0] < c[1] + '|' + c[0] ? -1 : 1));
}

/** Union of compact layers (company + global): the same exemplar keeps the stronger count per code. */
export function kompaktBirlashtir(...qatlamlar: ReadonlyArray<readonly KompaktMisol[]>): KompaktMisol[] {
  const map = new Map<string, KompaktMisol>();
  for (const layer of qatlamlar) for (const m of layer) {
    const id = misolId(m[0], m[1]);
    const cur = map.get(id);
    if (!cur) { map.set(id, [m[0], m[1], m[2].map(k => [...k] as KodSoni), m[3].map(x => [...x] as [string, number]), m[4].map(x => [...x] as [string, number])]); continue; }
    for (const k of m[2]) {
      const e = cur[2].find(x => x[0] === k[0]);
      if (!e) cur[2].push([...k] as KodSoni);
      else { e[1] = Math.max(e[1], k[1]); e[2] = Math.max(e[2], k[2]); e[3] = Math.max(e[3], k[3]); }
    }
    for (const [src, dst] of [[m[3], cur[3]], [m[4], cur[4]]] as const) {
      for (const [x, c] of src) { const e = dst.find(y => y[0] === x); if (e) e[1] = Math.max(e[1], c); else dst.push([x, c]); }
    }
  }
  return [...map.values()];
}

export function holatStat(h: Holat) {
  const misol = Object.keys(h.m).length;
  let juft = 0;
  for (const m of Object.values(h.m)) juft += Object.keys(m.c).length;
  const keys = Object.keys(h.o);
  return { misol, juft, obyekt: keys.filter(k => !studioMi(k)).length, kompaniya: new Set(keys.map(kompaniyaHash)).size };
}
