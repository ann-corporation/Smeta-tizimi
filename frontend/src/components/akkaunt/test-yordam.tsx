/** Akkaunt testlari uchun umumiy yordamchi: QueryClient + MemoryRouter qobig‘i va fetch mock. */
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Profil } from '../../api/profil';

export const PROFIL: Profil = {
  id: 1, login: 'anvar', email: 'anvar@example.com', ism: 'Anvar Ahatqulov', telefon: null, telefon_tasdiqlangan: false, til: 'uz',
  avatar_rang: null, google_ulangan: false, parol_bor: true, parol_yangilandi: null, yaratildi: '2026-01-02T00:00:00.000Z',
};

export function chiz(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { qc, ...render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>) };
}

type Javob = { status?: number; body: unknown };
/** `/api/profil` POST so‘rovlari `profilPost` ga yo‘naltiriladi; boshqa URL — 404 (men/sessiya so‘rovlari xato bo‘lib o‘tadi). */
export function fetchMock(profilPost: (body: Record<string, unknown>) => Javob) {
  const chaqiruvlar: Array<{ url: string; init?: RequestInit; body?: Record<string, unknown> }> = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    chaqiruvlar.push({ url, init, body });
    const j: Javob = url === '/api/profil' && init?.method === 'POST' ? profilPost(body ?? {}) : { status: 404, body: { ok: false } };
    const status = j.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => j.body } as Response;
  });
  vi.stubGlobal('fetch', f);
  return { f, chaqiruvlar };
}
