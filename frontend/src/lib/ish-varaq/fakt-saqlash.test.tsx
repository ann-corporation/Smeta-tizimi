import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FaktPaketi } from './paket';

/* Hodisa 2026-11-09 (Fakt jurnali «saqlash» ishlamay qoldi): saqlash yo'li qotib qolmasin, har xato o'z sababi bilan aytilsin,
 * sahifani yangilamasdan qayta urinish mumkin bo'lsin, kiritilgan ma'lumot yo'qolmasin. */
const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), yangi: vi.fn(async () => false) }));
vi.mock('./faktni-saqla', () => ({ faktPaketniYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: vi.fn(async () => true) }));
vi.mock('../../_shared/versiya', async (orig) => ({ ...(await orig<typeof import('../../_shared/versiya')>()), yangiVersiyaniTekshir: m.yangi }));

import { SAQLASH_QOROVUL_MS, useFaktSaqlash } from './fakt-saqlash';

const paketOl = (hajm: number) => ({ ok: true, qatorlar: [{ qator_id: 2, hajm }], tuzatishlar: [] as number[], xatolar: new Map() }) as unknown as FaktPaketi;
const IDLAR = new Set([2]);

function ornat(paket = paketOl(5), faktlar: ReadonlyMap<number, number> = new Map([[2, 40]])) {
  const fn = { holat: vi.fn(async () => undefined), tozala: vi.fn(), onSaqlandi: vi.fn(), qoralamaYoz: vi.fn(), qoralamaTozala: vi.fn() };
  const props = (p: FaktPaketi, f: ReadonlyMap<number, number>) => ({
    obyektId: 8, sana: '2026-11-09', kiritmalar: {}, paket: p, faktlar: f, smetalar: new Map<number, number | null>(),
    qatorOl: () => undefined, ozgarishSoni: 1, holatniYangila: fn.holat, tozala: fn.tozala, onSaqlandi: fn.onSaqlandi,
    qoralamaYozDarhol: fn.qoralamaYoz, qoralamaTozala: fn.qoralamaTozala, izoh: '', fokusgaOt: vi.fn(),
  });
  const h = renderHook((a: { p: FaktPaketi; f: ReadonlyMap<number, number> }) => useFaktSaqlash(props(a.p, a.f)), { initialProps: { p: paket, f: faktlar } });
  return { h, fn, qayta: (p: FaktPaketi, f = faktlar) => h.rerender({ p, f }) };
}
const opId = (i: number) => m.yoz.mock.calls[i][0].operationId as string;

beforeEach(() => { m.yangi.mockResolvedValue(false); });
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('useFaktSaqlash — xatodan keyin sahifani yangilamasdan qayta urinish', () => {
  it('SEND_FAILED: qoralama darhol yoziladi, tugma bo‘shaydi, qayta bosish o‘sha operation_id bilan saqlaydi', async () => {
    m.yoz.mockResolvedValueOnce({ ok: false, sabab: 'YOZ', matn: 'So‘rov chiqmadi', tarmoq: true, kod: 'SEND_FAILED' })
      .mockResolvedValueOnce({ ok: true, idlar: IDLAR, takror: false });
    const { h, fn } = ornat();
    expect(await act(() => h.result.current.saqla())).toBe(false);
    expect(fn.qoralamaYoz).toHaveBeenCalled();
    expect(h.result.current.band).toBe(false);
    expect(h.result.current.ishda.current).toBeNull();
    expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/So‘rov chiqmadi.*brauzerda saqlab qo‘yildi/), 'danger', undefined, 12000);
    expect(await act(() => h.result.current.saqla())).toBe(true);
    expect(opId(1)).toBe(opId(0));
    expect(fn.tozala).toHaveBeenCalledTimes(1);
    expect(fn.qoralamaTozala).toHaveBeenCalledTimes(1);
  });

  it('har sabab o‘z xabari bilan: sessiya tugagan, server xatosi ≠ «internet»; qoralama har safar yoziladi', async () => {
    m.yoz.mockResolvedValueOnce({ ok: false, sabab: 'YOZ', matn: 'Kirish muddati tugagan — qayta kiring', tarmoq: false, kod: 'SESSION_EXPIRED' })
      .mockResolvedValueOnce({ ok: false, sabab: 'YOZ', matn: 'Server vaqtincha javob bermadi', tarmoq: false, kod: 'SERVER' })
      .mockResolvedValueOnce({ ok: false, sabab: 'YOZ', matn: 'Qator topilmadi', tarmoq: false, kod: undefined });
    const { h, fn } = ornat();
    for (let i = 0; i < 3; i++) await act(() => h.result.current.saqla());
    const matnlar = m.toast.mock.calls.map((c) => String(c[0]));
    expect(matnlar[0]).toMatch(/Kirish muddati tugagan.*brauzerda saqlab/);
    expect(matnlar[1]).toMatch(/Server vaqtincha.*brauzerda saqlab/);
    expect(matnlar[2]).toBe('Qator topilmadi'); // mantiqiy rad — «brauzerda saqlandi» deb aldamaydi
    expect(matnlar.join(' ')).not.toMatch(/Internet aloqasi uzildi/);
    expect(fn.qoralamaYoz).toHaveBeenCalledTimes(3);
  });

  it('oflayn tekshiruvi (yangi versiya so‘rovi) faqat so‘rov chiqmagan holatda; OFFLINE da versiya tekshirilmaydi', async () => {
    m.yoz.mockResolvedValueOnce({ ok: false, sabab: 'YOZ', matn: 'Qurilma ulanmagan', tarmoq: true, kod: 'OFFLINE' });
    const { h } = ornat();
    await act(() => h.result.current.saqla());
    expect(m.yangi).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/Qurilma ulanmagan/), 'danger', undefined, 12000);
  });

  it('dastur xatosi (TypeError emas) «tarmoq» deb aytilmaydi — nomi bilan ko‘rsatiladi, qoralama yoziladi', async () => {
    m.yoz.mockRejectedValueOnce(new RangeError('Invalid array length'));
    const { h, fn } = ornat();
    expect(await act(() => h.result.current.saqla())).toBe(false);
    expect(fn.qoralamaYoz).toHaveBeenCalled();
    expect(String(m.toast.mock.calls[0][0])).toMatch(/Kutilmagan dastur xatosi: RangeError: Invalid array length/);
    expect(h.result.current.ishda.current).toBeNull();
  });

  it('qotib qolgan so‘rov: qo‘riqchi uzadi, `ishda` tozalanadi, keyingi saqlash ishlaydi (avval abadiy «Saqlanmoqda…»)', async () => {
    vi.useFakeTimers();
    m.yoz.mockImplementationOnce(() => new Promise(() => undefined)).mockResolvedValueOnce({ ok: true, idlar: IDLAR, takror: false });
    const { h } = ornat();
    let p!: Promise<boolean>;
    act(() => { p = h.result.current.saqla(); });
    expect(h.result.current.ishda.current).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(SAQLASH_QOROVUL_MS + 1); });
    expect(await p).toBe(false);
    expect(h.result.current.ishda.current).toBeNull();
    expect(h.result.current.band).toBe(false);
    expect(String(m.toast.mock.calls[0][0])).toMatch(/Server javob bermadi.*brauzerda saqlab/);
    expect(await act(() => h.result.current.saqla())).toBe(true);
    expect(opId(1)).toBe(opId(0));
  });
});

describe('useFaktSaqlash — eskirgan closure va operation_id', () => {
  it('saqla eski renderdan olingan bo‘lsa ham eng yangi faktlar (CAS asosi) bilan ishlaydi', async () => {
    m.yoz.mockResolvedValue({ ok: true, idlar: IDLAR, takror: false });
    const { h, qayta } = ornat(paketOl(5), new Map([[2, 40]]));
    const eskiSaqla = h.result.current.saqla;
    qayta(paketOl(5), new Map([[2, 55]])); // jadval serverdan yangilandi, paket o‘zgarmadi
    await act(() => eskiSaqla());
    expect(m.yoz.mock.calls[0][0].faktlar.get(2)).toBe(55);
  });

  it('javobi yo‘qolgan amal serverda bajarilgan, kiritma esa o‘zgargan: «takror» yangi kiritmani yutmaydi — tozalanmaydi, yangi operation_id', async () => {
    m.yoz.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, idlar: IDLAR, takror: true })
      .mockResolvedValueOnce({ ok: true, idlar: IDLAR, takror: false });
    const { h, fn, qayta } = ornat(paketOl(5));
    await act(() => h.result.current.saqla()); // tarmoq xatosi (javob yo'qolgan bo'lishi mumkin)
    qayta(paketOl(7)); // foydalanuvchi kiritmani o‘zgartirdi
    expect(await act(() => h.result.current.saqla())).toBe(false);
    expect(fn.tozala).not.toHaveBeenCalled();
    expect(fn.qoralamaTozala).not.toHaveBeenCalled();
    expect(fn.holat).toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/allaqachon bajarilgan edi/), 'warn', undefined, 12000);
    expect(await act(() => h.result.current.saqla())).toBe(true);
    expect(opId(2)).not.toBe(opId(0));
  });

  it('bir xil paket «takror» deb qaytsa — oddiy muvaffaqiyat (ikkinchi hujjat yo‘q, kiritma tozalanadi)', async () => {
    m.yoz.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ ok: true, idlar: IDLAR, takror: true });
    const { h, fn } = ornat(paketOl(5));
    await act(() => h.result.current.saqla());
    expect(await act(() => h.result.current.saqla())).toBe(true);
    expect(fn.tozala).toHaveBeenCalledTimes(1);
  });
});
