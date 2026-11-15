import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { IsmQadam } from './IsmQadam';
import { KompaniyasizBosh } from './KompaniyasizBosh';

const profil = (ism: string | null) => ({ ok: true, profil: { id: 1, login: 'x', email: null, ism, telefon: null, telefon_tasdiqlangan: false, til: null, avatar_rang: null, google_ulangan: false, parol_bor: false, parol_yangilandi: null, yaratildi: '2026-01-01' }, sessiya: null });
const javob = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
const orab = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('IsmQadam', () => {
  it('ism bo‘sh bo‘lsa so‘raydi va /api/profil yangila bilan saqlaydi', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => init?.method === 'POST' ? javob({ ok: true, profil: profil('Ali').profil }) : javob(profil(null)));
    vi.stubGlobal('fetch', f);
    orab(<IsmQadam />);
    const input = await screen.findByLabelText('Ism');
    fireEvent.change(input, { target: { value: 'Ali' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(f.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toMatchObject({ amal: 'yangila', ism: 'Ali' });
  });
  it('ism bor bo‘lsa hech narsa ko‘rsatmaydi', async () => {
    const f = vi.fn(async () => javob(profil('Ali')));
    vi.stubGlobal('fetch', f);
    orab(<IsmQadam />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('«Keyinroq» yopadi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javob(profil(null))));
    orab(<IsmQadam />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keyinroq' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('KompaniyasizBosh', () => {
  it('xato emas: shaxsiy sozlamalarga havolalar bor (takliflar so‘rovi xato bo‘lsa ham)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javob({ ok: false, code: 'X' })));
    orab(<KompaniyasizBosh />);
    expect(await screen.findByTestId('kompaniyasiz-bosh')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Profil va @username/ }).getAttribute('href')).toBe('/admin/akkaunt?bolim=profil');
    expect(screen.getByRole('link', { name: /Modullarim/ }).getAttribute('href')).toBe('/admin/akkaunt?bolim=modullarim');
  });
});