import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Naryad as NaryadTuri, NaryadQisqa } from '../../lib/naryad';

const m = vi.hoisted(() => ({
  royxat: vi.fn(), bitta: vi.fn(), lugat: vi.fn(), qabul: vi.fn(), faktHozir: vi.fn(), faktYoz: vi.fn(), hisobla: vi.fn(), narx: vi.fn(),
  kartalar: vi.fn(), toast: vi.fn(), nak: vi.fn(), pod: vi.fn(),
}));
vi.mock('../../api/t2-naryad', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-naryad')>()),
  naryadlarOl: m.royxat, naryadOl: m.bitta, lugatKompaniyaOl: m.lugat, naryadQabul: m.qabul, faktHozirOl: m.faktHozir, naryadFaktYoz: m.faktYoz, naryadHisobla: m.hisobla, naryadNarx: m.narx,
}));
vi.mock('../../api/t2-ish-kartasi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-ish-kartasi')>()), kartalarOl: m.kartalar }));
vi.mock('../../api/t2-nakrutka', () => ({ t2ObyektNakrutka: m.nak }));
vi.mock('../../api/t2-nakrutka-podval', () => ({ sbPodvallarOl: m.pod, podvalTanla: () => null }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: 1, joriy: { id: 1 } }) }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: 10 }, objects: [{ id: 10, nom: 'Sinov obyekt' }] }) }));

import Naryad from './Naryad';

const QISQA: NaryadQisqa = { id: 5, obyekt_id: 10, raqam: 'N-2026-0005', usta_nom: 'Sinov usta', brigada: null, holat: 'bajarildi', versiya: 2, davr_dan: null, davr_gacha: null,
  qator_soni: 2, reja_summa: 6000, narxsiz_soni: 1, fakt_holat: null, xarajat_summa: null, yaratildi: '2026-11-12' };
const N: NaryadTuri = { id: 5, obyekt_id: 10, raqam: 'N-2026-0005', davr_dan: null, davr_gacha: null, usta_nom: 'Sinov usta', brigada: null, holat: 'bajarildi', izoh: null, versiya: 2,
  fakt_operation_id: 'f', fakt_holat: null, fakt_akt_id: null, xarajat_id: null, xarajat_summa: null, yaratildi: '2026-11-12',
  qatorlar: [
    { id: 1, qator_id: 100, tartib: 1, kod: 'К1', nom: 'Кладка стен кирпичных', birlik: 'м3', hajm: 10, norma_chel_soat: 50, smeta_mehnat_birlik: 800, usta_narx: 600, bajarilgan_hajm: 10, qabul_hajm: null, fakt_boshida: 2, fakt_delta: null, fakt_yozilgan: null },
    { id: 2, qator_id: 101, tartib: 2, kod: 'К2', nom: 'Установка окон', birlik: 'шт', hajm: 4, norma_chel_soat: null, smeta_mehnat_birlik: null, usta_narx: null, bajarilgan_hajm: 4, qabul_hajm: null, fakt_boshida: 0, fakt_delta: null, fakt_yozilgan: null },
  ] };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function tayyorla() {
  m.royxat.mockResolvedValue([QISQA]); m.bitta.mockResolvedValue(N); m.lugat.mockResolvedValue({ qiymat: {}, versiya: null });
  m.kartalar.mockResolvedValue({ kartalar: [], ulushlar: [] }); m.nak.mockResolvedValue({ ok: false }); m.pod.mockResolvedValue({ ok: false });
  m.faktHozir.mockResolvedValue(new Map([[100, { fakt_hajm: 5, smeta_hajm: 100 }]]));
  m.qabul.mockResolvedValue({ ok: true });
}

describe('Naryad sahifasi', () => {
  it('ro‘yxat, tafsilot: qisqa nom (lug‘at), jami, narxsiz «—» (0 emas)', async () => {
    tayyorla();
    render(<Naryad />);
    fireEvent.click(await screen.findByText('N-2026-0005'));
    const t = await screen.findByTestId('naryad-tafsilot');
    expect(t.textContent).toContain('G\'isht terish');          // lug‘at: «Кладка стен кирпичных» → g‘isht terish
    expect(t.textContent).toContain('Установка окон');
    const jami = (screen.getByTestId('naryad-jami').textContent ?? '').replace(/\s/g, ' ');
    expect(jami).toContain('6 000');                             // 10 × 600 (narxsiz satr kirmaydi)
    expect(jami).toContain('narxsiz: 1');
    expect(jami).toContain('2 000');                             // smeta 8 000 − usta 6 000
  });

  it('qabul: hozirgi fakt o‘qiladi va qabul fakt_hozir bilan yuboriladi', async () => {
    tayyorla();
    render(<Naryad />);
    fireEvent.click(await screen.findByText('N-2026-0005'));
    fireEvent.click(await screen.findByText('Qabul qilish (prorab)'));
    await waitFor(() => expect(m.qabul).toHaveBeenCalledTimes(1));
    const yuk = m.qabul.mock.calls[0][0];
    expect(yuk.naryadId).toBe(5); expect(yuk.versiya).toBe(2);
    expect(yuk.qatorlar).toEqual([{ id: 1, qabul_hajm: 10, fakt_hozir: 5 }, { id: 2, qabul_hajm: 4, fakt_hozir: null }]);
    expect(m.faktHozir).toHaveBeenCalledWith([100, 101]);
  });

  it('naryad bo‘lmasa — bo‘sh ro‘yxat xabari', async () => {
    tayyorla(); m.royxat.mockResolvedValue([]);
    render(<Naryad />);
    expect(await screen.findByText('Naryad yo‘q.')).toBeTruthy();
  });
});
