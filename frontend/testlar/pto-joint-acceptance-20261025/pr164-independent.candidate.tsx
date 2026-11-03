import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PQator } from '../../src/lib/pereraschet';
import { faktPereraschetHisobla, farqYuk, qaytaYuk, stornoYuk } from '../../src/lib/pereraschet-fakt';
import { pereraschetFaktXlsx } from '../../src/lib/pereraschet-export';

const mocks = vi.hoisted(() => ({
  create: vi.fn(async (_p: unknown) => ({ ok: true })),
  confirm: vi.fn<() => Promise<boolean>>(),
  token: vi.fn(async (_p: unknown, work: () => Promise<unknown>) => work()),
  operationSequence: 0,
}));

vi.mock('../../src/api/supabase', () => ({
  sbT2AktYaratV2: mocks.create,
  yangiOperationId: () => {
    mocks.operationSequence += 1;
    return `00000000-0000-4000-8000-${String(mocks.operationSequence).padStart(12, '0')}`;
  },
}));
vi.mock('../../src/api/t2-token', () => ({ tokenBilan: mocks.token }));
vi.mock('../../src/lib/token-hujjat', () => ({ hujjatTokenBilan: vi.fn() }));
vi.mock('../../src/lib/construction-document-control/export/download-helper', () => ({ downloadBlob: vi.fn() }));
vi.mock('../../src/lib/f2-dublikat/tekshiruv', () => ({
  bloklarmi: () => false,
  dublikatTekshiruv: () => [],
  ESKI_SMETA: { test: () => false },
}));
vi.mock('../../src/umumiy/ui/Tasdiq', () => ({ tasdiqSora: mocks.confirm }));
vi.mock('../../src/umumiy/ui/useUstamaliSumma', () => ({ useUstamaliSumma: () => ({ hisobla: () => ({ ustamali: 0, nomalum: { summa: 0 } }) }) }));
vi.mock('../../src/umumiy/ui/SummaJuft', () => ({ SummaJuft: () => null }));
vi.mock('../../src/components/nakopitelniy/PereraschetGrafik', () => ({
  IkkiTomonQator: () => null, MiniFarq: () => null, Eksa: ({ children }: { children: React.ReactNode }) => <>{children}</>, Rang: () => null,
}));

import { PereraschetFakt } from '../../src/admin/sahifalar/PereraschetFakt';

const row = (id: number, p: Partial<PQator> = {}): PQator => ({
  qator_id: id, ota_id: 2, tur: 'mat', kod: `SYN-${id}`, nom: `Synthetic line ${id}`, birlik: 'm3', kat: 'МАТ',
  smeta_hajm: 10, smeta_narx: 100, fakt_hajm: 5, fakt_summa: 500,
  f2_hajm: 2, f2_summa: 200, f2_summa_nomalum: 0, almashtirilgan_hajm: 0, fakt_manbasi: 'DIRECT', ...p,
});
const rows = (qs: PQator[]) => [{ qator_id: 1, ota_id: null, tur: 'rz', nom: 'Synthetic section' } as PQator,
  { qator_id: 2, ota_id: 1, tur: 'bl', nom: 'Synthetic group' } as PQator, ...qs];
const props = (qs: PQator[], obyektId = 41) => ({
  companyId: 7, obyektId, obyektNom: 'Synthetic object', tomonlar: {}, ndsFoiz: null,
  rows: rows(qs), qoshimcha: new Set<number>(), bolim: null, bolimNomi: null,
  aktlar: [], onYaratildi: vi.fn(),
});

afterEach(() => { vi.clearAllMocks(); });

describe('PR164 independent synthetic QA', () => {
  it('strict oracle: full storno + reissue and delta agree by signed amount across mixed rows', () => {
    const n = faktPereraschetHisobla(rows([
      row(3, { fakt_hajm: 5, f2_hajm: 2, f2_summa: 200 }),
      row(4, { fakt_hajm: 1, f2_hajm: 4, f2_summa: 450 }),
      row(5, { smeta_hajm: 0, f2_hajm: 3, f2_summa: 180 }),
    ]));
    const s = stornoYuk(n); const q = qaytaYuk(n); const d = farqYuk(n);
    expect(s.jami + q.jami).toBe(n.jami.sof);
    expect(d.jami + d.sigmadi.summa).toBe(n.jami.sof);
    expect(s.jami + q.jami).toBe(d.jami + d.sigmadi.summa);
    expect(n.jami.sof).toBe(-230);
  });

  it('NULL remains review-only while explicit zero price remains a counted zero-priced line', () => {
    const n = faktPereraschetHisobla(rows([
      row(3, { smeta_narx: null, fakt_hajm: 3, f2_hajm: 2, f2_summa: 200 }),
      row(4, { smeta_narx: 0, fakt_hajm: 3, f2_hajm: 2, f2_summa: 200 }),
      row(5, { f2_summa_nomalum: 1, f2_summa: 200 }),
    ]));
    expect(n.tekshirish.map((p) => p.qatorId).sort()).toEqual([3, 5]);
    expect(n.hisobda.map((p) => p.qatorId)).toEqual([4]);
    expect(n.jami.sof).toBe(-200);
  });

  it('zero quantity with nonzero certified money remains visible in both sheet totals and draft omission accounting', () => {
    const n = faktPereraschetHisobla(rows([row(3, { fakt_hajm: 0, f2_hajm: 0, f2_summa: 275 })]));
    const s = stornoYuk(n); const d = farqYuk(n);
    expect(s.qatorlar).toHaveLength(0);
    expect(s.sigmadi).toEqual({ soni: 1, summa: -275, idlar: [3] });
    expect(d.qatorlar).toHaveLength(0);
    expect(d.sigmadi).toEqual({ soni: 1, summa: -275, idlar: [3] });
    const workbook = pereraschetFaktXlsx(n, { obyektNomi: 'Synthetic', ndsFoiz: null, ustamali: null, sana: '2026-10-26' });
    expect(workbook.bytes.length).toBeGreaterThan(1000);
  });

  it('strict oracle: confirmation cannot persist after the selected object scope unmounts', async () => {
    let resolveConfirm!: (ok: boolean) => void;
    mocks.confirm.mockImplementation(() => new Promise<boolean>((resolve) => { resolveConfirm = resolve; }));
    const view = render(<MemoryRouter><PereraschetFakt {...props([row(3)], 41)} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: 'QA-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Faqat farq' }));
    fireEvent.click(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    view.unmount();
    resolveConfirm(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('accepted current scope creates a new draft with the computed delta and does not approve or replace an existing F2', async () => {
    mocks.confirm.mockResolvedValue(true);
    render(<MemoryRouter><PereraschetFakt {...props([row(3)], 52)} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: 'QA-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Faqat farq' }));
    fireEvent.click(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      obyektId: 52, raqam: 'QA-2', oy: expect.stringMatching(/^\d{4}-\d{2}-01$/),
      qatorlar: [expect.objectContaining({ qatorId: 3, certifiedQuantity: 3, certifiedAmount: 300 })],
    }));
    expect(mocks.token).toHaveBeenCalledTimes(1);
  });

  it('strict oracle: partial storno/reissue retry never reuses an accepted operation ID for edited content or marks the old attempt complete', async () => {
    const initial = props([row(3)], 63);
    const apiLedger = new Map<string, unknown>();
    const sent: Array<Record<string, unknown>> = [];
    mocks.confirm.mockResolvedValue(true);
    mocks.create.mockImplementation(async (arg: unknown) => {
      const payload = arg as Record<string, unknown>;
      const id = String(payload.operationId);
      sent.push(payload);
      if (sent.length === 1) { apiLedger.set(id, payload); return { ok: true }; } // synthetic confirmed storno receipt
      if (sent.length === 2) return { ok: false, error: 'synthetic reissue failure' };
      if (apiLedger.has(id)) return { ok: true, takror: true }; // synthetic idempotency replay; no new body applied
      apiLedger.set(id, payload);
      return { ok: true };
    });

    const view = render(<MemoryRouter><PereraschetFakt {...initial} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: 'QA-3' } });
    fireEvent.click(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(sent[0].operationId).not.toBe(sent[1].operationId); // distinct UUIDs for the two halves
    await waitFor(() => expect(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ })).toHaveProperty('disabled', false));

    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: 'QA-4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Faqat farq' }));
    view.rerender(<MemoryRouter><PereraschetFakt {...initial} rows={rows([row(9, { fakt_hajm: 4, f2_hajm: 1, f2_summa: 80 })])} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ }));
    await act(async () => { await Promise.resolve(); });

    const confirmedStorno = sent[0];
    expect(apiLedger.get(String(confirmedStorno.operationId))).toBe(confirmedStorno);
    const bodies = new Map<string, string>();
    for (const payload of sent) {
      const id = String(payload.operationId); const body = JSON.stringify(payload);
      if (bodies.has(id)) expect(body, 'same operation_id must retain identical payload').toBe(bodies.get(id));
      else bodies.set(id, body);
    }
  });

  it('strict oracle: unknown first response followed by edited retry uses a fresh operation ID or blocks for reconciliation', async () => {
    const initial = props([row(3)], 64);
    const sent: Array<Record<string, unknown>> = [];
    const apiLedger = new Map<string, unknown>();
    mocks.confirm.mockResolvedValue(true);
    mocks.create.mockImplementation(async (arg: unknown) => {
      const payload = arg as Record<string, unknown>;
      const id = String(payload.operationId);
      sent.push(payload);
      if (sent.length === 1) {
        apiLedger.set(id, payload);
        throw new Error('synthetic response lost after possible acceptance');
      }
      if (apiLedger.has(id)) return { ok: true, takror: true };
      apiLedger.set(id, payload);
      return { ok: true };
    });
    const view = render(<MemoryRouter><PereraschetFakt {...initial} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: 'QA-5' } });
    fireEvent.click(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ })).toHaveProperty('disabled', false));
    view.rerender(<MemoryRouter><PereraschetFakt {...initial} rows={rows([row(10, { fakt_hajm: 6, f2_hajm: 1, f2_summa: 100 })])} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Pereraschet F2 qoralamasi/ }));
    await act(async () => { await Promise.resolve(); });

    const bodies = new Map<string, string>();
    for (const payload of sent) {
      const id = String(payload.operationId); const body = JSON.stringify(payload);
      if (bodies.has(id)) expect(body, 'unknown response must not permit edited payload under original UUID').toBe(bodies.get(id));
      else bodies.set(id, body);
    }
  });
});
