import { describe, expect, it } from 'vitest';
import { restAloqa } from './muhr-isit';

describe('muhr-isit restAloqa (PostgREST RPC)', () => {
  it('nomzod va isit RPC nomlari, parametrlari va javob xaritasi', async () => {
    const chaqiruv: Array<{ url: string; body: unknown }> = [];
    const f = (async (url: string, init: RequestInit) => {
      chaqiruv.push({ url, body: JSON.parse(String(init.body)) });
      return url.endsWith('t2_qator_muhr_isit_nomzod_v1')
        ? Response.json([{ sovuq_id: 7, r2_key: 'muhr-cold/v1/ab/' + 'a'.repeat(62) + '.json.gz', r2_sha256: 'b'.repeat(64), idlar: [11, 12] }])
        : Response.json(2);
    }) as unknown as typeof fetch;
    const a = restAloqa({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' }, f);
    const n = await a.nomzod(5, 3);
    expect(n).toEqual([{ sovuq_id: '7', r2_key: expect.stringContaining('muhr-cold/v1/'), r2_sha256: 'b'.repeat(64), idlar: ['11', '12'] }]);
    expect(chaqiruv[0].body).toEqual({ p_obyekt_id: 5, p_limit: 3 });
    expect(await a.isit('7', '[]', 'b'.repeat(64), ['11'])).toBe(2);
    expect(chaqiruv[1].body).toEqual({ p_sovuq_id: 7, p_matn: '[]', p_sha256: 'b'.repeat(64), p_idlar: [11] });
    expect(chaqiruv[1].url).toContain('/rest/v1/rpc/t2_qator_muhr_isit_v1');
  });
  it('RPC xatosi — xato tashlaydi (isitish yiqiladi, reader avvalgi natijada qoladi)', async () => {
    const f = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    await expect(restAloqa({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' }, f).nomzod(1, 1)).rejects.toThrow('RPC_');
  });
});
