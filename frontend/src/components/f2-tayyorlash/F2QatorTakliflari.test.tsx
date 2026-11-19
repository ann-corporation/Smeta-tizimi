import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { F2QatorTakliflari } from './F2QatorTakliflari';
import { qatorTakliflari, takliflarOrnat, takliflarTozala, type TaklifAmallari } from './f2-takliflar-store';
import type { AktTaklif } from '../../lib/tekshiruv/pto';

afterEach(() => { cleanup(); takliflarTozala(41); });
const T = (o: Partial<AktTaklif> = {}): AktTaklif => ({
  id: 1, tekshiruv_id: 9, qator_id: 7, kod: 'A-1', nom: 'Beton', birlik: 'm3', bayroq: 'hajm_notogri', izoh: 'Loyiha bilan mos emas', taklif_hajm: 8, rang: null, hujjat_turi: null,
  qosh: false, qaror: 'kutilmoqda', qaror_sabab: null, hujjat_id: null, joriy_hajm: 12, akt_versiya: 3, eskirgan: false, ...o,
});
const amallar = () => { const qabul = vi.fn(); const qaror = vi.fn(async () => true); return { qabul, qaror, band: false } as TaklifAmallari & { qabul: typeof qabul; qaror: typeof qaror }; };
const ornat = (takliflar: AktTaklif[], a: TaklifAmallari) => act(() => takliflarOrnat({ aktId: 41, takliflar, amallar: a }));

describe('F2QatorTakliflari (qator ustida texnadzor taklifi)', () => {
  it('sof tanlash: faqat shu qator, eskirgan emas', () => {
    expect(qatorTakliflari([T(), T({ id: 2, qator_id: 8 }), T({ id: 3, eskirgan: true })], 7).map((x) => x.id)).toEqual([1]);
  });
  it('belgi + izoh + joriy -> taklif hajm ko\'rinadi; boshqa qatorda hech narsa', () => {
    const a = amallar(); ornat([T()], a);
    render(<><F2QatorTakliflari qatorId={7} mumkin={5} qoshish={vi.fn()} /><F2QatorTakliflari qatorId={99} mumkin={5} qoshish={vi.fn()} /></>);
    const el = screen.getByTestId('qator-taklif-1');
    expect(el.textContent).toContain('Loyiha bilan mos emas'); expect(el.textContent).toContain('8');
    expect(screen.queryByTestId('qator-takliflari-99')).toBeNull();
  });
  it('Qabul (hajm) - umumiy preview yo\'lini ochadi; Keyinroq - qaror', () => {
    const a = amallar(); ornat([T()], a);
    render(<F2QatorTakliflari qatorId={7} mumkin={5} qoshish={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Qabul/ })); expect(a.qabul).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Keyinroq/ })); expect(a.qaror).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'keyinroq');
  });
  it('Rad: sabab majburiy (>=3 belgi), keyin qaror yoziladi', () => {
    const a = amallar(); ornat([T()], a);
    render(<F2QatorTakliflari qatorId={7} mumkin={5} qoshish={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Rad$/ }));
    const btn = screen.getByRole('button', { name: /Rad etish$/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sabab bor' } });
    fireEvent.click(btn); expect(a.qaror).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'rad', 'sabab bor');
  });
  it('qator qo\'shish taklifi: fakt bor - Qabul qatorni qo\'shadi (taklif hajmi mumkin bilan chegaralanadi) va qaror yozadi; fakt yo\'q - tugma o\'chiq', async () => {
    const a = amallar(); const qoshish = vi.fn();
    ornat([T({ qosh: true, bayroq: null, taklif_hajm: 20, joriy_hajm: null })], a);
    const { rerender } = render(<F2QatorTakliflari qatorId={7} mumkin={0} qoshish={qoshish} />);
    expect((screen.getByRole('button', { name: /Qabul/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<F2QatorTakliflari qatorId={7} mumkin={5} qoshish={qoshish} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Qabul/ })); });
    expect(qoshish).toHaveBeenCalledWith(5); expect(a.qaror).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'qabul');
    expect(a.qabul).not.toHaveBeenCalled();
  });
  it('hal qilingan taklif: tugmalarsiz holat belgisi', () => {
    ornat([T({ qaror: 'qabul' })], amallar());
    render(<F2QatorTakliflari qatorId={7} mumkin={5} qoshish={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Rad$/ })).toBeNull();
  });
});
