/**
 * Node-only helpers of the LOCAL experience-index build and eval (real approved smetas stay OUTSIDE the repository, which is public).
 * Sources: (1) the DB export (tools/tajriba-indeks/db_export.mjs, read-only), (2) the approved smeta files read by the single smeta core
 * (smeta-anatomiya) through moslash-eval-io.datasetOl. The same smeta can arrive from both: such copies are merged into ONE object
 * (largest copy wins) by line-set overlap, so k-anonymity counts and the leave-one-object-out split stay honest.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EVAL_DIRS, datasetOl } from './moslash-eval-io';
import { birlikKalit } from './resurs-kalit';
import { matnKalit, normaKodi, type TajribaQator } from './tajriba-indeks';

export type LokalObyekt = {
  id: string; kompaniya: string; manba: 'db' | 'fayl'; qatorlar: TajribaQator[];
  /** seconds since epoch: first creation (DB) / file modification time (files) */ t: number;
  /** source objects/files merged into this one */ nusxa: string[];
};

/** File -> object: the first folder when the file lives in one, the numbered release family ("109xxx_ALL_...") as one object, else the file itself. */
export function obyektOl(fayl: string): string {
  const parts = fayl.split('/');
  if (parts.length > 1) return 'dir:' + parts[0];
  if (/^\d{5,6}_ALL_/.test(fayl)) return 'seriya:ALL';
  return 'fayl:' + fayl.replace(/\.[^.]+$/, '');
}

const qoshniKodlar = (list: TajribaQator[]): TajribaQator[] => list.map((q, i) => ({
  ...q, qoshni: [list[i - 2]?.kod, list[i - 1]?.kod, list[i + 1]?.kod, list[i + 2]?.kod].filter((x): x is string => !!x && !!normaKodi(x)),
}));
const kalitlar = (qs: TajribaQator[]) => new Set(qs.map(q => `${normaKodi(q.kod)}|${matnKalit(q.nom)}|${birlikKalit(q.birlik)}`));

/** mtime (seconds) of a smeta file by its relative path or, failing that, by base name under TAJRIBA_SMETA_ROOT / MOSLASH_EVAL_DIRS (time-ordered split only). */
let BASE: Map<string, number> | null = null;
function mtimeOl(fayl: string): number | null {
  for (const dir of EVAL_DIRS) { try { return Math.floor(fs.statSync(path.join(dir, fayl)).mtimeMs / 1000); } catch { /* next */ } }
  if (!BASE) {
    BASE = new Map();
    const walk = (dir: string) => { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (!BASE!.has(n)) BASE!.set(n, Math.floor(st.mtimeMs / 1000)); } };
    for (const r of [process.env.TAJRIBA_SMETA_ROOT, ...EVAL_DIRS]) if (r && fs.existsSync(r)) walk(r);
  }
  return BASE.get(path.basename(fayl)) ?? null;
}
export type LokalOptions = { dbJsonl?: string; fayllar?: boolean; /** overlap (of the smaller object) at/above which two objects are one smeta */ birlashtirChegara?: number };

export function lokalObyektlar(o: LokalOptions = {}): { obyektlar: LokalObyekt[]; birlashtirildi: number; /** raw source object id (db:N / dir:... / fayl:...) -> merged object id */ harita: Map<string, string> } {
  const xom: LokalObyekt[] = [];
  if (o.dbJsonl) {
    const by = new Map<string, { komp: string; t: number; qs: Array<TajribaQator & { tartib: number }> }>();
    for (const line of fs.readFileSync(o.dbJsonl, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { kompaniya: number; obyekt: number; tartib: number; kod: string; nom: string; birlik: string | null; bolim: string[]; t: number };
      const e = by.get('db:' + r.obyekt) ?? { komp: 'k' + r.kompaniya, t: r.t, qs: [] };
      by.set('db:' + r.obyekt, e);
      e.t = Math.min(e.t, r.t);
      e.qs.push({ nom: r.nom, birlik: r.birlik, kod: r.kod, bolim: r.bolim, tartib: r.tartib });
    }
    for (const [id, e] of by) xom.push({ id, kompaniya: e.komp, manba: 'db', qatorlar: qoshniKodlar(e.qs), t: e.t, nusxa: [id] });
  }
  if (o.fayllar !== false && (EVAL_DIRS.length || process.env.MOSLASH_EVAL_OUT)) {
    const d = datasetOl();
    const by = new Map<string, TajribaQator[]>(), fayllar = new Map<string, Set<string>>(), vaqt = new Map<string, number>();
    for (const j of d.ishlar) {
      const id = obyektOl(j.fayl);
      (by.get(id) ?? by.set(id, []).get(id)!).push({ nom: j.nom, birlik: j.birlik, kod: j.kod, bolim: j.bolim });
      (fayllar.get(id) ?? fayllar.set(id, new Set()).get(id)!).add(j.fayl);
    }
    for (const [id, fs0] of fayllar) {
      let t = Infinity;
      for (const f of fs0) { const m = mtimeOl(f); if (m != null) t = Math.min(t, m); }
      vaqt.set(id, Number.isFinite(t) ? t : 0);
    }
    const dbKomp = xom.find(x => x.manba === 'db')?.kompaniya ?? 'k1';   // the approved files belong to the same owner company as the DB objects
    for (const [id, qs] of by) xom.push({ id, kompaniya: dbKomp, manba: 'fayl', qatorlar: qoshniKodlar(qs), t: vaqt.get(id) ?? 0, nusxa: [...(fayllar.get(id) ?? [])].map(f => f) });
  }
  // merge copies of the same smeta: biggest first, a smaller object whose lines are mostly in a kept one is a copy of it
  const chegara = o.birlashtirChegara ?? (Number(process.env.TAJRIBA_BIRLASHTIR) || 0.7);
  xom.sort((a, b) => b.qatorlar.length - a.qatorlar.length || (a.id < b.id ? -1 : 1));
  const kept: Array<{ o: LokalObyekt; k: Set<string> }> = [];
  let birlashtirildi = 0;
  const harita = new Map<string, string>();
  for (const x of xom) {
    const k = kalitlar(x.qatorlar);
    const bor = kept.find(y => { let c = 0; for (const s of k) if (y.k.has(s)) c++; return c / Math.max(1, Math.min(k.size, y.k.size)) >= chegara; });
    if (bor) { bor.o.nusxa.push(...x.nusxa); bor.o.t = Math.min(bor.o.t || x.t, x.t || bor.o.t); harita.set(x.id, bor.o.id); birlashtirildi++; continue; }
    harita.set(x.id, x.id);
    kept.push({ o: x, k });
  }
  return { obyektlar: kept.map(x => x.o), birlashtirildi, harita };
}
