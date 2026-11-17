import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Faqat sintetik ma'lumot; tarmoq va hisoblash serveri soxta.
const api = vi.hoisted(() => ({
  omborQoldiq: vi.fn(), omborQoldiqSana: vi.fn(), omborRoyxat: vi.fn(), omborTarix: vi.fn(), omborYoz: vi.fn(), omborTuzat: vi.fn(), omborEksport: vi.fn(),
  omborTahlilMatn: vi.fn(), omborTahlilOvoz: vi.fn(), omborTasdiq: vi.fn(), omborTaklif: vi.fn(), omborHisobot: vi.fn(), omborNarxQoy: vi.fn(),
}));
vi.mock('../../api/t2-ombor', () => api);
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
import { OmborIshJoyi } from './OmborIshJoyi';

const G = (nomi: string, birligi: string, qoldiq: number) => ({ kalit: 'k:' + nomi, nomi, birligi, tur: null, kirim: qoldiq, chiqim: 0, qoldiq, variantlar_soni: 2, harakatlar: 2, oxirgi_sana: '2026-11-01', ball: 0.95 });
const T = (nomi: string, birligi: string, o: Record<string, unknown> = {}) => ({ nomi, birligi, soni: 3, oxirgi_sana: '2026-11-01', miqdor_oxirgi: 10, miqdor_median: 8, narx_oxirgi: null, narx_ortacha: null, narx_oxirgi_qqs: null, narx_ortacha_qqs: null,
  kontragent: null, kontragent_oxirgi: null, kontragentlar: [], ball: 1, ...o });
const JAMI = { kirim_soni: 0, chiqim_soni: 0, birliklar: [], kirim_summa: 0, kirim_summa_qqs: 0, chiqim_summa: null, chiqim_summa_qqs: null, narxsiz_soni: 0, qqs_foiz: 12 };
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  localStorage.clear();
  api.omborTaklif.mockResolvedValue({ ok: true, tur: 'prixod', qqs_foiz: 12, takliflar: [], kontragentlar: [] });
  api.omborQoldiq.mockResolvedValue({ ok: true, jami: 1, limit: 50, offset: 0, turlar: ['Sintetik'], qatorlar: [G('Тест труба ф25', 'м', 175)] });
  api.omborHisobot.mockResolvedValue({ ok: true, davr: { belgi: 'bugun', dan: '2026-11-17', gacha: '2026-11-17' }, jami: JAMI, chetlatilgan: 0, jami_qator: 0, limit: 50, offset: 0, qatorlar: [] });
  api.omborYoz.mockResolvedValue({ ok: true, harakat_id: 1, qoldiq_keyin: 180 });
});
afterEach(cleanup);
const montaj = (yozish = true) => render(<OmborIshJoyi kompaniyaId={1} skladId={9} skladNomi="Test ombor" yozishMumkin={yozish} />);
const qoldiqTab = () => fireEvent.click(screen.getByRole('tab', { name: 'Qoldiq' }));
const kirishQatori = async () => screen.findByLabelText('Material yoki buyruq');
const taklifTanla = async (nom: RegExp) => { fireEvent.change(await kirishQatori(), { target: { value: 'truba' } }); fireEvent.click(await screen.findByRole('option', { name: nom })); };

describe('OmborIshJoyi: sodda tuzilma', () => {
  it('bitta kiritish qatori + Kirim/Chiqim + uchta yorliq (Bugun, Hisobot, Qoldiq); bugungi ro\'yxat yuklanadi', async () => {
    montaj();
    await kirishQatori();
    expect(screen.getByRole('button', { name: 'Kirim' })).toBeTruthy(); expect(screen.getByRole('button', { name: 'Chiqim' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Bugun', 'Hisobot', 'Qoldiq']);
    await waitFor(() => expect(api.omborHisobot).toHaveBeenCalled());
    expect(api.omborHisobot.mock.calls[0][2]).toMatchObject({ davr: 'bugun' });
  });
  it('ostatka birlashgan: variantlar soni ko\'rinadi', async () => {
    montaj(); qoldiqTab();
    expect(await screen.findByText('Тест труба ф25')).toBeTruthy();
    expect(screen.getAllByText(/2 yozuv/).length).toBeGreaterThan(0);
  });
  it('faqat-o\'qish foydalanuvchida kiritish paneli yo\'q', async () => {
    montaj(false); qoldiqTab();
    await screen.findByText('Тест труба ф25');
    expect(screen.queryByLabelText('Material yoki buyruq')).toBeNull();
  });
  it('ostatka sanasi tanlansa o\'tgan sana API si chaqiriladi', async () => {
    api.omborQoldiqSana.mockResolvedValue({ ok: true, jami: 0, limit: 50, offset: 0, turlar: [], qatorlar: [] });
    montaj(); qoldiqTab();
    fireEvent.change(await screen.findByLabelText('Ostatka sanasi'), { target: { value: '2026-10-31' } });
    await waitFor(() => expect(api.omborQoldiqSana).toHaveBeenCalled());
    expect(api.omborQoldiqSana.mock.calls.at(-1)![2]).toBe('2026-10-31');
  });
  it('hisobot yorlig\'i: davr tugmalari va filtr bilan so\'raladi', async () => {
    montaj();
    fireEvent.click(screen.getByRole('tab', { name: 'Hisobot' }));
    fireEvent.click(await screen.findByRole('button', { name: 'O‘tgan oy' }));
    await waitFor(() => expect(api.omborHisobot.mock.calls.some((c) => c[2].davr === 'otgan_oy')).toBe(true));
  });
});

describe('kirim: aqlli taklif -> bir bosishlik karta', () => {
  it('taklifdan tanlash kartani to\'ldiradi (birlik, odatiy miqdor, narx QQS bilan, yetkazuvchi) -> bitta operation_id; narx QQS siz ga keltirishga server tomonidan (narx_rejim)', async () => {
    api.omborTaklif.mockResolvedValue({ ok: true, tur: 'prixod', qqs_foiz: 12, kontragentlar: [],
      takliflar: [T('Test truba f25', 'm', { miqdor_median: 8, narx_oxirgi: 1000, narx_oxirgi_qqs: 1120, kontragent: 'Sintetik MChJ' })] });
    montaj(); await taklifTanla(/Test truba f25/);
    expect((screen.getByLabelText('Birlik') as HTMLInputElement).value).toBe('m');
    expect((screen.getByLabelText('Miqdor') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('Yetkazuvchi') as HTMLInputElement).value).toBe('Sintetik MChJ');
    expect((screen.getByLabelText('Narx (ixtiyoriy)') as HTMLInputElement).value).toBe('1120'); // sukut «QQS bilan»
    expect(screen.getByRole('button', { name: 'QQS bilan' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('1 000', { exact: false })).toBeTruthy(); // QQS siz ham ko'rinadi
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '5,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(api.omborYoz).toHaveBeenCalledTimes(1));
    const [k, s, y] = api.omborYoz.mock.calls[0];
    expect([k, s]).toEqual([1, 9]);
    expect(y).toMatchObject({ operatsiya: 'prixod', nomi: 'Test truba f25', birligi: 'm', miqdor: '5.5', narx: '1120', narx_rejim: 'bilan', kontragent: 'Sintetik MChJ' });
    expect(String(y.operation_id)).toMatch(/^[0-9a-f-]{36}$/i);
  });
  it('narx ixtiyoriy: bo\'sh bo\'lsa bir marta yumshoq so\'raladi, «O\'tkazib yuborish» yoki ikkinchi «Saqlash» baribir saqlaydi (hech qachon to\'smaydi)', async () => {
    api.omborTaklif.mockResolvedValue({ ok: true, tur: 'prixod', qqs_foiz: 12, kontragentlar: [], takliflar: [T('Test truba f25', 'm')] });
    montaj(); await taklifTanla(/Test truba f25/);
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText(/Narxi ma’lummi/)).toBeTruthy();
    expect(api.omborYoz).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'O‘tkazib yuborish' }));
    await waitFor(() => expect(api.omborYoz).toHaveBeenCalledTimes(1));
    expect(api.omborYoz.mock.calls[0][2].narx).toBeUndefined();
    // ikkinchi urinish: ikkinchi «Saqlash» ham so'ramasdan saqlaydi
    api.omborYoz.mockClear();
    await taklifTanla(/Test truba f25/);
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(api.omborYoz).toHaveBeenCalledTimes(1));
  });
  it('QQS siz tanlansa eslab qolinadi (ombor bo\'yicha), narx o\'sha narxni saqlab o\'zgaradi; server narx_rejim:siz oladi', async () => {
    api.omborTaklif.mockResolvedValue({ ok: true, tur: 'prixod', qqs_foiz: 12, kontragentlar: [], takliflar: [T('Test truba f25', 'm', { narx_oxirgi: 1000, narx_oxirgi_qqs: 1120 })] });
    montaj(); await taklifTanla(/Test truba f25/);
    fireEvent.click(screen.getByRole('button', { name: 'QQS siz' }));
    expect((screen.getByLabelText('Narx (ixtiyoriy)') as HTMLInputElement).value).toBe('1000');
    expect(localStorage.getItem('ombor-narx-rejim:1:9')).toBe('siz');
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(api.omborYoz).toHaveBeenCalled());
    expect(api.omborYoz.mock.calls[0][2]).toMatchObject({ narx: '1000', narx_rejim: 'siz' });
  });
  it('yangi nom (taklifda yo\'q) o\'zi qabul qilinadi — chiqimda narx maydoni yo\'q va so\'ralmaydi', async () => {
    montaj();
    fireEvent.click(await screen.findByRole('button', { name: 'Chiqim' }));
    fireEvent.change(await kirishQatori(), { target: { value: 'Butunlay yangi material' } });
    fireEvent.keyDown(screen.getByLabelText('Material yoki buyruq'), { key: 'Enter' });
    fireEvent.change(await screen.findByLabelText('Birlik'), { target: { value: 'dona' } });
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '3' } });
    expect(screen.queryByLabelText('Narx (ixtiyoriy)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(api.omborYoz).toHaveBeenCalledTimes(1));
    expect(api.omborYoz.mock.calls[0][2]).toMatchObject({ operatsiya: 'chiqim', nomi: 'Butunlay yangi material', birligi: 'dona', miqdor: '3' });
  });
  it('server QOLDIQ_YETMAYDI ni tushunarli xabar bilan ko\'rsatadi', async () => {
    api.omborYoz.mockResolvedValue({ ok: false, code: 'QOLDIQ_YETMAYDI' });
    montaj();
    fireEvent.click(await screen.findByRole('button', { name: 'Chiqim' }));
    fireEvent.change(await kirishQatori(), { target: { value: 'truba' } });
    fireEvent.keyDown(screen.getByLabelText('Material yoki buyruq'), { key: 'Enter' });
    fireEvent.change(await screen.findByLabelText('Birlik'), { target: { value: 'm' } });
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ostatka yetmaydi');
  });
});

describe('gap/ovoz buyrug\'i', () => {
  it('variant tanlash bosqichi yo\'q: tasdiq kartasi chiqadi, nomzodlar ixtiyoriy taklif', async () => {
    api.omborTahlilMatn.mockResolvedValue({ ok: true, holat: 'tasdiq_kerak', token: 'T.T', matn: 'test 5 kg keldi', nomzodlar: [{ nomi: 'Test A', birligi: 'kg', qoldiq: 1, ball: 0.8, kalit: 'a', variantlar_soni: 1 }, { nomi: 'Test B', birligi: 'kg', qoldiq: 2, ball: 0.8, kalit: 'b', variantlar_soni: 1 }],
      preview: { tur: 'prixod', nomi: 'Test A', birligi: 'kg', miqdor: 5, sana: '2026-11-17', ogohlantirish: [] } });
    montaj();
    fireEvent.change(await kirishQatori(), { target: { value: 'test 5 kg keldi' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Tushun' }));
    expect(await screen.findByRole('group', { name: 'Tasdiqlash kartasi' })).toBeTruthy();
    fireEvent.click(screen.getByText('Test B'));
    await waitFor(() => expect(api.omborTahlilMatn).toHaveBeenLastCalledWith(1, 9, 'test 5 kg keldi', { nomi: 'Test B', birligi: 'kg' }, 'bilan'));
  });
  it('matn → preview kartasi (narx QQS siz/bilan) → faqat «Tasdiqlash» dan keyin yoziladi; rejim aniq bo\'lmasa bir marta so\'raladi', async () => {
    api.omborTahlilMatn.mockResolvedValue({ ok: true, holat: 'tasdiq_kerak', token: 'T.T', matn: '50 kg mix keldi narx 1120',
      preview: { tur: 'prixod', nomi: 'Тест миx', birligi: 'кг', miqdor: 50, narx: 1000, narx_bilan: 1120, narx_rejim: 'bilan', narx_rejim_sorov: true, sana: '2026-11-17', qoldiq_hozir: 10, qoldiq_keyin: 60, ogohlantirish: [] } });
    api.omborTasdiq.mockResolvedValue({ ok: true, harakat_id: 7 });
    montaj();
    fireEvent.change(await kirishQatori(), { target: { value: '50 kg mix keldi narx 1120' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Tushun' }));
    const karta = await screen.findByRole('group', { name: 'Tasdiqlash kartasi' });
    const tekis = (karta.textContent ?? '').replace(/\s/g, ''); expect(tekis).toContain('1000'); expect(tekis).toContain('1120');
    expect(api.omborTasdiq).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'QQS siz' })); // aniq tanlov: qayta tahlil, tanlov eslab qolinadi
    await waitFor(() => expect(api.omborTahlilMatn).toHaveBeenLastCalledWith(1, 9, '50 kg mix keldi narx 1120', undefined, 'siz'));
    expect(localStorage.getItem('ombor-narx-rejim:1:9')).toBe('siz');
    fireEvent.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(api.omborTasdiq).toHaveBeenCalledWith(1, 9, 'T.T'));
  });
});

describe('material kartasi', () => {
  it('qatorni bosganda tarix ochiladi va tuzatish sababsiz yuborilmaydi', async () => {
    api.omborTarix.mockResolvedValue({ ok: true, jami: 1, kirim: 5, chiqim: 0, qatorlar: [
      { id: 11, sana: '2026-11-01', operatsiya: 'prixod', nomi: 'Тест труба ф25', birligi: 'м', obyomi: 5, postavshik: 'S', qabul_qiluvchi: null, qabul_turi: null, izoh: null, tur: null, sf_tasdiq: null, manba: 'ombor_prixod_v1', teskari: false, yaratildi: 'x' }] });
    api.omborTuzat.mockResolvedValue({ ok: true, teskari_id: 2, yangi_id: 3 });
    montaj(); qoldiqTab();
    fireEvent.click(await screen.findByText('Тест труба ф25'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tuzatish' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' }).at(-1)!);
    expect(api.omborTuzat).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'sintetik xato' } });
    fireEvent.change(screen.getByLabelText('Yangi miqdor'), { target: { value: '6' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' }).at(-1)!);
    await waitFor(() => expect(api.omborTuzat).toHaveBeenCalledTimes(1));
    expect(api.omborTuzat.mock.calls[0][2]).toMatchObject({ harakat_id: 11, yangi: { miqdor: '6' }, sabab: 'sintetik xato' });
  });
});

describe('hisobot: narxsiz kirimga keyin narx qo\'yish', () => {
  it('narxsiz kirim qatorida «Narx qo\'yish» (yozish ruxsati bilan) -> omborNarxQoy; jadvalda QQS siz va QQS bilan ustunlari', async () => {
    api.omborHisobot.mockResolvedValue({ ok: true, davr: { belgi: 'oy', dan: '2026-11-01', gacha: '2026-11-17' }, chetlatilgan: 0, jami_qator: 2, limit: 50, offset: 0,
      jami: { ...JAMI, kirim_soni: 2, narxsiz_soni: 1, kirim_summa: 1000, kirim_summa_qqs: 1120, birliklar: [{ birligi: 'кг', kirim: 10, chiqim: 0 }] },
      qatorlar: [
        { id: 5, sana: '2026-11-05', operatsiya: 'prixod', nomi: 'Цемент', birligi: 'кг', obyomi: 1, kontragent: 'А', obyekt_id: null, narx: 1000, summa: 1000, summa_qqs: 1120, izoh: null },
        { id: 6, sana: '2026-11-06', operatsiya: 'prixod', nomi: 'Мix', birligi: 'кг', obyomi: 9, kontragent: null, obyekt_id: null, narx: null, summa: null, summa_qqs: null, izoh: null }] });
    api.omborNarxQoy.mockResolvedValue({ ok: true, harakat_id: 6, narx: 50 });
    montaj();
    fireEvent.click(screen.getByRole('tab', { name: 'Hisobot' }));
    expect(await screen.findByText('Narxi yozilmagan kirim: 1', { exact: false })).toBeTruthy();
    expect(screen.getAllByText('1 120').length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Narx qo‘yish' }));
    fireEvent.change(screen.getByLabelText('Narx (ixtiyoriy)'), { target: { value: '50' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Saqlash' }).at(-1)!);
    await waitFor(() => expect(api.omborNarxQoy).toHaveBeenCalledWith(1, 9, 6, '50'));
  });
});
