import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ yetim: vi.fn(), kochir: vi.fn(), ai: vi.fn(), tasdiq: vi.fn() }));
vi.mock('../api/t2-hujjat-maydoni', async (orig) => ({ ...(await orig<object>()), hmYetim: m.yetim, hmYetimKochir: m.kochir, hmYetimAi: m.ai }));
vi.mock('../umumiy/ui/Tasdiq', () => ({ tasdiqSora: m.tasdiq, matnSora: vi.fn() }));
vi.mock('../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
import { YetimTaklif } from './YetimTaklif';

const tk = (faylId: number, o: Record<string, unknown> = {}) => ({ faylId, daraja: 'yoq', manba: null, loyihaId: null, obyektId: null, loyihaNom: null, obyektNom: null, ball: 0, ...o });
const aniq = (faylId: number) => tk(faylId, { daraja: 'aniq', manba: 'nom', loyihaId: 1, obyektId: 11, loyihaNom: 'Navoiy bog‘', obyektNom: 'Karting', ball: 0.9 });
const royxat = (fayllar: unknown[], daraja = 4) => ({
  ok: true, papka_id: 70, daraja, fayllar, loyihalar: [{ id: 1, nom: 'Navoiy bog‘' }],
  obyektlar: [{ id: 11, nom: 'Karting', loyiha_id: 1, loyiha_nom: 'Navoiy bog‘' }],
});
const f = (id: number, nom: string, taklif: unknown) => ({ id, nom, bayt: 10, versiya: 1, yangilandi: null, hujjat_turi: null, taklif });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Disk A4: Biriktirilmagan taklifi', () => {
  it('aniq taklif ko‘rinadi va «Ko‘chirish» bir bosishda to‘g‘ri loyiha/obyekt bilan chaqiradi', async () => {
    m.yetim.mockResolvedValue(royxat([f(1, 'a.xlsx', aniq(1))]));
    m.kochir.mockResolvedValue({ ok: true, fayl_id: 1, papka_id: 9 });
    const yangila = vi.fn();
    render(<YetimTaklif kompId={17} papkaId={70} onOzgardi={yangila} />);
    expect((await screen.findByTestId('yetim-taklif-matn')).textContent).toContain('Navoiy bog‘ › Karting');
    fireEvent.click(screen.getByRole('button', { name: 'Ko‘chirish' }));
    await waitFor(() => expect(m.kochir).toHaveBeenCalledWith(17, 1, 1, 11));
    await waitFor(() => expect(yangila).toHaveBeenCalled());
  });
  it('mos kelmaydigan fayl: taklif yo‘q, Ko‘chirish o‘chiq; qo‘lda tanlansa yoqiladi', async () => {
    m.yetim.mockResolvedValue(royxat([f(2, 'x.pdf', tk(2))]));
    render(<YetimTaklif kompId={17} papkaId={70} onOzgardi={vi.fn()} />);
    expect(await screen.findByTestId('yetim-taklif-yoq')).toBeTruthy();
    const tugma = screen.getByRole('button', { name: 'Ko‘chirish' }) as HTMLButtonElement;
    expect(tugma.disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o:11' } });
    expect(tugma.disabled).toBe(false);
    m.kochir.mockResolvedValue({ ok: true, fayl_id: 2, papka_id: 9 });
    fireEvent.click(tugma);
    await waitFor(() => expect(m.kochir).toHaveBeenCalledWith(17, 2, 1, 11));
  });
  it('«Hammasini» tasdiq dialogidan keyin FAQAT taklifi bor fayllarni ko‘chiradi; rad etilsa hech narsa o‘zgarmaydi', async () => {
    m.yetim.mockResolvedValue(royxat([f(1, 'a', aniq(1)), f(2, 'b', tk(2)), f(3, 'c', aniq(3))]));
    m.kochir.mockResolvedValue({ ok: true, fayl_id: 1, papka_id: 9 });
    render(<YetimTaklif kompId={17} papkaId={70} onOzgardi={vi.fn()} />);
    const hammasi = await screen.findByRole('button', { name: /Hammasini taklif bo‘yicha ko‘chirish/ });
    m.tasdiq.mockResolvedValueOnce(false);
    fireEvent.click(hammasi);
    await waitFor(() => expect(m.tasdiq).toHaveBeenCalledTimes(1));
    expect(m.kochir).not.toHaveBeenCalled();
    m.tasdiq.mockResolvedValueOnce(true);
    fireEvent.click(hammasi);
    await waitFor(() => expect(m.kochir).toHaveBeenCalledTimes(2));
    expect(m.kochir.mock.calls.map((c) => c[1])).toEqual([1, 3]);
  });
  it('AI taklifi taklifsiz faylga qo‘shiladi (tasdiqdan keyin)', async () => {
    m.yetim.mockResolvedValue(royxat([f(2, 'b', tk(2))]));
    m.tasdiq.mockResolvedValue(true);
    m.ai.mockResolvedValue({ ok: true, ai_chaqirildi: true, takliflar: [tk(2, { daraja: 'taxminiy', manba: 'ai', loyihaId: 1, obyektId: 11, loyihaNom: 'Navoiy bog‘', obyektNom: 'Karting', ball: 0.8 })] });
    render(<YetimTaklif kompId={17} papkaId={70} onOzgardi={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /AI bilan aniqlash/ }));
    await waitFor(() => expect(m.ai).toHaveBeenCalledWith(17, [2]));
    expect((await screen.findByTestId('yetim-taklif-matn')).textContent).toContain('Karting');
  });
  it('boshqa papka (foydalanuvchining shu nomli papkasi) yoki ruxsati faqat o‘qish: panel chiqmaydi / tugmalar yo‘q', async () => {
    m.yetim.mockResolvedValue(royxat([f(1, 'a', aniq(1))]));
    const { container } = render(<YetimTaklif kompId={17} papkaId={999} onOzgardi={vi.fn()} />);
    await waitFor(() => expect(m.yetim).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    cleanup();
    m.yetim.mockResolvedValue(royxat([f(1, 'a', aniq(1))], 1));
    render(<YetimTaklif kompId={17} papkaId={70} onOzgardi={vi.fn()} />);
    await screen.findByTestId('yetim-taklif-matn');
    expect(screen.queryByRole('button', { name: 'Ko‘chirish' })).toBeNull();
  });
});
