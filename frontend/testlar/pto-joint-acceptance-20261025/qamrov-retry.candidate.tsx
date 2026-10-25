import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JurnalIsh } from '../../src/lib/fakt-jurnal';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), id: 0 }));
vi.mock('../../src/api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../src/api/supabase', () => ({ yangiOperationId: () => `synthetic-operation-${++m.id}`, sbT2AktBekor: vi.fn() }));
vi.mock('../../src/umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../src/umumiy/ui/SummaJuft', () => ({ SummaJuft: () => <span>Amount fixture</span> }));
vi.mock('../../src/lib/hotkeys/useHotkeys', () => ({ useHotkeys: vi.fn() }));
vi.mock('../../src/i18n/til', () => ({ t: (s: string, p?: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => p?.[k] ?? k) }));
import { FaktQamrov } from '../../src/admin/sahifalar/FaktQamrov';

function row(id: number): JurnalIsh {
  return { id, tur: 'bl', kod: null, nom: `Synthetic work ${id}`, birlik: 'm3',
    smeta: 100, fakt: 0, qoldiq: 100, f2Mumkin: 0, ulush: 0, holat: 'yangi', norma: null,
    qoshimcha: false, zamena: false, otaId: 1, otaVersiya: 1, kat: null,
    almashtiradi: null, aslNom: null, almashtirilgan: null, bajarilmaydi: null,
    resurslar: [], avtomatik: [] };
}
const base = () => ({ sarlavha: 'Synthetic scope', holatMap: new Map(), obyektId: 8, kompaniyaId: 1,
  sana: '2026-10-25', onYop: vi.fn(), onBajarildi: vi.fn(), aktBekor: vi.fn(async () => ({ ok: true })) });
const save = () => fireEvent.click(screen.getByRole('button', { name: /^Faktga yozish/ }));
beforeEach(() => { m.id = 0; m.yoz.mockReset(); m.toast.mockReset(); });
afterEach(cleanup);

it('OPEN JQA-04: unknown result retry must preserve the original request body even after editing percent', async () => {
  m.yoz.mockRejectedValueOnce(new Error('synthetic lost reply')).mockResolvedValue({ ok: true, akt_id: 1 });
  render(<FaktQamrov {...base()} ishlar={[row(10)]} />);
  save();
  await waitFor(() => expect(screen.getByRole('button', { name: /^Faktga yozish/ }).hasAttribute('disabled')).toBe(false));
  expect(m.yoz).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Bajarilish foizi'), { target: { value: '50' } });
  save();
  await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(2));
  // A stable ID protects only an immutable command. A new preview cannot replace an unknown attempt.
  expect(m.yoz.mock.calls[1][0]).toEqual(m.yoz.mock.calls[0][0]);
});

it('OPEN JQA-05: partial write plus refreshed remaining rows must not reuse the first chunk ID for different rows', async () => {
  const rows = Array.from({ length: 3001 }, (_, i) => row(i + 10));
  const accepted = new Map<string, { akt_id: number }>();
  const persistedIds = new Set<number>();
  let n = 0;
  m.yoz.mockImplementation(async (p: { operationId: string; qatorlar: { qator_id: number }[] }) => {
    n++;
    if (n === 2) return { ok: false, error: 'synthetic second chunk unavailable' };
    // Live t2_akt_yarat readback: an existing operation_id returns its old act, before reading new rows.
    const receipt = accepted.get(p.operationId);
    if (receipt) return { ok: true, takror: true, ...receipt };
    const created = { akt_id: accepted.size + 1 };
    accepted.set(p.operationId, created);
    p.qatorlar.forEach((q) => persistedIds.add(q.qator_id));
    return { ok: true, ...created };
  });
  const p = base();
  const view = render(<FaktQamrov {...p} ishlar={rows} />);
  save();
  await waitFor(() => expect(p.onBajarildi).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Faktga yozish/ }).hasAttribute('disabled')).toBe(false));
  // Parent refresh: the first 3000 rows now have no open remainder. Only the failed last row remains.
  view.rerender(<FaktQamrov {...p} ishlar={rows.slice(3000)} />);
  save();
  await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(3));
  const first = m.yoz.mock.calls[0][0];
  const retry = m.yoz.mock.calls[2][0];
  expect(retry.qatorlar).not.toEqual(first.qatorlar);
  // Reusing this ID resolves to the already accepted chunk or a command conflict, never the failed chunk.
  expect.soft(retry.operationId).not.toBe(first.operationId);
  expect(p.onYop).toHaveBeenCalledTimes(1); // UI has already reported completion.
  expect(persistedIds.has(rows[3000].id)).toBe(true); // Last row must actually have been accepted.
});

it('CONTROL: an unchanged unknown-result retry keeps exactly the same command', async () => {
  m.yoz.mockRejectedValueOnce(new Error('synthetic lost reply')).mockResolvedValue({ ok: true, akt_id: 1 });
  render(<FaktQamrov {...base()} ishlar={[row(10)]} />);
  save();
  await waitFor(() => expect(screen.getByRole('button', { name: /^Faktga yozish/ }).hasAttribute('disabled')).toBe(false));
  save();
  await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(2));
  expect(m.yoz.mock.calls[1][0]).toEqual(m.yoz.mock.calls[0][0]);
});
