import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FaylMenejer } from './FaylMenejer';
import type { FaylExplorer } from '../../api/t2-fayl';

const mocks = vi.hoisted(() => ({ list: vi.fn(), bytes: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock('../../api/t2-fayl', () => ({ faylExplorerOl: mocks.list, faylBaytlari: mocks.bytes, EKSPORT_JADVALLARI: [], jadvalHammasi: vi.fn() }));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatYukla: mocks.upload }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: mocks.download }));
vi.mock('../../i18n/til', () => ({ useTil: () => ({ t: (text: string) => text }) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
vi.mock('../../umumiy/hujjat/HujjatKorinish', () => ({ HujjatKorinish: () => <div>preview</div> }));

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const listing = (id: number): FaylExplorer => ({ ok: true, rol: 'admin', kompaniya_id: id, kompaniya: `Company ${id}`, fayllar: [{ id, nom: 'file.xlsx', tur: 'smeta', versiya: 1, mime: 'application/xlsx', hajm: 1, sha256: null, sana: '2026-10-09', kim: null, loyiha_id: null, loyiha: null, obyekt_id: null, obyekt: null }] });
afterEach(() => vi.resetAllMocks());

it('late A response cannot populate B or a new A session', async () => {
  const first = deferred<FaylExplorer>();
  mocks.list.mockReturnValueOnce(first.promise).mockResolvedValueOnce(listing(2)).mockResolvedValueOnce(listing(1));
  const { rerender } = render(<FaylMenejer kompaniyaId={1} />);
  rerender(<FaylMenejer kompaniyaId={2} />);
  await waitFor(() => expect(screen.getAllByText('Company 2').length).toBeGreaterThan(0));
  await act(async () => first.resolve({ ...listing(1), kompaniya: 'STALE' }));
  expect(screen.queryByText('STALE')).toBeNull();
  rerender(<FaylMenejer kompaniyaId={1} />);
  await waitFor(() => expect(screen.getAllByText('Company 1').length).toBeGreaterThan(0));
  expect(screen.queryByText('STALE')).toBeNull();
});

it('late download after company switch produces no file download', async () => {
  mocks.list.mockImplementation((id: number) => Promise.resolve(listing(id)));
  const bytes = deferred<Uint8Array>(); mocks.bytes.mockReturnValue(bytes.promise);
  const { rerender } = render(<FaylMenejer kompaniyaId={1} />);
  await waitFor(() => expect(screen.getAllByText('Company 1').length).toBeGreaterThan(0));
  fireEvent.change(screen.getByLabelText('Shu papkada qidirish'), { target: { value: 'file' } });
  fireEvent.click(screen.getByLabelText('Yuklab olish'));
  rerender(<FaylMenejer kompaniyaId={2} />);
  await act(async () => bytes.resolve(new Uint8Array([1])));
  expect(mocks.download).not.toHaveBeenCalled();
});

it('company switch stops a multi-file upload after the already-started request', async () => {
  mocks.list.mockImplementation((id: number) => Promise.resolve(listing(id)));
  const upload = deferred<{ ok: true }>(); mocks.upload.mockReturnValue(upload.promise);
  const { rerender, container } = render(<FaylMenejer kompaniyaId={1} />);
  await waitFor(() => expect(screen.getAllByText('Company 1').length).toBeGreaterThan(0));
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')] } });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  rerender(<FaylMenejer kompaniyaId={2} />);
  await act(async () => upload.resolve({ ok: true }));
  expect(mocks.upload).toHaveBeenCalledTimes(1);
});

it('company switch prevents exporting an old-company ZIP after bytes arrive', async () => {
  mocks.list.mockImplementation((id: number) => Promise.resolve(listing(id)));
  const bytes = deferred<Uint8Array>(); mocks.bytes.mockReturnValue(bytes.promise);
  const { rerender } = render(<FaylMenejer kompaniyaId={1} />);
  await waitFor(() => expect(screen.getAllByText('Company 1').length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: 'Papkani ZIP' }));
  rerender(<FaylMenejer kompaniyaId={2} />);
  await act(async () => bytes.resolve(new Uint8Array([1])));
  expect(mocks.download).not.toHaveBeenCalled();
});
