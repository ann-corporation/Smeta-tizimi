// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../../api/supabase';

const api = vi.hoisted(() => ({
  daraxt: vi.fn(), holat: vi.fn(), qisman: vi.fn(), narx: vi.fn(),
}));

vi.mock('../../api/supabase', async (asl) => ({
  ...(await asl<typeof import('../../api/supabase')>()),
  sbT2DaraxtOl: api.daraxt,
  sbT2QatorHolatOl: api.holat,
}));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: api.qisman }));
vi.mock('../../api/t2-price-control', () => ({ priceControlOl: api.narx }));
vi.mock('../../api/t2-ozgarish', () => ({
  ozgarishMalumotOl: async () => new Map([[4, { change_type: 'ADDITIONAL', replaces_line_id: null }]]),
  avvalgiVersiyaOl: async () => ({ qatorlar: [{ ...q(90, null, 'rz'), almashtirgan_versiya_id: 5 }, { ...q(91, 90, 'bl'), almashtirgan_versiya_id: 5 }], versiyaNomi: new Map([[5, 'V2']]) }),
}));

import { useT2Daraxt } from './useT2Daraxt';

function q(id: number, ota_id: number | null, tur: string): T2Qator {
  return {
    id, obyekt_id: 7, obyekt: null, kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: null, nom: `q${id}`,
    birlik: null, hajm: 10, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: null, zamena: null,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null,
  };
}
function h(qator_id: number, fakt_hajm: number): T2QatorHolat {
  return {
    id: qator_id, qator_id, obyekt_id: 7, tur: null, kod: null, nom: null, birlik: null, kat: null,
    smeta_hajm: 10, smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 10, qoldiq_summa: null,
  };
}
// rz1 ─ bl2 ─ rs3 ;  rz1 ─ bl4
const ROWS = [q(1, null, 'rz'), q(2, 1, 'bl'), q(3, 2, 'rs'), q(4, 1, 'bl')];

beforeEach(() => {
  vi.clearAllMocks();
  api.daraxt.mockResolvedValue({ ok: true, qatorlar: ROWS });
  api.holat.mockResolvedValue({ ok: true, qatorlar: ROWS.map((r) => h(r.id, 0)) });
  api.narx.mockResolvedValue({ ok: true, qatorlar: [] });
});

describe('useT2Daraxt — katta smetada qotmaslik', () => {
  it('fakt saqlangach faqat taalluqli qatorlar o\'qiladi, t2_daraxt qayta so\'ralmaydi, skeleton qaytmaydi', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.tree.length).toBe(1));
    expect(api.daraxt).toHaveBeenCalledTimes(1);
    // change_type alohida o'qilib qatorlarga qo'shiladi (t2_daraxt view'ida yo'q).
    expect(result.current.rows.find((r) => r.id === 4)!.change_type).toBe('ADDITIONAL');
    expect(result.current.rows.find((r) => r.id === 2)!.change_type).toBeNull();
    // Avvalgi (almashtirilgan) versiya — asosiy daraxtga kirmaydi, alohida daraxt (kulrang).
    expect(result.current.rows.some((r) => r.id === 90)).toBe(false);
    expect(result.current.avvalgiTree.length).toBe(1);
    expect(result.current.avvalgiTree[0].avvalgiVersiya).toBe('V2');
    expect(result.current.avvalgiTree[0].children![0].avvalgiVersiya).toBe('V2');

    api.qisman.mockResolvedValue({ ok: true, qatorlar: [h(2, 4), h(3, 4), h(1, 4)] });
    const loadingKorildi: boolean[] = [];
    await act(async () => {
      const p = result.current.holatniYangila(2);
      loadingKorildi.push(result.current.loading);
      await p;
    });

    expect(api.qisman).toHaveBeenCalledWith(7, expect.arrayContaining([1, 2, 3]));
    expect((api.qisman.mock.calls[0][1] as number[]).includes(4)).toBe(false); // begona shox
    expect(api.daraxt).toHaveBeenCalledTimes(1); // tuzilma qayta o'qilmadi
    expect(api.holat).toHaveBeenCalledTimes(1);  // to'liq holat ham o'qilmadi
    expect(loadingKorildi.every((l) => !l)).toBe(true);
    expect(result.current.tree.length).toBe(1); // daraxt ekranda qoldi
    expect(result.current.states.find((s) => s.qator_id === 2)!.fakt_hajm).toBe(4);
    expect(result.current.states.find((s) => s.qator_id === 4)!.fakt_hajm).toBe(0);
  });

  it('qisman o\'qish muvaffaqiyatsiz bo\'lsa — faqat holat jadvali to\'liq o\'qiladi', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.tree.length).toBe(1));
    api.qisman.mockResolvedValue({ ok: false, error: 'x' });
    api.holat.mockResolvedValue({ ok: true, qatorlar: ROWS.map((r) => h(r.id, 1)) });
    await act(async () => { await result.current.holatniYangila(2); });
    expect(api.holat).toHaveBeenCalledTimes(2);
    expect(api.daraxt).toHaveBeenCalledTimes(1);
    expect(result.current.states.every((s) => s.fakt_hajm === 1)).toBe(true);
  });

  it('eskirgan javob yangisini bosib ketmaydi', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.tree.length).toBe(1));
    let sekinTugat: (v: unknown) => void = () => {};
    api.qisman
      .mockImplementationOnce(() => new Promise((r) => { sekinTugat = r; }))
      .mockResolvedValueOnce({ ok: true, qatorlar: [h(2, 9)] });
    await act(async () => {
      const sekin = result.current.holatniYangila(2);
      await result.current.holatniYangila(2);
      sekinTugat({ ok: true, qatorlar: [h(2, 1)] });
      await sekin;
    });
    expect(result.current.states.find((s) => s.qator_id === 2)!.fakt_hajm).toBe(9);
  });
});
