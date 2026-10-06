import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { EstimateOutline, type OutlineLabels } from './EstimateOutline';

afterEach(cleanup);
// jsdom has no layout engine. Keep the real virtualizer; simulate only viewport geometry.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(520);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0,
    top: 0, left: 0, right: 1000, bottom: 520, width: 1000, height: 520, toJSON: () => ({}) });
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterAll(() => vi.restoreAllMocks());
const labels: OutlineLabels = { title: 'Test estimate', search: 'Find work', collapse: 'Collapse',
  sections: 'Sections', works: 'Works', resources: 'Resources', empty: 'No rows', invalid: 'Invalid hierarchy',
  select: 'Select', expand: 'Expand', close: 'Close' };
function fixture(count = 1) {
  const doc = emptyDoc('internal-draft-uuid');
  doc.rootOrder = ['secret-section-id'];
  doc.sections['secret-section-id'] = { id: 'secret-section-id', name: 'Foundations', parentId: null, children: [], items: [] };
  for (let i = 0; i < count; i++) {
    const id = `internal-work-${i}`; doc.sections['secret-section-id'].items.push(id);
    doc.occurrences[id] = { id, sectionId: 'secret-section-id', source: { workId: 'catalog-id', catalogRevision: 'secret-hash',
      name: `Concrete ${i}`, code: 'E06', unitCode: 'm3', tableLabel: null }, quantity: '4',
      basis: { scale: '1', unitLabel: 'm3', evidence: 'source', origin: 'OBSERVED' }, recipe: [], overrides: {} };
  }
  return doc;
}
it('opens section and returns stable identity without showing technical IDs', async () => {
  const onSelect = vi.fn(), doc = fixture();
  const { container } = render(<EstimateOutline doc={doc} labels={labels} onSelect={onSelect} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Expand' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Select: Concrete 0' }));
  expect(onSelect.mock.calls[0][0].occurrenceId).toBe('internal-work-0');
  expect(container.textContent).not.toMatch(/internal-|secret-|catalog-id/);
});
it('search reveals nested work without manual expansion', async () => {
  render(<EstimateOutline doc={fixture()} labels={labels} onSelect={() => {}} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'concrete' } });
  expect(await screen.findByRole('button', { name: 'Select: Concrete 0' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Select: Foundations' })).toBeTruthy();
});
it('invalid metadata gives safe user message, never technical error text', () => {
  const doc = fixture(); doc.rootOrder.push('missing');
  render(<EstimateOutline doc={doc} labels={labels} onSelect={() => {}} />);
  expect(screen.getByRole('alert').textContent).toBe('Invalid hierarchy');
  expect(screen.queryByText('OUTLINE_SECTION_MISSING')).toBeNull();
});
it('30k works render a bounded viewport instead of 30k DOM nodes', async () => {
  const { container } = render(<EstimateOutline doc={fixture(30_000)} labels={labels} onSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Works' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Select: Concrete 0' })).toBeTruthy());
  expect(container.querySelectorAll('[role="treeitem"]').length).toBeLessThan(50);
});
