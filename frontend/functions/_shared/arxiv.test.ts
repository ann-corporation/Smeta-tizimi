import { describe, expect, it } from 'vitest';
import { jadvalArxivla, ndjsonGzip, ndjsonOch, partiyaArxivla, partiyaTikla, type ArxivDeps, type Qator } from './arxiv';
import { siyosatOl } from './arxiv-siyosat';

const S = siyosatOl('t2_ozgarish')!;
const eski = '2026-01-15T10:00:00.000Z';

/** Xotiradagi soxta baza + R2: faqat sintetik qatorlar. */
function soxta(n: number, opt: { putXato?: boolean; buzilgan?: boolean; ochirXato?: boolean; headNoto?: boolean } = {}) {
  let db: Qator[] = Array.from({ length: n }, (_, i) => ({ k: String(i + 1), t: eski, r: { id: i + 1, maydon: 'x' + i } }));
  const r2 = new Map<string, Uint8Array>();
  const manifest = new Map<string, { soni: number; sha: string }>();
  const chaqiruv: string[] = [];
  const d: ArxivDeps = {
    async rpc(nom, a) {
      chaqiruv.push(nom);
      if (nom === 't2_arxiv_batch_v1') return db.filter((q) => (a.p_after == null || Number(q.k) > Number(a.p_after))).slice(0, Number(a.p_limit));
      if (nom === 't2_arxiv_yoz_v1') { manifest.set(String(a.p_r2_key), { soni: Number(a.p_soni), sha: String(a.p_sha256) }); return { ok: true }; }
      if (nom === 't2_arxiv_ochir_v1') {
        if (opt.ochirXato) return { ok: false, code: 'LOCK' };
        const m = manifest.get(String(a.p_r2_key));
        if (!m || m.soni !== (a.p_idlar as string[]).length) return { ok: false, code: 'SON_MOS_EMAS' };
        const idlar = new Set(a.p_idlar as string[]); const oldin = db.length; db = db.filter((q) => !idlar.has(q.k));
        return { ok: true, ochirildi: oldin - db.length };
      }
      if (nom === 't2_arxiv_tikla_v1') { const q = a.p_qatorlar as Array<{ id: number }>; for (const r of q) if (!db.some((x) => x.k === String(r.id))) db.push({ k: String(r.id), t: eski, r: r as never }); return { ok: true, kiritildi: q.length }; }
      throw new Error('noma\'lum rpc ' + nom);
    },
    r2: {
      async put(k, b) { if (opt.putXato) throw new Error('R2_PUT_500'); r2.set(k, opt.buzilgan ? b.map((x, i) => (i === 20 ? x ^ 1 : x)) : b); },
      async get(k) { return r2.get(k) ?? null; },
      async boshHajm(k) { const b = r2.get(k); return b ? (opt.headNoto ? b.length + 1 : b.length) : null; },
    },
    async kut() { /* pauza yo'q */ },
  };
  return { d, get db() { return db; }, r2, manifest, chaqiruv };
}

describe('arxiv yadrosi', () => {
  it('ndjson+gzip aylanishi aynan qaytaradi', () => {
    const q: Qator[] = [{ k: '1', t: eski, r: { a: 'ñ\n"q"', b: null } }, { k: '2', t: eski, r: { a: 2 } }];
    expect(ndjsonOch(ndjsonGzip(q))).toEqual(q);
  });

  it('tekshiruvdan keyin o\'chiradi, manifest yoziladi, R2 da qoladi', async () => {
    const s = soxta(5);
    const r = await partiyaArxivla(s.d, S, { limit: 100 });
    expect(r.holat).toBe('arxivlandi');
    expect(s.db).toHaveLength(0);
    expect(s.r2.size).toBe(1);
    expect(s.manifest.size).toBe(1);
    const kalit = [...s.r2.keys()][0];
    expect(kalit).toMatch(/^arxiv\/t2_ozgarish\/2026\/01\/.+\.ndjson\.gz$/);
    expect(ndjsonOch(s.r2.get(kalit)!)).toHaveLength(5);
  });

  it('R2 sha256 mos kelmasa bazaga TEGILMAYDI', async () => {
    const s = soxta(4, { buzilgan: true });
    const r = await partiyaArxivla(s.d, S);
    expect(r.holat).toBe('xato');
    expect(s.db).toHaveLength(4);
    expect(s.chaqiruv).not.toContain('t2_arxiv_ochir_v1');
    expect(s.chaqiruv).not.toContain('t2_arxiv_yoz_v1');
  });

  it('HEAD hajmi mos kelmasa va R2 yozish xatosida baza butun', async () => {
    for (const opt of [{ headNoto: true }, { putXato: true }]) {
      const s = soxta(3, opt);
      expect((await partiyaArxivla(s.d, S)).holat).toBe('xato');
      expect(s.db).toHaveLength(3);
      expect(s.chaqiruv).not.toContain('t2_arxiv_ochir_v1');
    }
  });

  it('qisman xato (o\'chirish ishlamadi) qatorlarni saqlaydi; qayta yurish bir xil kalit bilan tugatadi (idempotent)', async () => {
    const s = soxta(6, { ochirXato: true });
    expect((await partiyaArxivla(s.d, S)).holat).toBe('xato');
    expect(s.db).toHaveLength(6);
    const birinchi = [...s.r2.keys()];
    const s2 = soxta(6); s2.r2.set(birinchi[0], s.r2.get(birinchi[0])!);
    const r = await partiyaArxivla(s2.d, S);
    expect(r.holat).toBe('arxivlandi');
    expect(r.holat === 'arxivlandi' && r.kalit).toBe(birinchi[0]);
    expect(s2.r2.size).toBe(1);
    expect(s2.db).toHaveLength(0);
  });

  it('qayta yurishda arxivlanadigan qator qolmagan - bo\'sh, hech narsa yozilmaydi', async () => {
    const s = soxta(3);
    await partiyaArxivla(s.d, S);
    const yoz = s.chaqiruv.length;
    expect((await partiyaArxivla(s.d, S)).holat).toBe('bosh');
    expect(s.r2.size).toBe(1);
    expect(s.chaqiruv.slice(yoz)).toEqual(['t2_arxiv_batch_v1']);
  });

  it('jadvalArxivla: partiyalab, byudjet ichida, qoldi belgisi', async () => {
    const s = soxta(5);
    const n = await jadvalArxivla(s.d, S, { maxPartiya: 2, pauzaMs: 0, limit: 2 });
    expect(n.partiya).toBe(2); expect(n.qator).toBe(4); expect(n.qoldi).toBe(true);
    expect(s.db).toHaveLength(1);
    const n2 = await jadvalArxivla(s.d, S, { maxPartiya: 2, pauzaMs: 0, limit: 2 });
    expect(n2.qator).toBe(1); expect(n2.qoldi).toBe(false);
  });

  it('tiklash: R2 dan qatorlar qaytadi; sha256 mos kelmasa rad', async () => {
    const s = soxta(3);
    const a = await partiyaArxivla(s.d, S);
    expect(a.holat).toBe('arxivlandi');
    const kalit = [...s.r2.keys()][0]; const sha = s.manifest.get(kalit)!.sha;
    expect(await partiyaTikla(s.d, 't2_ozgarish', kalit, 'f'.repeat(64))).toEqual({ ok: false, xato: 'R2_SHA256_MOS_EMAS' });
    expect(s.db).toHaveLength(0);
    expect(await partiyaTikla(s.d, 't2_ozgarish', kalit, sha)).toEqual({ ok: true, kiritildi: 3 });
    expect(s.db).toHaveLength(3);
  });
});
