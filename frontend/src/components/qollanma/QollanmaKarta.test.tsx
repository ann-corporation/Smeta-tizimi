import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QollanmaBoshqaruv } from './QollanmaKarta';
import { _qollanmaXotirasiniTozala } from '../../lib/qollanma/korilgan';

const ochish = (yol: string, foydalanuvchi: string | null = 'pto@misol.uz') => render(
  <MemoryRouter initialEntries={[yol]}><QollanmaBoshqaruv foydalanuvchi={foydalanuvchi} /></MemoryRouter>,
);
const karta = () => screen.queryByTestId('qollanma-karta');

beforeEach(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* */ } _qollanmaXotirasiniTozala(); });
afterEach(cleanup);

describe('QollanmaBoshqaruv — birinchi tashrifda bir marta', () => {
  it('birinchi tashrifda karta o‘zi chiqadi; «Tushunarli» dan keyin qayta chiqmaydi, «?» bilan ochiladi', () => {
    ochish('/admin/fakt?obyekt=7');
    expect(karta()?.getAttribute('data-kalit')).toBe('fakt');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('qollanma-keyingi').getAttribute('href')).toBe('/admin/f2-tayyorlash?obyekt=7');
    fireEvent.click(screen.getByText('Tushunarli'));
    expect(karta()).toBeNull();
    cleanup();

    ochish('/admin/fakt');
    expect(karta()).toBeNull();
    fireEvent.click(screen.getByTestId('qollanma-tugma'));
    expect(karta()?.getAttribute('data-kalit')).toBe('fakt');
    expect(screen.queryByText('Ko‘rsatmang')).toBeNull();   // qo'lda ochilganda — faqat yopish
  });

  it('«ko‘rildi» har foydalanuvchiga alohida', () => {
    ochish('/admin/fakt');
    fireEvent.click(screen.getByText('Tushunarli'));
    cleanup();
    ochish('/admin/fakt', 'boshqa@misol.uz');
    expect(karta()).not.toBeNull();
  });

  it('Esc va «Keyinroq» — yopadi, lekin ko‘rildi deb belgilamaydi (keyingi ochilishda yana chiqadi)', () => {
    ochish('/admin/f2-tarix');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(karta()).toBeNull();
    cleanup();
    ochish('/admin/f2-tarix');                                // sessiya davomida (qayta yuklash ham) yana chiqmaydi
    expect(karta()).toBeNull();
    cleanup();
    sessionStorage.clear(); _qollanmaXotirasiniTozala();      // yangi sessiya
    ochish('/admin/f2-tarix');
    expect(karta()).not.toBeNull();
    fireEvent.click(screen.getByText('Keyinroq'));
    expect(karta()).toBeNull();
    cleanup();
    ochish('/admin/f2-tarix');
    expect(karta()).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('fz-qollanma-keyinroq') ?? '[]')).toHaveLength(1);
  });

  it('telefonda avtomatik karta modal emas, yopiladigan chip; chip bosilsa karta ochiladi, yopilsa sessiyada qaytmaydi', () => {
    const asl = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      ochish('/admin/fakt');
      expect(screen.getByTestId('qollanma-chip')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(screen.getByTestId('qollanma-chip-yop'));
      expect(screen.queryByTestId('qollanma-chip')).toBeNull();
      cleanup();
      ochish('/admin/fakt');
      expect(screen.queryByTestId('qollanma-chip')).toBeNull();
      expect(karta()).toBeNull();
    } finally { window.matchMedia = asl; }
  });

  it('«Ko‘rsatmang» — avtomatik kartalar butunlay o‘chadi, «?» qoladi', () => {
    ochish('/admin/nakopitelniy');
    fireEvent.click(screen.getByText('Ko‘rsatmang'));
    expect(karta()).toBeNull();
    cleanup();
    ochish('/admin/hujjat-dizayn');
    expect(karta()).toBeNull();
    expect(screen.getByTestId('qollanma-tugma')).toBeTruthy();
  });

  it('kartasi yo‘q sahifada hech narsa yo‘q; sessiya noma’lum bo‘lsa avtomatik chiqmaydi', () => {
    ochish('/admin/ombor');
    expect(screen.queryByTestId('qollanma-tugma')).toBeNull();
    expect(karta()).toBeNull();
    cleanup();
    ochish('/admin/fakt', null);
    expect(karta()).toBeNull();
    expect(screen.getByTestId('qollanma-tugma')).toBeTruthy();
  });

  it('?qollanma= bilan kelinsa — o‘sha kartani tushuntiradi', () => {
    ochish('/admin/holat/3?panel=smeta&qollanma=podval');
    expect(karta()?.getAttribute('data-kalit')).toBe('podval');
  });
});
