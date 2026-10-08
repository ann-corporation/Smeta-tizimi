import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ toast: vi.fn(), holat: vi.fn(), kuz: vi.fn(), bilim: vi.fn(), yigish: vi.fn(), saqla: vi.fn(), yoz: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-agent-ish', () => ({ bilimHolatiOl: m.holat, kuzatuvOl: m.kuz, bilimOl: m.bilim, bilimYigish: m.yigish, kuzatuvSaqla: m.saqla, bilimYoz: m.yoz }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));

import { AiBoshqaruvchi } from './AiBoshqaruvchi';

const markaz = { sonlar: { taklif_kutilmoqda: 3, signal_yangi: 5 } } as never;
const holat = (o: Record<string, unknown> = {}) => ({ ok: true, natija: { bilim_global: 4, bilim_kompaniya: 2, bilim_kutilmoqda: 1, kuzatuv_jami: 1, kuzatuv_ozgargan: 1, oxirgi_veb: [{ url: 'https://norma.uz/x', domen: 'norma.uz', status: 200, sha256: 'abcdef0123456789', yaratildi: '2026-10-08T10:00:00Z' }], ...o } });
const KUZ = { id: 3, url: 'https://norma.uz/x', domen: 'norma.uz', nom: 'ShNQ 3.01.01-22', maqsad: null, faol: true, oxirgi_holat: 'ozgardi', oxirgi_vaqt: '2026-10-08T10:00:00Z', oxirgi_izoh: '2 ta taklif' };
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.holat.mockResolvedValue(holat()); m.kuz.mockResolvedValue({ ok: true, natija: { natija: [KUZ] } });
  m.bilim.mockResolvedValue({ ok: true, natija: { natija: [{ id: 1, doira: 'global', kod: 'k', sarlavha: 'Yashirin ishlar talabi', matn: 'ShNQ band 6', kalit: ['aosr'], manba_url: 'https://norma.uz/x', versiya: 2 }] } });
});
afterEach(cleanup);

describe('AiBoshqaruvchi — boshqaruvchi agent oynasi', () => {
  it('kollektiv holati: takliflar, signallar, bilim, kutayotgan va o‘zgargan manbalar; xavfsizlik chegarasi aytilgan', async () => {
    render(<AiBoshqaruvchi m={markaz} taklifgaOt={vi.fn()} />);
    expect(await screen.findByText('Yashirin ishlar talabi')).toBeTruthy();
    expect(screen.getByText(/faqat taklif qiladi/)).toBeTruthy();
    expect(screen.getByText(/sizning tasdig‘ingizsiz kuchga kirmaydi/)).toBeTruthy();
    for (const n of ['Tasdiq kutayotgan takliflar', 'Yangi signallar', 'Umumiy bilim (faol)', 'Kompaniya bilimi', 'Kutayotgan bilim', 'O‘zgargan manbalar']) expect(screen.getByText(n)).toBeTruthy();
    expect(screen.getByText('O‘zgargan (taklif tayyorlandi)')).toBeTruthy();
  });

  it('«Yangi me‘yorlarni tekshirish» yig‘ishni ishga tushiradi va natijani aytadi', async () => {
    m.yigish.mockResolvedValue({ ok: true, natija: { korildi: 1, ozgardi: 1, takliflar: [41, 42], xatolar: 0 } });
    render(<AiBoshqaruvchi m={markaz} taklifgaOt={vi.fn()} />);
    await screen.findByText('Yashirin ishlar talabi');
    fireEvent.click(screen.getByRole('button', { name: /Yangi me‘yorlarni tekshirish/ }));
    await waitFor(() => expect(m.yigish).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('yangi takliflar: 2'), 'ok'));
  });

  it('kuzatuv sahifasi qo‘shiladi; tasdiqlanmagan domen xatosi ko‘rsatiladi', async () => {
    m.saqla.mockResolvedValueOnce({ ok: false, error: 'Avval bu domenni tasdiqlang', code: 'MANBA_TASDIQLANMAGAN' }).mockResolvedValueOnce({ ok: true, natija: { id: 4 } });
    render(<AiBoshqaruvchi m={markaz} taklifgaOt={vi.fn()} />);
    await screen.findByText('Yashirin ishlar talabi');
    fireEvent.change(screen.getByLabelText('Manba sahifa manzili (https://…)'), { target: { value: 'https://lex.uz/docs/1' } });
    fireEvent.change(screen.getByLabelText('Nomi (masalan: ShNQ 3.01.01-22)'), { target: { value: 'Lex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kuzatuvga qo‘shish' }));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith('Avval bu domenni tasdiqlang', 'danger'));
    fireEvent.click(screen.getByRole('button', { name: 'Kuzatuvga qo‘shish' }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalledTimes(2));
    expect(m.saqla).toHaveBeenLastCalledWith({ url: 'https://lex.uz/docs/1', nom: 'Lex', maqsad: undefined, domenniTasdiqla: false });
  });

  it('tasdiqlanmagan domen: tushunarli xabar + «Domenni tasdiqlab qo‘shish» tugmasi (bir bosishda), tavsiya manbalar maydonni to‘ldiradi', async () => {
    m.saqla.mockResolvedValueOnce({ ok: false, error: 'Bu domen tasdiqlangan manbalar ro‘yxatida yo‘q', code: 'MANBA_TASDIQLANMAGAN' }).mockResolvedValueOnce({ ok: true, natija: { id: 5 } });
    render(<AiBoshqaruvchi m={markaz} taklifgaOt={vi.fn()} />);
    await screen.findByText('Yashirin ishlar talabi');
    fireEvent.click(screen.getByRole('button', { name: 'lex.uz' }));
    expect((screen.getByLabelText('Manba sahifa manzili (https://…)') as HTMLInputElement).value).toBe('https://lex.uz');
    fireEvent.click(screen.getByRole('button', { name: 'Kuzatuvga qo‘shish' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Domenni tasdiqlab qo‘shish' }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalledTimes(2));
    expect(m.saqla).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://lex.uz', domenniTasdiqla: true }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Domenni tasdiqlab qo‘shish' })).toBeNull());
  });

  it('kuzatuv yo‘q bo‘lsa tekshirish tugmasi o‘chiq; kutayotgan takliflarga o‘tish tugmasi ishlaydi', async () => {
    m.kuz.mockResolvedValue({ ok: true, natija: { natija: [] } });
    const ot = vi.fn();
    render(<AiBoshqaruvchi m={markaz} taklifgaOt={ot} />);
    await screen.findByText('Hali kuzatiladigan sahifa yo‘q.');
    expect((screen.getByRole('button', { name: /Yangi me‘yorlarni tekshirish/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kutayotgan takliflarni ko‘rib chiqish' }));
    expect(ot).toHaveBeenCalled();
  });

  it('bilimni qo‘lda qo‘shish: qisqa matn bilan tugma bloklangan; to‘liq bo‘lsa serverga ketadi', async () => {
    m.yoz.mockResolvedValue({ ok: true, natija: { taklif_id: 9, qabul: true, kutilmoqda: false } });
    render(<AiBoshqaruvchi m={markaz} taklifgaOt={vi.fn()} />);
    await screen.findByText('Yashirin ishlar talabi');
    fireEvent.click(screen.getByText('Bilimni qo‘lda qo‘shish'));
    const saqla = screen.getByRole('button', { name: 'Bilimni saqlash' }) as HTMLButtonElement;
    expect(saqla.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Sarlavha'), { target: { value: 'Qoida' } });
    fireEvent.change(screen.getByLabelText('Matn (manba va bandini ko‘rsating)'), { target: { value: 'Yetarlicha uzun matn: ShNQ band 4.' } });
    fireEvent.change(screen.getByLabelText('Kalit so‘zlar (vergul bilan)'), { target: { value: 'qoida, band' } });
    expect(saqla.disabled).toBe(false);
    fireEvent.click(saqla);
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(null, { sarlavha: 'Qoida', matn: 'Yetarlicha uzun matn: ShNQ band 4.', kalit: 'qoida, band' }));
  });

  it('server rad etsa (superadmin emas) xato ko‘rsatiladi, panel ochilmaydi', async () => {
    m.holat.mockResolvedValue({ ok: false, error: 'Faqat platforma superadmini' });
    render(<AiBoshqaruvchi m={markaz} taklifgaOt={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('superadmini');
  });
});
