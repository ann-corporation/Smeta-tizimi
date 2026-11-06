import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const m = vi.hoisted(() => ({ podvallar: vi.fn() }));
vi.mock('../../api/t2-akt-podval', () => ({ aktPodvallariniOl: m.podvallar }));
vi.mock('./F2PodvalBackfillOyna', () => ({
  F2PodvalBackfillOyna: (p: { onTugadi?: () => void }) => <button type="button" data-testid="backfill-oyna" onClick={() => p.onTugadi?.()}>backfill</button>,
}));
vi.mock('./F2StornoOyna', () => ({
  F2StornoOyna: (p: { akt: { id: number }; faktRejimSukut?: string; onYaratildi?: (id: number) => void }) => (
    <button type="button" data-testid="storno-oyna" data-fakt={p.faktRejimSukut} onClick={() => p.onYaratildi?.(714)}>storno-{p.akt.id}</button>
  ),
}));

import { PereraschetOyna } from './PereraschetOyna';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const Joy = () => <output data-testid="joy">{useLocation().pathname + useLocation().search}</output>;
const TASDIQ = [{ id: 535, raqam: '535', holat: 'tasdiqlangan', lifecycle_status: 'approved' }];
const ochish = (reestr: Array<{ id: number; raqam: string; holat: string; lifecycle_status: string }> = TASDIQ) => render(
  <MemoryRouter initialEntries={['/admin/f2-tarix?obyekt=8']}>
    <PereraschetOyna obyektId={8} kompaniyaId={1} akt={{ id: 535, raqam: '535', oy: '2026-09-01', hujjat_jami: 100 }} reestr={reestr} onYop={vi.fn()} />
    <Joy />
  </MemoryRouter>,
);

describe('Pereraschet — faqat tasdiqlangan manba', () => {
  it('qoralama F2 dan pereraschet ochilmaydi: aniq sabab, storno oynasi yo‘q', async () => {
    m.podvallar.mockResolvedValue({ ok: true, podvallar: [{ akt_id: 535, blok: '' }] });
    ochish([{ id: 535, raqam: '535', holat: 'qoralama', lifecycle_status: 'draft' }]);
    expect((await screen.findByTestId('pereraschet-tasdiqlanmagan')).textContent).toContain('tasdiqlangan F2 sidan');
    expect(screen.queryByTestId('storno-oyna')).toBeNull();
  });
});

describe('Pereraschet — bitta tugma', () => {
  it('podval yo‘q: avval «fayldan tiklash» oynasi; tiklangach storno oynasi ochiladi', async () => {
    m.podvallar.mockResolvedValueOnce({ ok: true, podvallar: [] }).mockResolvedValueOnce({ ok: true, podvallar: [{ akt_id: 535, blok: '' }] });
    ochish();
    expect(await screen.findByTestId('pereraschet-podval-yoq')).toBeTruthy();
    expect(screen.queryByTestId('storno-oyna')).toBeNull();
    fireEvent.click(screen.getByTestId('pereraschet-podval-tiklash'));
    fireEvent.click(await screen.findByTestId('backfill-oyna'));
    expect(await screen.findByTestId('storno-oyna')).toBeTruthy();
  });

  it('podvalsiz davom — faqat ongli rozilik bilan', async () => {
    m.podvallar.mockResolvedValue({ ok: true, podvallar: [{ akt_id: 999, blok: '' }] });
    ochish();
    const davom = await screen.findByTestId('pereraschet-podvalsiz') as HTMLButtonElement;
    expect(davom.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('pereraschet-podvalsiz-rozi'));
    fireEvent.click(davom);
    expect(await screen.findByTestId('storno-oyna')).toBeTruthy();
  });

  it('podval bor: storno «fakt o‘zgartirma» bilan, yaratilgach F2 tayyorlashga shu qoralama bilan o‘tadi', async () => {
    m.podvallar.mockResolvedValue({ ok: true, podvallar: [{ akt_id: 535, blok: '' }] });
    ochish();
    const s = await screen.findByTestId('storno-oyna');
    expect(s.getAttribute('data-fakt')).toBe('ozgartirma');
    fireEvent.click(s);
    await waitFor(() => expect(screen.getByTestId('joy').textContent).toBe('/admin/f2-tayyorlash?obyekt=8&akt=714&pereraschet=535'));
  });
});
