import { createHash } from 'node:crypto';
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Mijoz } from '../src/db';
import { cloudflareR2Oqish, snapshotSovuqTikla } from '../src/snapshot-r2';
import { snapshotChaqir } from '../src/snapshot';

const MATN = JSON.stringify([{ id: 1, nom: 'A' }]);
const SHA = createHash('sha256').update(MATN).digest('hex');
const KALIT = `snapshot-cold/v1/${SHA.slice(0, 2)}/${SHA}.json.gz`;

function mijoz(o: { funksiyaBor?: boolean; bloklar?: Array<{ xesh: string; r2_key: string; r2_sha256: string }>; tikla?: (p: unknown[]) => boolean }) {
  const sorovlar: Array<{ sql: string; params: unknown[] }> = [];
  const m = {
    async query(sql: string, params: unknown[] = []) {
      sorovlar.push({ sql, params });
      if (sql.includes("p.proname = 'sovuq_bolaklar'")) return { rows: [{ bor: o.funksiyaBor !== false }], rowCount: 1 };
      if (sql.includes("n.nspname = 'snapshot' and p.proname = $1")) return { rows: [{ bor: true }], rowCount: 1 };
      if (sql.includes('snapshot.sovuq_bolaklar')) return { rows: o.bloklar ?? [], rowCount: (o.bloklar ?? []).length };
      if (sql.includes('snapshot.sovuq_tikla')) return { rows: [{ ok: o.tikla ? o.tikla(params) : true }], rowCount: 1 };
      return { rows: [{ ok: 1 }], rowCount: 1 };
    },
    release() {},
  } as unknown as Mijoz;
  return { m, sorovlar };
}
const r2 = (xotira: Record<string, Uint8Array>) => ({ get: async (k: string) => xotira[k] ?? null });
const blok = [{ xesh: 'x1', r2_key: KALIT, r2_sha256: SHA }];

describe('snapshotSovuqTikla — R2 zaxira o\'qish yo\'li', () => {
  it('sovuq blok yo\'q — R2 ga umuman murojaat qilinmaydi', async () => {
    const { m } = mijoz({ bloklar: [] });
    expect(await snapshotSovuqTikla(m, 5, { get: async () => { throw new Error('tegilmasin'); } })).toBe(0);
  });
  it('migratsiya qo\'llanmagan (funksiya yo\'q) — 0, xatosiz', async () => {
    const { m, sorovlar } = mijoz({ funksiyaBor: false });
    expect(await snapshotSovuqTikla(m, 5)).toBe(0);
    expect(sorovlar).toHaveLength(1);
  });
  it('R2 dan olib, sha256 tekshirib, sovuq_tikla ga asl matn bilan yozadi', async () => {
    const { m, sorovlar } = mijoz({ bloklar: blok });
    expect(await snapshotSovuqTikla(m, 5, r2({ [KALIT]: gzipSync(new TextEncoder().encode(MATN)) }))).toBe(1);
    const t = sorovlar.find((s) => s.sql.includes('snapshot.sovuq_tikla'))!;
    expect(t.params).toEqual(['x1', MATN, SHA]);
  });
  it('R2 obyekti yo\'q — xato, bazaga yozilmaydi', async () => {
    const { m, sorovlar } = mijoz({ bloklar: blok });
    await expect(snapshotSovuqTikla(m, 5, r2({}))).rejects.toThrow('R2 obyekti topilmadi');
    expect(sorovlar.some((s) => s.sql.includes('snapshot.sovuq_tikla'))).toBe(false);
  });
  it('R2 obyekti buzilgan (boshqa mazmun) — sha256 rad etadi', async () => {
    const { m, sorovlar } = mijoz({ bloklar: blok });
    await expect(snapshotSovuqTikla(m, 5, r2({ [KALIT]: gzipSync(new TextEncoder().encode('[{"id":9}]')) }))).rejects.toThrow('sha256');
    expect(sorovlar.some((s) => s.sql.includes('snapshot.sovuq_tikla'))).toBe(false);
  });
  it('R2 sozlamasi yo\'q — aniq xabar (token chop etilmaydi)', () => {
    expect(() => cloudflareR2Oqish({} as NodeJS.ProcessEnv)).toThrow(/CLOUDFLARE_API_TOKEN/);
  });
  it('snapshotChaqir: farq/qaytar oldidan tiklaydi, royxat tegmaydi', async () => {
    const f = mijoz({ bloklar: blok });
    process.env.CLOUDFLARE_API_TOKEN = 'T'; process.env.CLOUDFLARE_ACCOUNT_ID = 'A';
    const eski = globalThis.fetch;
    globalThis.fetch = (async () => new Response(gzipSync(new TextEncoder().encode(MATN)))) as typeof fetch;
    try {
      await snapshotChaqir(f.m, 'farq', { p_snapshot_id: 7 });
      expect(f.sorovlar.some((s) => s.sql.includes('snapshot.sovuq_tikla'))).toBe(true);
      const g = mijoz({ bloklar: blok });
      await snapshotChaqir(g.m, 'royxat', { p_obyekt_id: 1 });
      expect(g.sorovlar.some((s) => s.sql.includes('sovuq'))).toBe(false);
    } finally { globalThis.fetch = eski; delete process.env.CLOUDFLARE_API_TOKEN; delete process.env.CLOUDFLARE_ACCOUNT_ID; }
  });
});
