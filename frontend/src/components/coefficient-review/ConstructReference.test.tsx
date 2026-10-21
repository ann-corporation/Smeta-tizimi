import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConstructReference } from './ConstructReference';
import { CONSTRUCT_REFERENCE, type ConstructResult } from '../../lib/smeta-studio/construct-koef';
const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../lib/smeta-studio/construct-koef', async original => ({ ...await original<typeof import('../../lib/smeta-studio/construct-koef')>(), loadConstructCandidates: mock.load }));
afterEach(() => { cleanup();mock.load.mockReset(); });
const works = [{ id: 'work', code: 'E1-1-1-1', name: 'SYNTHETIC WORK', edition: 'OTHER EDITION' }];
const result = (status: ConstructResult['status']): ConstructResult => ({ ok: true, status, workKey: 'Е01-01-001-1', edition: CONSTRUCT_REFERENCE.edition,
  sourceSha256: CONSTRUCT_REFERENCE.sourceSha256, referenceSha256: CONSTRUCT_REFERENCE.sha256, canApply: false, total: 0, offset: 0, limit: 20, candidates: [] });
describe('R2 source evidence UI', () => {
  it('distinguishes unknown identity from a known source work without rules; never offers application', async () => {
    mock.load.mockResolvedValueOnce(result('UNKNOWN_WORK')).mockResolvedValueOnce(result('NO_SOURCE_CANDIDATES'));
    render(<ConstructReference works={works} />);
    fireEvent.click(screen.getByText('Manbada tekshirish'));
    await waitFor(() => expect(screen.getByText('Bu ish manba paketida mavjud emas.')).toBeTruthy());
    fireEvent.click(screen.getByText('Manbada tekshirish'));
    await waitFor(() => expect(screen.getByText('Ish mavjud, lekin ushbu manbada unga bog‘langan koeffitsient yo‘q.')).toBeTruthy());
    expect(screen.queryByText('Qoralamaga qo‘llash')).toBeNull();
    expect(screen.getByText(/Bir xil kod boshqa tahrirda teng norma degani emas/)).toBeTruthy();
    expect(screen.getByText(new RegExp(CONSTRUCT_REFERENCE.sourceSha256))).toBeTruthy();
  });
  it('aborts a request when its work key changes and ignores its late response', async () => {
    let resolve!: (r: ConstructResult) => void;
    mock.load.mockImplementationOnce(() => new Promise<ConstructResult>(r => { resolve = r; }));
    render(<ConstructReference works={works} />);
    fireEvent.click(screen.getByText('Manbada tekshirish'));
    const signal = mock.load.mock.calls[0][3] as AbortSignal;
    fireEvent.change(screen.getByLabelText('Manbadagi to‘liq ish kodi'), { target: { value: 'Е03-01-001-1' } });
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(result('UNKNOWN_WORK')); });
    expect(screen.queryByText('Bu ish manba paketida mavjud emas.')).toBeNull();
    expect((screen.getByText('Manbada tekshirish') as HTMLButtonElement).disabled).toBe(false);
  });
});
