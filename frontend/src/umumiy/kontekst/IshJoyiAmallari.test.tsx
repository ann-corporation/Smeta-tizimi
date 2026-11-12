/* Regressiya: «＋ Ish joyi qo‘shish» bandlari BLOKLOVCHI window.prompt ni chaqirmaydi (avtomatlashtirilgan brauzerda asosiy oqim ~45 s qotgan edi). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ yarat: vi.fn(), qoshil: vi.fn(), qayta: vi.fn(), tanla: vi.fn() }));
vi.mock('../../api/t2-ish-joyi', () => ({ ishJoyiYarat: m.yarat, qoshil: m.qoshil, ishJoyiXato: (r: { code?: string }) => r.code || 'xato' }));
vi.mock('./KompaniyaKontekst', () => ({ useKompaniya: () => ({ qayta: m.qayta, tanla: m.tanla }) }));
import { IshJoyiAmallari } from './IshJoyiAmallari';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const ochMenyu = () => fireEvent.click(screen.getByRole('button', { name: 'Ish joyi qo‘shish' }));

describe('IshJoyiAmallari — prompt YO‘Q, forma darhol ko‘rinadi', () => {
  for (const [band, forma] of [['Yangi tashkilot (jamoa)', 'Tashkilot (jamoa) nomi:'], ['Yangi shaxsiy ish joyi', 'Shaxsiy ish joyi nomi:'], ['Havola orqali qo‘shilish', 'Taklif havolasi yoki kodini kiriting:']] as const) {
    it(`«${band}» → forma sinxron, window.prompt/confirm chaqirilmaydi`, () => {
      const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => { throw new Error('window.prompt chaqirildi'); });
      const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('window.confirm chaqirildi'); });
      render(<IshJoyiAmallari />);
      ochMenyu();
      const t0 = performance.now();
      fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(band.replace(/[()]/g, '\\$&')) }));
      expect(screen.getByLabelText(forma)).toBeTruthy();
      expect(performance.now() - t0).toBeLessThan(1000);
      expect(prompt).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    });
  }
  it('forma yuborilganda ishJoyiYarat nom va turi bilan chaqiriladi', async () => {
    m.yarat.mockResolvedValue({ ok: true, kompaniya_id: 7 });
    render(<IshJoyiAmallari />);
    ochMenyu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Yangi tashkilot/ }));
    fireEvent.change(screen.getByLabelText('Tashkilot (jamoa) nomi:'), { target: { value: 'Sinov jamoa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Davom etish' }));
    await waitFor(() => expect(m.yarat).toHaveBeenCalledWith('Sinov jamoa', 'tashkilot'));
    await waitFor(() => expect(m.qayta).toHaveBeenCalled());
  });
  it('havola formasi qoshil() ga kodni uzatadi', async () => {
    m.qoshil.mockResolvedValue({ ok: true, kompaniya_id: 9, nom: 'X' });
    render(<IshJoyiAmallari />);
    ochMenyu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Havola orqali/ }));
    fireEvent.change(screen.getByLabelText('Taklif havolasi yoki kodini kiriting:'), { target: { value: 'https://x.example/qoshil/abc-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Davom etish' }));
    await waitFor(() => expect(m.qoshil).toHaveBeenCalledWith('ABC-1'));
  });
});
