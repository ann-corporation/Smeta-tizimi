import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []), narxTakliflari: vi.fn(async () => []), ishAbcSaqla: vi.fn(), abcXato: () => '' }));

import { FaktJurnal } from './FaktJurnal';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Yer ishlari' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Grunt', hajm: 100 }),
  q({ id: 3, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Qum', hajm: 10 }),
  q({ id: 4, tur: 'rz', kod: '2', nom: 'Beton ishlari' }),
  q({ id: 5, tur: 'bl', ota_id: 4, daraja: 1, nom: 'Poydevor', hajm: 30 }),
];
const states = [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }, { qator_id: 3, smeta_hajm: 10, fakt_hajm: 0 }, { qator_id: 5, smeta_hajm: 30, fakt_hajm: 0 }];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn() });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FaktJurnal', () => {
  it('bo‘lim ishlari, "+" va "=" bitta paketda, fokus yo‘qolmaydi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    const p = props();
    render(<FaktJurnal {...p} />);
    const grunt = screen.getByLabelText('Bugun bajarildi: Grunt') as HTMLInputElement;
    grunt.focus();
    fireEvent.change(grunt, { target: { value: '1' } });
    expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Grunt'));   // qayta yaratilmadi
    fireEvent.click(screen.getAllByRole('button', { name: '=' })[0]);
    fireEvent.change(screen.getByLabelText('Jami fakt: Grunt'), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Qum'), { target: { value: '2,5' } });
    expect(screen.getByText('2 ta o‘zgarish')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash/ }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 8, qatorlar: [{ qator_id: 2, hajm: 15 }, { qator_id: 3, hajm: 2.5 }] }));
    await waitFor(() => expect(p.holatniYangila).toHaveBeenCalled());
    expect(p.tuzilmaniYangila).not.toHaveBeenCalled();
  });

  it('Ctrl+S saqlaydi; 100% tugmasi qoldiqni yozadi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect((screen.getByLabelText('Bugun bajarildi: Grunt') as HTMLInputElement).value).toBe('60');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ qatorlar: [{ qator_id: 2, hajm: 60 }] })));
  });

  it('boshqa bo‘lim tanlanadi; qidiruv butun obyekt bo‘yicha', () => {
    render(<FaktJurnal {...props()} />);
    expect(screen.queryByText('Poydevor')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /2 Beton ishlari/ }));
    expect(screen.getByText('Poydevor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'qum' } });
    expect(screen.getByText('Qum')).toBeTruthy();
  });

  it('xato qiymat — saqlash o‘chiq', () => {
    render(<FaktJurnal {...props()} />);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Grunt'), { target: { value: 'abc' } });
    expect((screen.getByRole('button', { name: /^Saqlash/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Son emas')).toBeTruthy();
  });

  it('smetasiz obyekt — bajarilgan ishni kiritish taklifi', () => {
    render(<FaktJurnal {...props()} rows={[]} states={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Bajarilgan ishni kiritish/ }));
    expect(screen.getByRole('dialog', { name: 'Qo‘shimcha ish (smetadan tashqari)' })).toBeTruthy();
  });
});
