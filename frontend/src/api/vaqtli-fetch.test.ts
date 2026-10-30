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
  it('sukut chegarasi 60 s: og‘ir RPC (31–35 s) uzilmaydi, 60 s dan keyin aniq o‘zbekcha xato', async () => {
    vi.useFakeTimers();
    let javobBer: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((ok) => { javobBer = ok; })));
    const ogir = vaqtliOqish('/api/sb', { method: 'POST' });
    await vi.advanceTimersByTimeAsync(35_000);
    const javob = new Response('{"ok":true}');
    javobBer(javob);
    await expect(ogir).resolves.toBe(javob);

    vi.stubGlobal('fetch', osilganFetch());
    const p = vaqtliOqish('/api/sb', { method: 'POST' });
    const tekshir = expect(p).rejects.toThrow('Server 60 soniyada javob bermadi');
    await vi.advanceTimersByTimeAsync(59_999);
    await vi.advanceTimersByTimeAsync(1);
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
