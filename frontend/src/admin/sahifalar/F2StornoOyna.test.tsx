import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ yarat: vi.fn(), fakt: vi.fn(), podval: vi.fn(), ids: vi.fn(async () => [] as number[]), aktQ: vi.fn(async () => ({ ok: true, qatorlar: [] as unknown[] })) }));
vi.mock('../../api/supabase', () => ({ sbT2AktReestrOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-f2-storno', () => ({
  f2StornoManbaOl: vi.fn(async () => ({ ok: true, qatorlar: [
    { qator_id: 1, hajm: 4, certified_quantity: 4, certified_unit_price: 25, certified_amount: 100 },
    { qator_id: 2, hajm: 2, certified_quantity: 2, certified_unit_price: 10, certified_amount: 20 },
  ] })),
  f2StornoHolatOl: vi.fn(async () => ({ ok: true, qatorlar: [
    { qator_id: 1, tur: 'bl', fakt_hajm: 4, kod: 'K1', nom: 'Ish 1', birlik: 'м3' },
    { qator_id: 2, tur: 'mat', fakt_hajm: 2, kod: 'K2', nom: 'Mat 2', birlik: 'т' },
  ] })),
  f2StornoAktIdlari: m.ids,
  f2StornoAktQatorlariOl: m.aktQ,
  f2StornoQatorTarixOl: vi.fn(async () => ({ ok: true, qatorlar: [] })),
  f2StornoDaraxtOl: vi.fn(async () => ({ ok: true, qatorlar: [
    { id: 10, ota_id: null, tur: 'rz', nom: 'Bo‘lim A', tartib: 1 }, { id: 1, ota_id: 10, tur: 'bl', tartib: 2 },
    { id: 20, ota_id: null, tur: 'rz', nom: 'Bo‘lim B', tartib: 3 }, { id: 2, ota_id: 20, tur: 'mat', tartib: 4 },
  ] })),
  f2StornoQoralamaYarat: m.yarat,
  f2StornoFaktYoz: m.fakt,
  yangiOperationId: () => '00000000-0000-4000-8000-000000000009',
}));
vi.mock('../../api/t2-akt-podval', () => ({ aktPodvalStornoNusxa: m.podval }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: 1 }) }));

import { F2StornoOyna } from './F2StornoOyna';

afterEach(() => { cleanup(); vi.clearAllMocks(); m.ids.mockImplementation(async () => []); m.aktQ.mockImplementation(async () => ({ ok: true, qatorlar: [] })); });
const TASDIQ = [{ id: 11, raqam: '5', holat: 'tasdiqlangan', lifecycle_status: 'approved' }];
const ochish = (onYaratildi = vi.fn(), reestr: Array<{ id: number; raqam: string; holat: string; lifecycle_status: string }> = TASDIQ) => {
  render(<F2StornoOyna obyektId={8} akt={{ id: 11, raqam: '5', oy: '2026-09-01', hujjat_jami: 120 }} reestr={reestr} onYop={vi.fn()} onYaratildi={onYaratildi} />);
  return onYaratildi;
};

describe('F2StornoOyna: faqat tasdiqlangan F2 manba', () => {
  it('qoralama F2 storno qilinmaydi: xabar va tugma o‘chiq', async () => {
    ochish(vi.fn(), [{ id: 11, raqam: '5', holat: 'qoralama', lifecycle_status: 'draft' }]);
    expect((await screen.findByTestId('storno-tasdiqlanmagan')).textContent).toContain('№5');
    await screen.findByRole('radio', { name: 'Faktni 0 ga tushirish' });
    expect((screen.getByRole('button', { name: /qatorni storno qilish/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(m.yarat).not.toHaveBeenCalled();
  });
});

describe('F2StornoOyna: fakt tanlovi', () => {
  it('sukut — «Faktni 0 ga tushirish»: minus fakt yozuvlari yoziladi (eski oqim)', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 555 }); m.podval.mockResolvedValue({ ok: true }); m.fakt.mockResolvedValue({ ok: true });
    const tayyor = ochish();
    const nol = await screen.findByRole('radio', { name: 'Faktni 0 ga tushirish' }) as HTMLInputElement;
    expect(nol.checked).toBe(true);
    expect(screen.getByTestId('storno-fakt').textContent).toContain('0 ga tushiriladi: 2');
    fireEvent.click(screen.getByRole('button', { name: /2 qatorni storno qilish/ }));
    await waitFor(() => expect(tayyor).toHaveBeenCalledWith(555));
    expect(m.fakt).toHaveBeenCalledTimes(1);
    expect(m.fakt.mock.calls[0][0].yozuvlar.map((y: { qator_id: number; hajm: number }) => [y.qator_id, y.hajm])).toEqual([[1, -4], [2, -2]]);
  });

  it('«Faktni o‘zgartirma»: hech qanday fakt yozuvi yo‘q, muvaffaqiyat xatosiz', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 556 }); m.podval.mockResolvedValue({ ok: true });
    const tayyor = ochish();
    fireEvent.click(await screen.findByRole('radio', { name: /Faktni o‘zgartirma/ }));
    expect(screen.getByTestId('storno-fakt').textContent).toContain('Fakt o‘zgarmaydi');
    fireEvent.click(screen.getByRole('button', { name: /2 qatorni storno qilish/ }));
    await waitFor(() => expect(tayyor).toHaveBeenCalledWith(556));
    expect(m.fakt).not.toHaveBeenCalled();
    expect(m.yarat).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('fakt yozuvi yiqilsa qoralama takrorlanmaydi; «o‘zgartirma» ga o‘tib qayta urinish faqat yakunlaydi', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 557 }); m.podval.mockResolvedValue({ ok: true }); m.fakt.mockResolvedValue({ ok: false, error: 'tarmoq' });
    const tayyor = ochish();
    await screen.findByRole('radio', { name: 'Faktni 0 ga tushirish' });
    fireEvent.click(screen.getByRole('button', { name: /2 qatorni storno qilish/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('fakt 0 ga tushmadi');
    expect(tayyor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Faktni o‘zgartirma/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Podvalni qayta urinish' }));
    await waitFor(() => expect(tayyor).toHaveBeenCalledWith(557));
    expect(m.yarat).toHaveBeenCalledTimes(1);
    expect(m.fakt).toHaveBeenCalledTimes(1);
  });
});

describe('F2StornoOyna: daraxt (bo‘lim → ish → resurs)', () => {
  it('bitta bo‘limni qoldirish: bo‘lim belgisini bir bosish — qolgan hammasi stornoga, payload o‘zgarmaydi', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 558 }); m.podval.mockResolvedValue({ ok: true }); m.fakt.mockResolvedValue({ ok: true });
    const tayyor = ochish();
    const a = await screen.findByRole('checkbox', { name: 'Storno bo‘limi: Bo‘lim A' }) as HTMLInputElement;
    expect(a.checked).toBe(true);
    fireEvent.click(a);
    expect(a.checked).toBe(false);
    expect(screen.getByTestId('storno-soni').textContent).toBe('1');
    expect(screen.getByTestId('storno-qoladi-soni').textContent).toBe('1');
    expect(screen.getByTestId('storno-qoladi').textContent).toContain('Bo‘lim A');
    fireEvent.click(screen.getByRole('button', { name: /1 qatorni storno qilish/ }));
    await waitFor(() => expect(tayyor).toHaveBeenCalledWith(558));
    expect(m.yarat.mock.calls[0][0].qatorlar.map((q: { qatorId: number }) => q.qatorId)).toEqual([2]);
  });
  it('qidiruv ajdod bo‘limni ko‘rsatadi; qidiruv natijasidan belgilash ishlaydi', async () => {
    ochish();
    await screen.findByRole('checkbox', { name: 'Storno bo‘limi: Bo‘lim A' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Qator qidirish' }), { target: { value: 'mat' } });
    expect(screen.queryByRole('checkbox', { name: 'Storno bo‘limi: Bo‘lim A' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Storno bo‘limi: Bo‘lim B' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Storno: K2' }));
    expect(screen.getByTestId('storno-soni').textContent).toBe('1');
  });
  it('«Hammasidan olish» / «Hammasini belgilash» va qisman holat (indeterminate)', async () => {
    ochish();
    await screen.findByRole('checkbox', { name: 'Storno bo‘limi: Bo‘lim A' });
    fireEvent.click(screen.getByRole('button', { name: 'Hammasidan olish' }));
    expect(screen.getByTestId('storno-soni').textContent).toBe('0');
    expect((screen.getByRole('button', { name: /qatorni storno qilish/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hammasini belgilash' }));
    expect(screen.getByTestId('storno-soni').textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Tanlanmaganlarni ko‘rsatish' }));
    expect(screen.getByText('Hech narsa topilmadi.')).toBeTruthy();
  });
});

describe('F2StornoOyna: audit tuzatishlari', () => {
  it('M11: storno qatorlari raw_snapshot ida fakt rejimi va fakt operatsiya id si', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 560 }); m.podval.mockResolvedValue({ ok: true }); m.fakt.mockResolvedValue({ ok: true });
    const tayyor = ochish();
    fireEvent.click(await screen.findByRole('button', { name: /2 qatorni storno qilish/ }));
    await waitFor(() => expect(tayyor).toHaveBeenCalledWith(560));
    const rs = m.yarat.mock.calls[0][0].qatorlar[0].rawSnapshot;
    expect(rs).toMatchObject({ source: 'storno', stornoOf: 11, stornoFaktRejim: 'nolga', stornoFaktOp: m.fakt.mock.calls[0][0].operationId });
  });
  it('B2: server xato kodi o‘qiladigan matnda ko‘rinadi', async () => {
    m.yarat.mockResolvedValue({ ok: false, code: 'DUPLICATE_F2_SOURCE_LINE', error: 'x' });
    ochish();
    fireEvent.click(await screen.findByRole('button', { name: /2 qatorni storno qilish/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('DUPLICATE_F2_SOURCE_LINE');
  });
  it('M10: avval stornolangan qator sukut bo‘yicha belgisiz', async () => {
    m.ids.mockImplementation(async () => [90]);
    m.aktQ.mockImplementation(async () => ({ ok: true, qatorlar: [{ qator_id: 1, certified_quantity: -4, raw_snapshot: { source: 'storno', stornoOf: 11 } }] }));
    ochish(vi.fn(), [...TASDIQ, { id: 90, raqam: '5-С', holat: 'tasdiqlangan', lifecycle_status: 'approved' }]);
    expect((await screen.findByTestId('storno-avval')).textContent).toContain('1 qator avval stornolangan');
    expect(screen.getByTestId('storno-soni').textContent).toBe('1');
  });
  it('M9: yarim qolgan storno qoralamasi saqlangan fakt operatsiyasi bilan davom ettiriladi (yangi qoralama yo‘q)', async () => {
    m.podval.mockResolvedValue({ ok: true }); m.fakt.mockResolvedValue({ ok: true });
    m.ids.mockImplementation(async () => [91]);
    m.aktQ.mockImplementation(async () => ({ ok: true, qatorlar: [{ qator_id: 1, certified_quantity: -4, raw_snapshot: { source: 'storno', stornoOf: 11, stornoFaktRejim: 'nolga', stornoFaktOp: 'op-saqlangan' } }] }));
    const tayyor = ochish(vi.fn(), [...TASDIQ, { id: 91, raqam: '5-С', holat: 'qoralama', lifecycle_status: 'draft' }]);
    fireEvent.click(await screen.findByRole('button', { name: '№5-С ni davom ettirish' }));
    await waitFor(() => expect(tayyor).toHaveBeenCalledWith(91));
    expect(m.yarat).not.toHaveBeenCalled();
    expect(m.fakt.mock.calls[0][0]).toMatchObject({ operationId: 'op-saqlangan' });
    expect(m.fakt.mock.calls[0][0].yozuvlar.map((y: { qator_id: number; hajm: number }) => [y.qator_id, y.hajm])).toEqual([[1, -4]]);
  });
  it('M8: ochiq qoralamaga qo‘shish — yangi qoralama va fakt yozuvi yo‘q', async () => {
    m.podval.mockResolvedValue({ ok: true });
    const onQosh = vi.fn();
    render(<F2StornoOyna obyektId={8} akt={{ id: 11, raqam: '5', oy: '2026-09-01', hujjat_jami: 120 }} reestr={TASDIQ} onYop={vi.fn()} qoralamaga={{ aktId: 77, onQosh }} />);
    fireEvent.click(await screen.findByRole('button', { name: /2 qatorni ochiq qoralamaga qo‘shish/ }));
    await waitFor(() => expect(onQosh).toHaveBeenCalledTimes(1));
    expect(onQosh.mock.calls[0][0].map((q: { qatorId: number }) => q.qatorId)).toEqual([1, 2]);
    expect(m.podval.mock.calls[0][0]).toMatchObject({ aktId: 77, manbaAktId: 11 });
    expect(m.yarat).not.toHaveBeenCalled(); expect(m.fakt).not.toHaveBeenCalled();
  });
  it('m3: tugma o‘chiq bo‘lsa sababi yoziladi', async () => {
    ochish();
    await screen.findByRole('checkbox', { name: 'Storno bo‘limi: Bo‘lim A' });
    fireEvent.click(screen.getByRole('button', { name: 'Hammasidan olish' }));
    expect(screen.getByTestId('storno-sabab').textContent).toContain('hech qator belgilanmagan');
  });
});
