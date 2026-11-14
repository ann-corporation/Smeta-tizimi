import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KompaniyaProvider, useKompaniya } from './KompaniyaKontekst';

const men = {
  ok: true, platform_role: 'none', foydalanuvchi: { id: 7 },
  azoliklar: [],
  context_kompaniyalar: [17, 21].map((id) => ({ kompaniya_id: id, nom: `Kompaniya ${id}`, kod: `K${id}`, faol: true, membership_role: 'boss', effective_role: 'boss', is_director: true })),
};
vi.mock('../../api/t2-men', () => ({ useMen: () => ({ data: men, isLoading: false, refetch: vi.fn() }) }));

function Probe() {
  const k = useKompaniya();
  return <div><span data-testid="joriy">{k.joriy?.id ?? 'yo‘q'}</span><button onClick={() => k.tanla(21)}>tanla21</button></div>;
}
const mount = () => render(<QueryClientProvider client={new QueryClient()}><KompaniyaProvider><Probe /></KompaniyaProvider></QueryClientProvider>);
const KEY = 't2_kompaniya_kontekst';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('T15: tanlangan kompaniya yangilanganda (refresh) saqlanadi', () => {
  it('tanlov saqlanadi va «sahifa qayta yuklanganda» (yangi mount) tiklanadi', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('joriy').textContent).toBe('yo‘q')); // ko'p kompaniya, tanlov yo'q
    fireEvent.click(screen.getByText('tanla21'));
    await waitFor(() => expect(screen.getByTestId('joriy').textContent).toBe('21'));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ uid: 7, id: 21, global: false });
    cleanup();
    mount(); // refresh
    await waitFor(() => expect(screen.getByTestId('joriy').textContent).toBe('21'));
  });
  it('boshqa foydalanuvchi tanlovi yoki a‘zo bo‘lmagan kompaniya tiklanmaydi', async () => {
    localStorage.setItem(KEY, JSON.stringify({ uid: 8, id: 21, global: false }));
    mount();
    await waitFor(() => expect(screen.getByTestId('joriy').textContent).toBe('yo‘q'));
    cleanup();
    localStorage.setItem(KEY, JSON.stringify({ uid: 7, id: 999, global: false }));
    mount();
    await waitFor(() => expect(screen.getByTestId('joriy').textContent).toBe('yo‘q'));
  });
});
