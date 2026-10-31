import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/* JQA-10 (egasi): buxgalter F2 ni faqat o'qiydi — F2 tarixida tasdiqlash/rad/bekor/tahrirlash tugmalari ko'rinmaydi. */
const m = vi.hoisted(() => ({ k: { joriy: { id: 5, rol: 'bugalter', permissions: ['company.read', 'f2.read', 'f2.approve', 'f2.cancel'] } as Record<string, unknown>, superadmin: false } }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => m.k }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ companyId: 5, isProvider: false, setObjectId: vi.fn() }) }));
const AKT = { id: 11, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', oy: '2026-09-01', raqam: '7', hujjat_jami: 100, yozilgan_jami: 100, qator_soni: 1, reestr_holat: 'mos', obyekt_id: 3 };
vi.mock('../../api/supabase', () => ({
  sbT2AktReestrOl: async () => ({ ok: true, qatorlar: [AKT] }),
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 3, nom: 'Obyekt', kompaniya_id: 5 }] }),
  sbT2DaraxtOl: async () => ({ ok: true, qatorlar: [] }),
  sbOqi: async () => ({ ok: true, qatorlar: [{ id: 5, f2_tasdiq_rejimi: 'shaxsiy' }] }),
  yangiOperationId: () => 'op',
}));
vi.mock('../../api/t2-narx', () => ({ sbT2F2TafsilotOl: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../lib/f2-manba', () => ({ f2ImportAktlari: async () => new Set<number>(), f2ImportQilinganmi: async () => false }));
import { F2TarixNative } from './F2TarixNative';

const chiz = () => render(<MemoryRouter initialEntries={['/admin/f2-tarix?obyekt=3']}><F2TarixNative /></MemoryRouter>);

afterEach(() => { cleanup(); m.k = { joriy: { id: 5, rol: 'bugalter', permissions: ['company.read', 'f2.read', 'f2.approve', 'f2.cancel'] }, superadmin: false }; });

describe('F2 tarixi — buxgalter faqat o‘qiydi', () => {
  it('buxgalter: F2 ko‘rinadi, lekin tasdiqlash/rad/bekor/tahrirlash yo‘q (individual f2.approve bo‘lsa ham)', async () => {
    chiz();
    expect((await screen.findAllByText(/2026/)).length).toBeGreaterThan(0); // F2 o'qiladi (qoralama ro'yxatda)
    expect(screen.queryByRole('button', { name: /Rad etish/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bekor qilish/ })).toBeNull();
    expect(screen.queryByText(/Tahrirlash|Tizimda tahrirlash|Fayldan yangilash/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Yakunlash|Tasdiqlash/ })).toBeNull();
  });
  it('pto: o‘sha tugmalar joyida', async () => {
    m.k = { joriy: { id: 5, rol: 'pto', permissions: ['company.read', 'f2.read', 'f2.prepare', 'f2.approve', 'f2.cancel'] }, superadmin: false };
    chiz();
    expect(await screen.findByRole('button', { name: /Rad etish/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Bekor qilish/ }).length).toBeGreaterThan(0);
  });
});
