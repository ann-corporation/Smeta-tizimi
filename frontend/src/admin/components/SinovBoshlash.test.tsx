import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({ navigate: vi.fn(), boshlash: vi.fn(), demo: vi.fn(), holat: { data: undefined as unknown }, qayta: vi.fn(), tanla: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => m.navigate }));
vi.mock('../../api/t2-men', () => ({ sinovBoshlash: m.boshlash, sinovDemo: m.demo, useSinovHolat: () => m.holat, kompaniyaOziOch: vi.fn() }));
vi.mock('../../api/t2-ish-joyi', () => ({ qoshil: vi.fn(), ishJoyiXato: () => 'xato' }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => '11111111-1111-4111-8111-111111111111' }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ qayta: m.qayta, tanla: m.tanla }) }));
import { SinovBoshlash } from './SinovBoshlash';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const korsat = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><SinovBoshlash /></MemoryRouter></QueryClientProvider>);
const H = { ok: true, boshlangan: false, kompaniya_id: null, haqiqiy: false, boshlash_mumkin: false, demo_obyekt_id: null, demo_mavjud: true, balans: null };

describe('SinovBoshlash', () => {
  it('a’zosiz yangi foydalanuvchi: bitta tugma, bitta chaqiruv (operation_id bilan), keyin ish joyi tanlanadi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.holat.data = { ...H, boshlash_mumkin: true };
    m.boshlash.mockResolvedValue({ kompaniya_id: 77, bonus_token: 1000, balans: 1000 });
    korsat();
    fireEvent.click(screen.getByRole('button', { name: /Sinovni boshlash/ }));
    await waitFor(() => expect(m.boshlash).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'));
    expect(m.boshlash).toHaveBeenCalledTimes(1);
    expect(m.qayta).toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(m.tanla).toHaveBeenCalledWith(77);
    vi.useRealTimers();
  });
  it('limit xatosi ko‘rinadi, o‘tish yo‘q', async () => {
    m.holat.data = { ...H, boshlash_mumkin: true };
    m.boshlash.mockRejectedValue(Object.assign(new Error('LIMIT'), { code: 'LIMIT' }));
    korsat();
    fireEvent.click(screen.getByRole('button', { name: /Sinovni boshlash/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Bugungi sinov joylari tugadi/);
    expect(m.tanla).not.toHaveBeenCalled();
  });
  it('sinov ish joyi bor: balans, qadamlar va demo tugmasi', async () => {
    m.holat.data = { ...H, boshlangan: true, kompaniya_id: 77, balans: 1000 };
    m.demo.mockResolvedValue({ demo_obyekt_id: 5 });
    korsat();
    expect(screen.getByText(/Sinov balansi: 1000 token/)).toBeTruthy();
    expect(screen.getByText(/AI yordamchiga savol bering/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Namunani ochish' }));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin/obyektlar'));
    expect(m.demo).toHaveBeenCalledTimes(1);
  });
  it('haqiqiy kompaniya ochilgan yoki a’zosi bor hisobda hech narsa ko‘rinmaydi', () => {
    for (const d of [{ ...H, boshlangan: true, haqiqiy: true }, { ...H }, undefined]) {
      m.holat.data = d;
      const { container, unmount } = korsat();
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });
});
