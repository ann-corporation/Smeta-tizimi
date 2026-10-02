import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ oqi: vi.fn(), yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-boshqaruv', () => ({ boshqaruvOqi: m.oqi, boshqaruvYoz: m.yoz }));
vi.mock('../../api/t2-token', () => ({
  tokenHolatOl: vi.fn(async () => ({ ok: true, natija: { tariflar: [{ kod: 'free', nom: 'Bepul', oylik_token: 300, narx_som: 0 }], narxlar: [], demo_obyekt_id: null } })),
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
    m.oqi.mockReset(); m.yoz.mockReset(); m.toast.mockReset();
    m.oqi.mockImplementation(async (bolim: string) => ({ ok: true, natija: bolim === 'umumiy' ? UMUMIY : bolim === 'foydalanuvchilar' ? FOYD : [] }));
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
