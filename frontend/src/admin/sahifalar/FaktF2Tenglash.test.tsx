import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TenglashReja } from '../../lib/fakt-f2-tenglash';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
import { FaktF2Tenglash } from './FaktF2Tenglash';

const reja: TenglashReja = {
  qatorlar: [{ id: 10, tur: 'bl', nom: 'Ish A', birlik: 'm3', fakt: 3, f2: 8, delta: 5, narx: 100, summa: 500, avtomatik: 2 }],
  paket: [{ qator_id: 10, hajm: 5 }], jamiSumma: 500, narxsiz: 0, otkazildi: { manfiyReja: 0, f2Yoq: 0 },
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Fakt = F2 oynasi', () => {
  it('Qo‘llash — bitta fakt hujjati (musbat farq), xabarda «Bekor qilish» akt_bekor ni chaqiradi', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 77 });
    const bekor = vi.fn(async () => ({ ok: true }));
    const yangila = vi.fn();
    render(<FaktF2Tenglash sarlavha="Bo‘lim" reja={reja} obyektId={8} sana="2026-10-24" onYop={vi.fn()} onBajarildi={yangila} aktBekor={bekor} />);
    expect(screen.getByText('Ish A', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Qo‘llash' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz.mock.calls[0][0]).toMatchObject({ obyektId: 8, sana: '2026-10-24', qatorlar: [{ qator_id: 10, hajm: 5 }] });
    await waitFor(() => expect(yangila).toHaveBeenCalled());
    const action = m.toast.mock.calls[0][4] as { onClick: () => void };
    action.onClick();
    await waitFor(() => expect(bekor).toHaveBeenCalledWith(77));
  });

  it('klaviatura: Ctrl+Enter qo‘llaydi, Esc yopadi', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 78 });
    const yop = vi.fn();
    render(<FaktF2Tenglash sarlavha="Bo‘lim" reja={reja} obyektId={8} sana="2026-10-24" onYop={yop} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(yop).toHaveBeenCalled();
  });

  it('qo‘shiladigan hajm bo‘lmasa — Qo‘llash o‘chiq', () => {
    render(<FaktF2Tenglash sarlavha="x" reja={{ ...reja, qatorlar: [], paket: [], jamiSumma: 0 }} obyektId={8} sana="2026-10-24" onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Qo‘llash' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
