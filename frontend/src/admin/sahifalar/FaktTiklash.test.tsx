import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TiklashSatr } from '../../lib/fakt-tiklash';
import { bosKatKesim } from '../../lib/ustamali-summa';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), id: 0, tasdiq: vi.fn() }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: m.tasdiq }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => `op-${++m.id}`, sbT2AktBekor: vi.fn() }));
vi.mock('../../api/t2-fakt-tiklash', () => ({ sbTiklashObyektManba: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/ui/SummaJuft', () => ({ SummaJuft: ({ ustamasiz }: { ustamasiz: number | null }) => <span>{ustamasiz == null ? '—' : String(ustamasiz)}</span> }));
import { FaktTiklash } from './FaktTiklash';
import { urinishOchir, yozilganOchir } from '../../lib/fakt-qamrov-urinish';

const satr = (id: number, manba: 'f2' | 'qoralama', delta: number, summa: number | null, hujjat: string): TiklashSatr => ({
  kalit: `${manba}:${id}`, id, tur: 'bl', nom: `Ish ${id}`, birlik: 'm3', bolim: 'B', manba, hujjat, aktlar: [1], fakt: 2, keyin: 2 + delta, delta, narx: 100, summa,
  kesim: bosKatKesim(), narxManba: 'f2', paket: [{ qator_id: id, hajm: delta, narx_izoh: hujjat }],
});
const satrlar = [satr(10, 'f2', 5, 500, 'F2 №7'), satr(11, 'f2', -2, -200, 'F2 №7'), satr(20, 'qoralama', 4, 400, 'qoralama F2 №3')];
const props = { obyektNom: 'Stella', obyektId: 8, kompaniyaId: 1, sana: '2026-11-03', holatMap: new Map(), fakt: { ustamasiz: 1000, kesim: bosKatKesim() }, f2: { ustamasiz: 5000, kesim: bosKatKesim() } };
const yozBtn = () => screen.getByTestId('tiklash-qollash') as HTMLButtonElement;
const katak = (kalit: string) => screen.getByLabelText(new RegExp(`Tanlash: Ish ${kalit}`)) as HTMLInputElement;

beforeEach(() => { m.id = 0; m.yoz.mockReset(); m.toast.mockReset(); m.tasdiq.mockReset(); urinishOchir(1, 8); yozilganOchir(1, 8); });
afterEach(cleanup);

describe('Fakt tiklash oynasi', () => {
  it('sukut: tasdiqlangan F2 qatorlari belgilangan, qoralama — yo‘q; jami: fakt hozir → keyin va F2', () => {
    render(<FaktTiklash {...props} satrlar={satrlar} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    expect(katak('10').checked).toBe(true);
    expect(katak('11').checked).toBe(true);
    expect(katak('20').checked).toBe(false);
    const jami = screen.getByTestId('tiklash-jami').textContent ?? '';
    expect(jami).toContain('1000');   // fakt hozir
    expect(jami).toContain('1300');   // keyin: 1000 + 500 − 200
    expect(jami).toContain('5000');   // F2
    expect(screen.getByTestId('tiklash-soni').textContent).toMatch(/^2 qator yoziladi/);
    expect(screen.getByTestId('tiklash-f2').textContent).toContain('F2 №7');
    expect(screen.getByTestId('tiklash-qoralama').textContent).toContain('qoralama F2 №3');
    expect(yozBtn().disabled).toBe(false);
  });

  it('tasdiq dialogi: rad etilsa hech narsa yozilmaydi; tasdiqlansa bitta so‘rov — faqat delta, izohda hujjat, operation_id', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 91 });
    const yangila = vi.fn();
    render(<FaktTiklash {...props} satrlar={satrlar} onYop={vi.fn()} onBajarildi={yangila} aktBekor={vi.fn()} />);
    fireEvent.click(katak('20')); // qoralama ham belgilanadi
    m.tasdiq.mockResolvedValueOnce(false);
    fireEvent.click(yozBtn());
    await waitFor(() => expect(m.tasdiq).toHaveBeenCalledTimes(1));
    const matn = m.tasdiq.mock.calls[0][0] as string;
    expect(matn).toContain('3 qator faktga yoziladi');
    expect(matn).toContain('F2 №7');
    expect(matn).toContain('qoralama F2 №3');
    expect(matn).toMatch(/qoralama F2 asosida/); // kuchsiz dalil haqida ogohlantirish
    expect(m.yoz).not.toHaveBeenCalled();
    m.tasdiq.mockResolvedValueOnce(true);
    fireEvent.click(yozBtn());
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    const arg = m.yoz.mock.calls[0][0];
    expect(arg).toMatchObject({ obyektId: 8, sana: '2026-11-03', operationId: 'op-1' });
    expect(arg.qatorlar.map((q: { qator_id: number; hajm: number }) => [q.qator_id, q.hajm])).toEqual([[10, 5], [11, -2], [20, 4]]); // minus saqlanadi
    expect(arg.izoh).toMatch(/^Fakt tiklash: Stella — F2 №7; qoralama F2 №3/);
    await waitFor(() => expect(yangila).toHaveBeenCalled());
  });

  it('belgi olib tashlansa paketga tushmaydi; hech narsa belgilanmasa — yozish o‘chiq', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 5 });
    m.tasdiq.mockResolvedValue(true);
    render(<FaktTiklash {...props} satrlar={satrlar} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    fireEvent.click(katak('11'));
    fireEvent.click(yozBtn());
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz.mock.calls[0][0].qatorlar).toEqual([expect.objectContaining({ qator_id: 10, hajm: 5 })]);
    cleanup(); urinishOchir(1, 8); yozilganOchir(1, 8);
    render(<FaktTiklash {...props} satrlar={satrlar} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    fireEvent.click(katak('10')); fireEvent.click(katak('11'));
    expect(yozBtn().disabled).toBe(true);
  });

  it('idempotentlik: javob noma‘lum bo‘lsa qayta yuborish xuddi shu operation_id bilan, ikkinchi tasdiq so‘ralmaydi', async () => {
    m.tasdiq.mockResolvedValue(true);
    m.yoz.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ ok: true, akt_id: 7 });
    render(<FaktTiklash {...props} satrlar={satrlar} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    fireEvent.click(yozBtn());
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('qamrov-urinish')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Qo‘llash' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(2));
    expect(m.yoz.mock.calls[1][0].operationId).toBe(m.yoz.mock.calls[0][0].operationId);
    expect(m.yoz.mock.calls[1][0].qatorlar).toEqual(m.yoz.mock.calls[0][0].qatorlar);
    expect(m.tasdiq).toHaveBeenCalledTimes(1);
  });

  it('dalil yo‘q: «yo‘q» xabari va yozish o‘chiq', () => {
    render(<FaktTiklash {...props} satrlar={[]} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    expect(screen.getByTestId('tiklash-bosh')).toBeTruthy();
    expect(yozBtn().disabled).toBe(true);
  });

  it('kompaniya bo‘yicha xulosa: har obyekt o‘qiladi, faqat potensiali bor obyektlar ko‘rinadi, o‘qilmagani xato bilan', async () => {
    const yukla = vi.fn(async (id: number) => id === 3 ? { ok: false, error: 'tarmoq' } : {
      ok: true, manba: { id, yigma: new Map(), holat: id === 1
        ? [{ qator_id: 1, tur: 'mat', kat: 'МАТ', fakt_hajm: 2, fakt_summa: null, f2_hajm: 10, f2_summa: 1000, f2_summa_yoq: 0, smeta_narx: null }]
        : [] },
    });
    render(<FaktTiklash {...props} satrlar={satrlar} obyektlar={[{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }, { id: 3, nom: 'C' }]} yukla={yukla} onYop={vi.fn()} onBajarildi={vi.fn()} aktBekor={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tiklash-kompaniya-hisobla'));
    await waitFor(() => expect(yukla).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByTestId('tiklash-komp-3').textContent).toContain('tarmoq'));
    expect(screen.getByTestId('tiklash-komp-1').textContent).toContain('800');
    expect(screen.queryByTestId('tiklash-komp-2')).toBeNull();
  });
});
