import { afterEach, describe, expect, it, vi } from 'vitest';
import { t2NakopitelniyToliq } from './t2-nakopitelniy';

// Q4 (egasi, 2026-09-25): katta obyekt (27 000+ qator) ham to'liq, avtomat.
function sahifa(offset: number, n: number, jami: number, keyingi: number | null) {
  return {
    ok: true, generated_at: '', obyekt: { id: 84, nom: 'X', kompaniya_id: 1, loyiha_id: null }, davr: '2026-09',
    joriy_revision_id: null, qatorlar: Array.from({ length: n }, (_, i) => ({ qator_id: offset + i + 1 })),
    qatorlar_jami: jami, qatorlar_korsatildi: n, offset, limit: 5000, keyingi_offset: keyingi, truncated: keyingi != null,
    jami: offset === 0 ? { smeta_summa: 1 } : null, davrlar: [],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('t2NakopitelniyToliq — server sahifalari avtomat', () => {
  it('keyingi_offset null bo‘lguncha o‘qiydi, qatorlar to‘liq va tartibda', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(u);
      const off = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
      const javob = off === 0 ? sahifa(0, 5000, 12_001, 5000) : off === 5000 ? sahifa(5000, 5000, 12_001, 10_000) : sahifa(10_000, 2001, 12_001, null);
      return { json: async () => javob } as Response;
    }));
    const r = await t2NakopitelniyToliq(84, '2026-09');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qatorlar).toHaveLength(12_001);
    expect(r.qatorlar[12_000].qator_id).toBe(12_001);
    expect(r.truncated).toBe(false);
    expect(r.jami).toEqual({ smeta_summa: 1 });
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => new URL(u, 'http://x').searchParams.get('davr') === '2026-09-01' && u.includes('limit=5000'))).toBe(true);
  });

  it('sahifalar orasida qator soni o‘zgarsa — xato, chala ro‘yxat qaytmaydi', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const off = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
      return { json: async () => (off === 0 ? sahifa(0, 5000, 6000, 5000) : sahifa(5000, 1001, 6001, null)) } as Response;
    }));
    const r = await t2NakopitelniyToliq(84, null);
    expect(r).toEqual({ ok: false, code: 'NAKOPITELNIY_OZGARDI' });
  });

  it('25k qator: qolgan sahifalar parallel (bir vaqtda ≤4) so‘raladi, natija offset tartibida', async () => {
    let ochiq = 0, maks = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const off = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
      ochiq++; maks = Math.max(maks, ochiq);
      // Keyingi sahifalar teskari tartibda tugaydi — natija baribir offset tartibida bo'lishi kerak.
      await new Promise((r) => setTimeout(r, off ? 30 - off / 1000 : 0));
      ochiq--;
      const n = Math.min(5000, 25_201 - off);
      return { json: async () => sahifa(off, n, 25_201, off + n < 25_201 ? off + n : null) } as Response;
    }));
    const r = await t2NakopitelniyToliq(84, '2026-09');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qatorlar).toHaveLength(25_201);
    expect(r.qatorlar.every((q, i) => q.qator_id === i + 1)).toBe(true);
    expect(maks).toBeGreaterThan(1);
    expect(maks).toBeLessThanOrEqual(4);
  });

  it('parallel sahifalardan biri xato bersa (502/tarmoq) — ketma-ket yo‘lga qaytadi va to‘liq o‘qiydi (regressiya)', async () => {
    let parallelXato = true;
    const urls: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const off = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
      urls.push(off);
      if (off === 10_000 && parallelXato) { parallelXato = false; throw new TypeError('Failed to fetch'); }
      const n = Math.min(5000, 25_201 - off);
      return { json: async () => sahifa(off, n, 25_201, off + n < 25_201 ? off + n : null) } as Response;
    }));
    const r = await t2NakopitelniyToliq(84, '2026-09');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qatorlar).toHaveLength(25_201);
    expect(r.qatorlar.every((q, i) => q.qator_id === i + 1)).toBe(true);
    expect(urls.filter((o) => o === 10_000)).toHaveLength(2); // parallel urinish + ketma-ket qayta o'qish
  });

  it('eski server (keyingi_offset yo‘q) qirqqan bo‘lsa — truncated qoladi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const j: Record<string, unknown> = sahifa(0, 3000, 27_309, 3000);
      delete j.keyingi_offset;
      return { json: async () => j } as Response;
    }));
    const r = await t2NakopitelniyToliq(84, null);
    expect(r.ok && r.truncated).toBe(true);
  });
});
