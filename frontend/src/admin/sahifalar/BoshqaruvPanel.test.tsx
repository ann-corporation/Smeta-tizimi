import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ oqi: vi.fn(), yoz: vi.fn(), toast: vi.fn(), markaz: vi.fn(), ustama: vi.fn() }));
vi.mock('../../api/t2-boshqaruv', () => ({ boshqaruvOqi: m.oqi, boshqaruvYoz: m.yoz }));
vi.mock('../../api/t2-agent-ish', () => ({ markazOl: m.markaz, ustamaBelgila: m.ustama }));
vi.mock('../../api/t2-token', async () => ({
  // narxHisob — haqiqiy (server formulasi bilan bir xil), qolganlari soxta.
  narxHisob: (await vi.importActual<typeof import('../../api/t2-token')>('../../api/t2-token')).narxHisob,
  tokenHolatOl: vi.fn(async () => ({ ok: true, natija: {
    tariflar: [{ kod: 'free', nom: 'Bepul', oylik_token: 300, narx_som: 0 }], demo_obyekt_id: null,
    sozlama: { token_som: 100, foyda_foiz: 30, royxat_bonus_token: 500, usd_kurs: 12700, tolov_rekvizit: null },
    narxlar: [{ amal: 'f2_hujjat', nom: 'F2 hujjati', tur: 'yacheyka', birlik: 100, asos_som: 20000, birlik_som: 1000, min_som: 30000, max_som: null, foyda_foiz: null, izoh: null, faol: true }],
  } })),
  tokenToldir: vi.fn(), obunaBelgila: vi.fn(), demoManbaBelgila: vi.fn(), tokenXato: () => 'xato',
}));
vi.mock('../../api/supabase', () => ({ sbT2ObyektlarOlKomp: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 1 }, superadmin: true }) }));
vi.mock('../pages/SystemControlPage', () => ({ default: () => <div>Boshqaruv markazi</div> }));

import BoshqaruvPanel from './BoshqaruvPanel';

const UMUMIY = {
  foydalanuvchi: { jami: 7, faol: 7, google: 1, yangi_7: 1, yangi_30: 4 }, kompaniya: { jami: 4, yangi_30: 2 }, obyekt: 37, smeta_qator_taxmin: 1,
  obunalar: [{ kod: 'free', nom: 'Bepul', narx_som: 0, soni: 3 }], oylik_tushum_som: 0,
  token: { berilgan: 30300, sotilgan: 0, sarflangan: 0, sarf_30: 0, qoldiq: 30300 }, token_amal: [], royxat_oxirgi: [], demo_obyekt: null,
};
const FOYD = [{ id: 9, login: 'aziz.pto', ism: 'Aziz', email: null, holat: 'faol', yaratildi: '2026-10-02T00:00:00Z', google: false, parol: true, ozi_royxat: true, azoliklar: [{ azolik_id: 1, kompaniya_id: 2, kompaniya: 'Aziz — PTO', rol: 'boss' }] }];

describe('Boshqaruv paneli', () => {
  beforeEach(() => {
    m.oqi.mockReset(); m.yoz.mockReset(); m.toast.mockReset(); m.markaz.mockReset(); m.ustama.mockReset();
    m.oqi.mockImplementation(async (bolim: string) => ({ ok: true, natija: bolim === 'umumiy' ? UMUMIY : bolim === 'foydalanuvchilar' ? FOYD : [] }));
    m.markaz.mockResolvedValue({ ok: true, natija: { ustama_foiz: 40 } });
  });

  it('narxni sinab ko‘rish: katak soni kiritilsa misol darhol qayta hisoblanadi (saqlamasdan)', async () => {
    render(<MemoryRouter><BoshqaruvPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Sozlamalar/ }));
    // standart misol — real F2 dagi 213 hisoblangan katak: (20 000 + 3 × 1 000) × 1,3 = 29 900 → min 30 000
    expect(await screen.findByText(/213 → 30\s000 = 300 token/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sinov: hujjatdagi hisoblangan kataklar soni'), { target: { value: '5000' } });
    // (20 000 + 50 × 1 000) × 1,3 = 91 000
    expect(await screen.findByText(/5\s000 → 91\s000 = 910 token/)).toBeTruthy();
    // har birlik narxini o'zgartirish — misol shu zahoti yangi narxni ko'rsatadi
    fireEvent.change(screen.getByLabelText('Har birlik (soʻm)'), { target: { value: '3000' } });
    expect(await screen.findByText(/5\s000 → 221\s000 = 2\s210 token/)).toBeTruthy();
    expect(m.yoz).not.toHaveBeenCalled();
  });

  it('AI ustamasi shu yerda: misol jonli, saqlash standart ustamani yozadi', async () => {
    m.ustama.mockResolvedValue({ ok: true, natija: {} });
    render(<MemoryRouter><BoshqaruvPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Sozlamalar/ }));
    const maydon = await screen.findByLabelText('Standart ustama (%)');
    await waitFor(() => expect((maydon as HTMLInputElement).value).toBe('40'));
    // $0.03 × 1,4 × 12 700 / 100 = 5,33 → 6 token = 600 so'm
    expect(screen.getByTestId('ai-misol').textContent).toMatch(/= 600 soʻm = 6 token/);
    fireEvent.change(maydon, { target: { value: '250' } });
    // $0.03 × 3,5 × 12 700 / 100 = 13,3 → 14 token
    expect(screen.getByTestId('ai-misol').textContent).toMatch(/= 1\s400 soʻm = 14 token/);
    fireEvent.click(within(screen.getByRole('region', { name: 'AI ustamasi' })).getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.ustama).toHaveBeenCalledWith(null, 250));
  });

  it('umumiy ko‘rsatkichlar ko‘rinadi', async () => {
    render(<MemoryRouter><BoshqaruvPanel /></MemoryRouter>);
    expect(await screen.findByText('Foydalanuvchilar', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('30 300')).toBeTruthy();
  });

  it('bloklash sabab so‘raydi va auditli amal yuboradi', async () => {
    m.yoz.mockResolvedValue({ ok: true, xabar: 'Saqlandi' });
    vi.spyOn(window, 'prompt').mockReturnValue('spam');
    render(<MemoryRouter><BoshqaruvPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Foydalanuvchilar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bloklash' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith('foydalanuvchi_holat', { foydalanuvchi_id: 9, holat: 'bekor', sabab: 'spam' }));
  });

  it('sabab yozilmasa hech narsa yuborilmaydi', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('');
    render(<MemoryRouter><BoshqaruvPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Foydalanuvchilar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bloklash' }));
    expect(m.yoz).not.toHaveBeenCalled();
  });

  it('superadmin bo‘lmasa — rad xabari', async () => {
    m.oqi.mockResolvedValue({ ok: false, error: 'Bu panel faqat platforma superadmini uchun', code: 'SUPERADMIN_KERAK' });
    render(<MemoryRouter><BoshqaruvPanel /></MemoryRouter>);
    expect(await screen.findByText('Bu panel faqat platforma superadmini uchun.')).toBeTruthy();
  });
});
