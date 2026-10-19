import { afterEach, describe, expect, it, vi } from 'vitest';
import { openrouterBalans } from './openrouter-balans';

const javob = (status: number, data?: unknown) => new Response(JSON.stringify(data ? { data } : {}), { status });
afterEach(() => vi.unstubAllGlobals());

describe('OpenRouter balansi (superadmin AI markazi)', () => {
  it('bo‘sh yoki faqat probel kalit — tarmoqqa chiqmaydi, kalit_yoq', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect((await openrouterBalans('  ')).holat).toBe('kalit_yoq');
    expect(f).not.toHaveBeenCalled();
  });
  it('401 — kalit rad etildi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javob(401)));
    expect((await openrouterBalans('k')).holat).toBe('rad_etildi');
  });
  it('qoldiq = sotib olingan − sarflangan; kalit limiti alohida; kalit javobga chiqmaydi', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => String(u).endsWith('/credits')
      ? javob(200, { total_credits: 20, total_usage: 15.25 }) : javob(200, { usage: 15.25, limit_remaining: null })));
    const b = await openrouterBalans('sir-kalit');
    expect(b).toEqual({ holat: 'ok', qoldiq_usd: 4.75, sarflangan_usd: 15.25, kalit_qoldiq_usd: null });
    expect(JSON.stringify(b)).not.toContain('sir-kalit');
  });
  it('/credits ruxsat bermasa ham /key bilan ishlaydi; tarmoq xatosi — xato', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => String(u).endsWith('/credits') ? javob(403) : javob(200, { usage: 3, limit_remaining: 0 })));
    expect(await openrouterBalans('k')).toMatchObject({ holat: 'ok', qoldiq_usd: null, kalit_qoldiq_usd: 0 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
    expect((await openrouterBalans('k')).holat).toBe('xato');
  });
});
