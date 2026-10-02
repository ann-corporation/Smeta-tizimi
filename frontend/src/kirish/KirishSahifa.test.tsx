import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Egasi 2026-10-02: tashqaridan kelgan odam o'zi ro'yxatdan o'tadi va a'zolik bilan tizimga kiradi.
const m = vi.hoisted(() => ({ navigate: vi.fn(), toast: vi.fn() }));
vi.mock('react-router-dom', async (asl) => ({ ...(await asl<typeof import('react-router-dom')>()), useNavigate: () => m.navigate }));
vi.mock('../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('./Sahna3D', () => ({ default: () => null }));
vi.mock('./GoogleKirish', () => ({ default: () => null }));

import KirishSahifa from './KirishSahifa';

const ochish = () => {
  render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: "Ro'yxatdan o'tish" }));
};
const toldir = async (ism: string, login: string, parol: string) => {
  fireEvent.change(await screen.findByPlaceholderText('F.I.Sh.'), { target: { value: ism } });
  fireEvent.change(screen.getByPlaceholderText('aziz.pto yoki aziz@mail.uz'), { target: { value: login } });
  fireEvent.change(document.querySelector('input[autocomplete="new-password"]')!, { target: { value: parol } });
  fireEvent.click(screen.getByRole('button', { name: /Hisob ochish/ }));
};

describe('O‘zi ro‘yxatdan o‘tish', () => {
  beforeEach(() => { m.navigate.mockReset(); m.toast.mockReset(); });

  it('ro‘yxat → odatdagi kirish → Tokenlar sahifasi', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      json: async () => (url === '/api/royxat-ozi' ? { ok: true, login: 'aziz.pto', demo: false } : { ok: true, rol: 'boss' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    ochish();
    await toldir('Aziz Karimov', 'Aziz.PTO', 'Sinov2026!x');
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin/tokenlar'));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/royxat-ozi', '/api/kirish']);
    const royxat = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(royxat).toMatchObject({ login: 'aziz.pto', ism: 'Aziz Karimov' });
    expect(royxat.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    const kirish = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(kirish).toEqual({ login: 'aziz.pto', parol: 'Sinov2026!x' });
  });

  it('qisqa parol — serverga umuman bormaydi', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    ochish();
    await toldir('Aziz', 'aziz.pto', '123');
    expect(await screen.findByText('Parol kamida 8 belgi')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('login band — xabar ko‘rinadi, kirishga o‘tilmaydi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: false, code: 'LOGIN_BAND', xabar: 'Bu login band' }) })));
    ochish();
    await toldir('Aziz', 'aziz.pto', 'Sinov2026!x');
    expect(await screen.findByText('Bu login band')).toBeTruthy();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('email login sifatida qabul qilinadi (egasi sinovi)', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ json: async () => (url === '/api/royxat-ozi' ? { ok: true } : { ok: true, rol: 'boss' }) }));
    vi.stubGlobal('fetch', fetchMock);
    ochish();
    await toldir('Anvar', 'Anvar.Test@Gmail.com', 'Sinov2026!x');
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin/tokenlar'));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).login).toBe('anvar.test@gmail.com');
  });
});
