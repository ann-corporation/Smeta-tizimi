import { afterEach, describe, expect, it, vi } from 'vitest';
import { yozAmali } from './supabase';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('yozAmali — tarmoq bir lahza uzilsa', () => {
  it('operation_id bor amal bir marta qayta yuboriladi va natija qaytadi', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, qator_id: 5 }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const r = await yozAmali({ amal: 'qoshimcha_ish_yarat_v1', operation_id: '00000000-0000-4000-8000-000000000001' });
    expect(r).toMatchObject({ ok: true, qator_id: 5 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][1].body).toBe(f.mock.calls[1][1].body);
  });
  it('operation_id siz amal qayta yuborilmaydi; xabar sababni aytadi', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    const r = await yozAmali({ amal: 'x' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Internet aloqasi uzildi/);
  });
});
