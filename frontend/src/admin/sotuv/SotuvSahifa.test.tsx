import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SotuvSahifa from './SotuvSahifa';
import type { Birlik, BitimKarta, BitimQator, SotuvPanel } from '../../api/t2-sotuv';

/* Sintetik ma'lumot (real mijoz/summa YO'Q). */
const m = vi.hoisted(() => ({
  company: { joriy: { id: 7, permissions: [] as string[] } as { id: number; permissions: string[] } | null, superadmin: false, yuklanmoqda: false },
}));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => m.company }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOl: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 10, nom: 'Sinov bino A', loyiha_id: 3 }, { id: 11, nom: 'Sinov bino B', loyiha_id: 3 }] })),
  yangiOperationId: () => '00000000-0000-4000-8000-000000000001',
}));
vi.mock('../../api/t2-sotuv', async (asl) => {
  const a = await asl<typeof import('../../api/t2-sotuv')>();
  return {
    ...a,
    shaxmatkaOl: vi.fn(), sotuvPanelOl: vi.fn(), bitimlarOl: vi.fn(), bitimOl: vi.fn(), mijozlarOl: vi.fn(),
    bitimSaqla: vi.fn(async () => ({ ok: true, id: 501, versiya: 2 })), grafikSaqla: vi.fn(async () => ({ ok: true })),
    birliklarSaqla: vi.fn(async () => ({ ok: true, yangi: 6, yangilandi: 0, otkazildi: 0 })), bronQil: vi.fn(async () => ({ ok: true, id: 1 })),
    narxOzgartir: vi.fn(async () => ({ ok: true, ozgardi: 1 })), birlikHolat: vi.fn(), loyihaSaqla: vi.fn(async () => ({ ok: true })),
    bronBekor: vi.fn(), tolovYoz: vi.fn(), tolovBekor: vi.fn(),
  };
});
import * as api from '../../api/t2-sotuv';

const birlik = (o: Partial<Birlik> & { id: number }): Birlik => ({
  podyezd: 1, qavat: 1, raqam: String(o.id), tur: 'xonadon', xona_soni: 2, maydon: 50, maydon_yashash: null, maydon_oshxona: null, maydon_balkon: null,
  shift: null, pardoz: null, yon: null, manzara: null, planirovka_id: null, narx_m2: 1_000_000, narx_jami: 50_000_000, valyuta: 'UZS', holat: 'bosh',
  versiya: 1, bron_id: null, bron_tugaydi: null, bitim_id: null, mijoz: null, ...o,
});
const SHAX = [birlik({ id: 1, raqam: '1', qavat: 1 }), birlik({ id: 2, raqam: '2', qavat: 2, holat: 'sotilgan', bitim_id: 900, mijoz: 'Sinov Mijoz' }),
  birlik({ id: 3, raqam: '3', qavat: 2, holat: 'bron', xona_soni: 3 })];
const PANEL: SotuvPanel = {
  ok: true, generated_at: '2026-11-03T10:00:00Z',
  zaxira: { jami: 3, bosh: 1, bron: 1, sotilgan: 1, sotuvda_emas: 0, maydon_jami: 150, maydon_bosh: 50, qiymat_bosh: 50_000_000, narxsiz_soni: 0, ortacha_m2_bosh: 1_000_000 },
  sotuv: { soni: 1, summa: 50_000_000, maydon: 50, ortacha_m2: 1_000_000 }, tushum: 10_000_000,
  qarz: { muddati_otgan: 2_000_000, k0_30: 2_000_000, k31_90: 0, k90: 0, kelajak: 38_000_000 },
  kechikkanlar: [{ bitim_id: 900, mijoz: 'Sinov Qarzdor', telefon: '998900000001', qarz: 2_000_000, kun: 12 }],
  prognoz: [{ oy: '2026-12', summa: 3_000_000 }], voronka: { lid: 4, aloqa: 2, shartnoma: 1, bekor: 1 },
  manbalar: [{ manba: 'telegram', lid: 5, sotildi: 1 }], menejerlar: [{ actor_id: 1, ism: 'Sinov Menejer', bitim: 7, sotildi: 1, summa: 50_000_000 }],
  oylik_sotuv: [], binolar: [{ obyekt_id: 10, nom: 'Sinov bino A', loyiha_id: 3, jami: 3, bosh: 1, sotilgan: 1 }],
  loyihalar: [{ loyiha_id: 3, nom: 'Sinov loyiha', reyestr_raqam: null, sotuvda: false, topshirish_sana: null, eskrou_hisob: null, bron_soat: 72 }],
};
const BITIMLAR: BitimQator[] = [{
  id: 501, bosqich: 'lid', mijoz_id: 1, mijoz: 'Sinov Lid', telefon: '998901112233', manba: 'telegram', masul_actor_id: 1, loyiha_id: null, birlik_id: null,
  birlik: null, summa: null, valyuta: 'UZS', tolov_turi: null, keyingi_aloqa: '2020-01-01T09:00:00Z', bron_tugaydi: null, versiya: 4,
  yaratildi: '2026-11-01T00:00:00Z', yangilandi: '2026-11-01T00:00:00Z',
}];
const KARTA: BitimKarta = {
  ok: true, generated_at: '2026-11-03T10:00:00Z',
  bitim: { id: 900, bosqich: 'shartnoma', versiya: 3, summa: 12_000_000, birlik_id: 2, valyuta: 'UZS', tolov_turi: 'muddatli' },
  mijoz: { id: 1, fio: 'Sinov Mijoz', telefon: '998900000002' },
  birlik: { id: 2, raqam: '2', narx_jami: 12_000_000, maydon: 50 }, bron: null, grafik: [], grafik_versiya: null, tolovlar: [],
  jami: { summa: 12_000_000, tolandi: 0, qoldiq: 12_000_000, muddati_otgan: 0 }, audit: [],
};

function chiz(url = '/admin/sotuv', birliklar: Birlik[] = SHAX) {
  vi.mocked(api.shaxmatkaOl).mockResolvedValue({ ok: true, natija: { ok: true, generated_at: '', obyekt_id: 10, birliklar, yozish: true,
    hisob: { jami: 3, bosh: 1, bron: 1, sotilgan: 1, sotuvda_emas: 0, zaxira: 0, maydon_bosh: 50, qiymat_bosh: 50_000_000, narxsiz_soni: 0 } } });
  vi.mocked(api.sotuvPanelOl).mockResolvedValue({ ok: true, natija: PANEL });
  vi.mocked(api.bitimlarOl).mockResolvedValue({ ok: true, natija: { ok: true, bitimlar: BITIMLAR } });
  vi.mocked(api.bitimOl).mockResolvedValue({ ok: true, natija: KARTA });
  vi.mocked(api.mijozlarOl).mockResolvedValue({ ok: true, natija: { ok: true, mijozlar: [] } });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[url]}><SotuvSahifa /></MemoryRouter></QueryClientProvider>);
}
const ruxsat = (...p: string[]) => { m.company.joriy = { id: 7, permissions: p }; };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Uy sotish sahifasi', () => {
  it('rahbar (faqat sales.read): Shaxmatka va Panel; yozish tugmalari yo‘q', async () => {
    ruxsat('sales.read');
    chiz('/admin/sotuv?bino=10');
    const tablar = screen.getAllByRole('tab').map((x) => x.textContent);
    expect(tablar).toEqual(['Shaxmatka', 'Panel']);
    expect(await screen.findByRole('gridcell', { name: /^1 · / })).toBeTruthy();
    expect(screen.queryByText('Birliklar yaratish')).toBeNull();
    fireEvent.click(screen.getByRole('gridcell', { name: /^1 · / }));
    expect(screen.queryByText('Bron qilish')).toBeNull();
    expect(screen.queryByText('Narxni o‘zgartirish')).toBeNull();
  });

  it('sotuvchi: katak kartasida bron, narx tugmasi yo‘q (sales.price kerak); filtr xira qiladi', async () => {
    ruxsat('sales.read', 'sales.write');
    chiz('/admin/sotuv?bino=10');
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Shaxmatka', 'Bitimlar', 'Mijozlar', 'Panel']);
    const katak = await screen.findByRole('gridcell', { name: /^1 · / });
    expect(screen.getByLabelText('Xulosa').textContent).toContain('Jami');
    fireEvent.click(screen.getByRole('button', { name: '3' }));      // 3 xonali filtr
    expect(katak.className).toContain('opacity-25');
    fireEvent.click(katak);
    const oyna = screen.getByRole('dialog');
    expect(within(oyna).getByText('Bron qilish')).toBeTruthy();
    expect(within(oyna).queryByText('Narxni o‘zgartirish')).toBeNull();
  });

  it('Panel: KPI, voronka, kechikkanlar → bitim kartasi; grafik generatori Σ = summa bilan saqlaydi', async () => {
    ruxsat('sales.read', 'sales.write');
    chiz('/admin/sotuv?tab=panel');
    expect(await screen.findByText('Sinov Qarzdor')).toBeTruthy();
    expect(screen.getByText('Muddati o‘tgan qarz')).toBeTruthy();
    expect(screen.getByText(/Bekor qilingan: 1/)).toBeTruthy();
    fireEvent.click(screen.getByText('Sinov Qarzdor'));
    expect(await screen.findByText('Bitim №900')).toBeTruthy();
    await waitFor(() => expect(api.bitimOl).toHaveBeenCalledWith(7, 900));
    fireEvent.click(await screen.findByText('Grafik tuzish'));
    expect(await screen.findByText('Σ shartnoma summasiga teng.')).toBeTruthy();
    fireEvent.click(screen.getByText('Grafikni saqlash'));
    await waitFor(() => expect(api.grafikSaqla).toHaveBeenCalled());
    const [kid, bitimId, qatorlar] = vi.mocked(api.grafikSaqla).mock.calls[0];
    expect([kid, bitimId]).toEqual([7, 900]);
    expect(qatorlar).toHaveLength(13);
    expect(qatorlar.reduce((s, q) => s + q.summa, 0)).toBe(12_000_000);
  });

  it('Bitimlar: kanban kartasi, kechikkan aloqa, bosqichni o‘tkazish kutilgan_versiya bilan', async () => {
    ruxsat('sales.read', 'sales.write');
    chiz('/admin/sotuv?tab=bitimlar');
    expect(await screen.findByText('Sinov Lid')).toBeTruthy();
    expect(screen.getByText('+998 90 111 22 33')).toBeTruthy();
    expect(screen.getByText(/Aloqa kechikdi/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Bosqichni o‘zgartirish'), { target: { value: 'aloqa' } });
    await waitFor(() => expect(api.bitimSaqla).toHaveBeenCalledWith(7, { id: 501, kutilgan_versiya: 4, bosqich: 'aloqa' }));
  });

  it('bo‘sh bino: generator oldindan ko‘rsatadi va birliklarni saqlaydi', async () => {
    ruxsat('sales.read', 'sales.write');
    chiz('/admin/sotuv?bino=11', []);
    expect(await screen.findByText('Bu binoda hali birliklar yo‘q.')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Birliklar yaratish')[1]);
    fireEvent.change(screen.getByLabelText('Qavatlar'), { target: { value: '2' } });
    expect(screen.getByText(/Oldindan ko‘rish: 6 ta birlik/)).toBeTruthy();
    fireEvent.click(screen.getByText('Saqlash'));
    await waitFor(() => expect(api.birliklarSaqla).toHaveBeenCalled());
    const [, obyektId, qatorlar] = vi.mocked(api.birliklarSaqla).mock.calls[0];
    expect(obyektId).toBe(11);
    expect(qatorlar.map((q) => q.raqam)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('Sozlama (sales.price): reyestrsiz «Sotuvda» yoqilmaydi', async () => {
    ruxsat('sales.read', 'sales.price');
    chiz('/admin/sotuv?tab=sozlama');
    expect(await screen.findByText(/PP-4732: uy-joy reklamasi/)).toBeTruthy();
    const belgi = screen.getByRole('checkbox');
    expect((belgi as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reyestr raqami'), { target: { value: 'R-0001' } });
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false);
  });

  it('ruxsatsiz — ogohlantirish', () => {
    ruxsat('company.read');
    chiz();
    expect(screen.getByText('Bu bo‘lim uchun «sales.read» ruxsati kerak.')).toBeTruthy();
  });
});
