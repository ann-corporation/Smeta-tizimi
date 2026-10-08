import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ superadmin: true, upload: vi.fn(), analysis: vi.fn() }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ superadmin: state.superadmin }) }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
vi.mock('../../lib/f2-import-parse/xlsxFonda', () => ({ readXlsxFonda: vi.fn(async () => ({})) }));
vi.mock('../../lib/catalog-manba-import', () => ({ tahlilKatalogXlsx: state.analysis, tahlilMashinaSoatPdf: state.analysis, catalogQatorlariniApiFormatga: (rows: unknown[]) => rows }));
vi.mock('../../lib/catalog-release/client', () => ({ listCatalogReleases: vi.fn(async () => ({ releases: [], cursor: null })), referenceRelease: vi.fn(async () => ({ counts: { resources: 123622, price_observations: 88806, wages: 437 } })), uploadCatalogRelease: state.upload }));
import CatalogReleasePanel from './CatalogReleasePanel';
beforeEach(() => {
  state.superadmin = true; state.upload.mockReset(); state.upload.mockResolvedValue({ rows: 1, revision: 'a'.repeat(64) });
  state.analysis.mockReturnValue({ turi: 'material_katalog', davr: { yil: 2026, kvartal: 1, yorliq: '2026 Q1' }, qatorlar: [{ nom: 'Ресурс', birlik: null, narx: null }], varaqlar: [], importgaTayyor: true });
});
it('ordinary users get company upload navigation and cannot submit a global file', async () => {
  state.superadmin = false; render(<MemoryRouter><CatalogReleasePanel /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Kompaniya katalogini yuklash' }).getAttribute('href')).toBe('/admin/narx-manbalari');
  expect(screen.queryByLabelText('Umumiy katalog fayli')).toBe(null); expect(state.upload).not.toHaveBeenCalled();
  expect(await screen.findByText(/Tizim ma’lumotnomalari/)).toBeTruthy();
});
it('requires operator review and leaves unknown currency/tax unknown', async () => {
  render(<MemoryRouter><CatalogReleasePanel /></MemoryRouter>);
  const file = new File(['test'], 'test.xlsx'); Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(4) });
  fireEvent.change(screen.getByLabelText('Umumiy katalog fayli'), { target: { files: [file] } });
  const button = await screen.findByRole('button', { name: 'Umumiy katalogni saqlash' }); expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(button);
  await waitFor(() => expect(state.upload).toHaveBeenCalledOnce());
  expect(state.upload.mock.calls[0][1]).toMatchObject({ valyuta: null, nds_holati: 'nomalum' });
  expect(state.upload.mock.calls[0][2][0].narx).toBe(null);
});
