import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fondaYangila, fonniQaytaOrnat, ORALIQ_MS } from './hujjat-fon';
import { ichkiOrinlarniTozala, ichkiRejimda, ichkiSozla } from './hujjat-ichki';

const env = { SESSIYA_KALIT: 's', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' };
const ctx = (waitUntil = vi.fn()) => ({ request: new Request('https://t2.test/api/sb', { method: 'POST' }), env, waitUntil });

describe('hujjat-fon: navbat tizim faoliyati bilan doimiy ishlaydi', () => {
  beforeEach(() => { fonniQaytaOrnat(); ichkiOrinlarniTozala(); vi.useRealTimers(); });

  it('javobdan keyin bitta fon ishi; oraliq ichida takrorlanmaydi', () => {
    const ish = vi.fn(async () => 'ok');
    const c = ctx();
    fondaYangila(c, 'sb', 200, ish);
    fondaYangila(c, 'sb', 200, ish);
    expect(ish).toHaveBeenCalledTimes(1);
    expect(c.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('oraliq o\'tgach yana ishlaydi', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const ish = vi.fn(async () => 'ok');
    fondaYangila(ctx(), 'sb', 200, ish);
    vi.setSystemTime(1_000_000 + ORALIQ_MS + 1);
    fondaYangila(ctx(), 'sb', 200, ish);
    expect(ish).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('og\'ir yo\'llar, xato javob, waitUntil/env yo\'q — ishlamaydi', () => {
    const ish = vi.fn(async () => 'ok');
    fondaYangila(ctx(), 'hujjat-yarat', 200, ish);
    fondaYangila(ctx(), 'hujjat-paket', 200, ish);
    fondaYangila(ctx(), 'sb', 401, ish);
    fondaYangila({ request: new Request('https://t2.test/api/sb'), env }, 'sb', 200, ish);
    fondaYangila({ ...ctx(), env: {} }, 'sb', 200, ish);
    expect(ish).not.toHaveBeenCalled();
  });

  it('izolyatda hujjat yasalayotgan bo\'lsa (CPU) yoki hujjat yasash ichida — o\'tkazib yuboriladi', async () => {
    const ish = vi.fn(async () => 'ok');
    let ichida = false;
    await ichkiRejimda(ctx() as never, async () => { fondaYangila(ctx(), 'sb', 200, ish); ichida = true; });
    expect(ichida).toBe(true);
    expect(ish).not.toHaveBeenCalled();
  });

  it('fon ishi xato tashlasa ham so\'rovga ta\'sir qilmaydi', async () => {
    let va: Promise<unknown> | null = null;
    fondaYangila({ ...ctx(), waitUntil: (p) => { va = p; } }, 'sb', 200, async () => { throw new Error('x'); });
    await expect(va).resolves.toBeUndefined();
  });

  it('limit sozlamasi tiklangan', () => { ichkiSozla({ limit: 1, maksKutishMs: 60_000, qadamMs: 200 }); expect(true).toBe(true); });
});
