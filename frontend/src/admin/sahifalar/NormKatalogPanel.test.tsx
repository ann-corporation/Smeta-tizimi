import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KatalogPanel } from './NormKatalogPanel';
import type { StudioNormCatalog } from '../../lib/catalog-extraction/norm-library';
import type { NormWork } from '../../lib/catalog-extraction/norm-catalog';
import type { NormDetail } from '../../lib/catalog-extraction/norm-remote';

const work: NormWork = { id: 'test-work', code: 'TEST-1', name: 'Synthetic work', collection: null,
  section: null, subsection: null, tableCode: null, unitCode: '100 m³' };
function fixture(count = 30) {
  const recipes = Array.from({ length: Math.min(count, 25) }, (_, i) => ({ id: `r${i}`, resourceStatus: 'EXACT',
    candidates: [{ id: `m${i}`, name: `Synthetic resource ${i}`, code: 'TEST', type: 'M', unitCode: 'kg' }], norm: '2', candidateCount: 1 }));
  const detail = { work, recipes, recipeCount: count, workCodeAmbiguous: false };
  const catalog = { childNodes: () => ({ nodes: [], total: 0 }), breadcrumb: () => [],
    load: vi.fn(async () => {}), detail: () => detail, unit: () => null,
    sourceBasis: () => ({ scale: '100', unitLabel: 'm³', evidence: 'TEST SOURCE', origin: 'OBSERVED' }),
  } as unknown as StudioNormCatalog;
  return { catalog, detail };
}
async function opened(options: { count?: number; hajmYoq?: boolean; onResurs?: () => void } = {}) {
  const { catalog, detail } = fixture(options.count);
  const onAdd = vi.fn((_work: NormWork, _detail: NormDetail, _quantity: string) => true);
  const view = render(<KatalogPanel katalog={catalog} boshlangichIsh={work} onAdd={onAdd}
    hajmYoq={options.hajmYoq} onResurs={options.onResurs} />);
  await screen.findByRole('button', { name: /Smetaga qo‘shish/ });
  return { ...view, onAdd, detail };
}
it('puts focused quantity and add before the collapsed recipe; an expression submits physical quantity, without dividing by norm scale', async () => {
  const { onAdd, container, detail } = await opened();
  const input = screen.getByLabelText(/Hajm yoki formula/);
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(container.querySelector('details')?.open).toBe(false);
  expect(input.compareDocumentPosition(container.querySelector('table')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.change(input, { target: { value: '12 × 3 × 0,2' } });
  expect(screen.getByText('Hisoblangan hajm: 7.2 m³')).toBeTruthy();
  fireEvent.submit(input.closest('form')!);
  expect(onAdd).toHaveBeenCalledWith(work, detail, '7.2');
  expect(screen.getByText('Ish «Synthetic work» smetaga qo‘shildi.')).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe('');
});
it('does not submit an invalid expression, and recovers after editing the visible value', async () => {
  const { onAdd } = await opened();
  const input = screen.getByLabelText(/Hajm yoki formula/);
  fireEvent.change(input, { target: { value: '1 / 0' } });
  expect(screen.getByRole('alert').textContent).toContain('formulani tekshiring');
  expect((screen.getByRole('button', { name: /Smetaga qo‘shish/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(input.closest('form')!);
  expect(onAdd).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '0,123456789012' } });
  fireEvent.submit(input.closest('form')!);
  expect(onAdd.mock.calls[0]?.[2]).toBe('0.123456789012');
});
it('preserves blank unknown and explicit zero as distinct inputs', async () => {
  const { onAdd } = await opened();
  const input = screen.getByLabelText(/Hajm yoki formula/);
  fireEvent.submit(input.closest('form')!);
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.submit(input.closest('form')!);
  expect(onAdd.mock.calls.map(call => call[2])).toEqual(['', '0']);
});
it('keeps resource selection expanded and hidden-quantity callers compatible', async () => {
  const onResurs = vi.fn();
  const { container, onAdd } = await opened({ hajmYoq: true, onResurs });
  expect(screen.queryByLabelText(/Hajm yoki formula/)).toBeNull();
  expect(container.querySelector('details')?.open).toBe(true);
  fireEvent.click(screen.getAllByRole('button', { name: /Resursni tanlash/ })[0]);
  expect(onResurs).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Smetaga qo‘shish/ }));
  expect(onAdd.mock.calls[0]?.[2]).toBe('');
});
it('does not post work whose resource recipe is missing', async () => {
  const { onAdd } = await opened({ count: 0 });
  const input = screen.getByLabelText(/Hajm yoki formula/);
  fireEvent.change(input, { target: { value: '3' } });
  fireEvent.submit(input.closest('form')!);
  expect(onAdd).not.toHaveBeenCalled();
});
