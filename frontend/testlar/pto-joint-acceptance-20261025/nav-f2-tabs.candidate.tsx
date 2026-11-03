import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

const m = vi.hoisted(() => ({ company: 123, object: 153 }));
vi.mock('../../src/i18n/til', () => ({ t: (s: string) => s }));
vi.mock('../../src/umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({
  companyId: m.company, scope: { objectId: m.object, projectId: 22, periodId: null, sourceDocumentId: null, revisionId: null },
  scopeSearch: () => `?obyekt=${m.object}&loyiha=22`,
}) }));
vi.mock('../../src/umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: m.company, rol: 'pto' } }) }));
import BolimTablari from '../../src/admin/BolimTablari';
import { BolimTablariKontekst } from '../../src/admin/bolimTablariKontekst';

const tabs = [[{ nom: 'Synthetic F2', yol: '/admin/f2' }, { nom: 'Synthetic history', yol: '/admin/f2-tarix' }]];
function Page() {
  const l = useLocation(), navigate = useNavigate();
  return <><output data-testid="location">{l.pathname + l.search}</output><button onClick={() => {
    m.company = 456; m.object = 154; navigate('/admin/f2-tarix?obyekt=154&loyiha=22');
  }}>Synthetic scope switch</button></>;
}
function mount(search: string) {
  return render(<MemoryRouter initialEntries={[`/admin/f2${search}`]}><BolimTablariKontekst.Provider value={tabs}>
    <Routes><Route element={<BolimTablari />}><Route path="/admin/f2" element={<Page />} /><Route path="/admin/f2-tarix" element={<Page />} /></Route></Routes>
  </BolimTablariKontekst.Provider></MemoryRouter>);
}
const params = () => new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1] ?? '');
beforeEach(() => { m.company = 123; m.object = 153; sessionStorage.clear(); localStorage.clear(); });
afterEach(cleanup);

it('OPEN JQA-07: F2→history→F2 preserves the specific server draft job', () => {
  mount('?obyekt=153&job=42');
  fireEvent.click(screen.getByRole('link', { name: 'Synthetic history' }));
  // Page-specific draft IDs must not leak into a route with different semantics.
  expect(params().get('job')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Synthetic F2' }));
  expect(params().get('job')).toBe('42');
  expect(params().get('obyekt')).toBe('153');
});
it('OPEN JQA-07: editing an existing act retains both act and job on a tab roundtrip', () => {
  mount('?obyekt=153&job=42&akt=77');
  fireEvent.click(screen.getByRole('link', { name: 'Synthetic history' }));
  fireEvent.click(screen.getByRole('link', { name: 'Synthetic F2' }));
  expect(params().get('job')).toBe('42');
  expect(params().get('akt')).toBe('77');
});
it('CONTROL: a company/object switch does not reopen the previous scope draft', () => {
  mount('?obyekt=153&job=42&akt=77');
  fireEvent.click(screen.getByRole('link', { name: 'Synthetic history' }));
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic scope switch' }));
  fireEvent.click(screen.getByRole('link', { name: 'Synthetic F2' }));
  expect(params().get('obyekt')).toBe('154');
  expect(params().get('job')).toBeNull();
  expect(params().get('akt')).toBeNull();
});
