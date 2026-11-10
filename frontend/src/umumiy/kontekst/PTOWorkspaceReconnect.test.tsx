import { describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { T2Obyekt } from '../../api/supabase';
import type { Loyiha } from '../../api/t2-loyiha';

/** Oflayn boshlangan ilova: birinchi o'qish xato, tarmoq qaytgach ('online') ro'yxatlar qayta o'qiladi va xato tozalanadi. */
const h = vi.hoisted(() => ({ offline: true, loyihaChaqiruv: 0 }));
const projects = [{ id: 1, kompaniya_id: 17, nom: 'Loyiha A' }] as unknown as Loyiha[];
const objects = [{ id: 127, kompaniya_id: 17, loyiha_id: 1, nom: 'Obyekt A' }] as unknown as T2Obyekt[];

vi.mock('./KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: 17, globalRejim: false, yuklanmoqda: false }) }));
vi.mock('../../api/t2-loyiha', () => ({
  sbT2LoyihalarOl: async () => { h.loyihaChaqiruv++; return h.offline ? { ok: false, qatorlar: [], error: 'Tarmoq yo‘q' } : { ok: true, qatorlar: projects }; },
}));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => (h.offline ? { ok: false, qatorlar: [], error: 'Tarmoq yo‘q' } : { ok: true, qatorlar: objects }),
  sbT2AktReestrOl: async () => ({ ok: true, qatorlar: [] }),
}));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatRoyxatOl: async () => ({ documents: [] }) }));

const { PTOWorkspaceProvider, usePTOWorkspace } = await import('./PTOWorkspaceContext');

let api: ReturnType<typeof usePTOWorkspace>;
function Probe() { api = usePTOWorkspace(); return null; }

describe('PTO ish doirasi: tarmoq qaytganda (cold reconnect)', () => {
  it('oflayn xato, keyin window online -> qayta o‘qiladi, xato tozalanadi, loyiha/obyekt ro‘yxati to‘ladi', async () => {
    render(<MemoryRouter initialEntries={['/admin/holat']}><PTOWorkspaceProvider><Probe /></PTOWorkspaceProvider></MemoryRouter>);
    await waitFor(() => expect(api.error).toBe('Tarmoq yo‘q'));
    expect(api.projects).toHaveLength(0);
    const oldin = h.loyihaChaqiruv;

    h.offline = false;
    act(() => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(api.projects).toHaveLength(1));
    expect(api.objects).toHaveLength(1);
    expect(api.error).toBeNull();
    expect(h.loyihaChaqiruv).toBeGreaterThan(oldin);
  });
});
