import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { KoeffitsientlarPaneli } from './StudioKoeffitsientlar';
import { applyCommand, type StudioCommand } from '../../lib/smeta-studio/commands';
import { emptyDoc, type EstimateDoc, type Occurrence } from '../../lib/smeta-studio/model';
import { agentChaqir } from './studioAgent';
import { calcDoc } from '../../lib/smeta-studio/calc';
vi.mock('../../lib/smeta-studio/koef-katalog', async original => ({ ...await original<typeof import('../../lib/smeta-studio/koef-katalog')>(),
  koefKatalogi: async () => ({ schema: 'koef-katalog-v1', manba: 'SYNTHETIC', jadval: { '1-1-1': ['test'] },
    koef: { test: { a: 'TEST ONLY', t: 'TEST CONDITION', s: 'TEST SITE CONDITION', q: '', k: { МАТ: 1.2 }, op: 'MUL' } } }) }));
const resource = { id: 'r', code: 'TEST', name: 'SYNTHETIC MATERIAL', type: 'M', unitCode: '003' };
afterEach(cleanup);
function Harness({ inline = false, agent = false }: { inline?: boolean; agent?: boolean }) {
  const o: Occurrence = { id: 'o', sectionId: 's', source: { catalogRevision: 'fixture', workId: 'w', code: 'E1-1-1-1', name: 'TEST WORK', unitCode: '003', tableLabel: null },
    quantity: '1', basis: { scale: '1', unitLabel: 'м3', evidence: 'TEST ONLY', origin: 'OPERATOR' },
    recipe: [{ recipeId: 'line', resource, status: 'EXACT', norm: '2', candidates: [resource], candidateCount: 1, prices: [], priceCount: 0 }], overrides: {} };
  const [doc, setDoc] = useState<EstimateDoc>({ ...emptyDoc('test'), rootOrder: ['s'], sections: { s: { id: 's', name: 'TEST', parentId: null, children: [], items: ['o'] } }, occurrences: { o } });
  function command(c: StudioCommand) { setDoc(d => applyCommand(d, c));return true; }
  return <><KoeffitsientlarPaneli doc={doc} command={command} workId={inline ? 'o' : undefined} agentOnly={agent} /><output data-testid="quantity">{calcDoc(doc).occurrences.o.lines[0].quantity}</output></>;
}
describe('coefficient review integration', () => {
  it('previews real resource quantities and unknown money; no write until explicit condition confirmation', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByText(/Normativ koeffitsientlar \(1\)/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Normativ koeffitsientlar \(1\)/));
    fireEvent.click(screen.getByText('Ta’sirini ko‘rish'));
    expect(screen.getByTestId('quantity').textContent).toBe('2.000000');
    expect(screen.getByText('2.400000')).toBeTruthy();
    const apply = screen.getByText('Qoralamaga qo‘llash') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(screen.getByText(/Hisob to‘liq emas: noma’lum qiymatlar saqlanadi\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(apply);
    expect(screen.getByTestId('quantity').textContent).toBe('2.400000');
    fireEvent.click(screen.getByText('Bekor qilish'));
    expect(screen.getByTestId('quantity').textContent).toBe('2.000000');
  });
});

it('shows applicable suggestions directly under one work, without a work/code search', async () => {
 render(<Harness inline />);
 await screen.findByText('TEST SITE CONDITION');
 expect(screen.queryByLabelText('Ish')).toBeNull();
 expect(screen.queryByLabelText('Manbadagi to‘liq ish kodi')).toBeNull();
 expect(screen.queryByText(/Construct/)).toBeNull();
 expect(screen.getByText('Ta’sirini ko‘rish')).toBeTruthy();
});
it('AI apply handler works without a visible global coefficient window and uses current document', async () => {
 render(<Harness agent />);
 await act(async () => { await agentChaqir('koef_qolla', {tur:'koef_qolla',ish:'i1',qiymat:'test',manba:'TEST USER CONDITION',izoh:''}, () => {}); });
 expect(screen.getByTestId('quantity').textContent).toBe('2.400000');
 await act(async () => { await agentChaqir('koef_qolla', {tur:'koef_qolla',ish:'i1',qiymat:'test',manba:'TEST USER CONDITION',izoh:''}, () => {}); });
 expect(screen.getByTestId('quantity').textContent).toBe('2.400000');
});
