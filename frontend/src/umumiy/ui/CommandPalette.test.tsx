import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async (asl) => ({ ...(await asl<typeof import('react-router-dom')>()), useNavigate: () => m.navigate }));
vi.mock('../kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ globalRejim: false, joriy: { id: 7 } }) }));
vi.mock('../../api/supabase', () => ({ sbT2ObyektlarOlKomp: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 42, nom: 'Amfiteatr' }, { id: 43, nom: 'Maktab 5' }] })) }));
import { CommandPalette } from './CommandPalette';
import { qidiruvMos } from './commandPaletteQidiruv';

const BANDLAR = [
  { yol: '/admin/obyektlar', nom: 'Obyektlar', guruh: 'Ish (PTO)' },
  { yol: '/admin/f2', nom: 'F2 import (tayyor F2 faylidan)', guruh: 'Ish (PTO)' },
  { yol: '/admin/f2-reestr', nom: 'F2 reestri', guruh: 'Ish (PTO)' },
];

const och = (path = '/admin/obyektlar') => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><CommandPalette bandlar={BANDLAR} /></MemoryRouter></QueryClientProvider>);
  act(() => { window.dispatchEvent(new Event('palitra:och')); });
};

afterEach(() => { cleanup(); m.navigate.mockReset(); });

describe('CommandPalette (Ctrl+K)', () => {
  it('bo‘sh so‘rovda sidebar bandlarini ko‘rsatadi — qattiq havola/redirect yo‘q', () => {
    och();
    const opts = screen.getAllByRole('option').map(o => o.textContent);
    expect(opts).toHaveLength(3);
    expect(screen.queryByText('Kalkulyator')).toBeNull();
    expect(screen.queryByText('Rahbar paneli')).toBeNull();
  });
  it('so‘z bo‘yicha qidiradi va Enter haqiqiy yo‘lga olib boradi', () => {
    och();
    const inp = screen.getByRole('textbox');
    fireEvent.change(inp, { target: { value: 'reestr f2' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(inp, { key: 'Enter' });
    expect(m.navigate).toHaveBeenCalledWith('/admin/f2-reestr');
  });
  it('obyektni topib, o‘sha obyekt sahifasini ochadi', async () => {
    och();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'amfi' } });
    fireEvent.click(await screen.findByText('Amfiteatr'));
    expect(m.navigate).toHaveBeenCalledWith('/admin/holat/42');
  });
  it('Ctrl+K qidiruv panelini OCHMAYDI (Ctrl+K — yagona yordamchi Jarvis; ikki oyna chiqmaydi)', async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/admin/obyektlar']}><CommandPalette bandlar={BANDLAR} /></MemoryRouter></QueryClientProvider>);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('qidiruv apostrof va registrga sezgir emas', () => {
    expect(qidiruvMos('Ta‘minot va sklad', "taminot SKLAD")).toBe(true);
    expect(qidiruvMos('F2 reestri', 'f2 import')).toBe(false);
  });
});
