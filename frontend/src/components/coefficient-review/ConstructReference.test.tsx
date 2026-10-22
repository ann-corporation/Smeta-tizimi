import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConstructReference } from './ConstructReference';
import { CONSTRUCT_REFERENCE, type ConstructResult } from '../../lib/smeta-studio/construct-koef';
const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../lib/smeta-studio/construct-koef', async original => ({ ...await original<typeof import('../../lib/smeta-studio/construct-koef')>(), loadConstructCandidates: mock.load }));
afterEach(() => { cleanup(); mock.load.mockReset(); });
const works = [{ id: 'work', code: 'E1-1-1-1', name: 'TEST WORK', edition: 'TEST' }];
const result: ConstructResult = { ok: true, status: 'NO_SOURCE_CANDIDATES', workKey: 'Е01-01-001-1', edition: CONSTRUCT_REFERENCE.edition,
 sourceSha256: CONSTRUCT_REFERENCE.sourceSha256, referenceSha256: CONSTRUCT_REFERENCE.sha256, canApply: false, total: 0, offset: 0, limit: 20, candidates: [] };
function open() { const details = screen.getByText('Qo‘shimcha normativ shartlar').closest('details')!; details.open = true; fireEvent(details, new Event('toggle')); }
it('binds lookup to this work and hides extraction program/audit identifiers', async () => {
 mock.load.mockResolvedValue(result); const view = render(<ConstructReference works={works} />); open();
 await screen.findByText('Bu ish uchun qo‘shimcha normativ shart topilmadi.');
 expect(mock.load).toHaveBeenCalledWith('E1-1-1-1', 0);
 expect(view.container.textContent).not.toMatch(/Construct|audit-|SHA|9837657/);
 expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByText('Qoralamaga qo‘llash')).toBeNull();
});
it('ignores a late response belonging to another work', async () => {
 let finish!: (r: ConstructResult) => void; mock.load.mockImplementationOnce(() => new Promise(r => { finish = r; }));
 const view = render(<ConstructReference works={works} />); open(); await waitFor(() => expect(mock.load).toHaveBeenCalled());
 view.rerender(<ConstructReference works={[{ ...works[0], code:'E3-1-1-1' }]} />);
 await act(async () => { finish(result); });
 expect(screen.queryByText('Bu ish uchun qo‘shimcha normativ shart topilmadi.')).toBeNull();
});
