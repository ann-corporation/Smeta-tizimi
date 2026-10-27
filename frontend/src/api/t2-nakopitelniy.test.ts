import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nakopitelniyQaytaKutish, t2NakopitelniyToliq, type NakopitelniyProgress } from './t2-nakopitelniy';
import { ogirYuklashFaol, ogirYuklashKut } from './ogir-sorov-navbat';

// Q4 (egasi, 2026-09-25): katta obyekt (27 000+ qator) ham to'liq, avtomat.
function sahifa(offset: number, n: number, jami: number, keyingi: number | null) {
  return {
    ok: true, generated_at: '', obyekt: { id: 84, nom: 'X', kompaniya_id: 1, loyiha_id: null }, davr: '2026-09',
    joriy_revision_id: null, qatorlar: Array.from({ length: n }, (_, i) => ({ qator_id: offset + i + 1 })),
    qatorlar_jami: jami, qatorlar_korsatildi: n, offset, limit: 5000, keyingi_offset: keyingi, truncated: keyingi != null,
    jami: offset === 0 ? { smeta_summa: 1 } : null, davrlar: [],
  };
}

beforeEach(() => { nakopitelniyQaytaKutish.ms = 0; });
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

  it('25k qator: qolgan sahifalar parallel (bir vaqtda ≤2 — prod 2026-10-27 DB to‘yinishi) so‘raladi, natija offset tartibida', async () => {
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
    expect(maks).toBeLessThanOrEqual(2);
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
    expect(urls.filter((o) => o === 10_000)).toHaveLength(2); // birinchi urinish + qayta urinish (zaxira yo'lga o'tmasdan)
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

describe('t2NakopitelniyToliq — qayta urinish, progress, og‘ir so‘rov navbati (prod 2026-10-27)', () => {
  const javobBer = (j: unknown, status = 200) => ({ status, json: async () => j } as Response);
  const xato500 = () => javobBer({ ok: false, code: 'NAKOPITELNIY_FAILED' }, 502);

  it('5xx (statement timeout) — eksponensial kutish bilan qayta uriniladi, natija to‘liq va o‘zgarmaydi', async () => {
    const urin = new Map<number, number>();
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const off = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
      const k = (urin.get(off) ?? 0) + 1; urin.set(off, k);
      if (k <= 2 && off === 5000) return xato500(); // 2 marta timeout, 3-urinishda o'tadi
      const n = Math.min(5000, 12_001 - off);
      return javobBer(sahifa(off, n, 12_001, off + n < 12_001 ? off + n : null));
    }));
    const r = await t2NakopitelniyToliq(84, '2026-09');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qatorlar.map((q) => q.qator_id)).toEqual(Array.from({ length: 12_001 }, (_, i) => i + 1));
    expect(urin.get(5000)).toBe(3);
    expect(urin.get(0)).toBe(1);
  });

  it('3 martadan keyin ham 5xx — xato qaytadi (jim chala ro‘yxat yo‘q)', async () => {
    let soni = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { soni++; return xato500(); }));
    const r = await t2NakopitelniyToliq(84, null);
    expect(r).toEqual({ ok: false, code: 'NAKOPITELNIY_FAILED' });
    expect(soni).toBe(3); // 1 + 2 qayta urinish
  });

  it('403 (ruxsat) — qayta urinilmaydi', async () => {
    let soni = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { soni++; return javobBer({ ok: false, code: 'PERMISSION_DENIED' }, 403); }));
    const r = await t2NakopitelniyToliq(84, null);
    expect(r.ok).toBe(false);
    expect(soni).toBe(1);
  });

  it('tarmoq uzilishi (fetch throw) — qayta uriniladi', async () => {
    let birinchi = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (birinchi) { birinchi = false; throw new TypeError('Failed to fetch'); }
      return javobBer(sahifa(0, 10, 10, null));
    }));
    const r = await t2NakopitelniyToliq(84, null);
    expect(r.ok && r.qatorlar.length).toBe(10);
  });

  it('progress: 0 → har sahifa → jami; oxiri jami ga teng, kamaymaydi', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const off = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
      const n = Math.min(5000, 25_201 - off);
      return javobBer(sahifa(off, n, 25_201, off + n < 25_201 ? off + n : null));
    }));
    const p: NakopitelniyProgress[] = [];
    const r = await t2NakopitelniyToliq(84, '2026-09', false, { onProgress: (x) => p.push(x) });
    expect(r.ok).toBe(true);
    expect(p[0]).toMatchObject({ yuklandi: 0, jami: null });
    expect(p.at(-1)).toMatchObject({ yuklandi: 25_201, jami: 25_201, sahifalar: 6 });
    for (let i = 1; i < p.length; i++) expect(p[i].yuklandi).toBeGreaterThanOrEqual(p[i - 1].yuklandi);
  });

  it('yuklash davomida og‘ir so‘rovlar (pul tahlili, akt reestri) kutadi, tugagach o‘tadi', async () => {
    let ozod: () => void = () => undefined;
    const tosiq = new Promise<void>((r) => { ozod = r; });
    vi.stubGlobal('fetch', vi.fn(async () => { await tosiq; return javobBer(sahifa(0, 10, 10, null)); }));
    const yuklash = t2NakopitelniyToliq(84, null);
    expect(ogirYuklashFaol()).toBe(1);
    let otdi = false;
    const kutish = ogirYuklashKut().then(() => { otdi = true; });
    await new Promise((r) => setTimeout(r, 5));
    expect(otdi).toBe(false);
    ozod();
    await yuklash;
    await kutish;
    expect(otdi).toBe(true);
    expect(ogirYuklashFaol()).toBe(0);
  });

  it('xato bilan tugasa ham navbat bo‘shaydi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javobBer({ ok: false, code: 'PERMISSION_DENIED' }, 403)));
    await t2NakopitelniyToliq(84, null);
    expect(ogirYuklashFaol()).toBe(0);
    await expect(ogirYuklashKut()).resolves.toBeUndefined();
  });
});