import { describe, expect, it } from 'vitest';
import { parallel, sorovlarniTayyorla } from './smeta-ai';

const nom = (i: number, over: Record<string, unknown> = {}) => ({ id: `n${i}`, kod: `Е06-01-001-${i}`, nom: `Норма ${i}`, birlik: '100 м3', jadval: 'Таблица', toplam: 'Е06', ...over });

describe('smeta-ai "tanla" request: matching pipeline shortlist', () => {
  it('accepts up to 20 candidates per line (the pipeline shortlist), never more', () => {
    const r = sorovlarniTayyorla([{ id: 'w1', tavsif: 'beton tayyorlov', birlik: 'м3', material: null, nomzodlar: Array.from({ length: 30 }, (_, i) => nom(i + 1)) }]);
    expect(r?.[0].nomzodlar).toHaveLength(20);
  });
  it('keeps the pipeline confidence (0..1) and drops an invalid one', () => {
    const r = sorovlarniTayyorla([{ id: 'w1', tavsif: 'x', birlik: 'м3', material: null, nomzodlar: [nom(1, { ishonch: 0.83 }), nom(2, { ishonch: 7 }), nom(3, { ishonch: 'x' }), nom(4)] }]);
    expect(r?.[0].nomzodlar.map(n => (n as { ishonch?: number }).ishonch)).toEqual([0.83, undefined, undefined, undefined]);
  });
  it('a request with no lines or a bad id is refused; 40 lines at most', () => {
    expect(sorovlarniTayyorla([])).toBeNull();
    expect(sorovlarniTayyorla([{ id: 'bad id!', tavsif: '', birlik: 'м3', nomzodlar: [] }])).toBeNull();
    expect(sorovlarniTayyorla(Array.from({ length: 41 }, (_, i) => ({ id: `w${i}`, tavsif: '', birlik: 'м3', nomzodlar: [] })))).toBeNull();
  });
});

describe('parallel() used for the model calls', () => {
  it('runs at most n in flight and keeps the order', async () => {
    let inflight = 0, peak = 0;
    const out = await parallel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 8, async x => { inflight++; peak = Math.max(peak, inflight); await new Promise(r => setTimeout(r, 5)); inflight--; return x * 2; });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });
});
