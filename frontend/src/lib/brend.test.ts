import { describe, expect, it } from 'vitest';
import { BREND_HUJJAT_MATN, sahifaSarlavhasi, yuzaAniqla, yuzaBelgisi } from './brend';

describe('brend: «qayerdaman» belgisi', () => {
  it('sayt — oddiy brauzer', () => expect(yuzaAniqla({ location: { origin: 'https://qurai.uz', protocol: 'https:' }, navigator: { userAgent: 'Mozilla/5.0 Chrome' } })).toBe('Sayt'));
  it('Telegram Mini App', () => expect(yuzaAniqla({ Telegram: { WebApp: { initData: 'query_id=1', platform: 'android' } } })).toBe('Telegram'));
  it('Tauri: Windows va Android', () => {
    expect(yuzaAniqla({ __TAURI__: {}, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' } })).toBe('Windows');
    expect(yuzaAniqla({ __TAURI_INTERNALS__: {}, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' } })).toBe('Android');
  });
  it('belgi va sarlavha', () => {
    expect(yuzaBelgisi('Sayt')).toBe('QURAI · Sayt');
    expect(yuzaBelgisi('Windows', 'Pro')).toBe('QURAI · Windows · Pro');
    expect(sahifaSarlavhasi('F2 import')).toBe('F2 import — QURAI');
    expect(sahifaSarlavhasi('')).toBe('QURAI');
    expect(BREND_HUJJAT_MATN).toBe('QURAI · qurai.uz orqali tayyorlandi');
  });
});