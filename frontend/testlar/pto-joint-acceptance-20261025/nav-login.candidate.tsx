import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const m = vi.hoisted(() => ({ invite: null as string | null, share: null as string | null }));
vi.mock('../../src/components/public-entry/PublicEntry', () => ({ PublicEntry: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div>, span: ({ children }: { children: ReactNode }) => <span>{children}</span> }, AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('../../src/i18n/TilTanlagich', () => ({ TilTanlagich: () => null }));
vi.mock('../../src/i18n/til', () => ({ t: (s: string) => s }));
vi.mock('../../src/umumiy/ui/Toast', () => ({ toast: vi.fn() }));
vi.mock('../../src/kirish/QoshilSahifa', () => ({ kutilayotganTaklifKodi: () => m.invite }));
vi.mock('../../src/kirish/UlashSahifa', () => ({ kutilayotganUlashKodi: () => m.share }));
vi.mock('../../src/kirish/GoogleKirish', () => ({ default: ({ onNatija }: { onNatija: (n: unknown) => unknown }) =>
  <button onClick={() => onNatija({ ok: true, yangi: false, rol: 'boss' })}>Synthetic existing Google user</button> }));
import KirishSahifa from '../../src/kirish/KirishSahifa';

function Location() { const l = useLocation(); return <output data-testid="location">{l.pathname + l.search}</output>; }
function mount() { return render(<MemoryRouter initialEntries={['/kirish']}><KirishSahifa /><Location /></MemoryRouter>); }
async function passwordLogin() {
  fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'synthetic-user' } });
  fireEvent.change(screen.getByLabelText('Parol'), { target: { value: 'synthetic-password' } });
  fireEvent.submit(screen.getByLabelText('Login').closest('form')!);
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toBe('/kirish'));
}
beforeEach(() => {
  m.invite = null; m.share = null;
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: true, rol: 'boss' }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('OPEN JQA-06: password login delegates home selection to the company-aware admin index', async () => {
  mount(); await passwordLogin();
  expect(screen.getByTestId('location').textContent).toBe('/admin');
});
it('OPEN JQA-06: existing Google login also delegates company-aware home selection', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Synthetic existing Google user' }));
  expect(screen.getByTestId('location').textContent).toBe('/admin');
});
it('CONTROL: pending invitation remains higher priority than the admin home', async () => {
  m.invite = 'synthetic-invite'; mount(); await passwordLogin();
  expect(screen.getByTestId('location').textContent).toBe('/qoshil/synthetic-invite');
});
it('CONTROL: pending shared link remains higher priority than the admin home', () => {
  m.share = 'synthetic-share'; mount();
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic existing Google user' }));
  expect(screen.getByTestId('location').textContent).toBe('/ulash/synthetic-share');
});
