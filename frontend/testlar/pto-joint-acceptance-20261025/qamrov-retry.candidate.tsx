import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JurnalIsh } from '../../src/lib/fakt-jurnal';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), id: 0, scenario: 0 }));
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
const base = () => ({ sarlavha: 'Synthetic scope', holatMap: new Map(), obyektId: 8, kompaniyaId: 1000 + m.scenario,
  sana: '2026-10-25', onYop: vi.fn(), onBajarildi: vi.fn(), aktBekor: vi.fn(async () => ({ ok: true })) });
const save = () => fireEvent.click(screen.getByRole('button', { name: /^Faktga yozish/ }));
beforeEach(() => { m.id = 0; m.scenario++; m.yoz.mockReset(); m.toast.mockReset(); });
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

it('CONTROL: actual parent retains the scope snapshot after partial success and a state refresh', async () => {
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
  // FaktJurnal stores qamrov.ishlar in state: parent refresh replaces holatMap, NOT this snapshot.
  const refreshed = new Map(rows.slice(0, 3000).map((q) => [q.id, { qator_id: q.id, smeta_hajm: 100, fakt_hajm: 100 }]));
  view.rerender(<FaktQamrov {...p} ishlar={rows} holatMap={refreshed} />);
  save();
  await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(4));
  const first = m.yoz.mock.calls[0][0];
  const retry = m.yoz.mock.calls[2][0];
  expect(retry).toEqual(first);
  expect(m.yoz.mock.calls[3][0]).toEqual(m.yoz.mock.calls[1][0]);
  expect(p.onYop).toHaveBeenCalledTimes(1);
  expect(persistedIds.has(rows[3000].id)).toBe(true);
});

it('OPEN JQA-08: close and reopen after an accepted-but-unknown response must not duplicate the same scope', async () => {
  const p = base();
  const rows = [row(10)];
  const accepted = new Set<string>();
  let persisted = 0;
  m.yoz.mockImplementation(async (r: { operationId: string; qatorlar: { hajm: number }[] }) => {
    if (!accepted.has(r.operationId)) { accepted.add(r.operationId); persisted += r.qatorlar[0].hajm; }
    if (m.yoz.mock.calls.length === 1) throw new Error('synthetic reply lost after commit');
    return { ok: true, akt_id: accepted.size };
  });
  function Parent() {
    const [open, setOpen] = useState(true);
    // Same lifecycle as FaktJurnal: onYop clears qamrov; onBajarildi refreshes states.
    return <><button onClick={() => setOpen(true)}>Open scope</button>{open &&
      <FaktQamrov {...p} ishlar={rows} onYop={() => setOpen(false)} />}</>;
  }
  render(<Parent />);
  save();
  await waitFor(() => expect(screen.getByRole('button', { name: /^Faktga yozish/ }).hasAttribute('disabled')).toBe(false));
  expect(p.onBajarildi).not.toHaveBeenCalled(); // Parent has received no confirmed receipt or refreshed totals.
  fireEvent.click(screen.getByRole('button', { name: 'Yopish' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open scope' }));
  save();
  await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(2));
  expect(persisted).toBe(100); // Both clicks refer to the same unknown attempt, not two actual work events.
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

it('OPEN JQA-09: discarding a partially confirmed attempt must not apply accepted quantities again', async () => {
  const rows = Array.from({ length: 3001 }, (_, i) => row(i + 10));
  const accepted = new Map<string, number>();
  const persisted = new Map<number, number>();
  m.yoz.mockImplementation(async (r: { operationId: string; qatorlar: { qator_id: number; hajm: number }[] }) => {
    if (m.yoz.mock.calls.length === 2) return { ok: false, code: 'SYNTHETIC_LINE_REJECTED', error: 'Synthetic rejection before commit' };
    const previous = accepted.get(r.operationId);
    if (previous) return { ok: true, takror: true, akt_id: previous };
    const id = accepted.size + 1;
    accepted.set(r.operationId, id);
    r.qatorlar.forEach((q) => persisted.set(q.qator_id, (persisted.get(q.qator_id) ?? 0) + q.hajm));
    return { ok: true, akt_id: id };
  });
  const p = base();
  const view = render(<FaktQamrov {...p} ishlar={rows} />);
  save();
  await waitFor(() => expect(p.onBajarildi).toHaveBeenCalledTimes(1));
  // Actual FaktJurnal refresh preserves qamrov.ishlar, but replaces the holatMap.
  const refreshed = new Map(rows.slice(0, 3000).map((q) => [q.id, { qator_id: q.id, smeta_hajm: 100, fakt_hajm: 100 }]));
  view.rerender(<FaktQamrov {...p} ishlar={rows} holatMap={refreshed} />);
  fireEvent.click(screen.getByTestId('urinish-tashla'));
  save();
  await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(4));
  expect(persisted.get(rows[0].id)).toBe(100); // Clearing failed attempt must not turn known success into a new write.
});
