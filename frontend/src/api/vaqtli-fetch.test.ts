import { afterEach, describe, expect, it, vi } from 'vitest';
import { vaqtliOqish } from './vaqtli-fetch';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/** Javob bermaydigan server: faqat signal uzilganda rad etadi. */
function osilganFetch() {
  return vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_ok, rad) => {
    init?.signal?.addEventListener('abort', () => rad(new DOMException('aborted', 'AbortError')));
  }));
}

describe('vaqtliOqish', () => {
  it('chegara o‘tsa so‘rov uziladi va aniq o‘zbekcha xato chiqadi', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', osilganFetch());
    const p = vaqtliOqish('/api/sb', { method: 'POST' }, 30_000);
    const tekshir = expect(p).rejects.toThrow('So‘rov 30 soniyada javob bermadi');
    await vi.advanceTimersByTimeAsync(30_000);
    await tekshir;
  });

  it('o‘z vaqtida kelgan javob o‘zgarishsiz qaytadi', async () => {
    const javob = new Response('{"ok":true}');
    const f = vi.fn(async () => javob);
    vi.stubGlobal('fetch', f);
    await expect(vaqtliOqish('/api/sb', { method: 'POST', body: '{}' })).resolves.toBe(javob);
    expect(f).toHaveBeenCalledWith('/api/sb', expect.objectContaining({ method: 'POST', body: '{}', signal: expect.any(AbortSignal) }));
  });

  it('chaqiruvchining signali uzilsa — vaqt xatosi emas, asl AbortError', async () => {
    vi.stubGlobal('fetch', osilganFetch());
    const c = new AbortController();
    const p = vaqtliOqish('/api/sb', { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
