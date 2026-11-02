import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({
  useKompaniya: () => ({ foydalanuvchi: { ism: 'Anvar', login: 'anvar', email: 'a@b.uz', holat: 'faol' }, joriy: null, joriyId: null, kompaniyalar: [], superadmin: false, globalRejim: false, yuklanmoqda: false }),
}));
import AkkauntMarkazi from './AkkauntMarkazi';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function chiz(yol: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[yol]}><AkkauntMarkazi /></MemoryRouter></QueryClientProvider>);
}

describe('AkkauntMarkazi', () => {
  it('profil API 404 — «Server yangilanmagan» notasi va faqat-o‘qish ma‘lumot (qulamaydi)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ ok: false }) } as Response)));
    chiz('/admin/akkaunt?bolim=profil');
    await waitFor(() => expect(screen.getByText('Server yangilanmagan')).toBeTruthy());
    expect(screen.getByText('Hozirgi ma‘lumotlar (faqat o‘qiladi).')).toBeTruthy();
  });

  it('profil yuklanadi va forma chiqadi; «Kirish usullari» birinchi tab', async () => {
    const profil = { id: 1, login: 'anvar', email: 'a@b.uz', ism: 'Anvar Ahatqulov', telefon: null, telefon_tasdiqlangan: false, til: 'uz', avatar_rang: null, google_ulangan: false, parol_bor: true, parol_yangilandi: null, yaratildi: '2026-01-01T00:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/profil'
      ? { ok: true, status: 200, json: async () => ({ ok: true, profil, sessiya: { boshlangan: '2026-10-01T00:00:00Z', tugaydi: '2026-11-01T00:00:00Z' } }) }
      : { ok: false, status: 404, json: async () => ({ ok: false }) }) as Response));
    chiz('/admin/akkaunt');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saqlash' })).toBeTruthy());
    expect(screen.getAllByRole('tab')[0].textContent).toBe('Kirish usullari');
    expect((screen.getByLabelText('Ism') as HTMLInputElement).value).toBe('Anvar Ahatqulov');
  });
});
