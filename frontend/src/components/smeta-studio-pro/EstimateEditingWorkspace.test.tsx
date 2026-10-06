import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { emptyDoc, type EstimateDoc } from '../../lib/smeta-studio/model';
import { applyCommand, type StudioCommand } from '../../lib/smeta-studio/commands';
import { EstimateEditingWorkspace, type EditingLabels } from './EstimateEditingWorkspace';

// Inspector tests isolate selection, while EstimateOutline.test exercises the real virtualizer.
vi.mock('./EstimateOutline', () => ({ EstimateOutline: ({ onSelect }: { onSelect: (r: unknown) => void }) =>
  <button onClick={() => onSelect({ key: 'resource', kind: 'resource', sectionId: 's', occurrenceId: 'w', recipeId: 'r' })}>Pick</button> }));
afterEach(cleanup);
const labels: EditingLabels = { title: 'Tree', search: 'Search', collapse: 'Collapse', sections: 'Sections', works: 'Works', resources: 'Resources',
  empty: 'Empty', invalid: 'Invalid', select: 'Select', expand: 'Expand', close: 'Close', inspector: 'Inspector', choose: 'Choose', quantity: 'Quantity',
  amount: 'Amount', unknown: 'Unknown', save: 'Save', failed: 'Action failed', name: 'Name', price: 'Price', evidence: 'Evidence', basis: 'Basis',
  priceBases: { OPERATOR_MANUAL: 'Manual', CATALOG_CANDIDATE: 'Catalog', CONTRACT_DRAFT: 'Contract', PROCUREMENT_ACTUAL: 'Actual' },
  candidates: 'Candidates', noCandidates: 'No candidates', source: 'Source', replacement: 'Replacement', reason: 'Reason', conversion: 'Conversion',
  conversionEvidence: 'Conversion evidence', blocked: 'Review required', restore: 'Restore', move: 'Move' };
labels.basisScale = 'Norm basis'; labels.basisUnit = 'Norm unit'; labels.basisEvidence = 'Norm evidence';
function fixture(): EstimateDoc {
  const doc = emptyDoc('draft');
  doc.rootOrder = ['s']; doc.sections.s = { id: 's', name: 'Concrete', parentId: null, children: [], items: ['w'] };
  doc.occurrences.w = { id: 'w', sectionId: 's', source: { workId: 'norm', catalogRevision: 'hash', code: 'E06', name: 'Foundation', unitCode: 'm3', tableLabel: null },
    quantity: '4', basis: { scale: '1', unitLabel: 'm3', evidence: 'original source', origin: 'OBSERVED' }, overrides: {},
    recipe: [{ recipeId: 'r', status: 'EXACT', resource: { id: 'original', name: 'Concrete B15', code: 'B15', unitCode: 'm3', type: 'MAT' }, norm: '1.01',
      candidates: [{ id: 'next', name: 'Concrete B20', code: 'B20', unitCode: 'm3', type: 'MAT' },
        { id: 'wrong', name: 'Truck', code: 'T', unitCode: 'hour', type: 'MASH' }], candidateCount: 2,
      prices: [{ id: 'price-id', region: 'Navoi', price: '100.25', transport: '12' }], priceCount: 1 }] };
  return doc;
}
function mount(command?: (c: StudioCommand) => boolean) {
  let current = fixture();
  function Harness() {
    const [doc, setDoc] = useState(current);
    return <EstimateEditingWorkspace doc={doc} labels={labels} command={command ?? (c => { current = applyCommand(current, c); setDoc(current); return true; })} />;
  }
  const view = render(<Harness />); fireEvent.click(screen.getByText('Pick'));
  return { ...view, doc: () => current };
}
it('edits quantity through the actual canonical command and recalculates resource quantity', () => {
  const h = mount(); fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5,5' } });
  fireEvent.submit(screen.getByLabelText('Quantity').closest('form')!);
  expect(h.doc().occurrences.w.quantity).toBe('5.5'); expect(screen.getByText(/5.555000/)).toBeTruthy();
});
it('catalog candidate needs operator evidence; source recipe and transport are not silently applied', () => {
  const h = mount(); fireEvent.change(screen.getByLabelText('Candidates'), { target: { value: 'price-id' } });
  const form = screen.getByLabelText('Price').closest('form')!;
  expect(form.querySelector('button')!.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Evidence'), { target: { value: 'Catalog 2026, page 7' } }); fireEvent.submit(form);
  expect(h.doc().occurrences.w.overrides.r.price).toEqual({ value: '100.25', basis: 'CATALOG_CANDIDATE', evidence: 'Catalog 2026, page 7', sourcePriceId: 'price-id' });
  expect(h.doc().occurrences.w.recipe[0].prices[0].transport).toBe('12');
  expect(screen.getAllByText(/405.01/).length).toBeGreaterThan(0);
});
it('manual modification clears catalog identity and requires fresh evidence', () => {
  mount(); fireEvent.change(screen.getByLabelText('Candidates'), { target: { value: 'price-id' } });
  fireEvent.change(screen.getByLabelText('Evidence'), { target: { value: 'Catalog evidence' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '99' } });
  expect((screen.getByLabelText('Basis') as HTMLSelectElement).value).toBe('OPERATOR_MANUAL');
  expect((screen.getByLabelText('Evidence') as HTMLInputElement).value).toBe('');
});
it('substitution preserves original recipe, clears price and can restore original', () => {
  const h = mount(); fireEvent.change(screen.getByLabelText('Replacement'), { target: { value: 'next' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Approved specification' } });
  const saves = screen.getAllByRole('button', { name: 'Save' }); fireEvent.click(saves[saves.length - 1]);
  expect(h.doc().occurrences.w.overrides.r.substitution?.resource.id).toBe('next');
  expect(h.doc().occurrences.w.recipe[0].resource?.id).toBe('original');
  expect((screen.getByLabelText('Candidates') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Restore')); expect(h.doc().occurrences.w.overrides.r.substitution).toBeNull();
});
it('wrong resource group is blocked even with reason and conversion evidence', () => {
  mount(); fireEvent.change(screen.getByLabelText('Replacement'), { target: { value: 'wrong' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Reason' } });
  fireEvent.change(screen.getByLabelText('Conversion evidence'), { target: { value: 'Evidence' } });
  expect(screen.getByRole('status').textContent).toBe('Review required');
  const saves = screen.getAllByRole('button', { name: 'Save' }); expect((saves[saves.length - 1] as HTMLButtonElement).disabled).toBe(true);
});
it('command failures display safe user text, not RPC internals', () => {
  mount(() => { throw new Error('PGRST202 private SQL'); });
  fireEvent.submit(screen.getByLabelText('Quantity').closest('form')!);
  expect(screen.getByRole('alert').textContent).toBe('Action failed');
});
it('switching tenant clears the previous inspector and its unsaved price', () => {
  const doc = fixture(); doc.context.companyId = 1;
  const view = render(<EstimateEditingWorkspace doc={doc} labels={labels} command={() => true} />);
  fireEvent.click(screen.getByText('Pick'));
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '999' } });
  const next = structuredClone(doc); next.context.companyId = 2;
  view.rerender(<EstimateEditingWorkspace doc={next} labels={labels} command={() => true} />);
  expect(screen.queryByLabelText('Price')).toBeNull();
  expect(screen.getByText('Choose')).toBeTruthy();
});
it('moving a work preserves stable work identity and resource source', () => {
  const doc = fixture(); doc.rootOrder.push('target');
  doc.sections.target = { id: 'target', name: 'Other section', parentId: null, children: [], items: [] };
  let result = doc;
  render(<EstimateEditingWorkspace doc={doc} labels={labels} command={c => { result = applyCommand(doc, c); return true; }} />);
  fireEvent.click(screen.getByText('Pick'));
  fireEvent.change(screen.getByLabelText('Move'), { target: { value: 'target' } });
  expect(result.occurrences.w.sectionId).toBe('target');
  expect(result.sections.s.items).toEqual([]); expect(result.sections.target.items).toEqual(['w']);
  expect(result.occurrences.w.recipe).toEqual(doc.occurrences.w.recipe);
});
it('basis change uses explicit source evidence and recomputes resource quantity', () => {
  const h = mount();
  fireEvent.change(screen.getByLabelText('Norm basis'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Norm evidence'), { target: { value: '' } });
  const form = screen.getByLabelText('Norm basis').closest('form')!;
  expect(form.querySelector('button')!.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Norm evidence'), { target: { value: 'Approved norm per 100 m3' } });
  fireEvent.submit(form);
  expect(h.doc().occurrences.w.basis.scale).toBe('100');
  expect(h.doc().occurrences.w.basis.origin).toBe('OPERATOR');
  expect(screen.getByText(/0.040400/)).toBeTruthy();
});
it('clearing unknown basis does not turn resource quantity into zero', () => {
  const h = mount(); fireEvent.change(screen.getByLabelText('Norm basis'), { target: { value: '' } });
  fireEvent.submit(screen.getByLabelText('Norm basis').closest('form')!);
  expect(h.doc().occurrences.w.basis.scale).toBeNull();
  expect(screen.getByText('Quantity: Unknown · Amount: Unknown')).toBeTruthy();
});
