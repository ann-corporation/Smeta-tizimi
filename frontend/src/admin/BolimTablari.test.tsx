import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const m = vi.hoisted(() => ({ ws: { companyId: 7 as number | null, scope: { objectId: 42 as number | null }, scopeSearch: (o: number | null) => (o ? `?obyekt=${o}` : '') } }));
vi.mock('../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => m.ws }));
import BolimTablari from './BolimTablari';
import { BolimTablariKontekst, joriyTabGuruhi, tabXotiraKaliti } from './bolimTablariKontekst';

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

afterEach(() => { cleanup(); sessionStorage.clear(); m.ws.scope.objectId = 42; });

describe('BolimTablari (F2 tab-qobig‘i)', () => {
  it('eski URL o‘z sahifasini ochadi va tablar tepada turadi', () => {
    chiz('/admin/f2');
    expect(screen.getByText('import-sahifa')).toBeTruthy();
    const tablar = screen.getAllByRole('link');
    expect(tablar.map(a => a.getAttribute('href'))).toEqual(['/admin/f2-tayyorlash?obyekt=42', '/admin/f2', '/admin/f2-reestr?obyekt=42']);
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
  /* JQA-07: F2 import `?job=…&akt=…` bilan turganda boshqa tabga o'tib qaytilsa — o'sha job/akt bilan ochiladi. */
  it('tab havolalari: joriy tab o‘z query’sini eslab qoladi, boshqalar scope bilan ochiladi', () => {
    chiz('/admin/f2?obyekt=42&job=15&akt=9');
    expect(screen.getByRole('link', { name: 'F2 reestri' }).getAttribute('href')).toBe('/admin/f2-reestr?obyekt=42');
    expect(sessionStorage.getItem(tabXotiraKaliti(7, 42, '/admin/f2'))).toBe('?obyekt=42&job=15&akt=9');
  });
  it('qaytganda tabning oxirgi URL’i (kompaniya+obyekt bo‘yicha) tiklanadi', () => {
    sessionStorage.setItem(tabXotiraKaliti(7, 42, '/admin/f2'), '?obyekt=42&job=15&akt=9');
    sessionStorage.setItem(tabXotiraKaliti(7, 43, '/admin/f2'), '?obyekt=43&job=99');
    chiz('/admin/f2-reestr?obyekt=42');
    expect(screen.getByRole('link', { name: 'F2 import (tayyor F2 faylidan)' }).getAttribute('href')).toBe('/admin/f2?obyekt=42&job=15&akt=9');
    fireEvent.click(screen.getByRole('link', { name: 'F2 import (tayyor F2 faylidan)' }));
    expect(screen.getByText('import-sahifa')).toBeTruthy();
  });
  it('boshqa obyektning job’i ko‘chmaydi', () => {
    sessionStorage.setItem(tabXotiraKaliti(7, 43, '/admin/f2'), '?obyekt=43&job=99');
    chiz('/admin/f2-reestr?obyekt=42');
    expect(screen.getByRole('link', { name: 'F2 import (tayyor F2 faylidan)' }).getAttribute('href')).toBe('/admin/f2?obyekt=42');
  });
  it('joriyTabGuruhi: /admin/f2 prefiksi /admin/f2-tarix bilan adashmaydi', () => {
    expect(joriyTabGuruhi([[{ yol: '/admin/f2', nom: 'x' }]], '/admin/f2-tarix')).toBeNull();
    expect(joriyTabGuruhi([F2], '/admin/f2')).toBe(F2);
  });
});
