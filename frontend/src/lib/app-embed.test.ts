import { describe, expect, it } from 'vitest';
import { appEmbedBelgila, appEmbedKompaniya, appEmbedMi, embedQuery } from './app-embed';
import { yuzaAniqla } from './brend';

const xotira = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const muhit = (o: { search?: string; ua?: string } = {}) => ({ location: { search: o.search ?? '' }, navigator: { userAgent: o.ua ?? 'Mozilla/5.0 Chrome' }, sessionStorage: xotira(), localStorage: xotira() });

describe('app-embed: query', () => {
  it('app=android, k, tema o\'qiladi; noto\'g\'ri qiymatlar e\'tiborsiz', () => {
    expect(embedQuery('?app=android&k=17&tema=dark')).toEqual({ yuza: 'Android', k: 17, tema: 'firuza' });
    expect(embedQuery('?app=1&tema=light')).toEqual({ yuza: 'Android', k: null, tema: 'ganch' });
    expect(embedQuery('?app=ios&k=abc&tema=x')).toEqual({ yuza: null, k: null, tema: null });
    expect(embedQuery('?k=-5')).toEqual({ yuza: null, k: null, tema: null });
  });
});

describe('app-embed: aniqlash', () => {
  it('oddiy brauzer — embed emas', () => {
    const w = muhit();
    appEmbedBelgila(w);
    expect(appEmbedMi(w)).toBe(false);
    expect(appEmbedKompaniya(w)).toBeNull();
  });
  it('User-Agent da QURAIApp — embed; navigatsiyadan keyin ham (query yo\'q)', () => {
    const w = muhit({ ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 QURAIApp/0.1.5' });
    expect(appEmbedMi(w)).toBe(true);
    expect(yuzaAniqla(w as never)).toBe('Android');
  });
  it('?app=android&k= sessionStorage da eslab qoladi; keyingi sahifada query yo\'q bo\'lsa ham', () => {
    const w = muhit({ search: '?app=android&k=21&tema=light' });
    appEmbedBelgila(w);
    expect(w.localStorage.getItem('fz-mavzu')).toBe('ganch');
    const keyingi = { ...w, location: { search: '' } };
    expect(appEmbedMi(keyingi)).toBe(true);
    expect(appEmbedKompaniya(keyingi)).toBe(21);
  });
  it('embed bo\'lmasa k va tema yozilmaydi', () => {
    const w = muhit({ search: '?k=9&tema=dark' });
    appEmbedBelgila(w);
    expect(w.localStorage.getItem('fz-mavzu')).toBeNull();
    expect(appEmbedKompaniya(w)).toBeNull();
  });
});
