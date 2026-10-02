import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ holat: vi.fn(), sorov: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-token', async (asl) => ({ ...(await asl<typeof import('../../api/t2-token')>()), tokenHolatOl: m.holat, tolovSorovYarat: m.sorov }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => '00000000-0000-4000-8000-000000000009' }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 7 } }) }));

import Tokenlar from './Tokenlar';

const HISOB = { amal: 'f2_hujjat', nom: 'F2 hujjati (Excel / ko\'rish)', birlik_soni: 792, birlik: 100, qism: 8, asos_som: 20000, birlik_som: 1000, tannarx_som: 28000, foyda_foiz: 30, min_som: 30000, max_som: 100000, yakuniy_som: 36400, token_som: 100, token: 364 };
const HOLAT = {
  balans: 136, obuna: null, tariflar: [], superadmin: false, demo_obyekt_id: null,
  sozlama: { token_som: 100, foyda_foiz: 30, royxat_bonus_token: 500, usd_kurs: 12700, tolov_rekvizit: 'Karta 8600 **** 0000, A. Ahatqulov' },
  narxlar: [{ amal: 'f2_hujjat', nom: "F2 hujjati (Excel / ko'rish)", tur: 'yacheyka', birlik: 100, asos_som: 20000, birlik_som: 1000, min_som: 30000, max_som: 100000, foyda_foiz: null, izoh: null, faol: true }],
  paketlar: [{ kod: 'p500', nom: '500 token', token: 500, narx_som: 50000 }, { kod: 'p1100', nom: '1 100 token (+10%)', token: 1100, narx_som: 100000 }],
  sorovlar: [],
  harakatlar: [{ id: 2, miqdor: -364, tur: 'sarf', amal: 'f2_hujjat', birlik_soni: 792, izoh: null, yaratildi: '2026-10-02T10:00:00Z', kim: 'aziz', meta: { sabab: 'F2 №1 · Fast Food · 2026-10', hisob: HISOB } }],
};

describe('Tokenlar (narx v2, sotib olish, nima uchun)', () => {
  beforeEach(() => { m.holat.mockReset(); m.sorov.mockReset(); m.toast.mockReset(); m.holat.mockResolvedValue({ ok: true, natija: HOLAT }); });

  it('F2 misoli server formulasi bilan bir xil: 36 400 so‘m = 364 token', async () => {
    render(<MemoryRouter><Tokenlar /></MemoryRouter>);
    expect(await screen.findByText(/F2 \(792 yacheyka\) = 36\s400 soʻm = 364 token/)).toBeTruthy();
  });

  it('sarfning to‘liq hisobi ochiladi (sabab, tannarx, foyda, yakuniy narx)', async () => {
    render(<MemoryRouter><Tokenlar /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Hisobni koʻrsatish' }));
    expect(screen.getAllByText(/F2 №1 · Fast Food/).length).toBeGreaterThan(0);
    expect(screen.getByText(/28\s000 soʻm/)).toBeTruthy();
    expect(screen.getByText(/36\s400 soʻm/, { selector: 'b' })).toBeTruthy();
  });

  it('sotib olish: paket + to‘lov ma‘lumoti → so‘rov', async () => {
    m.sorov.mockResolvedValue({ ok: true, sorov_id: 1 });
    render(<MemoryRouter><Tokenlar /></MemoryRouter>);
    expect(await screen.findByText('Karta 8600 **** 0000, A. Ahatqulov')).toBeTruthy();
    const yubor = screen.getByRole('button', { name: /tasdiqlashga yuborish/ });
    expect((yubor as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Toʻlov maʼlumoti'), { target: { value: 'chek 123456, 14:05, 4417' } });
    fireEvent.click(yubor);
    await waitFor(() => expect(m.sorov).toHaveBeenCalledWith({ kompaniyaId: 7, paketKod: 'p1100', usul: 'otkazma', tolovMalumot: 'chek 123456, 14:05, 4417', operationId: '00000000-0000-4000-8000-000000000009' }));
  });
});
