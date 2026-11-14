import { afterEach, describe, expect, it, vi } from 'vitest';
import { swRoyxat, swRoyxatMumkin, tauridami } from './sw-register';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const w = window as unknown as Record<string, unknown>;
afterEach(() => { delete w.__TAURI__; delete w.__TAURI_INTERNALS__; vi.restoreAllMocks(); });

describe('servis-worker ro\u2018yxati (guard)', () => {
  it('Tauri ichida aniqlanadi va ro\u2018yxatdan o\u2018tmaydi', () => {
    expect(tauridami()).toBe(false);
    w.__TAURI__ = {};
    expect(tauridami()).toBe(true);
    expect(swRoyxatMumkin(true)).toBe(false);
  });

  it('production emas — ro\u2018yxatdan o\u2018tmaydi', () => {
    expect(swRoyxatMumkin(false)).toBe(false);
  });

  it('swRoyxat Tauri/dev da register chaqirmaydi', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    w.__TAURI_INTERNALS__ = {};
    swRoyxat();
    window.dispatchEvent(new Event('load'));
    expect(register).not.toHaveBeenCalled();
  });
});

describe('public/sw.js: pul ma\u2019lumoti keshlanmaydi', () => {
  const kod = readFileSync(join(__dirname, '..', '..', '..', 'public', 'sw.js'), 'utf8');
  it('/api/, /functions/ va supabase tarmoqqa o\u2018tadi, faqat qobiq va /assets keshlanadi, kesh versiyali', () => {
    expect(kod).toMatch(/VERSIYA = 'smeta-qobiq-v\d+'/);
    expect(kod).toContain("startsWith('/api/')");
    expect(kod).toContain("startsWith('/functions/')");
    expect(kod).toMatch(/supabase/i);
    expect(kod).toContain("r.method !== 'GET'");
    expect(kod).toContain("startsWith('/assets/')");
  });
});