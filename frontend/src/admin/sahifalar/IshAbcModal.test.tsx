import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ ishTuri: vi.fn(), resurs: vi.fn(), narx: vi.fn(), saqla: vi.fn() }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: m.ishTuri, resursQidir: m.resurs, narxTakliflari: m.narx, ishAbcSaqla: m.saqla, abcXato: (r: { error?: string }) => r?.error ?? 'xato' }));

import { IshAbcModal } from './IshAbcModal';

const KLADKA = {
  manba: 'smeta', qator_id: 605420, kod: 'Е0802-002-03', nom: 'КЛАДКА ПЕРЕГОРОДОК ИЗ КИРПИЧА', birlik: '100М2', soni: 6, shu_obyekt: true,
  sostav: [
    { tur: 'rs', kat: 'ЧЕЛ', kod: '1', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'ЧЕЛ.-Ч', norma: 170.17, narx: 29421 },
    { tur: 'rs', kat: 'МАТ', kod: '440500', nom: 'КИРПИЧ ЖЖЕННЫЙ 250Х120Х88 ММ', birlik: '1000ШТ', norma: 3.8808, narx: null },
  ],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('IshAbcModal (kichik ABC)', () => {
  it('kutubxonadan ish turi → resurslar normalari bilan, narx taklifi, summa, saqlash paketi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.ishTuri.mockResolvedValue([KLADKA]);
    m.narx.mockResolvedValue([[{ manba: 'smeta_obyekt', narx: 29421, izoh: 'shu' }], [{ manba: 'smeta', narx: 1360000, izoh: 'boshqa' }, { manba: 'katalog', narx: 1200000, izoh: 'katalog' }]]);
    m.saqla.mockResolvedValue({ ok: true, qator_id: 1 });
    const onSaqlandi = vi.fn();
    render(<IshAbcModal kompaniyaId={1} obyektId={81} sana="2026-10-01" bolimlar={[{ id: 605419, nom: 'Стена', versiya: 3 }]} rejim={{ tur: 'additional', bolimId: 605419 }} onYop={vi.fn()} onSaqlandi={onSaqlandi} />);

    const nom = screen.getByLabelText('Ish turi nomi');
    fireEvent.focus(nom);
    fireEvent.change(nom, { target: { value: 'кладка' } });
    await act(async () => { vi.advanceTimersByTime(350); });
    await waitFor(() => expect(m.ishTuri).toHaveBeenCalledWith(81, 'кладка'));
    fireEvent.mouseDown(await screen.findByRole('option', { name: /КЛАДКА ПЕРЕГОРОДОК/ }));

    expect((screen.getByLabelText('Ish shifri') as HTMLInputElement).value).toBe('Е0802-002-03');
    expect((screen.getByLabelText('1-resurs normasi') as HTMLInputElement).value).toBe('170.17');
    await waitFor(() => expect((screen.getByLabelText('2-resurs narxi') as HTMLInputElement).value).toBe('1360000'));

    fireEvent.change(screen.getByLabelText('Ish hajmi'), { target: { value: '0,5' } });
    expect(screen.getAllByText('5 142 229,79').length).toBeGreaterThan(0);   // ish summasi = resurslar yig'indisi
    fireEvent.change(screen.getByLabelText('Bajarilgan hajm'), { target: { value: '0.3' } });
    fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'buyurtmachi xati' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(m.saqla).toHaveBeenCalledTimes(1));
    expect(m.saqla).toHaveBeenCalledWith(expect.objectContaining({
      command: 'additional', obyektId: 81, otaQatorId: 605419, kutilganVersiya: 3, faktHajm: 0.3,
      ish: { kod: 'Е0802-002-03', nom: 'КЛАДКА ПЕРЕГОРОДОК ИЗ КИРПИЧА', birlik: '100М2', hajm: 0.5 },
      resurslar: [
        expect.objectContaining({ kat: 'ЧЕЛ', norma: 170.17, narx: 29421, narx_manba: 'smeta_obyekt' }),
        expect.objectContaining({ kat: 'МАТ', norma: 3.8808, narx: 1360000, narx_manba: 'smeta' }),
      ],
    }));
    await waitFor(() => expect(onSaqlandi).toHaveBeenCalled());
  });

  it('qo‘lda narx — manba "qo‘lda"; xato bo‘lsa saqlanmaydi va sabablar ko‘rsatiladi', () => {
    render(<IshAbcModal kompaniyaId={1} obyektId={81} sana="2026-10-01" bolimlar={[]} rejim={{ tur: 'additional' }} onYop={vi.fn()} onSaqlandi={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Resurs qo‘shish/ }));
    fireEvent.change(screen.getByLabelText('1-resurs narxi'), { target: { value: '500' } });
    expect(screen.getByTitle('Narx manbasi').textContent).toBe('qo‘lda');
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(m.saqla).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Ish turi nomi kiritilmagan/);
  });

  it('resurs zamenasi: norma eskidan, hajm = norma × ish hajmi', async () => {
    m.saqla.mockResolvedValue({ ok: true, qator_id: 9 });
    render(<IshAbcModal kompaniyaId={1} obyektId={81} sana="2026-10-01" bolimlar={[]}
      rejim={{ tur: 'resurs_zamena', eski: { id: 605428, nom: 'КИРПИЧ ЖЖЕННЫЙ', birlik: '1000ШТ', kat: 'МАТ', norma: 3.8808 }, ishHajm: 0.2 }} onYop={vi.fn()} onSaqlandi={vi.fn()} />);
    expect(screen.getByText('0,77616')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('1-resurs nomi'), { target: { value: 'КИРПИЧ КЕРАМИЧЕСКИЙ' } });
    fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'mavjud emas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalledWith(expect.objectContaining({ command: 'resurs_zamena', almashtirilayotganQatorId: 605428, ish: null })));
  });
});
