// @vitest-environment node
/**
 * LOCAL eval runner: real approved smetas stay OUTSIDE the repository (repo is public).
 *
 *   MOSLASH_EVAL_DIRS="<folder of approved smetas>;<another folder>"   (semicolon separated, .xls/.xlsx, read-only)
 *   NORM_LIBRARY_FIXTURE_ROOT="<norm-library release folder: manifest.json, navigation.json, works.jsonl.gz, collection-*.json.gz>"
 *   MOSLASH_EVAL_OUT="<a NEW folder outside the repository for the report and the extracted dataset>"
 *   MOSLASH_TUNE=1   (optional) tune re-rank weights + confidence on the TRAIN half (split by file) and report the TEST half
 *   npx vitest run src/lib/smeta-ai/moslash-eval.local.test.ts
 *
 * Without the variables the test is skipped (never a fake PASS).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { kitobAnatomiyasi, sarlavhaYoli } from '../smeta-anatomiya/index';
import { faylniOqi } from '../smeta-anatomiya/korpus/oqish';
import { NormLibraryCatalog } from '../catalog-extraction/norm-library';
import type { NormWork } from '../catalog-extraction/norm-catalog';
import { birlikKalit, kodKalit, mehnatMi, nomKalit, resurslarniBirlashtir } from './resurs-kalit';
import { narxBirlikKoef } from './narx-birlik';
import { narxHisobla } from './narx-hisob';
import { NormMoslash, OGIRLIK, ISHONCH_KOEF, AVTO_CHEGARA, ishonchHisobla, type Kontekst, type Ogirlik, type IshonchKoef } from './norm-moslash';
import { fayl2bolak, haqiqiyKod, ishMetrika, takrorsiz, type IshJuft, type ResursJuft, type Matcher, type MatcherNatija } from './moslash-eval';
import { avtoTanlov, nomzodlarTopEski, type AiKatalog } from './worker';
import type { Birlik } from './protokol';
import { birlikNormKalit } from './narx-birlik';

const DIRS = (process.env.MOSLASH_EVAL_DIRS ?? '').split(';').map(s => s.trim()).filter(Boolean);
const ROOT = process.env.NORM_LIBRARY_FIXTURE_ROOT;
const OUT = process.env.MOSLASH_EVAL_OUT;
const TUNE = process.env.MOSLASH_TUNE === '1';

function fayllar(dir: string): string[] {
  const out: string[] = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) out.push(...fayllar(p));
    else if (/\.(xlsx?|xlsm)$/i.test(n) && !n.startsWith('~$')) out.push(p);
  }
  return out.sort();
}

async function katalogOch(): Promise<NormLibraryCatalog> {
  const fetcher = async (u: string) => {
    const f = new URL(u, 'http://x').searchParams.get('f')!;
    return new Response(fs.readFileSync(path.join(ROOT!, f)));
  };
  return NormLibraryCatalog.open(fetcher, '/api/norm-library');
}

type Dataset = { ishlar: IshJuft[]; resurslar: ResursJuft[]; fayllar: number };
function datasetOl(): Dataset {
  const cache = OUT ? path.join(OUT, 'dataset.json') : null;
  if (cache && fs.existsSync(cache)) {
    const d = JSON.parse(fs.readFileSync(cache, 'utf8')) as Dataset;
    d.ishlar.forEach((j, i) => { j.id = String(i); });   // unique ids (sheet row numbers repeat across sections)
    return d;
  }
  const ishlar: IshJuft[] = [], resurslar: ResursJuft[] = [];
  let n = 0;
  for (const dir of DIRS) for (const p of fayllar(dir)) {
    let a;
    try { a = kitobAnatomiyasi(faylniOqi(p, dir)); } catch { continue; }
    n++;
    const fayl = path.relative(dir, p).replace(/\\/g, '/');
    for (const v of a.varaqlar) {
      if (v.rol !== 'lrv' && v.rol !== 'res') continue;
      const barcha = [...v.titul, ...v.sarlavhalar];
      for (const i of v.ishlar) {
        if (v.rol === 'lrv' && i.shifr && i.xom) {
          ishlar.push({ id: `${n}:${v.varaq}:${i.tartib}`, nom: i.xom, birlik: i.birlik, hajm: i.hajm, kod: i.shifr,
            bolim: sarlavhaYoli(barcha, i.sarlavha).map(s => s.xom), fayl });
        }
        for (const r of i.resurslar) if (r.xom) resurslar.push({ kod: r.kod, nom: r.xom, birlik: r.birlik, narx: r.narx, fayl });
      }
      for (const r of v.vedomost) if (r.xom) resurslar.push({ kod: r.kod, nom: r.xom, birlik: r.birlik, narx: r.narx, fayl });
    }
  }
  ishlar.forEach((j, i) => { j.id = String(i); });
  const d = { ishlar, resurslar, fayllar: n };
  if (cache) { fs.mkdirSync(OUT!, { recursive: true }); fs.writeFileSync(cache, JSON.stringify(d), 'utf8'); }
  return d;
}

const BIRLIK_MAP: Record<string, Birlik> = { 'М3': 'м3', 'М2': 'м2', 'М': 'м', 'Т': 'т', 'КГ': 'кг', 'ШТ': 'шт', 'КОМПЛ': 'компл' };
/** Smeta unit to the 7-value enum the studio model works with; null when the unit has no enum value. */
function birlikEnum(u: string | null): Birlik | null {
  const k = birlikNormKalit(u).replace(/^\d+(?:\.\d+)?/, '');
  return BIRLIK_MAP[k] ?? null;
}

const UZ = /[қўғҳ]/i;
type Qator = { j: IshJuft; k: Kontekst; toplam: string };

/** Sequential pass in smeta order: lines already matched (auto-selected by the pipeline itself, never the truth) steer the next ones. */
function ketmaKet(nm: NormMoslash, qatorlar: Qator[], og: Ogirlik, koef: IshonchKoef, chegara: number): Map<string, MatcherNatija> {
  const out = new Map<string, MatcherNatija>();
  const bolimToplam = new Map<string, string[]>();
  for (const q of qatorlar) {
    const key = `${q.j.fayl}>${q.j.bolim.join('>')}`;
    const qoshni = bolimToplam.get(key) ?? [];
    const k: Kontekst = { ...q.k, qoshni: new Map() };
    for (const c of qoshni) k.qoshni.set(c, (k.qoshni.get(c) ?? 0) + 1);
    const raw = nm.rerank(k, 20, og);
    const r = nm.natija(raw, 0, koef, chegara);
    if (r.tanlangan) { const l = bolimToplam.get(key) ?? []; l.push(raw[0].d.coll); bolimToplam.set(key, l); }
    out.set(q.j.id, { nomzodlar: r.nomzodlar.map(n => ({ id: n.id, kod: n.kod, ishonch: n.ishonch })), tanlangan: r.tanlangan ? { id: r.tanlangan.id, kod: r.tanlangan.kod } : null });
  }
  return out;
}
const metrika = (qatorlar: Qator[], res: Map<string, MatcherNatija>) => ishMetrika(qatorlar.map(q => q.j), j => res.get(j.id)!);

/** Coordinate search over the re-rank weights; objective = top-1 + top-3 on the TRAIN half. */
function ogirlikniSoz(nm: NormMoslash, train: Qator[]): Ogirlik {
  let best: Ogirlik = { ...OGIRLIK };
  const score = (og: Ogirlik) => { const m = metrika(train, ketmaKet(nm, train, og, ISHONCH_KOEF, AVTO_CHEGARA)); return m.top1 + m.top3; };
  let bestS = score(best);
  const steps: Record<keyof Ogirlik, number[]> = { bm: [-0.2, 0.2], mos: [-0.2, 0.2], birlik: [-0.06, 0.06], sonYes: [-0.1, 0.1], sonNo: [-0.06, 0.06], extra: [-0.015, 0.015],
    extraMax: [-0.06, 0.06], boshi: [-0.04, 0.04], bolim: [-0.05, 0.05], maxsus: [-0.06, 0.06], tamir: [-0.1, 0.1], qoshni: [-0.05, 0.05],
    prec: [-0.08, 0.08], bigram: [-0.08, 0.08] };
  for (let pass = 0; pass < 2; pass++) for (const key of Object.keys(steps) as Array<keyof Ogirlik>) for (const dlt of steps[key]) {
    const cand = { ...best, [key]: Math.max(0, Math.round((best[key] + dlt) * 1000) / 1000) };
    const s = score(cand);
    if (s > bestS + 1e-6) { best = cand; bestS = s; }
  }
  return best;
}

/** Plain logistic regression (batch gradient descent on standardised features). */
function logistika(X: number[][], y: number[]): number[] {
  const d = X[0].length, mu = new Array(d).fill(0), sd = new Array(d).fill(1);
  for (let j = 0; j < d; j++) { mu[j] = X.reduce((a, r) => a + r[j], 0) / X.length; sd[j] = Math.sqrt(X.reduce((a, r) => a + (r[j] - mu[j]) ** 2, 0) / X.length) || 1; }
  const Z = X.map(r => r.map((v, j) => (v - mu[j]) / sd[j]));
  const w = new Array(d).fill(0); let b = 0;
  for (let it = 0; it < 4000; it++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      const p = 1 / (1 + Math.exp(-(b + Z[i].reduce((a, v, j) => a + v * w[j], 0))));
      const e = p - y[i]; gb += e; for (let j = 0; j < d; j++) gw[j] += e * Z[i][j];
    }
    b -= 0.3 * gb / Z.length; for (let j = 0; j < d; j++) w[j] -= 0.3 * (gw[j] / Z.length + 0.001 * w[j]);
  }
  // back to raw feature space: b0 + sum(w_j/sd_j * x_j) with the mean shift folded into b0
  const raw = w.map((v, j) => v / sd[j]);
  return [b - raw.reduce((a, v, j) => a + v * mu[j], 0), ...raw];
}

describe.skipIf(!DIRS.length || !ROOT)('moslash eval: real approved smetas', () => {
  it('dataset + baseline (nomzodlarTop) vs new pipeline', async () => {
    const d = datasetOl();
    const katalog = await katalogOch();
    const works: NormWork[] = katalog.allWorks();
    const byKey = new Map<string, NormWork[]>();
    for (const w of works) { const k = kodKalit(w.code); if (!k) continue; const l = byKey.get(k) ?? []; l.push(w); byKey.set(k, l); }
    const hammasi = takrorsiz(d.ishlar);
    const katalogda = hammasi.filter(j => byKey.has(haqiqiyKod(j)!));
    const aynan = katalogda.filter(j => byKey.get(haqiqiyKod(j)!)!.some(w => nomKalit(w.name) === nomKalit(j.nom)));
    const ruscha = katalogda.filter(j => !UZ.test(byKey.get(haqiqiyKod(j)!)![0].name ?? ''));
    const birlikli = katalogda.filter(j => birlikEnum(j.birlik));
    const { train, test } = fayl2bolak(katalogda);
    const testSet = new Set(test.map(j => j.id)), ruSet = new Set(ruscha.map(j => j.id));

    // ---- baseline: the studio's current deterministic candidate step (nomzodlarTop, 15 variants, 7-value unit enum)
    const ak = katalog as unknown as AiKatalog;
    const baseline: Matcher = j => {
      const b = birlikEnum(j.birlik);
      if (!b) return { nomzodlar: [], tanlangan: null };
      const r = nomzodlarTopEski(ak, { qidiruv: [j.nom], birlik: b, toplam: [] }, 15);
      return { nomzodlar: r.map(x => ({ id: x.id, kod: x.kod })), tanlangan: null };
    };
    // the studio's real entry point (hard production rules + sequential section context), on the same 7-value unit subset
    const integratsiyaMatcher: Matcher = j => {
      const b = birlikEnum(j.birlik);
      if (!b) return { nomzodlar: [], tanlangan: null };
      const r = avtoTanlov(ak, { qidiruv: [j.nom], birlik: b, toplam: [], bolim: j.bolim.join(' / ') })!;
      const top3 = r.holat === 'TOPILMADI' ? [] : r.nomzodlar.slice(0, 3);
      return { nomzodlar: top3.map(x => ({ id: x.id, kod: x.kod })), tanlangan: r.avto ? { id: r.avto.workId, kod: r.avto.kod } : null };
    };
    const baseMs = { birlikli: ishMetrika(birlikli, baseline), test: ishMetrika(birlikli.filter(j => testSet.has(j.id)), baseline),
      ruscha: ishMetrika(birlikli.filter(j => ruSet.has(j.id)), baseline) };

    // ---- new pipeline
    const t1 = performance.now();
    const nm = new NormMoslash(katalog);
    const indeksMs = Math.round(performance.now() - t1);
    const t2 = performance.now();
    const all: Qator[] = katalogda.map(j => ({ j, k: nm.kontekst({ nom: j.nom, birlik: j.birlik, bolim: j.bolim }), toplam: '' }));
    const qidirMs = Math.round(performance.now() - t2);
    const trainQ = all.filter(q => !testSet.has(q.j.id)), testQ = all.filter(q => testSet.has(q.j.id));

    let og: Ogirlik = OGIRLIK, koef: IshonchKoef = ISHONCH_KOEF, chegara = AVTO_CHEGARA;
    let tuneInfo: unknown = null;
    if (TUNE) {
      og = ogirlikniSoz(nm, trainQ);
      // confidence: label = candidate is the truth, features at that candidate (train half only)
      const X: number[][] = [], y: number[] = [];
      const seq = (qs: Qator[]) => {
        const bt = new Map<string, string[]>();
        for (const q of qs) {
          const key = `${q.j.fayl}>${q.j.bolim.join('>')}`, kk: Kontekst = { ...q.k, qoshni: new Map() };
          for (const c of bt.get(key) ?? []) kk.qoshni.set(c, (kk.qoshni.get(c) ?? 0) + 1);
          const raw = nm.rerank(kk, 20, og);
          raw.slice(0, 3).forEach((r, i) => {
            X.push([r.z, Math.max(0, Math.min(0.6, r.z - (raw[i + 1]?.z ?? 0))), r.mos, r.birlik === true ? 1 : 0, i]);
            y.push(kodKalit(r.d.w.code) === haqiqiyKod(q.j) ? 1 : 0);
          });
          const t = raw[0];
          if (t && ishonchHisobla({ z: t.z, margin: t.z - (raw[1]?.z ?? 0), mos: t.mos, birlikTrue: t.birlik === true, orin: 0 }) >= AVTO_CHEGARA) { const l = bt.get(key) ?? []; l.push(t.d.coll); bt.set(key, l); }
        }
      };
      seq(trainQ);
      const c = logistika(X, y);
      koef = { b0: c[0], z: c[1], margin: c[2], mos: c[3], birlik: c[4], orin: c[5] };
      // threshold: smallest confidence whose TRAIN auto-selection precision is >= 0.9 (fallback 0.85, else the strictest)
      const res = ketmaKet(nm, trainQ, og, koef, 0);
      const pts = trainQ.map(q => ({ p: res.get(q.j.id)!.nomzodlar[0]?.ishonch ?? 0, ok: kodKalit(res.get(q.j.id)!.nomzodlar[0]?.kod ?? '') === haqiqiyKod(q.j) }));
      let pick = 0.95;
      for (const target of [0.9, 0.85, 0.8]) {
        let found = false;
        for (const t of [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
          const sel = pts.filter(x => x.p >= t); if (sel.length >= 20 && sel.filter(x => x.ok).length / sel.length >= target) { pick = t; found = true; break; }
        }
        if (found) break;
      }
      chegara = pick;
      tuneInfo = { ogirlik: og, koef, chegara, trainN: trainQ.length, samples: X.length };
      if (OUT) fs.writeFileSync(path.join(OUT, 'tuned.json'), JSON.stringify(tuneInfo, null, 2), 'utf8');
    }
    const res = ketmaKet(nm, all, og, koef, chegara);
    // ranking quality alone (no abstention, no confidence): the 3 best by evidence score, default vs tuned weights
    const siraliRes = (o: Ogirlik) => { const m = new Map<string, MatcherNatija>(); for (const q of all) m.set(q.j.id, { nomzodlar: nm.rerank(q.k, 3, o).map(r => ({ id: r.d.w.id, kod: r.d.w.code })), tanlangan: null }); return m; };
    const siraliTuned = siraliRes(og), siraliDefault = siraliRes(OGIRLIK);
    const v0: Ogirlik = { ...OGIRLIK, prec: 0, bigram: 0 };
    const variantlar = {
      A_prec0_bigram0_siralash: metrika(all, siraliRes(v0)),
      B_prec0_bigram0_ketma: metrika(all, ketmaKet(nm, all, v0, koef, chegara)),
      C_default_ketma: metrika(all, ketmaKet(nm, all, OGIRLIK, koef, chegara)),
      D_noqoshni_prec0_bigram0_ketma: metrika(all, ketmaKet(nm, all, { ...v0, qoshni: 0 }, koef, chegara)),
      E_only_bigram: metrika(all, siraliRes({ ...v0, bigram: 0.1 })),
      F_only_prec: metrika(all, siraliRes({ ...v0, prec: 0.1 })),
    };
    const siralash = { variantlar, tuned: { hammasi: metrika(all, siraliTuned), test: metrika(testQ, siraliTuned) }, default: { hammasi: metrika(all, siraliDefault), test: metrika(testQ, siraliDefault) } };
    const mAll = metrika(all, res), mTest = metrika(testQ, res);
    const mRu = metrika(all.filter(q => ruSet.has(q.j.id)), res);
    const mBirlikli = ishMetrika(birlikli, j => res.get(j.id)!);
    const mTestRu = metrika(testQ.filter(q => ruSet.has(q.j.id)), res);

    // ---- latency of the real end-to-end call (retrieval + rerank + confidence), per line and for a 100-line smeta
    const sample = katalogda.slice(0, 100);
    const t3 = performance.now();
    for (const j of sample) nm.moslash({ nom: j.nom, birlik: j.birlik, bolim: j.bolim });
    const smeta100Ms = Math.round(performance.now() - t3);
    const t4 = performance.now();
    nm.moslash({ nom: sample[0].nom, birlik: sample[0].birlik, bolim: sample[0].bolim });
    const birQatorMs = Math.round((performance.now() - t4) * 100) / 100;

    // calibration table on ALL lines: confidence bucket -> share of correct top candidates
    const buckets: Array<{ dan: number; n: number; togri: number }> = [];
    for (let lo = 0; lo < 1; lo += 0.1) {
      const sel = all.filter(q => { const t = res.get(q.j.id)!.nomzodlar[0]; return t && (t.ishonch ?? 0) >= lo && (t.ishonch ?? 0) < lo + 0.1; });
      buckets.push({ dan: Math.round(lo * 10) / 10, n: sel.length, togri: sel.length ? Math.round(sel.filter(q => kodKalit(res.get(q.j.id)!.nomzodlar[0].kod) === haqiqiyKod(q.j)).length / sel.length * 100) / 100 : 0 });
    }

    const integratsiya = { birlikli: ishMetrika(birlikli, integratsiyaMatcher), test: ishMetrika(birlikli.filter(j => testSet.has(j.id)), integratsiyaMatcher) };
    const hisobot = { sana: '2026-11-16', integratsiya, fayllar: d.fayllar, ishQatorlar: d.ishlar.length, takrorsiz: hammasi.length, katalogda: katalogda.length,
      aynanNom: aynan.length, ruschaNomli: ruscha.length, birlikEnumli: birlikli.length, train: train.length, test: test.length,
      baseline: baseMs,
      yangi: { indeksMs, qidirMsJami: qidirMs, smeta100Ms, birQatorMs, hammasi: mAll, test: mTest, ruscha: mRu, testRuscha: mTestRu, birlikliSubset: mBirlikli,
        parametrlar: { ogirlik: og, koef, chegara }, kalibrovka: buckets, siralash }, tuneInfo };
    if (OUT) fs.writeFileSync(path.join(OUT, TUNE ? 'ish_natija_tune.json' : 'ish_natija.json'), JSON.stringify(hisobot, null, 2), 'utf8');
    expect(hammasi.length).toBeGreaterThan(0);
  }, 3_600_000);

  it('resources: duplicate merging + unit conversion on approved smetas', () => {
    const d = datasetOl();
    const R = d.resurslar.filter(r => r.nom);
    // ---- (b) the same resource written with a different code format / spacing: raw spellings vs canonical resources
    const xom = new Set(R.map(r => `${(r.kod ?? '').trim()}|${(r.nom ?? '').trim()}|${(r.birlik ?? '').trim()}`));
    const xomKod = new Set(R.map(r => (r.kod ?? '').trim()).filter(Boolean));
    const guruhlar = resurslarniBirlashtir(R);
    const kodGuruhlar = new Set(R.map(r => kodKalit(r.kod)).filter(Boolean));
    const mehnat = guruhlar.filter(g => g.asos === 'mehnat');
    const kopKodli = guruhlar.filter(g => g.kodlar.length > 1);
    // ---- (c) same canonical resource seen in two units with a price in both: can the converter reconcile them?
    const birlikJuft = { juftlar: 0, eskiKonvert: 0, yangiKonvert: 0, narxTogri: 0, zichlikBilan: 0 };
    for (const g of guruhlar) {
      if (g.asos !== 'kod') continue;
      const byUnit = new Map<string, { b: string; narx: number; nom: string | null }>();
      for (const q of g.qatorlar) if (q.narx != null && q.narx > 0 && q.birlik) { const u = birlikKalit(q.birlik); if (!byUnit.has(u)) byUnit.set(u, { b: q.birlik, narx: q.narx, nom: q.nom }); }
      const arr = [...byUnit.values()];
      for (let i = 0; i < arr.length; i++) for (let j = 0; j < arr.length; j++) if (i !== j) {
        birlikJuft.juftlar++;
        const eski = narxBirlikKoef(arr[i].b, arr[j].b).koef;
        const yangi = narxHisobla({ narx: arr[i].narx, manbaBirlik: arr[i].b, smetaBirlik: arr[j].b, nds: 'siz', nom: arr[i].nom });
        if (eski != null) birlikJuft.eskiKonvert++;
        if (yangi.ok) { birlikJuft.yangiKonvert++; if (yangi.usul === 'zichlik') birlikJuft.zichlikBilan++; if (Math.abs(yangi.narx - arr[j].narx) / arr[j].narx <= 0.05) birlikJuft.narxTogri++; }
      }
    }
    // ---- (c) price-unit mismatch rate: resource lines whose unit is not the unit the same code usually carries
    const modalBirlik = new Map<string, Map<string, number>>();
    for (const q of R) { const k = kodKalit(q.kod); if (!k) continue; const u = birlikKalit(q.birlik); const m = modalBirlik.get(k) ?? new Map(); m.set(u, (m.get(u) ?? 0) + 1); modalBirlik.set(k, m); }
    let kodliQator = 0, farqliBirlik = 0;
    for (const q of R) { const k = kodKalit(q.kod); if (!k) continue; const m = modalBirlik.get(k)!; if (m.size < 2) continue; kodliQator++; const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; if (birlikKalit(q.birlik) !== top) farqliBirlik++; }
    const hisobot = { sana: '2026-11-16', resursQatorlar: R.length,
      birlashtirish: { xomKombinatsiya: xom.size, xomKodlar: xomKod.size, kanonikKodlar: kodGuruhlar.size, kanonikResurslar: guruhlar.length,
        qisqarishFoiz: Math.round((1 - guruhlar.length / xom.size) * 1000) / 10, mehnatGuruhlari: mehnat.length,
        mehnatXomKombinatsiya: new Set(R.filter(r => mehnatMi(r.nom)).map(r => `${r.kod}|${r.nom}|${r.birlik}`)).size, birdanOrtiqKodliGuruh: kopKodli.length },
      birlikJuftlari: birlikJuft, birlikFarqiBorQatorlar: { kodliQatorlar: kodliQator, modaldanFarqli: farqliBirlik } };
    if (OUT) fs.writeFileSync(path.join(OUT, 'resurs_natija.json'), JSON.stringify(hisobot, null, 2), 'utf8');
    expect(R.length).toBeGreaterThan(0);
  }, 600_000);
});
