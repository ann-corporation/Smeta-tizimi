import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TenglashQator, TenglashReja } from '../../lib/fakt-f2-tenglash';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), id: 0, tasdiq: vi.fn() }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: m.tasdiq }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => `op-${++m.id}`, sbT2AktBekor: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/ui/SummaJuft', () => ({ SummaJuft: ({ ustamasiz }: { ustamasiz: number | null }) => <span>{ustamasiz == null ? '—' : String(ustamasiz)}</span> }));
import { FaktF2Tenglash } from './FaktF2Tenglash';
import { urinishOchir, urinishOl, yozilganOchir } from '../../lib/fakt-qamrov-urinish';

const q = (id: number, bolim: string | null = null, summa: number | null = 500): TenglashQator => ({ id, tur: 'bl', nom: `Ish ${id}`, birlik: 'm3', fakt: 3, f2: 8, delta: 5, narx: 100, summa, avtomatik: 2, bolim });
const rejaYasa = (qatorlar: TenglashQator[]): TenglashReja => ({
  qatorlar, paket: qatorlar.map((x) => ({ qator_id: x.id, hajm: x.delta })), jamiSumma: qatorlar.reduce((s, x) => s + (x.summa ?? 0), 0),
  narxsiz: qatorlar.filter((x) => x.summa == null).length, otkazildi: { manfiyReja: 0, f2Yoq: 0 }, faktOrtiq: [],
});
const reja = rejaYasa([q(10)]);
const holat = new Map();
const props = { obyektId: 8, kompaniyaId: 1, sana: '2026-10-24', holatMap: holat };
const yozBtn = () => screen.getByRole('button', { name: 'Qo‘llash' }) as HTMLButtonElement;

beforeEach(() => { m.id = 0; m.yoz.mockReset(); m.toast.mockReset(); urinishOchir(1, 8); yozilganOchir(1, 8); });
afterEach(cleanup);

describe('Fakt = F2 oynasi', () => {
  it('eski (smeta narxidagi) «Fakt = F2» hujjatlari: ro‘yxat + tasdiq bilan bekor qilish, keyin jadval yangilanadi va oyna yopiladi; rad etilsa hech narsa', async () => {
    const bekor = vi.fn(async () => ({ ok: true })); const yangila = vi.fn(); const yop = vi.fn();
    const eski = [{ id: 5, raqam: 'F20261001-01', sana: '2026-10-01', jami: 100 }, { id: 6, raqam: null, sana: null, jami: null }];
    render(<FaktF2Tenglash sarlavha="x" reja={reja} eskiAktlar={eski} {...props} onYop={yop} onBajarildi={yangila} aktBekor={bekor} />);
    expect(screen.getByTestId('f2-tenglash-eski').textContent).toContain('№F20261001-01');
    m.tasdiq.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByTestId('f2-tenglash-eski-bekor'));
    await waitFor(() => expect(m.tasdiq).toHaveBeenCalledTimes(1));
    expect(bekor).not.toHaveBeenCalled();
    m.tasdiq.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByTestId('f2-tenglash-eski-bekor'));
    await waitFor(() => expect(yop).toHaveBeenCalled());
    expect(bekor.mock.calls.map((c) => (c as unknown[])[0])).toEqual([5, 6]);
    expect(yangila).toHaveBeenCalled();
    expect(m.yoz).not.toHaveBeenCalled();
  });

  it('Qo‘llash — urinish yo‘li (fakt_yoz_v2, musbat farq), xabarda «Bekor qilish» akt_bekor ni chaqiradi', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 77 });
    const bekor = vi.fn(async () => ({ ok: true }));
    const yangila = vi.fn();
    render(<FaktF2Tenglash sarlavha="Bo‘lim" reja={reja} {...props} onYop={vi.fn()} onBajarildi={yangila} aktBekor={bekor} />);
    expect(screen.getByText('Ish 10', { exact: false })).toBeTruthy();
    fireEvent.click(yozBtn());
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz.mock.calls[0][0]).toMatchObject({ obyektId: 8, sana: '2026-10-24', operationId: 'op-1', qatorlar: [{ qator_id: 10, hajm: 5 }] });
    expect(m.yoz.mock.calls[0][0].izoh).toMatch(/^Fakt = F2: Bo‘lim/);
    await waitFor(() => expect(yangila).toHaveBeenCalled());
    expect(urinishOl(1, 8)).toBeNull(); // to'liq tasdiqlangach urinish tozalanadi
    const action = m.toast.mock.calls[0][4] as { onClick: () => void };
    action.onClick();
    await waitFor(() => expect(bekor).toHaveBeenCalledWith(77));
  });

  it('klaviatura: Ctrl+Enter qo‘llaydi, Esc yopadi', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 78 });
    const yop = vi.fn();
    render(<FaktF2Tenglash sarlavha="Bo‘lim" reja={reja} {...props} onYop={yop} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(yop).toHaveBeenCalled();
  });

  it('qo‘shiladigan hajm bo‘lmasa — Qo‘llash o‘chiq', () => {
    render(<FaktF2Tenglash sarlavha="x" reja={rejaYasa([])} {...props} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    expect(yozBtn().disabled).toBe(true);
  });

  it('obyekt: bo‘lim jamisi ko‘rinadi, bo‘lim va qator istisno qilinadi — paketga tushmaydi', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 5 });
    const r = rejaYasa([q(1, 'A'), q(2, 'A'), q(3, 'B', null), q(4, 'C')]);
    render(<FaktF2Tenglash sarlavha="Butun obyekt" reja={r} {...props} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    const bolimlar = screen.getByTestId('f2-tenglash-bolimlar');
    expect(bolimlar.textContent).toMatch(/A2/);
    expect(bolimlar.textContent).toMatch(/1000/);
    expect(screen.getByTestId('f2-tenglash-jami').textContent).toMatch(/^4 qator yoziladi/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Olinsin: B' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Olinsin: Ish 4' }));
    expect(screen.getByTestId('f2-tenglash-jami').textContent).toMatch(/^2 qator yoziladi/);
    fireEvent.click(yozBtn());
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz.mock.calls[0][0].qatorlar).toEqual([{ qator_id: 1, hajm: 5 }, { qator_id: 2, hajm: 5 }]);
  });

  it('katta obyekt (~25k qator): bo‘laklarga bo‘linadi, javob noma‘lum bo‘lsa xuddi shu UUID bilan qayta yuboriladi', async () => {
    const katta = rejaYasa(Array.from({ length: 6500 }, (_, i) => q(i + 1, `B${i % 7}`)));
    let n = 0;
    m.yoz.mockImplementation(async (x: { operationId: string }) => { n++; if (n === 2) throw new Error('timeout'); return { ok: true, akt_id: Number(x.operationId.slice(3)) + 100 }; });
    render(<FaktF2Tenglash sarlavha="Butun obyekt" reja={katta} {...props} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    fireEvent.click(yozBtn());
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(5));
    expect(m.yoz.mock.calls.map((c) => c[0].qatorlar.length)).toEqual([1500, 1500, 1500, 1500, 500]);
    await waitFor(() => expect(screen.getByTestId('qamrov-urinish')).toBeTruthy());
    const ids = m.yoz.mock.calls.map((c) => c[0].operationId);
    fireEvent.click(screen.getByRole('button', { name: 'Qo‘llash' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(10));
    expect(m.yoz.mock.calls.slice(5).map((c) => c[0].operationId)).toEqual(ids); // yangi UUID yo'q — ikkinchi hujjat yaratilmaydi
  });
});
