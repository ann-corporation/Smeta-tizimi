import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const m = vi.hoisted(() => ({ k: { yuklanmoqda: true, superadmin: false, globalRejim: false, joriy: null as null | { rol?: string; permissions?: string[] } } }));
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
function Yol() { const { pathname } = useLocation(); return <p>yol:{pathname}</p>; }

afterEach(() => { cleanup(); localStorage.removeItem('fz-yangi-menyu'); m.k = { yuklanmoqda: true, superadmin: false, globalRejim: false, joriy: null }; });

describe('RolBoshSahifa (/admin indeksi)', () => {
  it('kompaniya yuklanayotganda yo‘naltirmaydi', () => {
    chiz();
    expect(screen.getByText('Yuklanmoqda...')).toBeTruthy();
  });
  it('JORIY kompaniyadagi rol bo‘yicha yo‘naltiradi (sessiya roli emas)', async () => {
    m.k = { yuklanmoqda: false, superadmin: false, globalRejim: false, joriy: { rol: 'pto', permissions: ['company.read', 'smeta.read'] } };
    const { rerender } = chiz();
    rerender(<MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<RolBoshSahifa />} /><Route path="/admin/*" element={<Yol />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/yol:/)).toBeTruthy();
  });
  it('kontekstBoshSahifasi: kompaniya tanlanmagan → Ish joylarim; ruxsat yo‘q → Ish joylarim; boss → dashboard', () => {
    expect(kontekstBoshSahifasi({ superadmin: false, joriy: null })).toBe('/admin/ish-joylarim');
    expect(kontekstBoshSahifasi({ superadmin: true, joriy: null })).toBe('/admin/ish-joylarim');
    expect(kontekstBoshSahifasi({ superadmin: false, joriy: { rol: 'boss', permissions: ['company.read', 'financial.read'] } })).toBe('/admin/dashboard');
    expect(kontekstBoshSahifasi({ superadmin: false, joriy: { rol: 'boss', permissions: ['company.read'] } })).toBe('/admin/ish-joylarim');
    expect(kontekstBoshSahifasi({ superadmin: true, joriy: { rol: 'pto', permissions: [] } })).toBe('/admin/dashboard');
  });
  it('YANGI MENYU (sukut): kompaniya tanlangan har rol /admin/bugun ga boradi (usta ham: bitta «Bugun»)', async () => {
    for (const rol of ['pto', 'boss', 'usta', 'buyurtmachi']) {
      cleanup();
      m.k = { yuklanmoqda: false, superadmin: false, globalRejim: false, joriy: { rol, permissions: ['company.read'] } };
      chiz();
      expect(await screen.findByText('yol:/admin/bugun'), rol).toBeTruthy();
    }
  });
  it('kompaniya tanlanmagan (global rejim): Bugun emas, Ish joylarim', async () => {
    m.k = { yuklanmoqda: false, superadmin: true, globalRejim: true, joriy: null };
    chiz();
    expect(await screen.findByText('yol:/admin/ish-joylarim')).toBeTruthy();
  });
  it('ESKI MENYU (bayroq o‘chiq): eski rol bosh sahifasi saqlanadi', async () => {
    localStorage.setItem('fz-yangi-menyu', '0');
    m.k = { yuklanmoqda: false, superadmin: false, globalRejim: false, joriy: { rol: 'boss', permissions: ['company.read', 'financial.read'] } };
    chiz();
    expect(await screen.findByText('yol:/admin/dashboard')).toBeTruthy();
  });
});
