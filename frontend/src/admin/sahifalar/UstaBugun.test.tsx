import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ permissions: ['company.read', 'fakt.read', 'self.work.write'] as string[] }));
const sb = vi.hoisted(() => ({ sbOqi: vi.fn(), yangiOperationId: vi.fn() }));
const usta = vi.hoisted(() => ({ faktTogriYoz: vi.fn(), navbatYozuviniYubor: vi.fn(), sbUstaQoralamalarOl: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17, nom: 'Test MChJ', permissions: ctx.permissions }, superadmin: false }) }));
vi.mock('../../api/t2-obyektlar-kesh', () => ({ useT2ObyektlarRoyxati: () => ({ obyektlar: [{ id: 5, nom: 'Obyekt A' }], yuklanmoqda: false, xato: '' }) }));
vi.mock('../../api/supabase', () => sb);
vi.mock('../../api/t2-usta', () => usta);
vi.mock('../../api/t2-hr', () => ({ hrOyOl: vi.fn(), hrTabelSaqla: vi.fn(), hrXodimlarOl: vi.fn(), hrXato: () => 'xato' }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast }));

import UstaBugun from './UstaBugun';

let n = 0;
beforeEach(() => {
  ctx.permissions = ['company.read', 'fakt.read', 'self.work.write'];
  Object.values(sb).forEach((f) => f.mockReset()); Object.values(usta).forEach((f) => f.mockReset()); toast.mockReset();
  n = 0; sb.yangiOperationId.mockImplementation(() => `op-${++n}`);
  sb.sbOqi.mockResolvedValue({ ok: true, qatorlar: [{ qator_id: 301, kod: '1.1', nom: 'Beton quyish', birlik: '100 м2', smeta_hajm: 10, fakt_hajm: 2, qoldiq_hajm: 8 }] });
  usta.navbatYozuviniYubor.mockResolvedValue({ ok: true });
  usta.faktTogriYoz.mockResolvedValue({ ok: true });
  usta.sbUstaQoralamalarOl.mockResolvedValue({ ok: true, qatorlar: [] });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(cleanup);

const ishgaOt = async () => {
  render(<UstaBugun />);
  fireEvent.click(await screen.findByRole('button', { name: /Obyekt A/ }));
  fireEvent.click(await screen.findByText('Beton quyish'));
};

describe('Usta «Bugun»', () => {
  it('obyekt → ish → birlik «100 m²» tushuntiriladi, + tugmasi hajmni oshiradi', async () => {
    await ishgaOt();
    fireEvent.click(await screen.findByRole('button', { name: 'Ko‘paytirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ko‘paytirish' }));
    expect((screen.getByLabelText('Miqdor') as HTMLInputElement).value).toBe('2');
    expect(screen.getByTestId('usta-birlik-izoh').textContent).toContain('200 m²');
  });

  it('usta (fakt.write yo‘q) kiritgani QORALAMA yo‘li bilan, o‘z operation_id si bilan ketadi; to‘g‘ridan-to‘g‘ri fakt yozilmaydi', async () => {
    await ishgaOt();
    fireEvent.click(await screen.findByRole('button', { name: 'Ko‘paytirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect(usta.navbatYozuviniYubor).toHaveBeenCalledTimes(1));
    const y = usta.navbatYozuviniYubor.mock.calls[0][0];
    expect(y).toMatchObject({ id: 'op-1', tur: 'fakt', obyektId: 5, kompaniyaId: 17 });
    expect(y.payload.qatorlar).toEqual([{ qator_id: 301, hajm: 1 }]);
    expect(usta.faktTogriYoz).not.toHaveBeenCalled();
  });

  it('fakt.write bor foydalanuvchi mavjud fakt yo‘liga yozadi (qoralama emas)', async () => {
    ctx.permissions = ['company.read', 'fakt.read', 'fakt.write', 'self.work.write'];
    await ishgaOt();
    fireEvent.click(await screen.findByRole('button', { name: 'Ko‘paytirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(usta.faktTogriYoz).toHaveBeenCalledTimes(1));
    expect(usta.navbatYozuviniYubor).not.toHaveBeenCalled();
  });

  it('internet yo‘q: yozuv navbatda qoladi («Yuborilmagan») va yuborish urinishi bo‘lmaydi', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await ishgaOt();
    fireEvent.click(await screen.findByRole('button', { name: 'Ko‘paytirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    expect(await screen.findByTestId('usta-navbat')).toBeTruthy();
    expect(usta.navbatYozuviniYubor).not.toHaveBeenCalled();
  });

  it('material zayavkasi: «Material kerak» → material → yuborish (2 bosish)', async () => {
    sb.sbOqi.mockResolvedValue({ ok: true, qatorlar: [{ qator_id: 401, kod: 'M1', nom: 'Sement M400', birlik: 'т', smeta_hajm: 50, fakt_hajm: 0, qoldiq_hajm: 50 }] });
    render(<UstaBugun />);
    fireEvent.click(await screen.findByRole('button', { name: /Obyekt A/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Material kerak/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Sement M400/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Zayavka yuborish' }));
    await waitFor(() => expect(usta.navbatYozuviniYubor).toHaveBeenCalled());
    expect(usta.navbatYozuviniYubor.mock.calls[0][0]).toMatchObject({ tur: 'zayavka', payload: { nomi: 'Sement M400', miqdor: 1 } });
  });
});
