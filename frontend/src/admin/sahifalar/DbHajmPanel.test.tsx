import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DbHajmPanel } from './DbHajmPanel';

afterEach(() => vi.unstubAllGlobals());
const MB = 1024 * 1024;
const javob = (foiz: number, daraja: 'ok' | 'ogoh' | 'xavf') => ({
  ok: true, db_bytes: foiz * 5 * MB, limit_bytes: 500 * MB, foiz, daraja,
  top: [{ sxema: 'public', jadval: 't2_qator', bytes: 125 * MB, qator: 1 }, { sxema: 'snapshot', jadval: 'bolak_mazmun', bytes: 89 * MB, qator: 1 }],
  snapshot_sovuq: { sovuq_blok: 3, issiq_bayt: 85 * MB },
});
const stub = (j: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(j), { status })));

describe('DbHajmPanel', () => {
  it('80% dan past — ogohlantirishsiz; eng katta jadvallar ko‘rinadi', async () => {
    stub(javob(60, 'ok')); render(<DbHajmPanel />);
    expect(await screen.findByText('snapshot.bolak_mazmun')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('84% — ogohlantirish (80%)', async () => {
    stub(javob(84.2, 'ogoh')); render(<DbHajmPanel />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/80%/));
  });
  it('93% — xavf (90%)', async () => {
    stub(javob(93, 'xavf')); render(<DbHajmPanel />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/90%/));
  });
  it('403 — jim emas, aniq xabar', async () => {
    stub({ ok: false, code: 'SUPERADMIN_REQUIRED' }, 403); render(<DbHajmPanel />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/SUPERADMIN_REQUIRED/));
  });
});
