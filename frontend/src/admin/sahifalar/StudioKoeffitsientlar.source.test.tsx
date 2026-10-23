import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { emptyDoc, type WorkSource } from '../../lib/smeta-studio/model';
import { agentChaqir } from './studioAgent';
import { KoeffitsientlarPaneli } from './StudioKoeffitsientlar';

const libraryGate = vi.hoisted(() => ({ pending: null as Promise<void> | null }));

vi.mock('../../lib/smeta-studio/koef-katalog', async () => {
  const actual = await vi.importActual<typeof import('../../lib/smeta-studio/koef-katalog')>('../../lib/smeta-studio/koef-katalog');
  return { ...actual, koefKatalogi: vi.fn(async () => ({ schema: 'koef-katalog-v1', manba: 'test', koef: { OLD: { a: 'test', t: 'test', s: 'legacy condition', q: '', k: { ЧЕЛ: 2 } } }, jadval: { '1-1-30': ['OLD'] } })) };
});
vi.mock('../../lib/smeta-studio/norm-library-coefficients', async () => {
  const actual = await vi.importActual<typeof import('../../lib/smeta-studio/norm-library-coefficients')>('../../lib/smeta-studio/norm-library-coefficients');
  return { ...actual, coefficientCatalogsForDoc: (doc: Parameters<typeof actual.coefficientCatalogsForDoc>[0], legacy: Parameters<typeof actual.coefficientCatalogsForDoc>[1]) => actual.coefficientCatalogsForDoc(doc, legacy, async () => { await libraryGate.pending; return actual.sourceCoefficientCatalog({ revision: actual.COEFFICIENT_SOURCE_REVISION, status: 'SOURCE_CANDIDATES_NOT_AUTOMATIC_ACCEPTANCE', rules: [{ id: 1, kind: 'Е', cc: '01', code: '3.4', title: 'source condition', basis: 'test basis', labour: 1, machines: 0.95, materials: 1 }], targets: [{ correction_id: 1, otdel: '01', tbl: '030', n_from: 1, n_to: 4 }] }); }) };
});

it('source changes reload catalogues and manual/AI apply share source candidates without legacy fallback', async () => {
  const rev = '66bb1a23bd18c63006d447b5';
  const oldSource: WorkSource = { catalogRevision: 'old', workId: 'old', code: 'E1-1-30-1', name: 'work', unitCode: 'm3', tableLabel: null };
  const doc = emptyDoc('test'); doc.rootOrder = ['s']; doc.sections.s = { id: 's', parentId: null, name: 'test', children: [], items: ['o'] };
  doc.occurrences.o = { id: 'o', sectionId: 's', source: oldSource, quantity: '1', basis: { scale: null, unitLabel: null, evidence: null, origin: null }, recipe: [], overrides: {} };
  const command = vi.fn((_cmd: StudioCommand) => true);
  const view = render(<><KoeffitsientlarPaneli doc={doc} command={command} agentOnly /><KoeffitsientlarPaneli doc={doc} command={command} workId="o" /></>);
  await screen.findByText('OLD');
  const next = structuredClone(doc); next.occurrences.o.source = { ...oldSource, code: 'Е01-01-030-1', catalogRevision: rev, workId: `norm-library:${rev}:Е01-01-030-1` };
  view.rerender(<><KoeffitsientlarPaneli doc={next} command={command} agentOnly /><KoeffitsientlarPaneli doc={next} command={command} workId="o" /></>);
  await screen.findByText('01-3.4'); expect(screen.queryByText('legacy condition')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Qo‘llash' }));
  const manual = command.mock.calls[0][0]; command.mockClear();
  await agentChaqir('koef_qolla', { tur: 'koef_qolla', ish: 'i1', qiymat: '01-3.4', manba: 'confirmed condition', izoh: 'test' }, () => {});
  await waitFor(() => expect(command).toHaveBeenCalledTimes(1));
  const ai = command.mock.calls[0][0];
  expect(ai).toMatchObject({ type: 'SET_COEFFICIENTS', occurrenceId: 'o' });
  const factors = (cmd: StudioCommand) => cmd.type === 'SET_COEFFICIENTS' ? cmd.coefficients.map(c => [c.id, c.scope, c.value, c.accepted]) : [];
  expect(factors(ai)).toEqual(factors(manual));
});




it('ignores a late library load after switching back to a legacy document', async () => {
  let release!: () => void;
  libraryGate.pending = new Promise<void>(resolve => { release = resolve; });
  const revision = '66bb1a23bd18c63006d447b5', key = 'Е01-01-030-1';
  const doc = emptyDoc('late-source');
  doc.occurrences.o = { id: 'o', sectionId: 's', source: { catalogRevision: revision, workId: `norm-library:${revision}:${key}`, code: key, name: 'test', unitCode: null, tableLabel: null }, quantity: null, basis: { scale: null, unitLabel: null, evidence: null, origin: null }, recipe: [], overrides: {} };
  const command = vi.fn((_cmd: StudioCommand) => true);
  const view = render(<KoeffitsientlarPaneli doc={doc} command={command} workId="o" />);
  const legacy = structuredClone(doc);
  legacy.occurrences.o.source = { ...legacy.occurrences.o.source, catalogRevision: 'old', workId: 'old', code: 'E1-1-30-1' };
  view.rerender(<KoeffitsientlarPaneli doc={legacy} command={command} workId="o" />);
  await screen.findByText('OLD');
  await act(async () => { release(); await libraryGate.pending; });
  libraryGate.pending = null;
  expect(screen.queryByText('01-3.4')).toBeNull();
  expect(screen.getByText('OLD')).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
});
