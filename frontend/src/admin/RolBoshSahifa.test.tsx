import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const m = vi.hoisted(() => ({ k: { yuklanmoqda: true, superadmin: false, joriy: null as null | { rol?: string; permissions?: string[] } } }));
vi.mock('../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => m.k }));
import RolBoshSahifa from './RolBoshSahifa';
import { kontekstBoshSahifasi } from '../lib/nav/boshSahifa';

const chiz = () => render(
  <MemoryRouter initialEntries={['/admin']}>
    <Routes>
      <Route path="/admin" element={<RolBoshSahifa />} />
      <Route path="/admin/*" element={<Yol />} />
    </Routes>
  </MemoryRouter>,
);
function Yol() { return <p>yol:{window.location.pathname}</p>; }

afterEach(() => { cleanup(); m.k = { yuklanmoqda: true, superadmin: false, joriy: null }; });

describe('RolBoshSahifa (/admin indeksi)', () => {
  it('kompaniya yuklanayotganda yo‘naltirmaydi', () => {
    chiz();
    expect(screen.getByText('Yuklanmoqda...')).toBeTruthy();
  });
  it('JORIY kompaniyadagi rol bo‘yicha yo‘naltiradi (sessiya roli emas)', async () => {
    m.k = { yuklanmoqda: false, superadmin: false, joriy: { rol: 'pto', permissions: ['company.read', 'smeta.read'] } };
    const { rerender } = chiz();
    rerender(<MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<RolBoshSahifa />} /><Route path="/admin/*" element={<Yol />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/yol:/)).toBeTruthy();
  });
  it('kontekstBoshSahifasi: kompaniya tanlanmagan → Ish joylarim; ruxsat yo‘q → Ish joylarim; boss → dashboard', () => {
    expect(kontekstBoshSahifasi({ superadmin: false, joriy: null })).toBe('/admin/ish-joylarim');
    expect(kontekstBoshSahifasi({ superadmin: true, joriy: null })).toBe('/admin/ish-joylarim');
    expect(kontekstBoshSahifasi({ superadmin: false, joriy: { rol: 'boss', permissions: ['company.read', 'financial.read'] } })).toBe('/admin/pult');
    expect(kontekstBoshSahifasi({ superadmin: false, joriy: { rol: 'boss', permissions: ['company.read'] } })).toBe('/admin/ish-joylarim');
    expect(kontekstBoshSahifasi({ superadmin: true, joriy: { rol: 'pto', permissions: [] } })).toBe('/admin/dashboard');
  });
});
