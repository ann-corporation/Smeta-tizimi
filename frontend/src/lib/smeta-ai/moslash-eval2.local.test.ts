// @vitest-environment node
/**
 * LOCAL eval, round 2: retrieval recall, section context, learned synonyms, company memory (time-ordered).
 * Same environment variables as moslash-eval.local.test.ts. MOSLASH_LEARN=1 fits the synonym table on the TUNING half only and writes
 * src/lib/smeta-ai/norm-sinonim-oqilgan.ts (generic construction words, no names/sums).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EVAL_DIRS, EVAL_OUT, EVAL_ROOT, datasetOl, katalogOch } from './moslash-eval-io';
import { kodKalit } from './resurs-kalit';
import { fayl2bolak, haqiqiyKod, ishMetrika, takrorsiz, type IshJuft, type MatcherNatija } from './moslash-eval';
import { NormMoslash, OGIRLIK, ISHONCH_KOEF, AVTO_CHEGARA, type Kontekst, type IshSorovi } from './norm-moslash';
import { xotiraBosh, xotiraYoz, type Xotira } from './norm-xotira';
import { ildizlar } from './matn-qidiruv';
import { uzbekMi } from './norm-lugat';

type Opt = { kengaytir: boolean; xotira: Xotira | null; onlayn: boolean };
const ID = (j: IshJuft): IshSorovi => ({ nom: j.nom, birlik: j.birlik, bolim: j.bolim });

/** Sequential pass in smeta order (like a user working down the smeta): section context, optional memory. Returns results + recall@k. */
function yur(nm: NormMoslash, qs: IshJuft[], opt: Opt, koefIsh = ISHONCH_KOEF, chegara = AVTO_CHEGARA, ctx?: Map<string, Kontekst>) {
  const res = new Map<string, MatcherNatija>();
  const toplam = new Map<string, string[]>();
  const rekall: Record<number, number> = { 1: 0, 3: 0, 10: 0, 20: 0, 50: 0 };
  for (const j of qs) {
    const key = `${j.fayl}>${j.bolim.join('>')}`;
    const qoshni = toplam.get(key) ?? [];
    let k: Kontekst = opt.xotira ? nm.kontekst({ ...ID(j), xotira: opt.xotira }) : (ctx?.get(j.id) ?? nm.kontekst(ID(j)));
    k = { ...k, qoshni: new Map() };
    for (const c of qoshni) k.qoshni.set(c, (k.qoshni.get(c) ?? 0) + 1);
    if (opt.kengaytir) k = nm.kengaytir(k, [...k.hint, ...qoshni]);
    const raw = nm.rerank(k, 50);
    const want = haqiqiyKod(j);
    const pos = raw.findIndex(h => kodKalit(h.d.w.code) === want);
    for (const kk of [1, 3, 10, 20, 50]) if (pos >= 0 && pos < kk) rekall[kk]++;
    const r = nm.natija(raw.slice(0, 20), 0, koefIsh, chegara);
    if (r.tanlangan) { const l = toplam.get(key) ?? []; l.push(raw[0].d.coll); toplam.set(key, l); }
    res.set(j.id, { nomzodlar: r.nomzodlar.map(n => ({ id: n.id, kod: n.kod, ishonch: n.ishonch })), tanlangan: r.tanlangan ? { id: r.tanlangan.id, kod: r.tanlangan.kod } : null });
    if (opt.onlayn && opt.xotira) xotiraYoz(opt.xotira, j.nom, j.kod); // the user confirms the line (truth) after it was suggested
  }
  const n = Math.max(1, qs.length);
  return { res, rekall: Object.fromEntries(Object.entries(rekall).map(([k, v]) => [`@${k}`, Math.round(v / n * 1000) / 1000])), metrika: ishMetrika(qs, j => res.get(j.id)!) };
}

/** Word associations fitted on the tuning half: estimator stem -> normative stems that the approved norms use instead. */
function sinonimOgren(train: IshJuft[], truthText: (j: IshJuft) => string): Record<string, string> {
  const cnt = new Map<string, Map<string, number>>(), qc = new Map<string, number>();
  for (const j of train) {
    if (uzbekMi(truthText(j))) continue;   // Uzbek-named norms are bridged by the glossary, not learned
    const Q = new Set(ildizlar(j.nom.split('#')[0])), T = new Set(ildizlar(truthText(j)));
    for (const q of Q) {
      if (T.has(q) || /\d/.test(q) || q.length < 4) continue;
      qc.set(q, (qc.get(q) ?? 0) + 1);
      const m = cnt.get(q) ?? new Map<string, number>(); cnt.set(q, m);
      for (const t of T) if (!Q.has(t) && !/\d/.test(t) && t.length >= 5) m.set(t, (m.get(t) ?? 0) + 1);
    }
  }
  const out: Record<string, string> = {};
  for (const [q, m] of cnt) {
    const n = qc.get(q)!;
    if (n < 3) continue;
    const best = [...m.entries()].filter(([t, c]) => c >= 4 && c / n >= 0.5 && /^[а-я]+$/.test(t)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    if (best.length) out[q] = best.join(' ');
  }
  return out;
}

describe.skipIf(!EVAL_DIRS.length || !EVAL_ROOT)('moslash eval round 2', () => {
  it('recall, section context, learned synonyms, company memory', async () => {
    const d = datasetOl();
    const katalog = await katalogOch();
    const byKey = new Map(katalog.allWorks().map(w => [kodKalit(w.code)!, w]));
    const lines = takrorsiz(d.ishlar).filter(j => byKey.has(haqiqiyKod(j)!));
    const { train, test } = fayl2bolak(lines);
    const label = (j: IshJuft) => { const w = byKey.get(haqiqiyKod(j)!)!; return `${w.name ?? ''} ${katalog.tableLabel(w.id) ?? ''}`; };
    if (process.env.MOSLASH_LEARN === '1') {
      const t = sinonimOgren(train, label);
      const src = `/** Learned from approved smetas (tuning half only) by the local eval (moslash-eval2); generic construction word stems only. */\nexport const SINONIM_OQILGAN: Record<string, string> = ${JSON.stringify(t, null, 2)};\n`;
      fs.writeFileSync(path.join(__dirname, 'norm-sinonim-oqilgan.ts'), src, 'utf8');
      if (EVAL_OUT) fs.writeFileSync(path.join(EVAL_OUT, 'sinonim_oqilgan.json'), JSON.stringify(t, null, 2), 'utf8');
      expect(Object.keys(t).length).toBeGreaterThan(0);
      return;
    }
    const nm = new NormMoslash(katalog);
    const ctx = new Map<string, Kontekst>();
    for (const j of lines) ctx.set(j.id, nm.kontekst(ID(j)));
    const testSet = new Set(test.map(j => j.id));
    const testL = lines.filter(j => testSet.has(j.id));
    const A = yur(nm, lines, { kengaytir: false, xotira: null, onlayn: false }, ISHONCH_KOEF, AVTO_CHEGARA, ctx);
    const B = yur(nm, lines, { kengaytir: true, xotira: null, onlayn: false }, ISHONCH_KOEF, AVTO_CHEGARA, ctx);
    const At = yur(nm, testL, { kengaytir: false, xotira: null, onlayn: false }, ISHONCH_KOEF, AVTO_CHEGARA, ctx);
    const Bt = yur(nm, testL, { kengaytir: true, xotira: null, onlayn: false }, ISHONCH_KOEF, AVTO_CHEGARA, ctx);
    // ---- company memory, time-ordered: the first 60% of lines (dataset order = project order) are the past, the rest the future
    const kesim = Math.floor(lines.length * 0.6);
    const past = lines.slice(0, kesim), future = lines.slice(kesim);
    const mem: Xotira = xotiraBosh();
    for (const j of past) xotiraYoz(mem, j.nom, j.kod);
    const F0 = yur(nm, future, { kengaytir: true, xotira: null, onlayn: false });
    const F1 = yur(nm, future, { kengaytir: true, xotira: mem, onlayn: false });
    const mem2: Xotira = JSON.parse(JSON.stringify(mem));
    const F2 = yur(nm, future, { kengaytir: true, xotira: mem2, onlayn: true });
    const memBytes = JSON.stringify(mem).length;
    // same-company scenario: memory from the tuning files, evaluated on the held-out files (objects overlap like a company's repeat work)
    const memF: Xotira = xotiraBosh();
    for (const j of train) xotiraYoz(memF, j.nom, j.kod);
    const sweep: Record<string, unknown> = {};
    const og0 = { ...OGIRLIK };
    for (const w of [0, 0.1, 0.2, 0.35, 0.5]) {
      nm.ogirlikQoy({ ...og0, xotira: w });
      const r = yur(nm, testL, { kengaytir: false, xotira: w ? memF : null, onlayn: false });
      const r2 = yur(nm, future, { kengaytir: false, xotira: w ? mem : null, onlayn: false });
      sweep[`w${w}`] = { fayl: { top1: r.metrika.top1, top3: r.metrika.top3, '@20': r.rekall['@20'], auto: r.metrika.avtoulush, aniqlik: r.metrika.avtoAniqlik },
        vaqt: { top1: r2.metrika.top1, top3: r2.metrika.top3, '@20': r2.rekall['@20'], auto: r2.metrika.avtoulush, aniqlik: r2.metrika.avtoAniqlik } };
    }
    nm.ogirlikQoy(og0);
    const hisobot = { sana: '2026-11-16', n: lines.length, train: train.length, test: test.length,
      retrieval: { hammasi: A.rekall, hammasiKengaytirilgan: B.rekall, test: At.rekall, testKengaytirilgan: Bt.rekall },
      metrika: { hammasi: A.metrika, hammasiKengaytirilgan: B.metrika, test: At.metrika, testKengaytirilgan: Bt.metrika },
      xotira: { kesim: { oldin: past.length, keyin: future.length }, xotirasiz: { rekall: F0.rekall, m: F0.metrika }, statik: { rekall: F1.rekall, m: F1.metrika },
        onlayn: { rekall: F2.rekall, m: F2.metrika }, hajmBayt: memBytes, kodlar: Object.keys(mem.k).length, sweep } };
    if (EVAL_OUT) fs.writeFileSync(path.join(EVAL_OUT, 'ish_natija_r2.json'), JSON.stringify(hisobot, null, 2), 'utf8');
    expect(lines.length).toBeGreaterThan(0);
  }, 3_600_000);
});
