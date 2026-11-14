import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { KompaniyaSozlamaPanel } from './KompaniyaSozlamaPanel';

// CI yuklamasida (parallel fayllar) asinxron kutish 1 s yetmay qoladi — sinov vaqtga emas, holatga bog'liq bo'lsin.
configure({ asyncUtilTimeout: 5000 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const get = (o: Record<string, unknown> = {}) => ({ ok: true, kompaniya_id: 7, mavqe: 'pudratchi', f2_tasdiq_rejimi: 'shaxsiy', sozlamalar: {}, yozish_mumkin: true, ...o });
const javob = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

function chiz() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><KompaniyaSozlamaPanel kompaniyaId={7} /></MemoryRouter></QueryClientProvider>);
}

describe('KompaniyaSozlamaPanel', () => {
  it('F2 rejimini serverdan ko‘rsatadi va o‘zgartirganda POST qiladi', async () => {
    const fetchMock = vi.fn((_u: string, init?: RequestInit) => init?.method === 'POST' ? javob({ ok: true }) : javob(get()));
    vi.stubGlobal('fetch', fetchMock);
    chiz();
    const shaxsiy = await screen.findByRole('radio', { name: /Shaxsiy/ });
    expect(shaxsiy.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Korporativ/ }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
      expect(post).toBeTruthy();
      const b = JSON.parse(String(post![1]!.body));
      expect(b).toMatchObject({ kompaniya_id: 7, kalit: 'f2.tasdiq_rejimi', qiymat: 'korporativ' });
      expect(typeof b.operation_id).toBe('string');
    });
  });

  it('yozish_mumkin=false bo‘lsa — o‘chirilgan va POST yo‘q', async () => {
    const fetchMock = vi.fn((_u: string, _i?: RequestInit) => javob(get({ yozish_mumkin: false })));
    vi.stubGlobal('fetch', fetchMock);
    chiz();
    const k = await screen.findByRole('radio', { name: /Korporativ/ });
    expect((k as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(k);
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
  });

  it('404 SERVER_YANGILANMAGAN — «Server hali yangilanmagan» eslatmasi', async () => {
    vi.stubGlobal('fetch', vi.fn(() => javob({ ok: false, code: 'SERVER_YANGILANMAGAN' }, 404)));
    chiz();
    expect(await screen.findByText(/Server hali yangilanmagan/)).toBeTruthy();
  });
});
