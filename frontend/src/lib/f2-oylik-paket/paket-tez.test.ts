import { describe, expect, it, vi } from 'vitest';
import { paketTokeniYech, parallelIsh } from './paket-tez';
import { hujjatTokenBilan } from '../token-hujjat';

describe('parallelIsh — 4 parallel, tartib saqlanadi, jarayon sanaladi', () => {
  it('bir vaqtda n tadan ko‘p emas; natija kirish tartibida; har ish tayyor bo‘lganda hisoblagich', async () => {
    let hozir = 0; let eng = 0;
    const tugagan: number[] = [];
    const out = await parallelIsh([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (x) => {
      hozir++; eng = Math.max(eng, hozir);
      await new Promise((r) => setTimeout(r, 12 - x));
      hozir--; return x * 2;
    }, (n) => tugagan.push(n));
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(eng).toBe(4);
    expect(tugagan).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('bo‘sh ro‘yxat — bo‘sh natija', async () => { expect(await parallelIsh([], 4, async (x: number) => x)).toEqual([]); });
});

describe('paketTokeniYech — BITTA yechim, hujjat bo‘yicha dedup kalitlari', () => {
  const baytlar = (s: string) => new TextEncoder().encode(s);
  it('barcha hujjatlar bitta tokenBilan chaqiruvida: fayl_yacheykalar va fayl_xeshlar bir xil uzunlikda; butun paket xeshi (meta.xesh) yuborilmaydi', async () => {
    const tokenBilan = vi.fn(async (_p: unknown, ish: () => Promise<boolean>) => { await ish(); return { ok: true as const, natija: true, sarflandi: 3, bepulTakror: false }; });
    const xesh = vi.fn(async (b: Uint8Array) => `x:${new TextDecoder().decode(b)}`);
    const r = await paketTokeniYech({ kompaniyaId: 5, sabab: 'Пакет', hujjatlar: [
      { bytes: baytlar('a'), hujjat: 'F3', sabab: 's1' }, { bytes: baytlar('b'), hujjat: 'F2_OYLIK_REESTR', sabab: 's2' }, { bytes: baytlar('c'), hujjat: 'AKT_SVERKA', sabab: 's3' },
    ] }, { tokenBilan: tokenBilan as never, mazmunXeshi: xesh as never });
    expect(r.ok).toBe(true);
    expect(tokenBilan).toHaveBeenCalledTimes(1);
    const arg = tokenBilan.mock.calls[0][0] as { kompaniyaId: number; amal: string; meta: Record<string, unknown> };
    expect(arg.amal).toBe('hujjat');
    expect(arg.meta.fayl_xeshlar).toEqual(['x:a', 'x:b', 'x:c']);
    expect((arg.meta.fayl_yacheykalar as number[]).length).toBe(3);
    expect('xesh' in arg.meta).toBe(false);
  });
  it('bo‘sh paket — token chaqirilmaydi', async () => {
    const tokenBilan = vi.fn();
    const r = await paketTokeniYech({ kompaniyaId: 5, sabab: 'x', hujjatlar: [] }, { tokenBilan: tokenBilan as never, mazmunXeshi: vi.fn() as never });
    expect(r.ok).toBe(true); expect(tokenBilan).not.toHaveBeenCalled();
  });
  it('token yetmasa — xato qaytadi (hech narsa yechilmagan)', async () => {
    const tokenBilan = vi.fn(async () => ({ ok: false as const, xabar: 'Token yetmaydi' }));
    const r = await paketTokeniYech({ kompaniyaId: 5, sabab: 'x', hujjatlar: [{ bytes: baytlar('a'), hujjat: 'F3', sabab: 's' }] }, { tokenBilan: tokenBilan as never, mazmunXeshi: (async () => 'h') as never });
    expect(r).toEqual({ ok: false, xabar: 'Token yetmaydi' });
  });
  it('hujjatTokenBilan: xeshlar berilmasa eski yo‘l (butun mazmun xeshi) saqlanadi', async () => {
    const tokenBilan = vi.fn(async () => ({ ok: true as const, natija: true, sarflandi: 1, bepulTakror: false }));
    await hujjatTokenBilan({ kompaniyaId: 1, bytes: baytlar('z'), hujjat: 'F3', sabab: 's' }, () => undefined, { tokenBilan: tokenBilan as never, mazmunXeshi: (async () => 'H') as never });
    expect((tokenBilan.mock.calls[0] as unknown as [{ meta: Record<string, unknown> }])[0].meta.xesh).toBe('H');
  });
});