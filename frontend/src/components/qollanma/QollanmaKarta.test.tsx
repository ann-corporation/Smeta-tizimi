import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QollanmaBoshqaruv } from './QollanmaKarta';
import { _qollanmaXotirasiniTozala } from '../../lib/qollanma/korilgan';

const ochish = (yol: string, foydalanuvchi: string | null = 'pto@misol.uz') => render(
  <MemoryRouter initialEntries={[yol]}><QollanmaBoshqaruv foydalanuvchi={foydalanuvchi} /></MemoryRouter>,
);
const karta = () => screen.queryByTestId('qollanma-karta');

beforeEach(() => { try { localStorage.clear(); } catch { /* */ } _qollanmaXotirasiniTozala(); });
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
    _qollanmaXotirasiniTozala();                              // sahifa qayta yuklandi
    ochish('/admin/f2-tarix');
    expect(karta()).not.toBeNull();
    fireEvent.click(screen.getByText('Keyinroq'));
    expect(karta()).toBeNull();
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
