import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { f2NiyatlariniTekshir } from '../../lib/smeta-ai/protokol';
import type { F2Bolim } from '../../lib/f2-tayyor';

const m = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock('../../api/smeta-ai', () => ({ smetachiF2Niyat: m.ai }));
import { F2AiReja } from './F2AiReja';

const bolimlar: F2Bolim[] = [
  { id: 1, nom: 'ФУНДАМЕНТЫ', daraja: 0, alohida: [], ishlar: [{ id: 4, kod: null, nom: 'ЗАСЫПКА ПАЗУХ ФУНДАМЕНТОВ', birlik: 'м3', mumkin: 40, smeta: 40, olingan: 0, resurslar: [] }] },
];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('F2 yordamchi (B8)', () => {
  it('AI siz: matn → reja (✓), «Qoralamaga qo‘shish» faqat ✓ hajmni uzatadi', () => {
    const qosh = vi.fn();
    render(<F2AiReja bolimlar={bolimlar} kompaniyaId={1} onQoshish={qosh} />);
    fireEvent.change(screen.getByLabelText('Shu oy nima bajarildi?'), { target: { value: 'засыпка пазух 15 м3\nмонтаж вентиляции 2 м3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reja tuzish' }));
    expect(screen.getByText(/yagona nomzod/)).toBeTruthy();
    expect(screen.getByText(/mos ish topilmadi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Qoralamaga qo‘shish/ }));
    expect(qosh).toHaveBeenCalledWith({ 4: '15' });
    expect(m.ai).not.toHaveBeenCalled();
  });

  it('AI bilan: niyatlar AI dan keladi, moslash kod bilan; AI xatosi — AI siz davom etish xabari', async () => {
    m.ai.mockResolvedValueOnce({ ok: true, niyatlar: [{ tavsif: 'засыпка пазух', birlik: 'м3', hajm: '3*2', razdel: null }] });
    render(<F2AiReja bolimlar={bolimlar} kompaniyaId={1} onQoshish={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Shu oy nima bajarildi?'), { target: { value: 'erkin matn' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI bilan tushunish' }));
    await waitFor(() => expect(screen.getByText(/yagona nomzod/)).toBeTruthy());
    m.ai.mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByRole('button', { name: 'AI bilan tushunish' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('AI hozir javob bermadi'));
  });
});

describe('f2NiyatlariniTekshir', () => {
  it('sxema: bo‘sh tavsif tashlanadi, hajm faqat raqam/amal, noma‘lum matn rad', () => {
    const r = f2NiyatlariniTekshir({ niyatlar: [
      { tavsif: ' betonlash ', birlik: 'm3', hajm: '12*0,6', razdel: null },
      { tavsif: '', hajm: '5' },
      { tavsif: 'armatura', birlik: null, hajm: 'taxminan ko‘p', razdel: ' Fundament ' },
      { tavsif: 'kabel', hajm: 7 },
    ] });
    expect(r).toEqual([
      { tavsif: 'betonlash', birlik: 'm3', hajm: '12*0,6', razdel: null },
      { tavsif: 'armatura', birlik: null, hajm: null, razdel: 'Fundament' },
      { tavsif: 'kabel', birlik: null, hajm: '7', razdel: null },
    ]);
    expect(f2NiyatlariniTekshir(null)).toEqual([]);
  });
});
