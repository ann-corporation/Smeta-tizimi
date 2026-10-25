import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BolimTablari from './BolimTablari';
import { BolimTablariKontekst, joriyTabGuruhi } from './bolimTablariKontekst';

const F2 = [
  { yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash' },
  { yol: '/admin/f2', nom: 'F2 import (tayyor F2 faylidan)' },
  { yol: '/admin/f2-reestr', nom: 'F2 reestri' },
];

const chiz = (yol: string, guruhlar = [F2]) => render(
  <BolimTablariKontekst.Provider value={guruhlar}>
    <MemoryRouter initialEntries={[yol]}>
      <Routes>
        <Route path="/admin" element={<BolimTablari />}>
          <Route path="f2-tayyorlash" element={<p>tayyorlash-sahifa</p>} />
          <Route path="f2" element={<p>import-sahifa</p>} />
          <Route path="f2-reestr" element={<p>reestr-sahifa</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  </BolimTablariKontekst.Provider>,
);

afterEach(cleanup);

describe('BolimTablari (F2 tab-qobig‘i)', () => {
  it('eski URL o‘z sahifasini ochadi va tablar tepada turadi', () => {
    chiz('/admin/f2');
    expect(screen.getByText('import-sahifa')).toBeTruthy();
    const tablar = screen.getAllByRole('link');
    expect(tablar.map(a => a.getAttribute('href'))).toEqual(['/admin/f2-tayyorlash', '/admin/f2', '/admin/f2-reestr']);
    expect(screen.getByRole('link', { name: 'F2 import (tayyor F2 faylidan)' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'F2 tayyorlash' }).getAttribute('aria-current')).toBeNull();
  });
  it('tab bosilganda shu sahifaning o‘zi ochiladi (qayta yozilmagan)', () => {
    chiz('/admin/f2-tayyorlash');
    fireEvent.click(screen.getByRole('link', { name: 'F2 reestri' }));
    expect(screen.getByText('reestr-sahifa')).toBeTruthy();
  });
  it('ruxsat bo‘yicha bitta tab qolsa — tab qatori chizilmaydi', () => {
    chiz('/admin/f2-reestr', [[F2[2]]]);
    expect(screen.getByText('reestr-sahifa')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('joriyTabGuruhi: /admin/f2 prefiksi /admin/f2-tarix bilan adashmaydi', () => {
    expect(joriyTabGuruhi([[{ yol: '/admin/f2', nom: 'x' }]], '/admin/f2-tarix')).toBeNull();
    expect(joriyTabGuruhi([F2], '/admin/f2')).toBe(F2);
  });
});
