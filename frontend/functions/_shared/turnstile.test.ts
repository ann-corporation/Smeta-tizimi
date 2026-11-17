import { afterEach, describe, expect, it, vi } from 'vitest';
import { turnstileTekshir, turnstileYoqilgan } from './turnstile';

afterEach(() => vi.unstubAllGlobals());
describe('Turnstile (sozlama bilan)', () => {
  it('sir yo\'q -> tekshiruv o\'tkazib yuboriladi (hozirgi xulq)', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(turnstileYoqilgan({})).toBe(false);
    expect(await turnstileTekshir({}, undefined)).toEqual({ ok: true });
    expect(f).not.toHaveBeenCalled();
  });
  it('sir bor, token yo\'q -> TURNSTILE_KERAK', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await turnstileTekshir({ TURNSTILE_SECRET: 's' }, '')).toEqual({ ok: false, code: 'TURNSTILE_KERAK' });
  });
  it('siteverify muvaffaqiyat/rad/xizmat xatosi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true })));
    expect(await turnstileTekshir({ TURNSTILE_SECRET: 's' }, 'tok', '1.2.3.4')).toEqual({ ok: true });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false })));
    expect(await turnstileTekshir({ TURNSTILE_SECRET: 's' }, 'tok')).toEqual({ ok: false, code: 'TURNSTILE_RAD' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
    expect(await turnstileTekshir({ TURNSTILE_SECRET: 's' }, 'tok')).toEqual({ ok: false, code: 'TURNSTILE_XIZMAT' });
  });
});