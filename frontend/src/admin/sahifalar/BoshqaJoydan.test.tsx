import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IshTuriVariant } from '../../api/t2-ish-abc';
import { qatorlarniOqi } from '../../lib/xotira-fakt/parse';
import { BoshqaJoydan } from './BoshqaJoydan';

const m = vi.hoisted(() => ({ qidir: vi.fn(), saqla: vi.fn() }));
vi.mock('../../api/t2-ish-abc', async (orig) => ({ ...(await orig<object>()), ishTuriQidir: m.qidir, ishAbcSaqla: m.saqla }));

// Sintetik manba: boshqa razdeldagi ish (haqiqiy mijoz ma'lumoti emas).
const variant: IshTuriVariant = {
  manba: 'smeta', qator_id: 77, kod: 'E6-1-1', nom: 'УСТРОЙСТВО СТЕН ИЗ БЕТОНА', birlik: '100М3', shu_obyekt: true, soni: 2,
  sostav: [
    { tur: 'rs', kat: 'ЧЕЛ', kod: null, nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', norma: 200, narx: 20000 },
    { tur: 'mat', kat: 'МАТ', kod: '12-5', nom: 'БЕТОН', birlik: 'М3', norma: 102, narx: 500000 },
  ],
};
beforeEach(() => { m.qidir.mockReset(); m.saqla.mockReset(); m.qidir.mockResolvedValue([variant, { ...variant, manba: 'katalog', qator_id: undefined, sostav: [] }]); m.saqla.mockResolvedValue({ ok: true, qator_id: 901 }); });
afterEach(() => cleanup());

describe('BoshqaJoydan', () => {
  it('qidirish → tanlash → razdel + hajm → qo‘shimcha qator (additional) va fakt bitta amalda; manba qator id sababda', async () => {
    const [qator] = qatorlarniOqi('devor 120 m3');
    const saqlandi = vi.fn();
    render(<BoshqaJoydan kompaniyaId={5} obyektId={1} qator={qator} bolimlar={[{ id: 11, nom: 'ПОДПОРНАЯ СТЕНА', versiya: 3, daraja: 0 }]} onYop={vi.fn()} onSaqlandi={saqlandi} />);
    const opt = await screen.findByRole('option', {}, { timeout: 2000 });
    expect(screen.getAllByRole('option')).toHaveLength(1);   // katalog varianti bu rejimda chiqmaydi
    fireEvent.click(opt);
    expect((screen.getByLabelText('Bajarilgan hajm') as HTMLInputElement).value).toBe('1.2');
    fireEvent.change(screen.getByLabelText('Razdel'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /Qoʻshimcha qator yaratish/ }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalledTimes(1));
    const p = m.saqla.mock.calls[0][0];
    expect(p).toMatchObject({ kompaniyaId: 5, obyektId: 1, command: 'additional', otaQatorId: 11, kutilganVersiya: 3, almashtirilayotganQatorId: null, faktHajm: 1.2 });
    expect(p.ish).toMatchObject({ nom: 'УСТРОЙСТВО СТЕН ИЗ БЕТОНА', birlik: '100М3', hajm: 1.2 });
    expect(p.resurslar.map((r: { norma: number }) => r.norma)).toEqual([200, 102]);
    expect(p.sabab).toContain('#77');
    await waitFor(() => expect(saqlandi).toHaveBeenCalledWith(expect.objectContaining({ id: 901, hajm: 1.2 })));
  });

  it('server xatosi ko‘rsatiladi, onSaqlandi chaqirilmaydi', async () => {
    m.saqla.mockResolvedValue({ ok: false, code: 'WRITE_ROLE_REQUIRED' });
    const [qator] = qatorlarniOqi('devor 120 m3');
    const saqlandi = vi.fn();
    render(<BoshqaJoydan kompaniyaId={5} obyektId={1} qator={qator} bolimlar={[]} onYop={vi.fn()} onSaqlandi={saqlandi} />);
    fireEvent.click(await screen.findByRole('option', {}, { timeout: 2000 }));
    fireEvent.click(screen.getByRole('button', { name: /Qoʻshimcha qator yaratish/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/PTO, rahbar yoki admin/);
    expect(saqlandi).not.toHaveBeenCalled();
  });

  it('hech narsa mos kelmasa: «katalogdan qo‘shish» tugmasi onKatalog ni chaqiradi', async () => {
    m.qidir.mockResolvedValue([]);
    const [qator] = qatorlarniOqi('noma‘lum ish 5 m3');
    const katalog = vi.fn();
    render(<BoshqaJoydan kompaniyaId={5} obyektId={1} qator={qator} bolimlar={[]} onYop={vi.fn()} onSaqlandi={vi.fn()} onKatalog={katalog} />);
    await screen.findByText(/mos ish topilmadi/, {}, { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: /katalogdan qoʻshish/ }));
    expect(katalog).toHaveBeenCalledTimes(1);
  });
});