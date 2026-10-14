import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

const { PTOWorkspaceProvider, usePTOWorkspace, validateDetail, validateHierarchy } = await import('./PTOWorkspaceContext');

let api: ReturnType<typeof usePTOWorkspace>;
function Probe() {
  api = usePTOWorkspace();
  const loc = useLocation();
  return <output data-testid="url">{loc.pathname}{loc.search}</output>;
}
const url = () => new URLSearchParams(screen.getByTestId('url').textContent!.split('?')[1] ?? '');
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><PTOWorkspaceProvider><Probe /></PTOWorkspaceProvider></MemoryRouter>);

describe('PTO scope — the URL is the only source of truth', () => {
  it('choosing an object of ANOTHER project switches the project too; old document/period never follow (127 → 129 regression)', async () => {
    mount('/admin/f2-tarix?loyiha=1&obyekt=127&hujjat=d127&panel=x');
    await waitFor(() => expect(api.scope).toMatchObject({ projectId: 1, objectId: 127, sourceDocumentId: 'd127' }));
    act(() => api.setObjectId(129));
    await waitFor(() => expect(url().get('obyekt')).toBe('129'));
    await waitFor(() => expect(url().get('hujjat')).toBe('d129'));
    expect(url().get('loyiha')).toBe('2');
    expect(url().get('panel')).toBe('x');
    // Nothing ever writes the previous object back.
    await new Promise(r => setTimeout(r, 30));
    expect(url().get('obyekt')).toBe('129');
  });

  it('a late document list of the previous object does not validate the new object', async () => {
    slowObject = 127;
    mount('/admin/f2-tarix?loyiha=1&obyekt=127');
    await waitFor(() => expect(api.objects.length).toBe(3));
    act(() => api.setObjectId(128));
    await waitFor(() => expect(url().get('obyekt')).toBe('128'));
    act(() => pending.splice(0).forEach(f => f()));   // 127's documents arrive late
    await new Promise(r => setTimeout(r, 20));
    expect(url().get('obyekt')).toBe('128');
    expect(url().get('hujjat')).toBeNull();          // 128 has two documents: the user chooses, nothing is guessed
    slowObject = null;
  });

  it('two changes in the same tick: the last one wins, the first is not lost to a stale copy', async () => {
    mount('/admin/holat?obyekt=127');
    await waitFor(() => expect(api.objects.length).toBe(3));
    act(() => { api.setObjectId(128); api.setObjectId(129); });
    await waitFor(() => expect(url().get('obyekt')).toBe('129'));
    expect(url().get('loyiha')).toBe('2');
  });

  it('an unknown object id from a deep link is cleared after the company lists load, never guessed', async () => {
    mount('/admin/f2?obyekt=999&loyiha=1');
    await waitFor(() => expect(url().get('obyekt')).toBeNull());
    expect(url().get('loyiha')).toBe('1');
  });

  it('scopeSearch builds the link for another route with the object and its project', async () => {
    mount('/admin/fakt?loyiha=1&obyekt=127&hujjat=d127');
    await waitFor(() => expect(api.objects.length).toBe(3));
    expect(api.scopeSearch(129)).toBe('?loyiha=2&obyekt=129');
  });
});

describe('pure scope rules', () => {
  it('validateHierarchy: a valid object decides its project; unknown ids are cleared', () => {
    const empty = { periodId: null, sourceDocumentId: null, revisionId: null };
    expect(validateHierarchy({ projectId: 1, objectId: 129, ...empty }, 17, projects, objects)).toMatchObject({ projectId: 2, objectId: 129 });
    expect(validateHierarchy({ projectId: 9, objectId: 999, ...empty }, 17, projects, objects)).toMatchObject({ projectId: null, objectId: null });
    expect(validateHierarchy({ projectId: 1, objectId: 127, ...empty }, 99, projects, objects)).toMatchObject({ projectId: null, objectId: null });
  });
  it('validateDetail: only the object\'s own lists count; a single document is filled in, several are left to the user', () => {
    const base = { projectId: 1, objectId: 128, periodId: '2026-09', sourceDocumentId: 'd127', revisionId: 'd127:r1' };
    const d128 = { objectId: 128, periods: [], documents: docsByObject[128], revisions: [] };
    expect(validateDetail(base, d128)).toMatchObject({ periodId: null, sourceDocumentId: null, revisionId: null });
    expect(validateDetail(base, { ...d128, objectId: 127 })).toBe(base);
    const d129 = { objectId: 129, periods: [], documents: docsByObject[129], revisions: [{ id: 'd129:r1', documentId: 'd129', sequence: 1, label: 'r1' }] };
    expect(validateDetail({ ...base, objectId: 129 }, d129)).toMatchObject({ sourceDocumentId: 'd129', revisionId: 'd129:r1' });
  });
});
