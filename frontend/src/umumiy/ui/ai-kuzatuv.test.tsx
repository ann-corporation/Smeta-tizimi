import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ qadamTaklifOl: vi.fn(), fikrYubor: vi.fn(), toast: vi.fn(), hujjatYukla: vi.fn(), sbLoyihaUmumiy: vi.fn() }));
vi.mock('../../api/t2-agent-ish', () => ({ qadamTaklifOl: m.qadamTaklifOl, fikrYubor: m.fikrYubor }));
vi.mock('./Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatYukla: m.hujjatYukla }));
vi.mock('../../api/t2-loyiha', () => ({ sbLoyihaUmumiy: m.sbLoyihaUmumiy }));

import { useAiKuzatuv } from './useAiKuzatuv';
import { AiFikrPanel } from './AiFikrPanel';
import { izHodisasiYubor } from '../../lib/agent-faoliyat';

function Sinov() {
  const k = useAiKuzatuv(5);
  return (
    <div>
      <button type="button" onClick={() => k.almashtir(!k.yoqilgan)}>almashtir</button>
      <span data-testid="holat">{k.yoqilgan ? 'yoq' : 'ochiq'}</span>
      {k.taklif && <div><p>{k.taklif.taklif}</p><button type="button" onClick={k.rad}>rad</button></div>}
    </div>
  );
}

beforeEach(() => { Object.values(m).forEach((f) => f.mockReset()); window.localStorage.clear(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useAiKuzatuv', () => {
  it('standart — O‘CHIQ: xatolar bo‘lsa ham server chaqirilmaydi', async () => {
    render(<MemoryRouter><Sinov /></MemoryRouter>);
    expect(screen.getByTestId('holat').textContent).toBe('ochiq');
    act(() => { for (let i = 0; i < 4; i += 1) izHodisasiYubor('xato', 'xato xabari'); });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(m.qadamTaklifOl).not.toHaveBeenCalled();
  });

  it('yoqilganda takroriy xatolar ixtiyoriy taklifni keltiradi; rad etish uni yopadi va sovitadi', async () => {
    m.qadamTaklifOl.mockResolvedValue({ ok: true, natija: { taklif: 'Xohlasangiz F2 importni sinab ko‘ring', yol: '/admin/f2-import' } });
    render(<MemoryRouter><Sinov /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'almashtir' }));
    expect(screen.getByTestId('holat').textContent).toBe('yoq');
    act(() => { for (let i = 0; i < 3; i += 1) izHodisasiYubor('xato', 'xato xabari'); });
    await act(async () => { vi.advanceTimersByTime(16_000); });
    await waitFor(() => expect(screen.getByText('Xohlasangiz F2 importni sinab ko‘ring')).toBeTruthy());
    expect(m.qadamTaklifOl).toHaveBeenCalledTimes(1);
    const [komp, , iz] = m.qadamTaklifOl.mock.calls[0] as [number, string, Array<{ tur: string; nom: string }>];
    expect(komp).toBe(5);
    expect(iz.filter((e) => e.tur === 'xato')).toHaveLength(3);
    expect(JSON.stringify(iz)).not.toMatch(/\d{4}/);
    fireEvent.click(screen.getByText('rad'));
    expect(screen.queryByText('Xohlasangiz F2 importni sinab ko‘ring')).toBeNull();
    expect(window.localStorage.getItem('t2_ai_rad_soni')).toBe('1');
    act(() => { for (let i = 0; i < 3; i += 1) izHodisasiYubor('xato', 'xato xabari'); });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(m.qadamTaklifOl).toHaveBeenCalledTimes(1);
  });

  it('o‘chirilganda iz tozalanadi va keyingi xatolar yig‘ilmaydi', async () => {
    render(<MemoryRouter><Sinov /></MemoryRouter>);
    const b = screen.getByRole('button', { name: 'almashtir' });
    fireEvent.click(b); fireEvent.click(b);
    expect(screen.getByTestId('holat').textContent).toBe('ochiq');
    act(() => { for (let i = 0; i < 3; i += 1) izHodisasiYubor('xato', 'xato xabari'); });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(m.qadamTaklifOl).not.toHaveBeenCalled();
  });
});

describe('AiFikrPanel', () => {
  it('fikr yuboriladi: tur, matn, sahifa uzatiladi; AI javobi ko‘rinadi', async () => {
    m.fikrYubor.mockResolvedValue({ ok: true, natija: { fikr_id: 1, javob: 'Qayd etdim.', ulashildi: true } });
    render(<AiFikrPanel kompaniyaId={5} sahifa="/admin/f2" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'etiroz' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hisobot noto‘g‘ri chiqdi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect(m.fikrYubor).toHaveBeenCalledWith(5, expect.objectContaining({ tur: 'etiroz', matn: 'Hisobot noto‘g‘ri chiqdi', sahifa: '/admin/f2' })));
    expect(await screen.findByText('Qayd etdim.')).toBeTruthy();
  });

  it('skrinshot avval «Umumiy» loyihaga R2 ga yuklanadi, so‘ng tahlilga uzatiladi', async () => {
    m.sbLoyihaUmumiy.mockResolvedValue({ ok: true, id: 9 }); m.hujjatYukla.mockResolvedValue({ ok: true, data: { document_id: 77 } });
    m.fikrYubor.mockResolvedValue({ ok: true, natija: { fikr_id: 2, javob: null, ulashildi: false } });
    render(<AiFikrPanel kompaniyaId={5} sahifa="/admin/f2" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Xato oynasi chiqdi' } });
    fireEvent.change(screen.getByLabelText('Skrinshot', { selector: 'input' }), { target: { files: [new File(['x'.repeat(200)], 's.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect(m.fikrYubor).toHaveBeenCalled());
    expect(m.hujjatYukla).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 5, loyihaId: 9, documentType: 'fikr_skrin' }));
    const p = m.fikrYubor.mock.calls[0][1] as { skrinIds: number[]; skrinTahlil: { mimeType: string; data: string } };
    expect(p.skrinIds).toEqual([77]); expect(p.skrinTahlil.mimeType).toBe('image/png'); expect(p.skrinTahlil.data.length).toBeGreaterThan(10);
  });

  it('rasm bo‘lmagan fayl rad etiladi; kompaniyasiz yuborish yo‘q', () => {
    render(<AiFikrPanel kompaniyaId={5} sahifa="/x" />);
    fireEvent.change(screen.getByLabelText('Skrinshot', { selector: 'input' }), { target: { files: [new File(['x'], 'a.exe', { type: 'application/x-msdownload' })] } });
    expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('PNG'), 'warn');
    cleanup();
    render(<AiFikrPanel kompaniyaId={undefined} sahifa="/x" />);
    expect(screen.queryByRole('button', { name: 'Yuborish' })).toBeNull();
  });
});
