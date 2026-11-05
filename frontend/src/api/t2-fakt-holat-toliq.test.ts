import { afterEach, expect, it, vi } from 'vitest';
import type { SbSoro } from './supabase';
import { sbQatorHolatOl } from './t2-fakt';

afterEach(() => { vi.unstubAllGlobals(); });

/** Server bir so'rovga ≤ chegara qator beradi (PostgREST max-rows) — katta obyekt holati kesilmasligi kerak. */
it('sbQatorHolatOl — katta obyekt holati server chegarasidan oshsa ham TO‘LIQ o‘qiladi', async () => {
  const rows = Array.from({ length: 12000 }, (_, i) => ({ qator_id: 800000 + i, fakt_hajm: 1, f2_mumkin_hajm: i % 2 }));
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
    const s = JSON.parse(String(init.body)) as SbSoro;
    let r = rows;
    for (const m of (s.filtr ?? '').matchAll(/qator_id=(gte|lte|gt)\.(\d+)/g)) {
      const v = Number(m[2]);
      r = r.filter((x) => (m[1] === 'gte' ? x.qator_id >= v : m[1] === 'lte' ? x.qator_id <= v : x.qator_id > v));
    }
    if (s.tartib === 'qator_id.desc') r = [...r].reverse();
    const bolak = r.slice(0, Math.min(s.limit ?? 200000, 5000));
    const qatorlar = s.ustunlar === 'qator_id' ? bolak.map((x) => ({ qator_id: x.qator_id })) : bolak;
    return new Response(JSON.stringify({ ok: true, toliq: bolak.length >= r.length, jamiServerda: r.length, qatorlar }));
  }));
  const r = await sbQatorHolatOl(151);
  expect(r.ok).toBe(true);
  expect(r.qatorlar).toHaveLength(12000);
  expect(new Set((r.qatorlar ?? []).map((x) => x.qator_id)).size).toBe(12000);
});
