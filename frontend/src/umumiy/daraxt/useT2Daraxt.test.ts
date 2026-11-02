// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sbT2TreeQur, type T2Qator, type T2QatorHolat } from '../../api/supabase';

const api = vi.hoisted(() => ({
  daraxt: vi.fn(), holat: vi.fn(), qisman: vi.fn(), daraxtQisman: vi.fn(), narx: vi.fn(), oz: vi.fn(),
}));

vi.mock('../../api/supabase', async (asl) => ({
  ...(await asl<typeof import('../../api/supabase')>()),
  sbT2DaraxtOl: api.daraxt,
  sbT2QatorHolatOl: api.holat,
}));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: api.qisman, sbT2DaraxtQisman: api.daraxtQisman }));
vi.mock('../../api/t2-price-control', () => ({ priceControlOl: api.narx }));
vi.mock('../../api/t2-ozgarish', () => ({
  ozgarishMalumotOl: (...a: unknown[]) => api.oz(...a),
  avvalgiVersiyaOl: async () => ({ qatorlar: [{ ...q(90, null, 'rz'), almashtirgan_versiya_id: 5 }, { ...q(91, 90, 'bl'), almashtirgan_versiya_id: 5 }], versiyaNomi: new Map([[5, 'V2']]) }),
}));

import { daraxtKaliti, useT2Daraxt } from './useT2Daraxt';

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
  api.oz.mockResolvedValue(new Map([[4, { change_type: 'ADDITIONAL', replaces_line_id: null }]]));
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

  it('qisman so‘rovlar ketma-ket: keyingi saqlash oldingisidan KEYIN o‘qiladi, eski javob yangisini bosmaydi', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.tree.length).toBe(1));
    let sekinTugat: (v: unknown) => void = () => {};
    api.qisman
      .mockImplementationOnce(() => new Promise((r) => { sekinTugat = r; }))
      .mockResolvedValueOnce({ ok: true, qatorlar: [h(2, 9)] });
    await act(async () => {
      const sekin = result.current.holatniYangila(2);
      await vi.waitFor(() => expect(api.qisman).toHaveBeenCalledTimes(1));
      const keyingi = result.current.holatniYangila(2);
      await Promise.resolve();
      expect(api.qisman).toHaveBeenCalledTimes(1); // ikkinchisi birinchi tugashini kutadi
      sekinTugat({ ok: true, qatorlar: [h(2, 1)] });
      await sekin; await keyingi;
    });
    expect(api.qisman).toHaveBeenCalledTimes(2);
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

  it('Holat → Fakt → qaytish: kesh darhol ko‘rinadi, lekin fonda DOIM qayta tekshiriladi; tasdiqgacha serverTasdiq=false', async () => {
    const qc = new QueryClient();
    const birinchi = renderHook(() => useT2Daraxt(7), { wrapper: wrapper(qc) });
    await waitFor(() => expect(birinchi.result.current.qoshimchaTayyor).toBe(true));
    expect(birinchi.result.current.serverTasdiq).toBe(true);
    api.qisman.mockResolvedValue({ ok: true, qatorlar: [h(2, 4), h(3, 4), h(1, 4)] });
    await act(async () => { await birinchi.result.current.holatniYangila(2); });
    birinchi.unmount();
    expect(qc.getQueryData(daraxtKaliti(7))).toBeTruthy();

    let tugat: (v: unknown) => void = () => {};
    api.daraxt.mockImplementationOnce(() => new Promise((r) => { tugat = r; }));
    const ikkinchi = renderHook(() => useT2Daraxt(7), { wrapper: wrapper(qc) });
    expect(ikkinchi.result.current.tree.length).toBe(1); // skeleton yo'q
    expect(ikkinchi.result.current.loading).toBe(false);
    expect(ikkinchi.result.current.states.find((s) => s.qator_id === 2)!.fakt_hajm).toBe(4);
    // Keshdan — hali server tasdiqlamagan: eksport yopiq bo'lishi kerak.
    expect(ikkinchi.result.current.serverTasdiq).toBe(false);
    expect(ikkinchi.result.current.yangilanmoqda).toBe(true);
    expect(api.daraxt).toHaveBeenCalledTimes(2);
    await act(async () => { tugat({ ok: true, qatorlar: ROWS }); });
    await waitFor(() => expect(ikkinchi.result.current.serverTasdiq).toBe(true));
    await waitFor(() => expect(ikkinchi.result.current.yangilanmoqda).toBe(false));
    expect(ikkinchi.result.current.qoshimchaTayyor).toBe(true);
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

describe('useT2Daraxt — poyga holatlari va qo‘shimcha belgilar', () => {
  beforeEach(() => {
    api.daraxt.mockResolvedValue({ ok: true, qatorlar: PUL_ROWS });
    api.holat.mockResolvedValue({ ok: true, qatorlar: PUL_HOLAT });
  });

  it('ketma-ket ikki tez tahrir — ikkalasi ham daraxtda (navbatda yo‘qolmaydi)', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.qoshimchaTayyor).toBe(true));
    let birinchiTugat: (v: unknown) => void = () => {};
    // 1-tahrir (rs3) javobi sekin; 2-tahrir (bl4) uni kutadi va undan keyin o'qiladi.
    api.daraxtQisman
      .mockImplementationOnce(() => new Promise((r) => { birinchiTugat = r; }))
      .mockImplementationOnce(async (_o: number, idlar: number[]) => ({ ok: true, toliq: true,
        qatorlar: idlar.map((id) => id === 4 ? { ...PUL_ROWS[3], nom: 'yangi nom' } : PUL_ROWS[id - 1]) }));
    api.qisman.mockResolvedValue({ ok: true, qatorlar: [] });
    await act(async () => {
      const p1 = result.current.qatorniYangila(3);
      await vi.waitFor(() => expect(api.daraxtQisman).toHaveBeenCalledTimes(1));
      const p2 = result.current.qatorniYangila(4);
      await Promise.resolve();
      expect(api.daraxtQisman).toHaveBeenCalledTimes(1);
      birinchiTugat({ ok: true, toliq: true, qatorlar: [PUL_ROWS[0], PUL_ROWS[1], { ...PUL_ROWS[2], narx: 30, summa: 300 }] });
      await p1; await p2;
    });
    expect([...(api.daraxtQisman.mock.calls[1][1] as number[])].sort()).toEqual([1, 4]);
    expect(result.current.rows.find((r) => r.id === 3)!.summa).toBe(300);
    expect(result.current.rows.find((r) => r.id === 4)!.nom).toBe('yangi nom');
    expect(api.daraxt).toHaveBeenCalledTimes(1);
    expect(result.current.yangilanmoqda).toBe(false);
  });

  it('kutilayotgan fakt holati va qator tahriri bitta o‘qishda — eski holat yangi yamoqni bosmaydi', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.qoshimchaTayyor).toBe(true));
    let toliqTugat: (v: unknown) => void = () => {};
    api.daraxt.mockImplementationOnce(() => new Promise((r) => { toliqTugat = r; }));
    api.daraxtQisman.mockResolvedValue({ ok: true, toliq: true, qatorlar: [PUL_ROWS[0], PUL_ROWS[1], PUL_ROWS[2]] });
    api.qisman.mockImplementation(async (_o: number, idlar: number[]) => ({ ok: true, qatorlar: idlar.map((id) => hp(id, 500, id === 4 ? 7 : 0)) }));
    await act(async () => {
      const toliq = result.current.yuklash();
      const a = result.current.holatniYangila([4]);
      const b = result.current.qatorniYangila(3);
      toliqTugat({ ok: true, qatorlar: PUL_ROWS });
      await toliq; await a; await b;
    });
    expect(api.qisman).toHaveBeenCalledTimes(1);
    expect([...(api.qisman.mock.calls[0][1] as number[])].sort()).toEqual([1, 2, 3, 4]);
    expect(result.current.states.find((s) => s.qator_id === 4)!.fakt_summa).toBe(7);
    expect(result.current.states.find((s) => s.qator_id === 3)!.smeta_summa).toBe(500);
  });

  it('obyekt almashsa — eski obyekt tahriri/yuklashi yangi obyektga ham, keshiga ham yozmaydi', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const B_ROWS = [{ ...q(100, null, 'rz'), obyekt_id: 8 }, { ...q(101, 100, 'bl'), obyekt_id: 8 }];
    const { result, rerender } = renderHook(({ id }) => useT2Daraxt(id), { wrapper, initialProps: { id: 7 } });
    await waitFor(() => expect(result.current.qoshimchaTayyor).toBe(true));
    const aKesh = qc.getQueryData(daraxtKaliti(7));
    let aTugat: (v: unknown) => void = () => {};
    api.daraxt.mockImplementation((id: number) => id === 8 ? Promise.resolve({ ok: true, qatorlar: B_ROWS })
      : new Promise((r) => { aTugat = r; }));
    api.holat.mockImplementation(async (id: number) => ({ ok: true, qatorlar: id === 8 ? [h(100, 0), h(101, 0)] : PUL_HOLAT }));
    api.daraxtQisman.mockResolvedValue({ ok: true, toliq: true, qatorlar: [PUL_ROWS[0], PUL_ROWS[1], PUL_ROWS[2]] });
    api.qisman.mockResolvedValue({ ok: true, qatorlar: [hp(3, 1)] });
    let tahrir: Promise<void> = Promise.resolve(); let fakt: Promise<void> = Promise.resolve();
    await act(async () => {
      void result.current.yuklash();               // A: sekin to'liq yuklash
      tahrir = result.current.qatorniYangila(3);   // A: uni kutadi
      fakt = result.current.holatniYangila();      // A: butun holat
    });
    rerender({ id: 8 });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual([100, 101]));
    await act(async () => { aTugat({ ok: true, qatorlar: PUL_ROWS }); await tahrir; await fakt; });
    expect(result.current.rows.map((r) => r.id)).toEqual([100, 101]);
    expect(result.current.states.map((s) => s.qator_id).sort()).toEqual([100, 101]);
    expect(api.daraxtQisman).not.toHaveBeenCalled();
    expect(api.qisman).not.toHaveBeenCalled();
    expect(qc.getQueryData(daraxtKaliti(7))).toBe(aKesh);   // A keshi o'zgarmagan
    expect((qc.getQueryData(daraxtKaliti(8)) as { rows: T2Qator[] }).rows.map((r) => r.id)).toEqual([100, 101]);
    expect(result.current.error).toBe('');
  });
  it('jim to‘liq yuklash paytidagi tahrir uni bekor qilmaydi — qisman o‘qish undan KEYIN', async () => {
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.qoshimchaTayyor).toBe(true));
    let toliqTugat: (v: unknown) => void = () => {};
    api.daraxt.mockImplementationOnce(() => new Promise((r) => { toliqTugat = r; }));
    api.daraxtQisman.mockImplementation(async () => ({ ok: true, toliq: true, qatorlar: [PUL_ROWS[0], PUL_ROWS[1], { ...PUL_ROWS[2], summa: 999 }] }));
    api.qisman.mockResolvedValue({ ok: true, qatorlar: [] });
    await act(async () => {
      const toliq = result.current.yuklash();
      const qisman = result.current.qatorniYangila(3);
      await Promise.resolve();
      expect(api.daraxtQisman).not.toHaveBeenCalled(); // to'liq yuklashni kutyapti
      toliqTugat({ ok: true, qatorlar: PUL_ROWS.map((r) => (r.id === 4 ? { ...r, nom: 'toliqdan' } : r)) });
      await toliq; await qisman;
    });
    expect(result.current.rows.find((r) => r.id === 4)!.nom).toBe('toliqdan'); // to'liq natija qo'llangan (bekor qilinmadi)
    expect(result.current.rows.find((r) => r.id === 3)!.summa).toBe(999);       // tahrir ham
    expect(result.current.serverTasdiq).toBe(true);
  });

  it('qo‘shimcha/zamena belgilari o‘qilmasa — qoshimchaHolat=xato (LRV eksporti bloklanadi)', async () => {
    api.oz.mockResolvedValue(null);
    const { result } = renderHook(() => useT2Daraxt(7));
    await waitFor(() => expect(result.current.qoshimchaHolat).toBe('xato'));
    expect(result.current.qoshimchaTayyor).toBe(false);
    expect(result.current.tree.length).toBe(1); // daraxt baribir ko'rinadi
    // Qayta yuklashda holat avval 'yuklanmoqda', muvaffaqiyatda 'tayyor'.
    api.oz.mockResolvedValue(new Map());
    let p: Promise<void> = Promise.resolve();
    act(() => { p = result.current.yuklash(); });
    expect(result.current.qoshimchaHolat).toBe('yuklanmoqda');
    await act(async () => { await p; });
    expect(result.current.qoshimchaHolat).toBe('tayyor');
  });
});