import { describe, expect, it } from 'vitest';
import { initDataOl, tgXato } from './t2-telegram';

describe('Mini App initData mijozda olinadi (tekshiruv — faqat serverda)', () => {
  it('Telegram skripti bo‘lsa — undan', () => {
    expect(initDataOl({ location: { hash: '' }, Telegram: { WebApp: { initData: 'a=1&hash=x' } } })).toBe('a=1&hash=x');
  });
  it('skriptsiz — URL fragmentidagi tgWebAppData dan (dekodlangan holda)', () => {
    const data = 'query_id=Q&user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc';
    expect(initDataOl({ location: { hash: '#tgWebAppData=' + encodeURIComponent(data) + '&tgWebAppVersion=8.0' } })).toBe(data);
  });
  it('Telegram tashqarisida — bo‘sh', () => {
    expect(initDataOl({ location: { hash: '' } })).toBe('');
    expect(initDataOl({ location: { hash: '#foo=bar' } })).toBe('');
  });
  it('xato kodlari foydalanuvchi matniga aylanadi', () => {
    expect(tgXato({ ok: false, code: 'ULANMAGAN' })).toBe('Telegram hali hisobingizga ulanmagan.');
    expect(tgXato({ ok: false, xabar: 'X' })).toBe('X');
    expect(tgXato({ ok: false })).toBe('Amal bajarilmadi.');
  });
});
