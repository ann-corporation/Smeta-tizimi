// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sbT2TreeQur, type T2Qator, type T2QatorHolat } from '../../api/supabase';

const api = vi.hoisted(() => ({
  daraxt: vi.fn(), holat: vi.fn(), qisman: vi.fn(), daraxtQisman: vi.fn(), narx: vi.fn(),
}));

vi.mock('../../api/supabase', async (asl) => ({
  ...(await asl<typeof import('../../api/supabase')>()),
  sbT2DaraxtOl: api.daraxt,
  sbT2QatorHolatOl: api.holat,
}));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: api.qisman, sbT2DaraxtQisman: api.daraxtQisman }));
vi.mock('../../api/t2-price-control', () => ({ priceControlOl: api.narx }));
vi.mock('../../api/t2-ozgarish', () => ({
  ozgarishMalumotOl: async () => new Map([[4, { change_type: 'ADDITIONAL', replaces_line_id: null }]]),
  avvalgiVersiyaOl: async () => ({ qatorlar: [{ ...q(90, null, 'rz'), almashtirgan_versiya_id: 5 }, { ...q(91, 90, 'bl'), almashtirgan_versiya_id: 5 }], versiyaNomi: new Map([[5, 'V2']]) }),
}));

import { daraxtKeshiniEskirt, useT2Daraxt } from './useT2Daraxt';

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
    // Qo'shimchalar daraxtdan keyin (bloklamasdan) qo'shiladi.
    await waitFor(() => expect(result.current.qoshimchaTayyor).toBe(true));
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

// Pul qiymatlari bilan: rz1 ─ bl2 ─ rs3 ;  rz1 ─ bl4 (bl4 summasi NULL — NULL qolishi kerak).
function pul(r: T2Qator, hajm: number | null, narx: number | null, summa: number | null): T2Qator { return { ...r, hajm, narx, summa }; }
function hp(qator_id: number, smeta_summa: number | null, fakt_summa = 0): T2QatorHolat {
  return { ...h(qator_id, 0), smeta_summa, fakt_summa, qoldiq_summa: smeta_summa == null ? null : smeta_summa - fakt_summa };
}
const PUL_ROWS = [pul(ROWS[0], null, null, 200), pul(ROWS[1], 10, 20, 200), pul(ROWS[2], 10, 20, 200), pul(ROWS[3], 5, null, null)];
const PUL_HOLAT = [hp(1, 200), hp(2, 200), hp(3, 200, 40), hp(4, null)];

describe('useT2Daraxt — qator tahriridan keyin qisman yangilash', () => {
  beforeEach(() => {
    api.daraxt.mockResolvedValue({ ok: true, qatorlar: PUL_ROWS });
    api.holat.mockResolvedValue({ ok: true, qatorlar: PUL_HOLAT });
  });

  it('faqat qator + ota-bobolari + bolalari o‘qiladi; daraxt jamilari to‘liq yuklash bilan AYNAN bir xil', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.qoshimchaTayyor).toBe(true));
    // Server: rs3 narxi 30 ga o'zgardi → rs3, bl2 (t2_rollup) va rz1 summasi yangilandi.
    const server = [pul(ROWS[0], null, null, 300), pul(ROWS[1], 10, 20, 300), { ...pul(ROWS[2], 10, 30, 300), versiya: 2, narx_usul: 'QOL' }];
    const serverHolat = [hp(1, 300), hp(2, 300), hp(3, 300, 40)];
    api.daraxtQisman.mockResolvedValue({ ok: true, toliq: true, qatorlar: server });
    api.qisman.mockResolvedValue({ ok: true, toliq: true, qatorlar: serverHolat });

    await act(async () => { await result.current.qatorniYangila(3); });

    expect(api.daraxt).toHaveBeenCalledTimes(1); // butun smeta qayta o'qilmadi
    expect(api.holat).toHaveBeenCalledTimes(1);
    const idlar = api.daraxtQisman.mock.calls[0][1] as number[];
    expect([...idlar].sort()).toEqual([1, 2, 3]);
    expect(api.qisman.mock.calls[0][1]).toEqual(idlar);

    // To'liq qayta yuklash natijasi bilan solishtirish (bir xil raqamlar, bir xil tartib, change_type saqlangan).
    const toliqRows = [server[0], server[1], server[2], PUL_ROWS[3]].map((r) => ({ ...r, change_type: r.id === 4 ? 'ADDITIONAL' : null, replaces_line_id: null }));
    const toliqHolat = [serverHolat[0], serverHolat[1], serverHolat[2], PUL_HOLAT[3]];
    expect(result.current.rows).toEqual(toliqRows);
    expect(result.current.tree).toEqual(sbT2TreeQur(toliqRows, toliqHolat));
    const rz = result.current.tree[0];
    expect(rz.smeta).toBe(300);
    expect(rz.stFakt).toBe(40); // barg faktlari yuqoriga yig'iladi
    expect(rz.children!.find((n) => n.id === 4)!.smeta).toBeNull(); // NULL — 0 emas
    expect(result.current.rows.find((r) => r.id === 3)!.versiya).toBe(2);
  });

  it('qisman o‘qishda qator yetishmasa (tuzilma o‘zgargan) — to‘liq yuklashga qaytadi', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.tree.length).toBe(1));
    api.daraxtQisman.mockResolvedValue({ ok: true, toliq: true, qatorlar: [PUL_ROWS[2]] });
    api.qisman.mockResolvedValue({ ok: true, toliq: true, qatorlar: [] });
    await act(async () => { await result.current.qatorniYangila(3); });
    expect(api.daraxt).toHaveBeenCalledTimes(2);
    expect(result.current.yangilanmoqda).toBe(false);
  });

  it('fakt jurnali bir nechta qatorni saqlasa — faqat ularning shoxlari holati o‘qiladi', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.tree.length).toBe(1));
    api.qisman.mockResolvedValue({ ok: true, qatorlar: [hp(3, 200, 80), hp(2, 200), hp(1, 200)] });
    await act(async () => { await result.current.holatniYangila([3]); });
    expect([...(api.qisman.mock.calls[0][1] as number[])].sort()).toEqual([1, 2, 3]);
    expect(api.holat).toHaveBeenCalledTimes(1);
    expect(result.current.tree[0].stFakt).toBe(80);
    await act(async () => { await result.current.holatniYangila([3, 4]); });
    expect([...(api.qisman.mock.calls[1][1] as number[])].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('useT2Daraxt — sahifalar orasida umumiy kesh', () => {
  const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);

  it('Holat → Fakt → qaytish: daraxt qayta o‘qilmaydi va darhol ko‘rinadi; tahrir yamog‘i keshda qoladi', async () => {
    const qc = new QueryClient();
    const birinchi = renderHook(() => useT2Daraxt(7), { wrapper: wrapper(qc) });
    await waitFor(() => expect(birinchi.result.current.qoshimchaTayyor).toBe(true));
    api.qisman.mockResolvedValue({ ok: true, qatorlar: [h(2, 4), h(3, 4), h(1, 4)] });
    await act(async () => { await birinchi.result.current.holatniYangila(2); });
    birinchi.unmount();

    const ikkinchi = renderHook(() => useT2Daraxt(7), { wrapper: wrapper(qc) });
    expect(ikkinchi.result.current.tree.length).toBe(1); // skeleton yo'q
    expect(ikkinchi.result.current.loading).toBe(false);
    expect(ikkinchi.result.current.states.find((s) => s.qator_id === 2)!.fakt_hajm).toBe(4);
    expect(ikkinchi.result.current.rows.find((r) => r.id === 4)!.change_type).toBe('ADDITIONAL');
    expect(api.daraxt).toHaveBeenCalledTimes(1);
    expect(api.holat).toHaveBeenCalledTimes(1);
    ikkinchi.unmount();

    // Boshqa sahifa daraxtni o'zgartirsa — keyingi ochilishda jim qayta o'qiladi (kesh darhol ko'rsatiladi).
    daraxtKeshiniEskirt(qc, 7);
    const uchinchi = renderHook(() => useT2Daraxt(7), { wrapper: wrapper(qc) });
    expect(uchinchi.result.current.tree.length).toBe(1);
    await waitFor(() => expect(api.daraxt).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(uchinchi.result.current.yangilanmoqda).toBe(false));
  });

  it('boshqa obyekt keshi aralashmaydi', async () => {
    const qc = new QueryClient();
    const a = renderHook(() => useT2Daraxt(7), { wrapper: wrapper(qc) });
    await waitFor(() => expect(a.result.current.tree.length).toBe(1));
    a.unmount();
    api.daraxt.mockResolvedValue({ ok: true, qatorlar: [] });
    api.holat.mockResolvedValue({ ok: true, qatorlar: [] });
    const b = renderHook(() => useT2Daraxt(8), { wrapper: wrapper(qc) });
    expect(b.result.current.tree.length).toBe(0);
    await waitFor(() => expect(api.daraxt).toHaveBeenCalledWith(8, expect.any(String)));
  });
});