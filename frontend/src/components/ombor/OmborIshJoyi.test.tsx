import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Faqat sintetik ma'lumot; tarmoq va hisoblash serveri soxta.
const api = vi.hoisted(() => ({
  omborQoldiq: vi.fn(), omborRoyxat: vi.fn(), omborTarix: vi.fn(), omborYoz: vi.fn(), omborTuzat: vi.fn(), omborEksport: vi.fn(),
  omborTahlilMatn: vi.fn(), omborTahlilOvoz: vi.fn(), omborTasdiq: vi.fn(),
}));
vi.mock('../../api/t2-ombor', () => api);
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
import { OmborIshJoyi } from './OmborIshJoyi';

const G = (nomi: string, birligi: string, qoldiq: number) => ({ kalit: 'k:' + nomi, nomi, birligi, tur: null, kirim: qoldiq, chiqim: 0, qoldiq, variantlar_soni: 2, harakatlar: 2, oxirgi_sana: '2026-11-01', ball: 0.95 });
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.omborQoldiq.mockResolvedValue({ ok: true, jami: 1, limit: 50, offset: 0, turlar: ['Sintetik'], qatorlar: [G('Тест труба ф25', 'м', 175)] });
  api.omborRoyxat.mockResolvedValue({ ok: true, jami: 0, limit: 50, offset: 0, qatorlar: [] });
  api.omborYoz.mockResolvedValue({ ok: true, harakat_id: 1, qoldiq_keyin: 180 });
});
afterEach(cleanup);
const montaj = (yozish = true) => render(<OmborIshJoyi kompaniyaId={1} skladId={9} skladNomi="Test ombor" yozishMumkin={yozish} />);

describe('OmborIshJoyi', () => {
  it('ostatka birlashgan: variantlar soni ko\'rinadi', async () => {
    montaj();
    expect(await screen.findByText('Тест труба ф25')).toBeTruthy();
    expect(screen.getAllByText(/2 yozuv/).length).toBeGreaterThan(0);
  });
  it('faqat-o\'qish foydalanuvchida tez kiritish va buyruq qutisi yo\'q', async () => {
    montaj(false);
    await screen.findByText('Тест труба ф25');
    expect(screen.queryByLabelText('Tez kiritish')).toBeNull();
    expect(screen.queryByLabelText('Buyruq')).toBeNull();
  });
  it('tez yo\'l: harf yozish → tanlash → miqdor → saqlash (bitta operation_id, chiqim uchun ro\'yxat majburiy)', async () => {
    montaj();
    await screen.findByText('Тест труба ф25');
    fireEvent.click(screen.getByRole('button', { name: 'Chiqim' }));
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'труба' } });
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByRole('alert')).toBeTruthy(); // ro'yxatdan tanlanmagan — yozilmaydi
    expect(api.omborYoz).not.toHaveBeenCalled();
    const taklif = await screen.findByRole('option', { name: /Тест труба ф25/ });
    fireEvent.click(taklif.querySelector('button')!);
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '5,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(api.omborYoz).toHaveBeenCalledTimes(1));
    const [k, s, y] = api.omborYoz.mock.calls[0];
    expect([k, s]).toEqual([1, 9]);
    expect(y).toMatchObject({ operatsiya: 'chiqim', nomi: 'Тест труба ф25', birligi: 'м', miqdor: '5.5' });
    expect(String(y.operation_id)).toMatch(/^[0-9a-f-]{36}$/i);
  });
  it('server QOLDIQ_YETMAYDI ni tushunarli xabar bilan ko\'rsatadi', async () => {
    api.omborYoz.mockResolvedValue({ ok: false, code: 'QOLDIQ_YETMAYDI' });
    montaj();
    await screen.findByText('Тест труба ф25');
    fireEvent.click(screen.getByRole('button', { name: 'Chiqim' }));
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'труба' } });
    fireEvent.click((await screen.findByRole('option', { name: /Тест труба ф25/ })).querySelector('button')!);
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ostatka yetmaydi');
  });
  it('buyruq: matn → preview kartasi → faqat «Tasdiqlash» dan keyin yoziladi', async () => {
    api.omborTahlilMatn.mockResolvedValue({ ok: true, holat: 'tasdiq_kerak', token: 'T.T', matn: '50 kg mix keldi',
      preview: { tur: 'prixod', nomi: 'Тест миx', birligi: 'кг', miqdor: 50, sana: '2026-11-17', qoldiq_hozir: 10, qoldiq_keyin: 60, ogohlantirish: [] } });
    api.omborTasdiq.mockResolvedValue({ ok: true, harakat_id: 7 });
    montaj();
    fireEvent.change(await screen.findByLabelText('Buyruq'), { target: { value: '50 kg mix keldi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tushun' }));
    expect(await screen.findByText('Tasdiqlash kartasi', { selector: '[aria-label]' }).catch(() => null) ?? screen.getByRole('group', { name: 'Tasdiqlash kartasi' })).toBeTruthy();
    expect(api.omborTasdiq).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(api.omborTasdiq).toHaveBeenCalledWith(1, 9, 'T.T'));
  });
});

describe('material kartasi', () => {
  it('qatorni bosganda tarix ochiladi va tuzatish sababsiz yuborilmaydi', async () => {
    api.omborTarix.mockResolvedValue({ ok: true, jami: 1, kirim: 5, chiqim: 0, qatorlar: [
      { id: 11, sana: '2026-11-01', operatsiya: 'prixod', nomi: 'Тест труба ф25', birligi: 'м', obyomi: 5, postavshik: 'S', qabul_qiluvchi: null, qabul_turi: null, izoh: null, tur: null, sf_tasdiq: null, manba: 'ombor_prixod_v1', teskari: false, yaratildi: 'x' }] });
    api.omborTuzat.mockResolvedValue({ ok: true, teskari_id: 2, yangi_id: 3 });
    montaj();
    fireEvent.click(await screen.findByText('Тест труба ф25'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tuzatish' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' }).at(-1)!);
    expect(api.omborTuzat).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'sintetik xato' } });
    fireEvent.change(screen.getByLabelText('Yangi miqdor'), { target: { value: '6' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' }).at(-1)!);
    await waitFor(() => expect(api.omborTuzat).toHaveBeenCalledTimes(1));
    expect(api.omborTuzat.mock.calls[0][2]).toMatchObject({ harakat_id: 11, yangi: { miqdor: '6' }, sabab: 'sintetik xato' });
  });
});
