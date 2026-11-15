// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { T2Obyekt } from '../../api/supabase';
import type { Loyiha } from '../../api/t2-loyiha';
import type { CenterDocument } from '../../components/document-center';

const projects = [{ id: 1, kompaniya_id: 17, nom: 'NEW TIMES' }, { id: 2, kompaniya_id: 17, nom: 'Suniy ko‘l' }] as unknown as Loyiha[];
const objects = [{ id: 127, kompaniya_id: 17, loyiha_id: 1, nom: 'Amfiteatr' }, { id: 129, kompaniya_id: 17, loyiha_id: 2, nom: 'Suniy ko‘l' },
  { id: 128, kompaniya_id: 17, loyiha_id: 1, nom: 'Stella' }] as unknown as T2Obyekt[];
const doc = (id: string): CenterDocument => ({ id, filename: `${id}.xlsx`, type: 'smeta', revision: 1, mime: 'x', size: 1, sha256: id, canonicalStatus: 'READY', updatedAt: '', createdAt: '', author: '', replicas: [] } as unknown as CenterDocument);
const docsByObject: Record<number, CenterDocument[]> = { 127: [doc('d127')], 128: [doc('d128a'), doc('d128b')], 129: [doc('d129')] };
const pending: Array<() => void> = [];
let slowObject: number | null = null;

vi.mock('./KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: 17, globalRejim: false, yuklanmoqda: false }) }));
vi.mock('../../api/t2-loyiha', () => ({ sbT2LoyihalarOl: async () => ({ ok: true, qatorlar: projects }) }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: objects }),
  sbT2AktReestrOl: async () => ({ ok: true, qatorlar: [] }),
}));
vi.mock('../../api/t2-hujjat-canonical', () => ({
  hujjatRoyxatOl: ({ obyektId }: { obyektId: number }) => new Promise(resolve => {
    const done = () => resolve({ documents: docsByObject[obyektId] ?? [] });
    if (obyektId === slowObject) pending.push(done); else done();
  }),
}));

const { PTOWorkspaceProvider, PTOWorkspaceBar } = await import('./PTOWorkspaceContext');

const matchMedia = (telefon: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: telefon && q.includes('max-width'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
const mount = () => render(<MemoryRouter initialEntries={['/admin/f2-tarix?loyiha=1&obyekt=127']}><PTOWorkspaceProvider><PTOWorkspaceBar /></PTOWorkspaceProvider></MemoryRouter>);

describe('PTOWorkspaceBar — yuqori panel joylashuvi', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('desktop: loyiha/obyekt/oy tanlagichlari bevosita panelda (bitta qator, CSS o‘rab oladi)', async () => {
    matchMedia(false);
    mount();
    await waitFor(() => expect(screen.getByLabelText('PTO obyekt')).toBeTruthy());
    expect(screen.getByTestId('pto-workspace-bar').className).toContain('flex-wrap');
    expect(screen.queryByTestId('pto-doira-tugma')).toBeNull();
  });

  it('telefon: panelda faqat bitta tugma (≤56px qator); tanlagichlar tugma ortidagi panelda', async () => {
    matchMedia(true);
    mount();
    const tugma = await screen.findByTestId('pto-doira-tugma');
    expect(screen.queryByLabelText('PTO obyekt')).toBeNull();
    expect(tugma.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tugma);
    expect(tugma.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByTestId('pto-doira-panel');
    expect(panel.contains(screen.getByLabelText('PTO loyiha'))).toBe(true);
    expect(panel.contains(screen.getByLabelText('PTO obyekt'))).toBe(true);
    fireEvent.click(tugma);
    expect(screen.queryByTestId('pto-doira-panel')).toBeNull();
  });
});