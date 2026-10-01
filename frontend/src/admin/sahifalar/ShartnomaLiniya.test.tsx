import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Liniya } from '../../api/t2-shartnoma-liniya';

const m = vi.hoisted(() => ({ ol: vi.fn(), saqla: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-shartnoma-liniya', async (orig) => ({ ...(await orig<typeof import('../../api/t2-shartnoma-liniya')>()), shartnomaLiniyaOl: m.ol, shartnomaSaqlaV2: m.saqla }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 1 } }) }));

import { ShartnomaLiniya } from './ShartnomaLiniya';

const L: Liniya = {
  loyihalar: [{ id: 1, nom: 'Navoiy ko‘llari', holat: 'faol' }],
  shartnomalar: [{ id: 10, loyiha_id: 1, raqam: '45', nom: 'Bosh pudrat', turi: 'Bosh shartnoma', asosiy: true, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null, izoh: null, versiya: 3,
    tomonlar: [{ rol: 'Buyurtmachi', nom: 'Hokimlik', inn: null }], obyektlar: [100] }],
  obyektlar: [{ id: 100, nom: 'Ko‘l 1', loyiha_id: 1, asosiy_shartnoma_id: 10 }, { id: 101, nom: 'Ko‘l 2', loyiha_id: 1, asosiy_shartnoma_id: null }],
  rollar: [], turlar: [],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ShartnomaLiniya', () => {
  it('loyiha → shartnoma → obyekt daraxti va shartnomasiz obyektni bir bosishda biriktirish', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: L });
    m.saqla.mockResolvedValue({ ok: true, id: 10, versiya: 4 });
    render(<ShartnomaLiniya />);
    expect(await screen.findByRole('region', { name: 'Loyiha: Navoiy ko‘llari' })).toBeTruthy();
    expect(screen.getByText('Ko‘l 1')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Biriktirish: Ko‘l 2'), { target: { value: '10' } });
    await waitFor(() => expect(m.saqla).toHaveBeenCalledWith(expect.objectContaining({ id: 10, kutilganVersiya: 3, obyektlar: [100, 101] })));
    expect(m.saqla.mock.calls[0][0].tomonlar).toEqual([{ rol: 'Buyurtmachi', nom: 'Hokimlik', inn: null }]);
    await waitFor(() => expect(m.ol).toHaveBeenCalledTimes(2));
  });

  it('yangi shartnoma: erkin rolli tomon, obyekt tanlash, server xatosi tushunarli', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: L });
    m.saqla.mockResolvedValue({ ok: false, error: 'OBYEKT_BOSHQA_ASOSIY: «Ko‘l 2» allaqachon № 45 asosiy shartnomada' });
    render(<ShartnomaLiniya />);
    await screen.findByRole('region', { name: 'Loyiha: Navoiy ko‘llari' });
    fireEvent.click(screen.getAllByRole('button', { name: /Shartnoma$/ })[0]);
    expect(screen.queryByLabelText('Obyekt: Ko‘l 1')).toBeNull();      // boshqa asosiy shartnomada
    fireEvent.change(screen.getByLabelText('Raqam'), { target: { value: '7-L' } });
    fireEvent.click(screen.getByLabelText('Asosiy shartnoma'));
    fireEvent.change(screen.getByLabelText('Turi'), { target: { value: 'Laboratoriya' } });
    fireEvent.change(screen.getByLabelText('1-tomon nomi'), { target: { value: 'Hokimlik' } });
    fireEvent.change(screen.getByLabelText('2-tomon roli'), { target: { value: 'Laboratoriya' } });
    fireEvent.change(screen.getByLabelText('2-tomon nomi'), { target: { value: 'GeoLab' } });
    fireEvent.click(screen.getByLabelText('Obyekt: Ko‘l 1'));               // qo'shimcha — cheklanmagan
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalledTimes(1));
    expect(m.saqla.mock.calls[0][0]).toMatchObject({ id: null, malumot: { loyiha_id: 1, raqam: '7-L', asosiy: false, turi: 'Laboratoriya' }, obyektlar: [100] });
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('Obyektda faqat bitta asosiy'), 'danger'));
  });
});
