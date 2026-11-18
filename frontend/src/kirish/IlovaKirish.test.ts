import { describe, expect, it } from 'vitest';
import { ilovaWebViewmi, sirYarat } from './IlovaKirish';

describe('ilova kirishi yordamchilari', () => {
  it('faqat Android WebView ("; wv)") ilova hisoblanadi', () => {
    expect(ilovaWebViewmi('Mozilla/5.0 (Linux; Android 14; sdk_gphone64; wv) AppleWebKit/537.36 Version/4.0 Chrome/113 Mobile Safari/537.36')).toBe(true);
    expect(ilovaWebViewmi('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe(false);
    expect(ilovaWebViewmi('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe(false);
  });
  it('sir va h: base64url, h = 43 belgi', async () => {
    const { sir, h } = await sirYarat();
    expect(sir).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h).not.toBe(sir);
  });
});
