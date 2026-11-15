// @vitest-environment node
/**
 * LOCAL: measures the LLM rerank for real on the HELD-OUT half (calls the configured cheap provider; capped at 300 calls).
 *   MOSLASH_LLM=1  OPENROUTER_API_KEY (read from the environment here, never printed)  + the usual eval variables.
 *   MOSLASH_LLM_MODEL (default google/gemini-2.5-flash-lite = the server default), MOSLASH_LLM_MUQOBIL=1 (ask for 2 alternatives).
 * Only the line text, its unit and the 20 candidate norm names are sent (no headings, no object names, no sums).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EVAL_DIRS, EVAL_OUT, EVAL_ROOT, datasetOl, katalogOch } from './moslash-eval-io';
import { kodKalit } from './resurs-kalit';
import { fayl2bolak, haqiqiyKod, takrorsiz, type IshJuft } from './moslash-eval';
import { NormMoslash } from './norm-moslash';
import { TANLOV_TIZIM } from './prompt';
import { MUQOBIL_QOIDA } from './protokol';

const ON = process.env.MOSLASH_LLM === '1' && !!process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MOSLASH_LLM_MODEL ?? 'google/gemini-2.5-flash-lite';
const MUQOBIL = process.env.MOSLASH_LLM_MUQOBIL === '1';
const CALL_CAP = 300, BATCH = 8, PARALLEL = Number(process.env.MOSLASH_LLM_PARALLEL ?? 8);

type Nom = { id: string; kod: string; nom: string; birlik: string | null; jadval: string | null; toplam: string | null };
type Sor = { id: string; tavsif: string; birlik: string; nomzodlar: Nom[] };
type Chaqiruv = { ms: number; promptTok: number; outTok: number; cost: number | null; ok: boolean; xato?: string };
type Javob = { by: Map<string, string | null>; alt: Map<string, string[]>; c: Chaqiruv };

async function chaqir(sorovlar: Sor[]): Promise<Javob> {
  const t0 = performance.now();
  const body = { model: MODEL, temperature: 0, max_tokens: 1500, usage: { include: true }, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: TANLOV_TIZIM + (MUQOBIL ? MUQOBIL_QOIDA : '') }, { role: 'user', content: `<MALUMOT>\n${JSON.stringify(sorovlar)}\n</MALUMOT>` }] };
  const by = new Map<string, string | null>(), alt = new Map<string, string[]>();
  const fail = (xato: string): Javob => ({ by, alt, c: { ms: performance.now() - t0, promptTok: 0, outTok: 0, cost: null, ok: false, xato } });
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; error?: { message?: string } };
    if (!r.ok) return fail(`${r.status} ${String(j.error?.message ?? '').slice(0, 80)}`);
    const m = /\{[\s\S]*\}/.exec(j.choices?.[0]?.message?.content ?? '');
    const o = (m ? JSON.parse(m[0]) : {}) as { tanlovlar?: Array<{ id?: string; ishId?: string | null; muqobil?: unknown }> };
    for (const x of o.tanlovlar ?? []) if (x.id) { by.set(String(x.id), x.ishId ? String(x.ishId) : null); if (Array.isArray(x.muqobil)) alt.set(String(x.id), x.muqobil.map(String)); }
    return { by, alt, c: { ms: performance.now() - t0, promptTok: j.usage?.prompt_tokens ?? 0, outTok: j.usage?.completion_tokens ?? 0, cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null, ok: true } };
  } catch (e) { return fail(e instanceof Error ? e.name : 'ERR'); }
}

describe.skipIf(!EVAL_DIRS.length || !EVAL_ROOT || !ON)('moslash eval: LLM rerank (real calls)', () => {
  it('top-1 / top-3 with and without the LLM on the held-out half', async () => {
    const d = datasetOl();
    const katalog = await katalogOch();
    const byKey = new Map(katalog.allWorks().map(w => [kodKalit(w.code)!, w]));
    const lines = takrorsiz(d.ishlar).filter(j => byKey.has(haqiqiyKod(j)!));
    const { test } = fayl2bolak(lines);
    const nm = new NormMoslash(katalog);
    const toplam = new Map<string, string[]>();
    type Row = { j: IshJuft; top20: Nom[]; ids: string[]; auto: boolean };
    const rows: Row[] = [];
    for (const j of test) {
      const key = `${j.fayl}>${j.bolim.join('>')}`;
      const k = nm.kontekst({ nom: j.nom, birlik: j.birlik, bolim: j.bolim, qoshni: toplam.get(key) ?? [] });
      const raw = nm.rerank(k, 20);
      const r = nm.natija(raw);
      if (r.tanlangan) { const l = toplam.get(key) ?? []; l.push(raw[0].d.coll); toplam.set(key, l); }
      rows.push({ j, top20: raw.map(h => ({ id: h.d.w.id, kod: h.d.w.code, nom: (h.d.w.name ?? '').slice(0, 300), birlik: h.d.w.unitCode, jadval: katalog.tableLabel(h.d.w.id), toplam: katalog.collectionTitle(h.d.w.collection) })),
        ids: raw.slice(0, 3).map(h => h.d.w.id), auto: !!r.tanlangan });
    }
    const batches: Row[][] = [];
    for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
    expect(batches.length).toBeLessThanOrEqual(CALL_CAP);
    const choice = new Map<string, string | null>(), muq = new Map<string, string[]>();
    const calls: Chaqiruv[] = [];
    const t0 = performance.now();
    for (let b = 0; b < batches.length; b += PARALLEL) {
      const wave = batches.slice(b, b + PARALLEL);
      const out = await Promise.all(wave.map(rs => chaqir(rs.map((r, i) => ({ id: `w${i + 1}`, tavsif: r.j.nom.slice(0, 400), birlik: r.j.birlik ?? '', nomzodlar: r.top20 })))));
      out.forEach((o, wi) => { calls.push(o.c); wave[wi].forEach((r, i) => { choice.set(r.j.id, o.by.get(`w${i + 1}`) ?? null); muq.set(r.j.id, o.alt.get(`w${i + 1}`) ?? []); }); });
    }
    const wallMs = Math.round(performance.now() - t0);
    const score = (pick: (r: Row) => string[]) => {
      let t1 = 0, t3 = 0;
      for (const r of rows) {
        const ids = pick(r), c = new Map(r.top20.map(n => [n.id, n])), want = haqiqiyKod(r.j);
        if (ids[0] && kodKalit(c.get(ids[0])?.kod ?? '') === want) t1++;
        if (ids.slice(0, 3).some(i => kodKalit(c.get(i)?.kod ?? '') === want)) t3++;
      }
      return { n: rows.length, top1: Math.round(t1 / rows.length * 1000) / 1000, top3: Math.round(t3 / rows.length * 1000) / 1000 };
    };
    const llm3 = (r: Row) => {
      const ch = choice.get(r.j.id), valid = new Set(r.top20.map(n => n.id));
      const alts = (muq.get(r.j.id) ?? []).filter(i => valid.has(i) && i !== ch);
      return ch && valid.has(ch) ? [ch, ...alts, ...r.top20.map(n => n.id).filter(i => i !== ch && !alts.includes(i))].slice(0, 3) : r.ids;
    };
    const ok = calls.filter(c => c.ok);
    const sum = (f: (c: Chaqiruv) => number) => ok.reduce((a, c) => a + f(c), 0);
    const sorted = ok.map(c => c.ms).sort((a, b) => a - b);
    const hisobot = { sana: '2026-11-16', model: MODEL, muqobil: MUQOBIL, heldOutLines: rows.length, unsureLines: rows.filter(r => !r.auto).length,
      politikalar: { pipelineOnly: score(r => r.ids), llmAllLines: score(llm3), hybridLlmOnlyUnsure: score(r => (r.auto ? r.ids : llm3(r))) },
      recall20: Math.round(rows.filter(r => r.top20.some(n => kodKalit(n.kod) === haqiqiyKod(r.j))).length / rows.length * 1000) / 1000,
      chaqiruvlar: { soni: calls.length, muvaffaqiyatli: ok.length, xatolar: calls.filter(c => !c.ok).map(c => c.xato), batch: BATCH, parallel: PARALLEL,
        medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0), p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), umumiyDevorMs: wallMs,
        promptTok: sum(c => c.promptTok), outTok: sum(c => c.outTok), costUsd: ok.every(c => c.cost != null) ? Math.round(sum(c => c.cost ?? 0) * 10000) / 10000 : null } };
    if (EVAL_OUT) fs.writeFileSync(path.join(EVAL_OUT, `llm_rerank_${MODEL.replace(/[^a-z0-9]+/gi, '_')}_${MUQOBIL ? 'muq' : 'oddiy'}.json`), JSON.stringify(hisobot, null, 2), 'utf8');
    expect(calls.length).toBeGreaterThan(0);
  }, 1_800_000);
});
