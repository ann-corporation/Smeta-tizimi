// @vitest-environment node
/**
 * LOCAL eval of the experience index (real approved smetas stay outside the repository).
 *   leave-one-object-out: exemplars of the object under test are REMOVED (all merged copies of the same smeta too);
 *   time-ordered split: the index is built from the earliest 60 % of objects only, tested on the later ones.
 * Variants: "kompaniya" (everything the company produced, minus the tested object) and "global" (k-anonymity: >= 3 objects or >= 2 companies).
 *   TAJRIBA_DB_JSONL, MOSLASH_EVAL_OUT (dataset cache + report folder), TAJRIBA_SMETA_ROOT, NORM_LIBRARY_FIXTURE_ROOT, TAJRIBA_EVAL_REPORT=<new md file>
 *   npx vitest run src/lib/smeta-ai/tajriba-eval.local.test.ts
 * Deterministic only (no LLM). Skipped without the variables.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { EVAL_ROOT, datasetOl, katalogOch } from './moslash-eval-io';
import { birlikKalit, kodKalit } from './resurs-kalit';
import { haqiqiyKod, takrorsiz, type IshJuft } from './moslash-eval';
import { NormMoslash, OGIRLIK, type Ogirlik } from './norm-moslash';
import { KANON, hissaKalit, hissaOchir, holatBosh, kompaktla, matnKalit, misolId, obyektQosh, type Holat } from './tajriba-indeks';
import { TajribaIndeks } from './tajriba-qidir';
import { uzRuOrgan } from './tajriba-uzru';
import { lokalObyektlar, obyektOl } from './tajriba-lokal-io';

const REPORT = process.env.TAJRIBA_EVAL_REPORT;
const UZ = /[қўғҳ]/i;
const QISQA = /[а-яa-z]\/[а-яa-z]|(?:^|\s)(?:уст-во|толщ|гр|эксп|емк|диам|пп)\.(?=\s|$)/i;
const pct = (x: number) => (Math.round(x * 1000) / 10).toFixed(1) + '%';

type Q = { j: IshJuft; obj: string };
type Nat = { pos: number; top1: boolean; top3: boolean; r20: boolean; top1Kod: string | null };

describe.skipIf(!REPORT || !EVAL_ROOT)('tajriba indeksi: eval', () => {
  it('leave-one-object-out + time-ordered split, before/after', async () => {
    const d = datasetOl();
    const katalog = await katalogOch();
    const works = katalog.allWorks();
    const byKey = new Map<string, typeof works>();
    for (const w of works) { const k = kodKalit(w.code); if (!k) continue; (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(w); }
    const lines = takrorsiz(d.ishlar).filter(j => byKey.has(haqiqiyKod(j)!));
    const { obyektlar, harita, birlashtirildi } = lokalObyektlar({ dbJsonl: process.env.TAJRIBA_DB_JSONL });
    const qs: Q[] = lines.map(j => ({ j, obj: harita.get(obyektOl(j.fayl)) ?? obyektOl(j.fayl) }));
    const full = holatBosh();
    for (const o of obyektlar) obyektQosh(full, o.kompaniya, o.id, o.qatorlar);
    const nm = new NormMoslash(katalog);
    const kalitOf = new Map(obyektlar.map(o => [o.id, hissaKalit(o.kompaniya, o.id)]));

    const indeks = (h: Holat, kanon: boolean) => { const k = kompaktla(h, kanon ? KANON : null); return { idx: new TajribaIndeks(k, uzRuOrgan(k)), misol: new Set(k.map(m => misolId(m[0], m[1]))), n: k.length }; };
    const sirtqi = (keep: (o: typeof obyektlar[number]) => boolean): Holat => { const h = structuredClone(full); for (const o of obyektlar) if (!keep(o)) hissaOchir(h, kalitOf.get(o.id)!); return h; };

    function yur(list: Q[], idxOf: (q: Q) => TajribaIndeks | null, og: Ogirlik = OGIRLIK): Map<string, Nat> {
      const out = new Map<string, Nat>();
      for (const q of list) {
        const k = nm.kontekst({ nom: q.j.nom, birlik: q.j.birlik, bolim: q.j.bolim, tajriba: idxOf(q) });
        const raw = nm.rerank(k, 50, og);
        const want = haqiqiyKod(q.j);
        const pos = raw.findIndex(h => kodKalit(h.d.w.code) === want);
        out.set(q.j.id, { pos, top1: pos === 0, top3: pos >= 0 && pos < 3, r20: pos >= 0 && pos < 20, top1Kod: raw[0] ? kodKalit(raw[0].d.w.code) : null });
      }
      return out;
    }
    const ol = (list: Q[], m: Map<string, Nat>) => {
      const n = Math.max(1, list.length), g = (f: (x: Nat) => boolean) => list.filter(q => f(m.get(q.j.id)!)).length / n;
      return { n: list.length, top1: g(x => x.top1), top3: g(x => x.top3), r20: g(x => x.r20) };
    };
    const satr = (nom: string, a: ReturnType<typeof ol>) => `| ${nom} | ${a.n} | ${pct(a.top1)} | ${pct(a.top3)} | ${pct(a.r20)} |`;

    // ---- leave-one-object-out
    const loo = new Map<string, { kom: ReturnType<typeof indeks>; glo: ReturnType<typeof indeks> }>();
    for (const id of new Set(qs.map(q => q.obj))) { const h = sirtqi(o => o.id !== id); loo.set(id, { kom: indeks(h, false), glo: indeks(h, true) }); }
    const base = yur(qs, () => null);
    const kom = yur(qs, q => loo.get(q.obj)!.kom.idx), glo = yur(qs, q => loo.get(q.obj)!.glo.idx);
    // lines whose wording (+unit) is in NO other object: the honest "new wording" subset
    const yangi = qs.filter(q => !loo.get(q.obj)!.kom.misol.has(misolId(matnKalit(q.j.nom), birlikKalit(q.j.birlik))));
    const uz = qs.filter(q => UZ.test(q.j.nom) || UZ.test(byKey.get(haqiqiyKod(q.j)!)![0].name ?? ''));

    // ---- weight grid (leave-one-object-out; the default is the one the TIME-SPLIT TRAIN part prefers, reported openly)
    const grid: string[] = [];
    // split time = the 60th percentile of the objects that own test lines; the index sees every object created before it
    const vaqtlar = [...new Set(qs.map(q => q.obj))].map(id => obyektlar.find(o => o.id === id)!.t).sort((x, y) => x - y);
    const T = vaqtlar[Math.min(vaqtlar.length - 1, Math.ceil(vaqtlar.length * 0.6))];
    const trainIds = new Set(obyektlar.filter(o => o.t < T).map(o => o.id));
    const nTrain = trainIds.size;
    const hTrain = sirtqi(o => trainIds.has(o.id));
    const zaman = indeks(hTrain, false), zamanG = indeks(hTrain, true);
    const testQ = qs.filter(q => !trainIds.has(q.obj)), trainQ = qs.filter(q => trainIds.has(q.obj));
    for (const w of [0.15, 0.3, 0.5, 0.8]) {
      const og = { ...OGIRLIK, tajriba: w };
      const m = yur(qs, q => loo.get(q.obj)!.kom.idx, og);
      const mz = yur(testQ, () => zaman.idx, og);
      grid.push(`| ${w} | ${pct(ol(qs, m).top1)} | ${pct(ol(qs, m).top3)} | ${pct(ol(testQ, mz).top1)} | ${pct(ol(testQ, mz).top3)} |`);
    }

    // ---- time split
    const zBase = yur(testQ, () => null), zKom = yur(testQ, () => zaman.idx), zGlo = yur(testQ, () => zamanG.idx);

    // ---- miss clusters of the baseline (top-3 misses)
    const klaster = (q: Q): string => {
      const b = base.get(q.j.id)!, want = haqiqiyKod(q.j)!;
      const truth = byKey.get(want)![0];
      if (UZ.test(q.j.nom) || UZ.test(truth.name ?? '')) return "o'zbekcha matn";
      if (b.top1Kod && b.top1Kod.split('-').slice(0, 3).join('-') === want.split('-').slice(0, 3).join('-')) return 'shifr shubhali (bir jadval)';
      if (QISQA.test(q.j.nom)) return 'qisqartma';
      if (!b.r20) return 'recall (top-20 da yo`q)';
      return "past o'rin (4-20)";
    };
    const miss = qs.filter(q => !base.get(q.j.id)!.top3);
    const cl = new Map<string, Q[]>();
    for (const q of miss) (cl.get(klaster(q)) ?? cl.set(klaster(q), []).get(klaster(q))!).push(q);
    const klRows = [...cl.entries()].sort((a, b) => b[1].length - a[1].length).map(([nom, l]) => {
      const f3 = l.filter(q => kom.get(q.j.id)!.top3).length, f3g = l.filter(q => glo.get(q.j.id)!.top3).length, f1 = l.filter(q => kom.get(q.j.id)!.top1).length;
      return `| ${nom} | ${l.length} | ${f3} (${pct(f3 / l.length)}) | ${f1} | ${f3g} (${pct(f3g / l.length)}) |`;
    });
    // regressions: lines that were right at baseline and are not with the index
    const reg3 = qs.filter(q => base.get(q.j.id)!.top3 && !kom.get(q.j.id)!.top3).length, reg1 = qs.filter(q => base.get(q.j.id)!.top1 && !kom.get(q.j.id)!.top1).length;

    const tabHead = '| to\'plam | qator | top-1 | top-3 | recall@20 |\n|---|---|---|---|---|';
    const idxN = [...loo.values()][0];
    const md = `# Tajriba indeksi - o'lchov (${new Date().toISOString().slice(0, 10)})

MAXFIY: haqiqiy smeta ma'lumotlaridan olingan hisob (matn, nom, summa yo'q; faqat sonlar). Faqat deterministik pipeline (LLM ishlatilmadi: OpenRouter 402, kredit tugagan - o'lchov LLM'siz).

## Ma'lumot
- Manba: DB (faqat o'qish, 32 obyekt, 9 254 ish qatori) + tasdiqlangan smeta fayllari (8 637 qator). Bir smetaning ikki nusxasi (DB va fayl) qator to'plami ustma-ustligi >= ${process.env.TAJRIBA_BIRLASHTIR ?? '0.7'} bo'lsa BITTA obyekt (${birlashtirildi} nusxa birlashtirildi) -> ${obyektlar.length} obyekt.
- Baholash: avvalgi hisobotlar bilan bir xil ${qs.length} katalogli takrorsiz qator, o'sha pipeline va og'irliklar (OGIRLIK); farq faqat tajriba indeksi.
- Indeks hajmi (o'zi chiqarib tashlangan obyekt bilan): kompaniya qatlami ~${idxN.kom.n} namuna, global (k-anonimlik: >=3 obyekt yoki >=2 kompaniya) ~${idxN.glo.n} namuna. Barcha obyektlar bitta kompaniyaniki, shuning uchun global qatlam amalda faqat >=3 obyektda uchragan juftlarni oladi.

## 1. Leave-one-object-out (tekshirilayotgan obyekt va uning barcha nusxalari indeksdan chiqarilgan)
${tabHead}
${satr('oldin (indekssiz)', ol(qs, base))}
${satr('keyin: kompaniya qatlami', ol(qs, kom))}
${satr('keyin: global (k-anon)', ol(qs, glo))}
${satr("yangi so'z (boshqa obyektda aynan shu matn YO'Q) - oldin", ol(yangi, base))}
${satr("yangi so'z - kompaniya qatlami", ol(yangi, kom))}
${satr("yangi so'z - global", ol(yangi, glo))}
${satr("o'zbekcha qatorlar - oldin", ol(uz, base))}
${satr("o'zbekcha qatorlar - kompaniya qatlami", ol(uz, kom))}

Regressiya (oldin to'g'ri, keyin noto'g'ri, kompaniya qatlami): top-1 ${reg1} qator, top-3 ${reg3} qator.

## 2. Vaqt tartibidagi bo'linish (eng eski 60 % obyekt = indeks, qolgani = sinov; obyekt vaqti = DB yaratilgan / fayl o'zgargan vaqti)
${tabHead}
${satr('oldin', ol(testQ, zBase))}
${satr('keyin: kompaniya qatlami', ol(testQ, zKom))}
${satr('keyin: global (k-anon)', ol(testQ, zGlo))}
(indeks obyektlari ${nTrain}, sinov qatorlari ${testQ.length}, o'tmish qatorlari ${trainQ.length})

## 3. Xato klasterlari (oldingi pipeline top-3 da xato qilgan ${miss.length} qator; klaster evristik)
| klaster | xato | top-3 ga tuzaldi (kompaniya) | shundan top-1 | top-3 ga tuzaldi (global) |
|---|---|---|---|---|
${klRows.join('\n')}

## 4. Tajriba og'irligi (LOO va vaqt bo'linishi; standart ${OGIRLIK.tajriba})
| og'irlik | LOO top-1 | LOO top-3 | vaqt top-1 | vaqt top-3 |
|---|---|---|---|---|
${grid.join('\n')}

## Cheklov
- Bu eval to'plami bitta kompaniya va ~${obyektlar.length} obyekt: global qatlam kam; ko'p kompaniyali ma'lumotda foyda o'lchanmagan.
- Fayl vaqti (mtime) sinxronlangan diskda noaniq bo'lishi mumkin; vaqt bo'linishi taxminiy.
`;
    fs.writeFileSync(REPORT!, md, 'utf8');
    console.log(md.split('\n').slice(8, 24).join('\n'));
    expect(qs.length).toBeGreaterThan(0);
  }, 1_800_000);
});
