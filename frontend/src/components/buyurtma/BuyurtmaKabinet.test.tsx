import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  buyurtmalarOl: vi.fn(), buyurtmaTafsilotOl: vi.fn(), buyurtmaOtish: vi.fn(), buyurtmaOlishYoz: vi.fn(),
}));
const tomon = vi.hoisted(() => ({ aloqalarOl: vi.fn() }));
vi.mock('../../api/t2-buyurtma', async (asl) => ({ ...(await asl<typeof import('../../api/t2-buyurtma')>()), ...api }));
vi.mock('../../api/t2-tomon', () => tomon);
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));

import { BuyurtmaKabinet } from './BuyurtmaKabinet';

const royxat = (id: number, holat: string, versiya = 1) => ({ id, tur: 'material', holat, bosqich: null, obyekt_id: null, summa_nds_siz: null, yetkazish_narx: null, qqs_foiz: null,
  versiya, yaratildi: '2026-11-11T00:00:00Z', xaridor_kompaniya_id: 17, ijrochi_kompaniya_id: 31, qator_soni: 2 });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  tomon.aloqalarOl.mockResolvedValue({ ok: true, natija: [{ id: 8, holat: 'faol', turi: 'shartnoma', nom: null, qarshi_kompaniya_id: 17, qarshi_nom: 'Xaridor MChJ' }] });
  api.buyurtmalarOl.mockResolvedValue({ ok: true, qatorlar: [royxat(1, 'yuborildi', 1), royxat(2, 'qabul_qilindi', 3), royxat(3, 'bajarilmoqda', 5), royxat(4, 'tayyor', 7), royxat(5, 'topshirildi', 9)], keyingi_id: null });
  api.buyurtmaOtish.mockResolvedValue({ ok: true, versiya: 2 });
});
afterEach(cleanup);

const qator = async (id: number) => (await screen.findByText('#' + id)).closest('li') as HTMLElement;

describe('Yetkazuvchi kabineti: «Menga kelgan buyurtmalar»', () => {
  it('«menga» yo\'nalishi so\'raladi; har holatda bitta asosiy tugma; topshirilgan buyurtmada tugma yo\'q (xaridor qabul qiladi)', async () => {
    render(<BuyurtmaKabinet kompaniyaId={31} />);
    await qator(1);
    expect(api.buyurtmalarOl).toHaveBeenCalledWith({ kompaniyaId: 31, yonalish: 'menga', limit: 100 });
    expect(within(await qator(1)).getByRole('button', { name: 'Qabul qilish' })).toBeTruthy();
    expect(within(await qator(2)).getByRole('button', { name: 'Bajarishni boshlash' })).toBeTruthy();
    expect(within(await qator(3)).getByRole('button', { name: 'Tayyor' })).toBeTruthy();
    expect(within(await qator(4)).getByRole('button', { name: 'Topshirdim' })).toBeTruthy();
    const oxirgi = await qator(5);
    expect(within(oxirgi).queryByRole('button', { name: /Qabul qilish|Bajarishni|Tayyor|Topshirdim/ })).toBeNull();
    expect(within(oxirgi).getByText('Xaridor qabul qilishini kutmoqda')).toBeTruthy();
    expect(within(await qator(1)).getByText('Xaridor MChJ')).toBeTruthy();
  });

  it('«Qabul qilish» -> otish(qabul_qilindi) joriy versiya bilan; keyin ro\'yxat qayta yuklanadi', async () => {
    render(<BuyurtmaKabinet kompaniyaId={31} />);
    fireEvent.click(within(await qator(1)).getByRole('button', { name: 'Qabul qilish' }));
    await waitFor(() => expect(api.buyurtmaOtish).toHaveBeenCalledWith(31, { buyurtmaId: 1, kutilganVersiya: 1, holat: 'qabul_qilindi' }));
    await waitFor(() => expect(api.buyurtmalarOl).toHaveBeenCalledTimes(2));
  });

  it('zanjir: Bajarishni boshlash > Topshirdim yagona qadamlar (bajarilmoqda va topshirildi holatlariga)', async () => {
    render(<BuyurtmaKabinet kompaniyaId={31} />);
    fireEvent.click(within(await qator(2)).getByRole('button', { name: 'Bajarishni boshlash' }));
    await waitFor(() => expect(api.buyurtmaOtish).toHaveBeenLastCalledWith(31, { buyurtmaId: 2, kutilganVersiya: 3, holat: 'bajarilmoqda' }));
    fireEvent.click(within(await qator(4)).getByRole('button', { name: 'Topshirdim' }));
    await waitFor(() => expect(api.buyurtmaOtish).toHaveBeenLastCalledWith(31, { buyurtmaId: 4, kutilganVersiya: 7, holat: 'topshirildi' }));
  });

  it('«Tayyor»: baza olib ketish joyini so\'rasa (OLISH_KERAK) - manzil so\'raladi, so\'ng olish_yoz va tayyor', async () => {
    api.buyurtmaOtish.mockResolvedValueOnce({ ok: false, code: 'OLISH_KERAK' }).mockResolvedValue({ ok: true });
    api.buyurtmaOlishYoz.mockResolvedValue({ ok: true, versiya: 6 });
    render(<BuyurtmaKabinet kompaniyaId={31} />);
    fireEvent.click(within(await qator(3)).getByRole('button', { name: 'Tayyor' }));
    const manzil = await screen.findByLabelText('Qayerdan olib ketiladi (ombor, manzil)');
    fireEvent.change(manzil, { target: { value: 'Markaziy ombor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash va tayyor' }));
    await waitFor(() => expect(api.buyurtmaOlishYoz).toHaveBeenCalledWith(31, { buyurtmaId: 3, kutilganVersiya: 5, olish: { manzil: 'Markaziy ombor' } }));
    await waitFor(() => expect(api.buyurtmaOtish).toHaveBeenLastCalledWith(31, { buyurtmaId: 3, kutilganVersiya: 6, holat: 'tayyor' }));
  });

  it('manzilsiz «Saqlash va tayyor» hech narsa yubormaydi', async () => {
    api.buyurtmaOtish.mockResolvedValueOnce({ ok: false, code: 'OLISH_KERAK' });
    render(<BuyurtmaKabinet kompaniyaId={31} />);
    fireEvent.click(within(await qator(3)).getByRole('button', { name: 'Tayyor' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Saqlash va tayyor' }));
    expect(api.buyurtmaOlishYoz).not.toHaveBeenCalled();
  });

  it('buyurtma yo\'q bo\'lsa - oddiy xabar', async () => {
    api.buyurtmalarOl.mockResolvedValue({ ok: true, qatorlar: [], keyingi_id: null });
    render(<BuyurtmaKabinet kompaniyaId={31} />);
    expect(await screen.findByText('Hozircha sizga buyurtma kelmagan.')).toBeTruthy();
  });

  it('«Tarkibi» buyurtma qatorlarini ko\'rsatadi', async () => {
    api.buyurtmaTafsilotOl.mockResolvedValue({ ok: true, tomon: 'ijrochi', buyurtma: { id: 1 }, qatorlar: [{ id: 11, qator_no: 1, nom: 'Sement M400', birlik: 'tonna', miqdor: 12 }] });
    render(<BuyurtmaKabinet kompaniyaId={31} />);
    fireEvent.click(within(await qator(1)).getByRole('button', { name: 'Tarkibi' }));
    expect(await screen.findByText('Sement M400')).toBeTruthy();
    expect(api.buyurtmaTafsilotOl).toHaveBeenCalledWith(31, 1);
  });
});
