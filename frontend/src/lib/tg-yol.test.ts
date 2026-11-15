import { describe, expect, it } from 'vitest';
import { tgChuqurHavola, tgIchkiYol } from './tg-yol';

describe('Telegram Mini App chuqur havolasi', () => {
  it('faqat ichki /admin yo‘li qabul qilinadi', () => {
    expect(tgIchkiYol('/admin')).toBe('/admin');
    expect(tgIchkiYol('/admin/hujjat-aylanish?zanjir=5')).toBe('/admin/hujjat-aylanish?zanjir=5');
    expect(tgIchkiYol('/admin/f2-reestr')).toBe('/admin/f2-reestr');
  });
  it('tashqi domen, protokol-nisbiy, javascript:, .. va uzun yo‘l rad', () => {
    for (const y of ['https://yomon.example', '//yomon.example', 'javascript:alert(1)', '/admin/../etc', '/admin//x', '/boshqa', '/admin/<x>', '/admin?x=<', 'admin', '', null, undefined, 5, '/admin/' + 'a'.repeat(400)])
      expect(tgIchkiYol(y)).toBeNull();
  });
  it('havola qurish: yaroqsiz yo‘l — oddiy kirish URL', () => {
    expect(tgChuqurHavola('https://x.pages.dev/tg', '/admin/fakt')).toBe('https://x.pages.dev/tg?to=%2Fadmin%2Ffakt');
    expect(tgChuqurHavola('https://x.pages.dev/tg', 'https://yomon.example')).toBe('https://x.pages.dev/tg');
    expect(tgChuqurHavola('https://x.pages.dev/tg', null)).toBe('https://x.pages.dev/tg');
  });
});