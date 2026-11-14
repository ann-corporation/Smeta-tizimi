import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const zay = vi.hoisted(() => ({ sbZayavkalarOl: vi.fn(), sbZayavkaYoz: vi.fn(), sbZayavkaHolatYoz: vi.fn() }));
const buy = vi.hoisted(() => ({ buyurtmalarOl: vi.fn(), buyurtmaTafsilotOl: vi.fn(), buyurtmaYarat: vi.fn(), buyurtmaQabul: vi.fn(), buyurtmaQabulYakunla: vi.fn() }));
const tomon = vi.hoisted(() => ({ aloqalarOl: vi.fn() }));
vi.mock('./KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17, nom: 'Xaridor MChJ' } }) }));
vi.mock('../api/t2-zayavka', () => zay);
const sbOqi = vi.hoisted(() => vi.fn());
vi.mock('../api/supabase', () => ({ sbOqi, sbT2ObyektlarOlKomp: vi.fn(async () => ({ qatorlar: [{ id: 5, nom: 'Obyekt A' }] })), yangiOperationId: () => 'op-1' }));
vi.mock('../api/t2-buyurtma', async (asl) => ({ ...(await asl<typeof import('../api/t2-buyurtma')>()), ...buy }));
vi.mock('../api/t2-tomon', () => tomon);
const toast = vi.hoisted(() => vi.fn());
vi.mock('../umumiy/ui/Toast', () => ({ toast }));

import TestZayavka from './TestZayavka';

const zayavka = (ustiga: Record<string, unknown> = {}) => ({ id: 44, kompaniyaId: 17, obyektId: 5, materialId: null, itemText: 'Sement M400', requestedQty: 20, unit: 'tonna',
  requiredDate: null, priority: null, note: null, status: 'procurement', deliveredQty: 5, remainingQty: 15, version: 2, createdAt: '2026-11-10T00:00:00Z', ...ustiga });
const buyurtma = (ustiga: Record<string, unknown> = {}) => ({ id: 9, tur: 'material', holat: 'yuborildi', bosqich: null, obyekt_id: 5, summa_nds_siz: null, yetkazish_narx: null, qqs_foiz: null, versiya: 1,
  yaratildi: '2026-11-11T00:00:00Z', xaridor_kompaniya_id: 17, ijrochi_kompaniya_id: 31, qator_soni: 1, ...ustiga });
const faolAloqa = { id: 8, holat: 'faol', turi: 'shartnoma', nom: null, qarshi_kompaniya_id: 31, qarshi_nom: 'Yetkazuvchi MChJ' };

beforeEach(() => {
  [zay, buy, tomon].forEach((m) => Object.values(m).forEach((f) => f.mockReset()));
  toast.mockReset();
  sbOqi.mockReset();
  sbOqi.mockResolvedValue({ ok: true, qatorlar: [] });
  zay.sbZayavkalarOl.mockResolvedValue({ qatorlar: [zayavka()] });
  zay.sbZayavkaHolatYoz.mockResolvedValue({ ok: true });
  buy.buyurtmalarOl.mockResolvedValue({ ok: true, qatorlar: [], keyingi_id: null });
  tomon.aloqalarOl.mockResolvedValue({ ok: true, natija: [faolAloqa] });
});
afterEach(cleanup);

const ochish = () => render(<MemoryRouter><TestZayavka /></MemoryRouter>);
const jadvaldagiTugma = async () => within(await screen.findByRole('table')).getByRole('button', { name: 'Buyurtma berish' });

describe('Zayavka sahifasi: smetadan material tanlash', () => {
  it('smeta materiallari KIRILL kat (МАТ, ОБ) bo‘yicha so‘raladi va tanlov ro‘yxatiga tushadi (avval lotin mat/ob — doim bo‘sh edi)', async () => {
    sbOqi.mockResolvedValue({ ok: true, qatorlar: [{ nom: 'Бетон B25', birlik: 'м3', hajm: 40 }] });
    const { container } = render(<MemoryRouter initialEntries={['/admin/zayavka?obyekt=5&yarat=1']}><TestZayavka /></MemoryRouter>);
    await waitFor(() => expect(sbOqi).toHaveBeenCalledTimes(1));
    const so = sbOqi.mock.calls[0][0] as { jadval: string; filtr: string };
    expect(so.jadval).toBe('t2_qator');
    expect(decodeURIComponent(so.filtr)).toBe('obyekt_id=eq.5&kat=in.(МАТ,ОБ)');
    await waitFor(() => expect(container.querySelector('datalist#zayavka-materiallar option')?.getAttribute('value')).toBe('Бетон B25'));
  });
});

describe('Zayavka sahifasi: Buyurtma berish', () => {
  it('faqat ta\'minotdagi zayavkada ko\'rinadi; eski «Buyurtma» holat tugmasi o\'rniga', async () => {
    zay.sbZayavkalarOl.mockResolvedValue({ qatorlar: [zayavka({ id: 1, status: 'approved' }), zayavka({ id: 2, status: 'procurement', itemText: 'Armatura' })] });
    ochish();
    await screen.findByText('Armatura');
    expect(screen.getAllByRole('button', { name: 'Buyurtma berish' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Buyurtma' })).toBeNull();
  });

  it('faol aloqali yetkazuvchi yo\'q: tushunarli xabar + taklif havolasi, yuborish tugmasi o\'chiq', async () => {
    tomon.aloqalarOl.mockResolvedValue({ ok: true, natija: [{ ...faolAloqa, holat: 'taklif' }, { ...faolAloqa, id: 9, qarshi_kompaniya_id: 40, turi: 'obyekt:5' }] });
    ochish();
    fireEvent.click(await jadvaldagiTugma());
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Yetkazuvchi tizimga ulanmagan — taklif yuboring/)).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Taklif yuborish' }).getAttribute('href')).toBe('/admin/kontragentlar?tab=aloqa');
    expect((within(dialog).getAllByRole('button', { name: 'Buyurtma berish' })[0] as HTMLButtonElement).disabled).toBe(true);
    expect(buy.buyurtmaYarat).not.toHaveBeenCalled();
  });

  it('yetkazuvchi tanlanadi, buyurtma zayavka_id bilan yaratiladi (narx bo\'sh = noma\'lum), zayavka «Buyurtma berildi» ga o\'tadi', async () => {
    buy.buyurtmaYarat.mockResolvedValue({ ok: true, id: 9 });
    ochish();
    fireEvent.click(await jadvaldagiTugma());
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Yetkazuvchi MChJ' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText('Yetkazuvchi'), { target: { value: '31' } });
    expect((within(dialog).getByLabelText('Miqdor') as HTMLInputElement).value).toBe('15');   // yetkazilmagan qismi
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Buyurtma berish' }).at(-1)!);
    await waitFor(() => expect(buy.buyurtmaYarat).toHaveBeenCalledTimes(1));
    expect(buy.buyurtmaYarat).toHaveBeenCalledWith(17, {
      ijrochiKompaniyaId: 31, aloqaId: 8, obyektId: 5,
      qatorlar: [{ nom: 'Sement M400', birlik: 'tonna', miqdor: 15, narx: null, zayavka_id: 44 }],
    }, 'op-1');
    await waitFor(() => expect(zay.sbZayavkaHolatYoz).toHaveBeenCalledWith(17, expect.objectContaining({ id: 44 }), 'ordered'));
  });

  it('yetkazuvchi tanlanmasa yoki baza rad etsa (ALOQA_KERAK) - buyurtma ketmaydi / xabar chiqadi, zayavka holati o\'zgarmaydi', async () => {
    buy.buyurtmaYarat.mockResolvedValue({ ok: false, code: 'ALOQA_KERAK' });
    ochish();
    fireEvent.click(await jadvaldagiTugma());
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Yetkazuvchi MChJ' })).toBeTruthy());
    const yubor = within(dialog).getAllByRole('button', { name: 'Buyurtma berish' }).at(-1)!;
    fireEvent.click(yubor);
    expect(buy.buyurtmaYarat).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Yetkazuvchi'), { target: { value: '31' } });
    fireEvent.click(yubor);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Bu yetkazuvchi bilan faol aloqa yo‘q. Avval taklif yuboring.', 'danger'));
    expect(zay.sbZayavkaHolatYoz).not.toHaveBeenCalled();
  });

  it('berilgan buyurtmalar holat yorlig\'i bilan; «Topshirildi» da bitta tugma «Qabul qildim» -> hammasi to\'liq qabul', async () => {
    buy.buyurtmalarOl.mockResolvedValue({ ok: true, qatorlar: [buyurtma({ id: 9, holat: 'topshirildi', versiya: 6 }), buyurtma({ id: 10, holat: 'qabul_qilindi' })], keyingi_id: null });
    buy.buyurtmaTafsilotOl.mockResolvedValue({ ok: true, tomon: 'xaridor', buyurtma: { id: 9, versiya: 6 }, qatorlar: [{ id: 91, qator_no: 1, nom: 'Sement M400', birlik: 'tonna', miqdor: 15, narx: null }] });
    buy.buyurtmaQabul.mockResolvedValue({ ok: true, holat: 'qabul_qilindi_yakuniy' });
    buy.buyurtmaQabulYakunla.mockResolvedValue({ ok: true, sklad_soni: 1, qarz_soni: 0, ogohlantirish: [] });
    ochish();
    const panel = await screen.findByRole('region', { name: 'Berilgan buyurtmalar' });
    expect(buy.buyurtmalarOl).toHaveBeenCalledWith({ kompaniyaId: 17, yonalish: 'meniki', limit: 100 });
    expect(within(panel).getByText('Topshirildi')).toBeTruthy();
    expect(within(panel).getByText('Qabul qilindi')).toBeTruthy();
    expect(within(panel).getAllByText('narx noma’lum').length).toBe(2);
    expect(within(panel).getAllByRole('button', { name: 'Qabul qildim' })).toHaveLength(1);   // faqat topshirilgan buyurtmada
    fireEvent.click(within(panel).getByRole('button', { name: 'Qabul qildim' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hammasi to‘liq keldi' }));
    await waitFor(() => expect(buy.buyurtmaQabul).toHaveBeenCalledWith(17, {
      buyurtmaId: 9, kutilganVersiya: 6, qatorlar: [{ buyurtma_qator_id: 91, qabul_miqdor: 15, holat: 'butun' }],
    }, expect.any(String)));
    // bitta amal: qabul o'tgach darhol sklad kirimi + qarz asosi
    await waitFor(() => expect(buy.buyurtmaQabulYakunla).toHaveBeenCalledWith(17, { buyurtmaId: 9 }, expect.any(String)));
    await waitFor(() => expect(buy.buyurtmalarOl).toHaveBeenCalledTimes(2));
  });

  it('qabul o\'tdi, yakunlash yiqildi: ogohlantirish, oyna ochiq qoladi; qayta bosilganda qabul QAYTA yuborilmaydi, faqat yakunlash', async () => {
    buy.buyurtmalarOl.mockResolvedValue({ ok: true, qatorlar: [buyurtma({ id: 9, holat: 'topshirildi', versiya: 6 })], keyingi_id: null });
    buy.buyurtmaTafsilotOl.mockResolvedValue({ ok: true, tomon: 'xaridor', buyurtma: { id: 9, versiya: 6 }, qatorlar: [{ id: 91, qator_no: 1, nom: 'Sement M400', birlik: 'tonna', miqdor: 15, narx: null }] });
    buy.buyurtmaQabul.mockClear();
    buy.buyurtmaQabul.mockResolvedValue({ ok: true, holat: 'qabul_qilindi_yakuniy' });
    buy.buyurtmaQabulYakunla.mockClear();
    buy.buyurtmaQabulYakunla.mockResolvedValueOnce({ ok: false, error: 'tarmoq' }).mockResolvedValueOnce({ ok: true, sklad_soni: 1, qarz_soni: 0 });
    ochish();
    fireEvent.click(await screen.findByRole('button', { name: 'Qabul qildim' }));
    const tugma = await screen.findByRole('button', { name: 'Hammasi to‘liq keldi' });
    fireEvent.click(tugma);
    await waitFor(() => expect(buy.buyurtmaQabulYakunla).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Hammasi to‘liq keldi' }));
    await waitFor(() => expect(buy.buyurtmaQabulYakunla).toHaveBeenCalledTimes(2));
    expect(buy.buyurtmaQabul).toHaveBeenCalledTimes(1);
  });

  it('qisman / muammo: har qator miqdori va holati yuboriladi (server nizo/qisman ni o\'zi hal qiladi)', async () => {
    buy.buyurtmalarOl.mockResolvedValue({ ok: true, qatorlar: [buyurtma({ id: 9, holat: 'topshirildi', versiya: 6 })], keyingi_id: null });
    buy.buyurtmaTafsilotOl.mockResolvedValue({ ok: true, tomon: 'xaridor', buyurtma: { id: 9, versiya: 6 }, qatorlar: [{ id: 91, qator_no: 1, nom: 'Sement M400', birlik: 'tonna', miqdor: 15, narx: null }] });
    buy.buyurtmaQabul.mockResolvedValue({ ok: true, holat: 'nizo' });
    ochish();
    fireEvent.click(await screen.findByRole('button', { name: 'Qabul qildim' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Qisman yoki muammo bor' }));
    fireEvent.change(await screen.findByLabelText('Kelgan miqdor: Sement M400'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Holati: Sement M400'), { target: { value: 'shikast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Qabulni saqlash' }));
    await waitFor(() => expect(buy.buyurtmaQabul).toHaveBeenCalledWith(17, {
      buyurtmaId: 9, kutilganVersiya: 6, qatorlar: [{ buyurtma_qator_id: 91, qabul_miqdor: 12, holat: 'shikast' }],
    }, expect.any(String)));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Qabul saqlandi: nizo belgilandi', 'warn'));
  });
});
