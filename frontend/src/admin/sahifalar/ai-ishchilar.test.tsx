import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ toast: vi.fn(), ol: vi.fn(), yoz: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/ai-ishchi', () => ({ aiIshchiOl: m.ol, aiIshchiYoz: m.yoz }));

import { AiIshchilar } from './AiIshchilar';

const ishchi = (o: Record<string, unknown> = {}) => ({ kod: 'kunlik_nazoratchi', nom: 'Kunlik nazoratchi', tavsif: 'Ertalabki xulosa', doira: 'kompaniya', ai_bor: true, model_daraja: 'fast', sukut_jadval: 'kunlik',
  vositalar: [], yoqilgan: false, jadval: 'qolda', soat: 1, ai_xulosa: true, max_token_ish: 3000, yangi_natija: 0, oxirgi: null, ...o });
const natija = (o: Record<string, unknown> = {}) => ({ id: 3, ish_id: 9, ishchi_kod: 'kunlik_nazoratchi', sarlavha: 'Kunlik xulosa: 2 ta band', xulosa: '- fakt kiritilmagan: 3 ta', quruq: true, ustuvorlik: 1, bandlar: [{ tur: 'fakt_yoq', daraja: 1, matn: 'Fakt kiritilmagan obyektlar: 3 ta' }],
  holat: 'yangi', yaratildi: '2026-11-13T01:00:00Z', ish_holat: 'tugadi', ai_holat: 'limit', ...o });

function qur({ ishchilar = [ishchi()], inbox = [] as unknown[], sarf = null as unknown, manbalar = [] as unknown[] } = {}) {
  m.ol.mockImplementation(async (bolim: string) => {
    if (bolim === 'ishchilar') return { ok: true, data: { royxat: ishchilar } };
    if (bolim === 'inbox') return { ok: true, data: { royxat: inbox } };
    if (bolim === 'sarf') return sarf ? { ok: true, data: sarf } : { ok: false, error: 'yo‘q' };
    return { ok: true, data: { royxat: manbalar } };
  });
}
beforeEach(() => { Object.values(m).forEach((f) => f.mockReset()); m.yoz.mockResolvedValue({ ok: true, data: {} }); });
afterEach(cleanup);

describe('AiIshchilar', () => {
  it('bo‘sh holatlar tushunarli: ishchi o‘chiq («yoqing»), inbox bo‘sh, ishga tushirish tugmasi o‘chirilgan', async () => {
    qur();
    render(<AiIshchilar kid={5} tizim={false} />);
    const k = await screen.findByTestId('ishchi-kunlik_nazoratchi');
    expect(within(k).getByTestId('ishchi-ochiq-izoh').textContent).toContain('yoqing');
    expect((within(k).getByRole('button', { name: 'Hozir ishga tushir' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('inbox-bosh').textContent).toContain('Hali natija yo‘q');
  });

  it('yoqish: sozlama_saqla (kompaniya, jadval, token chegarasi) yuboriladi; tugma yoqilgach faollashadi', async () => {
    qur();
    render(<AiIshchilar kid={5} tizim={false} />);
    const k = await screen.findByTestId('ishchi-kunlik_nazoratchi');
    fireEvent.change(within(k).getByDisplayValue('Faqat qo‘lda'), { target: { value: 'kunlik' } });
    fireEvent.change(within(k).getByDisplayValue('3000'), { target: { value: '4500' } });
    fireEvent.click(within(k).getByRole('button', { name: 'Yoqish' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ amal: 'sozlama_saqla', kompaniya_id: 5, ishchi: 'kunlik_nazoratchi', yoqilgan: true, jadval: 'kunlik', max_token_ish: 4500 })));
  });

  it('«Hozir ishga tushir»: ishga_tushir yuboriladi, natija inbox da ko‘rinadi (limit tugagan bo‘lsa ham faktlar)', async () => {
    qur({ ishchilar: [ishchi({ yoqilgan: true, oxirgi: { id: 9, holat: 'limit', ai_holat: 'limit', yaratildi: '2026-11-13T01:00:00Z', tugadi: null, xato_kod: 'BYUDJET_TUGADI', natija_id: 3 } })], inbox: [natija()] });
    render(<AiIshchilar kid={5} tizim={false} />);
    const k = await screen.findByTestId('ishchi-kunlik_nazoratchi');
    expect(within(k).getByTestId('ishchi-oxirgi').textContent).toContain('AI limiti tugadi');
    fireEvent.click(within(k).getByRole('button', { name: 'Hozir ishga tushir' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ amal: 'ishga_tushir', kompaniya_id: 5, ishchi: 'kunlik_nazoratchi' })));
    const n = await screen.findByTestId('natija-3');
    expect(n.textContent).toContain('Kunlik xulosa: 2 ta band'); expect(n.textContent).toContain('Faqat faktlar');
    fireEvent.click(within(n).getByRole('button', { name: 'O‘qildi' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ amal: 'natija_holat', natija_id: 3, holat: 'oqildi' })));
  });

  it('server xatosi toast bilan ko‘rinadi (jim yutilmaydi)', async () => {
    qur({ ishchilar: [ishchi({ yoqilgan: true })] });
    m.yoz.mockResolvedValue({ ok: false, error: 'Buning uchun boss, admin yoki direktor huquqi kerak' });
    render(<AiIshchilar kid={5} tizim={false} />);
    fireEvent.click(within(await screen.findByTestId('ishchi-kunlik_nazoratchi')).getByRole('button', { name: 'Hozir ishga tushir' }));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith('Buning uchun boss, admin yoki direktor huquqi kerak', 'danger'));
  });

  it('sarf paneli: token (tannarx/dollar YO‘Q)', async () => {
    qur({ sarf: { oy_token_ishchi: 1200, oy_token_jami: 5000, token_limit: 20000, token_balans: 0, ishchilar: [{ ishchi: 'kunlik_nazoratchi', chaqiruv: 4, token: 1200, xato: 0 }], ishlar: [] } });
    const { container } = render(<AiIshchilar kid={5} tizim={false} />);
    const s = await screen.findByTestId('ishchi-sarf');
    expect(s.textContent).toMatch(/1\s200/); expect(s.textContent).toContain('Kunlik nazoratchi'); expect(s.textContent).toContain('Token balansi');
    expect(container.textContent).not.toMatch(/\$|usd|tannarx|ustama/i);
  });

  it('tizim rejimi: manbalar bo‘limi (yoqish/chastota), domen tasdiqlanmagan ogohlantirishi', async () => {
    qur({ ishchilar: [ishchi({ kod: 'internet_kuzatuvchi', nom: 'Internet kuzatuvchi', doira: 'tizim' })], manbalar: [{ id: 2, url: 'https://norma.example.org', domen: 'norma.example.org', nom: 'Norma', maqsad: null, tur: 'meyor', chastota_soat: 24, faol: true, oxirgi_vaqt: null, oxirgi_holat: null, domen_ruxsat: false }] });
    render(<AiIshchilar kid={null} tizim />);
    const b = await screen.findByTestId('manbalar');
    expect(b.textContent).toContain('Domen tasdiqlanmagan');
    fireEvent.click(within(b).getByRole('checkbox', { name: 'Norma' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ amal: 'manba_saqla', kompaniya_id: null, id: 2, faol: false })));
    expect(m.ol).toHaveBeenCalledWith('manbalar', null);
  });

  it('xatolik (migratsiya yo‘q): sahifa qulamaydi, sabab ko‘rinadi', async () => {
    m.ol.mockResolvedValue({ ok: false, error: 'Server xatosi' });
    render(<AiIshchilar kid={5} tizim={false} />);
    expect((await screen.findByTestId('ishchi-xato')).textContent).toContain('Server xatosi');
  });
});
