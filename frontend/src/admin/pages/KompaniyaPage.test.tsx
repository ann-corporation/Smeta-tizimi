import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../components/kompaniya-sozlama/KompaniyaSozlamaPanel', () => ({ KompaniyaSozlamaPanel: () => <div>SOZLAMA-PANEL</div> }));
vi.mock('../../api/t2-men', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-men')>()),
  useMen: () => ({ isLoading: false, isError: false, data: { foydalanuvchi: { login: 'u' }, jami: 1, azoliklar: [{ azolik_id: 1, kompaniya_id: 7, nom: 'K', kod: 'K1', rol: 'boss', is_director: true }], onboarding_kerak: false } }),
  useOnboardingCommands: () => new Proxy({}, { get: () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false }) }),
  useKompaniyaRoyxatlar: () => ({ isLoading: false, isError: false, data: { superadmin: false, royxatlar: [] } }),
  useKompaniyaProfil: () => ({ isLoading: true, data: undefined }),
}));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({
  useKompaniya: () => ({ joriy: { id: 7, nom: 'K' }, joriyId: 7, superadmin: false, kompaniyalar: [], tanla: () => {} }),
}));

import KompaniyaPage from './KompaniyaPage';

afterEach(cleanup);
const chiz = (url: string) => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}><KompaniyaPage /></MemoryRouter></QueryClientProvider>);

describe('KompaniyaPage ?tab=', () => {
  it('?tab=sozlamalar — Sozlamalar yorlig‘i tanlanadi', () => {
    chiz('/admin/kompaniya?tab=sozlamalar');
    expect(screen.getByRole('tab', { name: /Sozlamalar/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('SOZLAMA-PANEL')).toBeTruthy();
  });
  it('noto‘g‘ri tab — Profil', () => {
    chiz('/admin/kompaniya?tab=yoq');
    expect(screen.getByRole('tab', { name: /Profil/ }).getAttribute('aria-selected')).toBe('true');
  });
});
