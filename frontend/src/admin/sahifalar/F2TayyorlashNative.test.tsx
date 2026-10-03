import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { T2Qator } from '../../api/supabase';

const m = vi.hoisted(() => ({ yarat: vi.fn(), toast: vi.fn() }));
const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', nom: 'Poydevor' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е6-1', nom: 'Beton quyish', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'Ishchi', norma: 2, narx: 25000 }),
  q({ id: 4, tur: 'rs', ota_id: 2, kat: 'МАШ', nom: 'Kran', norma: 0.5, narx: null }),
  q({ id: 5, tur: 'rz', nom: 'Devor' }),
  q({ id: 6, tur: 'bl', ota_id: 5, nom: 'G‘isht terish', hajm: 4 }),
];
const holat = [
  { qator_id: 2, tur: 'bl', nom: 'Beton quyish', f2_mumkin_hajm: 6, f2_hajm: 0, smeta_hajm: 10 },
  { qator_id: 3, tur: 'rs', nom: 'Ishchi', kat: 'ЧЕЛ', f2_mumkin_hajm: 12 },
  { qator_id: 4, tur: 'rs', nom: 'Kran', kat: 'МАШ', f2_mumkin_hajm: 3 },
  { qator_id: 6, tur: 'bl', nom: 'G‘isht terish', f2_mumkin_hajm: 4 },
];

vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 8, nom: 'Ko‘l' }] })),
  sbT2DaraxtOl: vi.fn(async () => ({ ok: true, qatorlar: rows })),
  sbT2AktYaratV2: m.yarat,
  yangiOperationId: () => '00000000-0000-4000-8000-000000000001',
}));
// Token daftari: sarf muvaffaqiyatli — amal bajariladi (token mantig'i t2-token/f2-yacheyka testlarida).
vi.mock('../../api/t2-token', () => ({ tokenBilan: vi.fn(async (_p: unknown, ish: () => Promise<unknown>) => ({ ok: true, natija: await ish(), sarflandi: 1 })) }));
vi.mock('../../api/t2-fakt', () => ({ sbQatorHolatOl: vi.fn(async () => ({ ok: true, qatorlar: holat })) }));
vi.mock('../../api/t2-narx-protokol', async (asl) => ({ ...(await asl<typeof import('../../api/t2-narx-protokol')>()), narxProtokolQatorlariOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-aosr', () => ({ sbAosrCoverageOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-shartnoma-liniya', () => ({ shartnomaLiniyaOl: vi.fn(async () => ({ ok: true, natija: {
  loyihalar: [], rollar: [], turlar: [],
  obyektlar: [{ id: 8, nom: 'Ko‘l', loyiha_id: 1, asosiy_shartnoma_id: 45 }],
  shartnomalar: [
    { id: 45, loyiha_id: 1, raqam: '45', nom: 'Bosh pudrat', turi: null, asosiy: true, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null, izoh: null, versiya: 1,
      tomonlar: [{ rol: 'Buyurtmachi', nom: 'Дирекция', inn: null }, { rol: 'Pudratchi', nom: 'ООО «NTB»', inn: null }], obyektlar: [8] },
    { id: 46, loyiha_id: 1, raqam: '46', nom: 'Subpudrat', turi: 'Subpudrat', asosiy: false, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null, izoh: null, versiya: 1,
      tomonlar: [{ rol: 'Subpudratchi', nom: 'ООО «Суб»', inn: null }], obyektlar: [8] },
  ],
} })) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 1 } }) }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: null }, setObjectId: vi.fn() }) }));
vi.mock('../../umumiy/hujjat/HujjatTomonlari', () => ({ useHujjatTomonlari: () => [{}, vi.fn()], HujjatTomonlariPanel: () => null }));
vi.mock('../../umumiy/hujjat/HujjatKorinish', () => ({ useHujjatKorinish: () => ({ oyna: null, ochish: vi.fn() }) }));

import { F2TayyorlashNative } from './F2TayyorlashNative';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const ochish = () => render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8']}><F2TayyorlashNative /></MemoryRouter>);

describe('F2 tayyorlash', () => {
  it('ish hajmi → resurslar avtomatik; narxsiz resurs ongli belgilanadi; bitta F2 yuboriladi', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 1 });
    ochish();
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect((hajm as HTMLInputElement).value).toBe('6');
    fireEvent.click(screen.getByRole('button', { name: 'Resurslarni ko‘rish: Beton quyish' }));
    expect(screen.getByText('Narx kerak (yoki «narxsiz» belgilang)')).toBeTruthy();       // Kran — smetada narx yo'q
    const saqla = screen.getByRole('button', { name: /F2 qoralama yaratish/ }) as HTMLButtonElement;
    expect(saqla.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /«narxsiz» belgilash/ }));
    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: '7' } });
    expect(saqla.disabled).toBe(false);
    fireEvent.click(saqla);
    await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
    const a = m.yarat.mock.calls[0][0];
    expect(a.raqam).toBe('7');
    expect(a.qatorlar.map((x: { qatorId: number; certifiedQuantity: number; certifiedAmount?: number; priceIntentionallyAbsent: boolean }) => [x.qatorId, x.certifiedQuantity, x.certifiedAmount ?? null, x.priceIntentionallyAbsent]))
      .toEqual([[2, 6, null, true], [3, 12, 300000, false], [4, 3, null, true]]);
  });

  it('bo‘limlar navigatori va qidiruv', async () => {
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    expect(screen.queryByText('G‘isht terish')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Devor/ }));
    expect(screen.getByText('G‘isht terish')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'kran' } });
    expect(screen.getByText('Beton quyish')).toBeTruthy();
    expect(screen.queryByText('G‘isht terish')).toBeNull();
  });

  it('imzolovchilar va shartnoma raqami shartnoma liniyasidan avtomatik (3 tomonlama — subpudratchi)', async () => {
    ochish();
    expect(await screen.findByText(/№ 45 — Bosh pudrat · Дирекция · ООО «NTB» · ООО «Суб»/)).toBeTruthy();
  });
});
