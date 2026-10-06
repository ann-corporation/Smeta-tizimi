import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  toast: vi.fn(), murojaatlarOl: vi.fn(), murojaatTafsilotOl: vi.fn(), murojaatTurlariOl: vi.fn(), aloqalarOl: vi.fn(), zakazchikObyektlarOl: vi.fn(),
  murojaatJavob: vi.fn(), murojaatQarori: vi.fn(), murojaatYarat: vi.fn(), hujjatYukla: vi.fn(), sbT2LoyihalarOl: vi.fn(),
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5, nom: 'NTB', rol: 'boss' } }) }));
vi.mock('../../api/supabase', async (asl) => ({ ...(await asl<typeof import('../../api/supabase')>()), sbT2ObyektlarOlKomp: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-loyiha', async (asl) => ({ ...(await asl<typeof import('../../api/t2-loyiha')>()), sbT2LoyihalarOl: m.sbT2LoyihalarOl }));
vi.mock('../../api/t2-hujjat-canonical', async (asl) => ({ ...(await asl<typeof import('../../api/t2-hujjat-canonical')>()), hujjatYukla: m.hujjatYukla }));
vi.mock('../../api/t2-tomon', async (asl) => ({
  ...(await asl<typeof import('../../api/t2-tomon')>()),
  murojaatlarOl: m.murojaatlarOl, murojaatTafsilotOl: m.murojaatTafsilotOl, murojaatTurlariOl: m.murojaatTurlariOl, aloqalarOl: m.aloqalarOl,
  zakazchikObyektlarOl: m.zakazchikObyektlarOl, murojaatJavob: m.murojaatJavob, murojaatQarori: m.murojaatQarori, murojaatYarat: m.murojaatYarat,
}));

import Murojaatlar from './Murojaatlar';

const qisqa = (o: Record<string, unknown> = {}) => ({ id: 3, aloqa_id: 1, turi: 'remark', sarlavha: 'Beton sinfi mos emas', muhimlik: 'yuqori', muddat: '2026-10-01', holat: 'ochiq', raund: 1, menga: true,
  qarshi_nom: 'Zakazchik MCHJ', obyekt_nom: 'Fast Food', yaratildi: '2026-09-30T10:00:00Z', yangilandi: '2026-09-30T10:00:00Z', kechikkan: true, ...o });
const tafsilot = (o: Record<string, unknown> = {}) => ({ ok: true, natija: {
  murojaat: { id: 3, aloqa_id: 1, turi: 'remark', sarlavha: 'Beton sinfi mos emas', muhimlik: 'yuqori', muddat: '2026-10-01', holat: 'ochiq', raund: 1, menga: true, men_beruvchiman: false,
    matn: 'B20 quyilgan', joy: '2-qavat', beruvchi_nom: 'Zakazchik MCHJ', ijrochi_nom: 'NTB', obyekt_nom: 'Fast Food', yaratildi: '2026-09-30T10:00:00Z', javob_matn: null, javob_vaqti: null, yopish_izoh: null, ...o },
  hujjatlar: [], hodisalar: [{ id: 1, tur: 'murojaat', matn: 'Beton sinfi mos emas', vaqt: '2026-09-30T10:00:00Z', meni: false, kompaniya_nom: 'Zakazchik MCHJ' }] } });

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.murojaatTurlariOl.mockResolvedValue({ ok: true, natija: [{ kalit: 'remark', nom: 'Remark (izoh/kamchilik)', nom_ru: null }] });
  m.aloqalarOl.mockResolvedValue({ ok: true, natija: [] });
  m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [] });
  m.murojaatlarOl.mockResolvedValue({ ok: true, natija: [qisqa()] });
  m.murojaatTafsilotOl.mockResolvedValue(tafsilot());
  m.sbT2LoyihalarOl.mockResolvedValue({ ok: true, qatorlar: [{ id: 9, nom: 'Loyiha' }] });
});
afterEach(cleanup);

describe('Murojaatlar', () => {
  it('kechikkan murojaat belgilanadi; ijrochi javobi matnsiz yuborilmaydi, matn bilan serverga ketadi', async () => {
    render(<Murojaatlar />);
    expect(await screen.findByText('Kechikkan')).toBeTruthy();
    fireEvent.click(screen.getByText('Beton sinfi mos emas'));
    const bajar = await screen.findByRole('button', { name: 'Bajarildi' });
    expect((bajar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Nima qilindi/), { target: { value: 'Beton almashtirildi' } });
    m.murojaatJavob.mockResolvedValue({ ok: true, natija: { dalil_soni: 0 } });
    fireEvent.click(screen.getByRole('button', { name: 'Bajarildi' }));
    await waitFor(() => expect(m.murojaatJavob).toHaveBeenCalledWith(5, 3, 'Beton almashtirildi', []));
  });

  it('dalil fayli avval R2 ga yuklanadi, keyin hujjat ID si javob bilan ketadi', async () => {
    render(<Murojaatlar />);
    fireEvent.click(await screen.findByText('Beton sinfi mos emas'));
    await screen.findByRole('button', { name: 'Bajarildi' });
    fireEvent.change(screen.getByPlaceholderText(/Nima qilindi/), { target: { value: 'Protokol ilova' } });
    fireEvent.change(screen.getByLabelText('Dalil fayllari', { selector: 'input' }), { target: { files: [new File(['x'], 'protokol.pdf', { type: 'application/pdf' })] } });
    m.hujjatYukla.mockResolvedValue({ ok: true, data: { document_id: 77 } });
    m.murojaatJavob.mockResolvedValue({ ok: true, natija: { dalil_soni: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Bajarildi' }));
    await waitFor(() => expect(m.murojaatJavob).toHaveBeenCalledWith(5, 3, 'Protokol ilova', [77]));
    expect(m.hujjatYukla).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 5, loyihaId: 9, documentType: 'murojaat_dalil' }));
  });

  it('loyihasi yo‘q kompaniyada fayl yuklanmaydi va tushunarli xabar chiqadi', async () => {
    m.sbT2LoyihalarOl.mockResolvedValue({ ok: true, qatorlar: [] });
    render(<Murojaatlar />);
    fireEvent.click(await screen.findByText('Beton sinfi mos emas'));
    await screen.findByRole('button', { name: 'Bajarildi' });
    fireEvent.change(screen.getByPlaceholderText(/Nima qilindi/), { target: { value: 'Protokol ilova' } });
    fireEvent.change(screen.getByLabelText('Dalil fayllari', { selector: 'input' }), { target: { files: [new File(['x'], 'p.pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Bajarildi' }));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('loyiha'), 'danger'));
    expect(m.hujjatYukla).not.toHaveBeenCalled();
    expect(m.murojaatJavob).not.toHaveBeenCalled();
  });

  it('beruvchi: bajarilganni sababsiz qayta ocholmaydi, yopa oladi', async () => {
    m.murojaatlarOl.mockResolvedValue({ ok: true, natija: [qisqa({ menga: false, holat: 'bajarildi', kechikkan: false })] });
    m.murojaatTafsilotOl.mockResolvedValue(tafsilot({ menga: false, men_beruvchiman: true, holat: 'bajarildi', javob_matn: 'Almashtirildi' }));
    render(<Murojaatlar />);
    fireEvent.click(screen.getByRole('button', { name: 'Mendan' }));
    fireEvent.click(await screen.findByText('Beton sinfi mos emas'));
    fireEvent.click(await screen.findByRole('button', { name: 'Qayta ochish' }));
    expect(m.murojaatQarori).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('sababini'), 'danger');
    m.murojaatQarori.mockResolvedValue({ ok: true, natija: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Qabul qilish va yopish' }));
    await waitFor(() => expect(m.murojaatQarori).toHaveBeenCalledWith(5, 3, 'yopish', ''));
  });
});
