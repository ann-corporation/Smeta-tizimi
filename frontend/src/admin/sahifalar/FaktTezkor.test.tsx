import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-fakt-smetadan-tashqari', () => ({ sbIshTurlariOl: () => Promise.resolve({ ok: true, qatorlar: [] }), sbFaktSmetadanTashqari: vi.fn(), smetadanTashqariXato: () => '' }));

import { FaktTezkor } from './FaktTezkor';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [q({ id: 1, tur: 'rz', nom: 'Bo‘lim' }), q({ id: 2, tur: 'bl', ota_id: 1, nom: 'Grunt', hajm: 100 }), q({ id: 3, tur: 'mat', ota_id: 2, nom: 'Qum', hajm: 10 })];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FaktTezkor', () => {
  it('bir nechta qator — bitta saqlash, bitta server chaqiruvi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    const onSaqlandi = vi.fn();
    render(<FaktTezkor kompaniyaId={1} obyektId={8} rows={rows} states={[{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }]} onSaqlandi={onSaqlandi} />);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Grunt'), { target: { value: '12,5' } });
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Qum'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Hammasini saqlash \(2\)/ }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 8, qatorlar: [{ qator_id: 2, hajm: 12.5 }, { qator_id: 3, hajm: 3 }] }));
    await waitFor(() => expect(onSaqlandi).toHaveBeenCalled());
  });

  it('xato qiymat bo‘lsa saqlanmaydi', () => {
    render(<FaktTezkor kompaniyaId={1} obyektId={8} rows={rows} states={[]} onSaqlandi={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Grunt'), { target: { value: 'abc' } });
    expect((screen.getByRole('button', { name: /Hammasini saqlash/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Son emas')).toBeTruthy();
  });

  it('smetasiz obyekt — smetadan tashqari ish taklifi', () => {
    render(<FaktTezkor kompaniyaId={1} obyektId={8} rows={[]} states={[]} onSaqlandi={vi.fn()} />);
    expect(screen.getByText(/Bu obyektda smeta yo‘q/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Smetadan tashqari ish/ }));
    expect(screen.getByRole('dialog', { name: 'Smetadan tashqari ish' })).toBeTruthy();
  });
});
