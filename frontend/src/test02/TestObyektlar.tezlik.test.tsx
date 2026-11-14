import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({ ol: vi.fn() }));
vi.mock('../api/supabase', async (orig) => ({ ...(await orig<object>()), sbT2ObyektlarOlKomp: m.ol }));
vi.mock('../api/t2-loyiha', () => ({ sbT2LoyihalarOl: async () => ({ ok: true, qatorlar: [] }), sbT2LoyihaYoz: vi.fn() }));
vi.mock('../api/t2-nakrutka-paket', () => ({ t2NakrutkaOldindan: vi.fn() }));
vi.mock('./KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17, nom: 'K' } }) }));
vi.mock('../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ refresh: vi.fn(), scope: { objectId: null } }) }));
vi.mock('../components/pto-workspace/useLineage', () => ({
  useCompanyLineage: () => ({ data: { loyihalar: [{ id: 1, nom: 'Loyiha' }], shartnomalar: [], obyektlar: [{ id: 10, loyiha_id: 1 }] }, isPending: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../components/pto-workspace/useObjectFinancials', () => ({ useObjectFinancials: () => ({ loading: false, failed: false, retry: vi.fn(), sum: () => ({ smeta: { known: 0, present: 0, unknown: 0, total: 0 }, fakt: { known: 0, present: 0, unknown: 0, total: 0 }, f2: { known: 0, present: 0, unknown: 0, total: 0 }, ostatka: { known: 0, present: 0, unknown: 0, total: 0 }, legacy: 0 }) }) }));
vi.mock('../components/pto-workspace/useMarkupTotals', () => ({ useMarkupTotals: () => ({ loading: false, failed: false, sum: () => ({ known: 0, present: 0, unknown: 0, total: 0 }) }) }));
vi.mock('../umumiy/ui/PortfelSummaJuft', () => ({ PortfelSummaJuft: () => null }));
vi.mock('../components/pto-workspace/ObyektGrafik', () => ({ KatTaqsimot: () => null, LoyihaStack: () => null, ProgressQadam: () => null }));
vi.mock('../components/pto-workspace/LoyihasizObyektlar', () => ({ LoyihasizObyektlar: () => null }));
vi.mock('../components/qollanma/KeyingiQadamPanel', () => ({ KeyingiQadamPanel: () => null }));
import TestObyektlar from './TestObyektlar';

const sorovlar: string[] = [];
beforeEach(() => {
  sorovlar.length = 0;
  m.ol.mockReset().mockResolvedValue({ ok: true, qatorlar: [{ id: 10, kompaniya_id: 17, nom: 'Obyekt A', loyiha_id: 1, jami: 100, qator_soni: 3, razdel: 1, ish: 1, resurs: 1, narxsiz: 0, versiya: 1 }] });
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
    sorovlar.push(String(init?.body ?? ''));
    return new Response(JSON.stringify({ ok: true, qatorlar: [], natija: { ok: true } }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Obyektlar sahifasi — og‘ir rahbar_panel_v1 ochilishda so‘ralmaydi', () => {
  it('mount paytida rahbar_panel_v1 yo‘q; tugma bosilganda (lazy) so‘raladi', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><TestObyektlar /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'QQS bilan hisoblash' })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(sorovlar.some((b) => b.includes('rahbar_panel_v1'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'QQS bilan hisoblash' }));
    await waitFor(() => expect(sorovlar.some((b) => b.includes('rahbar_panel_v1'))).toBe(true));
  });
});
