import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { emptyDoc, type EstimateDoc } from '../../lib/smeta-studio/model';
import { applyCommand, type StudioCommand } from '../../lib/smeta-studio/commands';
import { calcDoc } from '../../lib/smeta-studio/calc';
import { SmetaDocumentPanel, type DocumentPanelLabels } from './SmetaDocumentPanel';
vi.mock('./EstimateEditingWorkspace', () => ({ EstimateEditingWorkspace: ({ onTargetSection }: { onTargetSection: (id: string) => void }) =>
  <button onClick={() => onTargetSection('section-1')}>Pick section</button> }));
afterEach(cleanup);
const labels: DocumentPanelLabels = { title: 'Tree', search: 'Search', collapse: 'Collapse', sections: 'Sections', works: 'Works', resources: 'Resources',
  empty: 'Empty', invalid: 'Invalid', select: 'Select', expand: 'Expand', close: 'Close', inspector: 'Inspector', choose: 'Choose', quantity: 'Quantity',
  amount: 'Amount', unknown: 'Unknown', save: 'Save', failed: 'Action failed', name: 'Name', price: 'Price', evidence: 'Evidence', basis: 'Basis',
  priceBases: { OPERATOR_MANUAL: 'Manual', CATALOG_CANDIDATE: 'Catalog', CONTRACT_DRAFT: 'Contract', PROCUREMENT_ACTUAL: 'Actual' },
  candidates: 'Candidates', noCandidates: 'No candidates', source: 'Source', replacement: 'Replacement', reason: 'Reason', conversion: 'Conversion',
  conversionEvidence: 'Conversion evidence', blocked: 'Review required', restore: 'Restore', move: 'Move',
  object: 'Object', documentTitle: 'Document title', currency: 'Currency', newSection: 'New section', subsection: 'Subsection',
  targetSection: 'Target', knownAmount: 'Known subtotal', unresolved: 'Unresolved' };
function mount(initial = emptyDoc('draft')) {
  let current: EstimateDoc = initial, sequence = 0;
  const commands: StudioCommand[] = [];
  function Harness() {
    const [doc, setDoc] = useState(current), [target, setTarget] = useState<string | null>(null);
    return <SmetaDocumentPanel doc={doc} total={calcDoc(doc).total} labels={labels} targetSectionId={target}
      setTargetSection={setTarget} createId={() => `section-${++sequence}`} command={c => {
        commands.push(c); current = applyCommand(current, c); setDoc(current); return true;
      }} />;
  }
  render(<Harness />); return { doc: () => current, commands };
}
function add(name: string) {
  fireEvent.change(screen.getByLabelText('New section'), { target: { value: name } });
  fireEvent.submit(screen.getByLabelText('New section').closest('form')!);
}
it('creates root section through canonical command and makes it the catalog target', () => {
  const h = mount(); add('Foundations');
  expect(h.doc().rootOrder).toEqual(['section-1']); expect(screen.getByText('Target: Foundations')).toBeTruthy();
  expect(h.commands[0].type).toBe('ADD_SECTION');
});
it('creates child under selected section rather than guessing from the visible name', () => {
  const h = mount(); add('Foundations'); fireEvent.click(screen.getByLabelText('Subsection')); add('Concrete');
  expect(h.doc().sections['section-2'].parentId).toBe('section-1');
  expect(h.doc().sections['section-1'].children).toEqual(['section-2']);
});
it('current engine depth limit is reported safely, without partially adding another section', () => {
  const h = mount(); add('Foundations'); fireEvent.click(screen.getByLabelText('Subsection')); add('Concrete'); add('Too deep');
  expect(screen.getByRole('alert').textContent).toBe('Action failed');
  expect(Object.keys(h.doc().sections)).toHaveLength(2);
});
it('context labels do not silently replace canonical numeric object/project IDs', () => {
  const doc = emptyDoc('draft'); doc.context.objectId = 79; doc.context.projectId = 3; doc.context.companyId = 1;
  const h = mount(doc); fireEvent.change(screen.getByLabelText('Object'), { target: { value: 'Fast Food' } });
  fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Estimate July' } });
  fireEvent.submit(screen.getByLabelText('Object').closest('form')!);
  expect(h.doc().context).toMatchObject({ objectId: 79, projectId: 3, companyId: 1, objectLabel: 'Fast Food', title: 'Estimate July' });
});
it('blank section is not sent and subsection is blocked without a target', () => {
  const h = mount(); expect((screen.getByLabelText('Subsection') as HTMLInputElement).disabled).toBe(true);
  add('  '); expect(h.commands).toEqual([]);
});
it('invalid currency does not mutate the draft or leak an internal code', () => {
  const h = mount(); fireEvent.change(screen.getByLabelText('Currency'), { target: { value: '12' } });
  fireEvent.submit(screen.getByLabelText('Object').closest('form')!);
  expect(h.doc().currency).toBe('UZS'); expect(screen.getByRole('alert').textContent).toBe('Action failed');
});
it('context switch clears target without changing the initial authorized selection', () => {
  const doc = emptyDoc('draft'); doc.context.companyId = 1;
  doc.rootOrder = ['s']; doc.sections.s = { id: 's', name: 'Same visible name', parentId: null, children: [], items: [] };
  const setTarget = vi.fn();
  const view = render(<SmetaDocumentPanel doc={doc} total={calcDoc(doc).total} labels={labels}
    targetSectionId="s" setTargetSection={setTarget} command={() => true} />);
  expect(setTarget).not.toHaveBeenCalled();
  const other = structuredClone(doc); other.context.companyId = 2;
  view.rerender(<SmetaDocumentPanel doc={other} total={calcDoc(other).total} labels={labels}
    targetSectionId="s" setTargetSection={setTarget} command={() => true} />);
  expect(setTarget).toHaveBeenCalledExactlyOnceWith(null);
});
