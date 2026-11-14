import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { MindmapGraf } from '../api/t2-mindmap';

const m = vi.hoisted(() => ({
  kompaniya: { current: null as any }, graf: vi.fn(), bog: vi.fn(), toast: vi.fn(), grant: vi.fn(), taklif: vi.fn(),
}));
vi.mock('./KompaniyaTanlov', () => ({ useKompaniya: () => m.kompaniya.current }));
vi.mock('./Graf2D', () => ({ Graf2D: () => <div data-testid="graf2d" /> }));
vi.mock('../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../api/t2-hodisa', () => ({ sbObyektHodisalariOl: vi.fn(async () => ({ qatorlar: [] })), qachon: () => '', MODUL_RANG: {} }));
vi.mock('../api/t2-mindmap', async (orig) => ({ ...(await orig<typeof import('../api/t2-mindmap')>()), sbMindmapGrafOl: m.graf, sbMindmapBog: m.bog }));
vi.mock('../api/t2-tomon', async (orig) => ({
  ...(await orig<typeof import('../api/t2-tomon')>()),
  aloqalarOl: vi.fn(async () => ({ ok: true, natija: [{ id: 11, holat: 'faol', turi: 'shartnoma', nom: null, men_taklif_qildim: true, men_rol: 'pudratchi', qarshi_rol: 'zakazchik', qarshi_kompaniya_id: 2, qarshi_nom: 'Buyurtmachi MChJ', qarshi_inn: '123456789', kod_kutilmoqda: false, kod_muddati: null, taklif_vaqti: '', javob_vaqti: null, yopish_sababi: null, izoh: null, berilgan_grant_soni: 1, olingan_grant_soni: 0, kelgan_ochiq_taqdim: 2, yuborilgan_ochiq_taqdim: 0 },
    { id: 12, holat: 'faol', turi: 'shartnoma', nom: null, men_taklif_qildim: true, men_rol: 'pudratchi', qarshi_rol: 'subpudratchi', qarshi_kompaniya_id: 3, qarshi_nom: 'SINOV subpudratchi (test)', qarshi_inn: '111222333', kod_kutilmoqda: false, kod_muddati: null, taklif_vaqti: '', javob_vaqti: null, yopish_sababi: null, izoh: null, berilgan_grant_soni: 0, olingan_grant_soni: 0, kelgan_ochiq_taqdim: 0, yuborilgan_ochiq_taqdim: 0 }] })),
  aloqaTafsilotOl: vi.fn(async () => ({ ok: true, natija: { aloqa: {}, berilgan: [{ id: 91, resurs: 'f2', amallar: ['korish'], obyekt_id: 5, doira_nom: 'Amfiteatr', yaratildi: '' }], olingan: [], hodisalar: [] } })),
  resurslarOl: vi.fn(async () => ({ ok: true, natija: [{ kalit: 'f2', nom: 'F2 hujjati', nom_ru: null, guruh: 'x', amallar: ['korish'], taqdim_mumkin: true, izoh: null }] })),
  grantSaqla: m.grant,
  taklifYubor: m.taklif,
}));

import TestXarita from './TestXarita';

const grafFixture = (): MindmapGraf => ({
  tugunlar: [
    { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: { versiya: 1 }, x: null, y: null },
    { id: 'loyiha:7', tur: 'loyiha', nom: 'Park', meta: { versiya: 1 }, x: null, y: null },
    { id: 'shartnoma:3', tur: 'shartnoma', nom: '№12', meta: { versiya: 2 }, x: null, y: null },
    { id: 'kontragent:9', tur: 'kontragent', nom: 'Yangi MChJ', meta: { versiya: 1, inn: null }, x: null, y: null },
    { id: 'obyekt:5', tur: 'obyekt', nom: 'Amfiteatr', x: null, y: null, meta: { versiya: 4, loyiha_id: 7, smeta: 1000, fakt: 600, f2: 400, belgi: [] } },
  ],
  bogichlar: [
    { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
    { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
  ],
});

const tugun = (id: string) => document.querySelector<HTMLElement>('[data-tugun="' + id + '"]')!;
const ulash = (id: string) => tugun(id).querySelector<HTMLElement>('[data-karta-ulash]')!;
const Yol = () => <span data-testid="yol">{useLocation().pathname + useLocation().search}</span>;
const mount = () => render(<MemoryRouter><TestXarita /><Yol /></MemoryRouter>);

beforeAll(() => { if (!('ResizeObserver' in globalThis)) (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* */ }
  m.graf.mockReset(); m.graf.mockImplementation(async () => ({ ok: true, graf: grafFixture() }));
  m.bog.mockReset(); m.bog.mockResolvedValue({ ok: true }); m.toast.mockReset(); m.grant.mockReset(); m.grant.mockResolvedValue({ ok: true, natija: { saqlandi: 1 } });
  m.kompaniya.current = { joriy: { id: 1, nom: 'K', kod: 'k', rol: 'pto', is_director: false, mavqe: null, permissions: ['document.read', 'document.write'] }, superadmin: false };
});
afterEach(() => cleanup());

describe('Karta (chiziq tortish kanvasi) — asosiy ko‘rinish', () => {
  it('tahrir ruxsati bor — sukut ko‘rinish karta; tugunlarda holat va tugmalar bor', async () => {
    mount();
    await waitFor(() => expect(tugun('obyekt:5')).toBeTruthy());
    expect(screen.queryByTestId('pult-qator')).toBeNull();
    expect(tugun('obyekt:5').querySelector('[data-holat]')).toBeTruthy();
    await waitFor(() => expect(tugun('loyiha:7').querySelector('[data-karta-amal]')).toBeTruthy());
    expect(tugun('loyiha:7').querySelector('[data-karta-yarat]')).toBeTruthy();
    expect(tugun('loyiha:7').querySelector('[data-loyiha-raqam]')).toBeTruthy();
  });

  it('tap-tap: «Bog‘lash» → ikkinchi tugun → tasdiq kartasi (oddiy tilda) → tasdiqlansa mavjud yozuvchiga', async () => {
    mount();
    await waitFor(() => expect(tugun('shartnoma:3')).toBeTruthy());
    fireEvent.click(ulash('shartnoma:3'));
    expect(screen.getByTestId('karta-ulash-banner')).toBeTruthy();
    fireEvent.click(tugun('obyekt:5'));
    const karta = await screen.findByTestId('karta-tasdiq');
    expect(within(karta).getByTestId('karta-tasdiq-matn').textContent).toMatch(/biriktiriladi/);
    expect(m.bog).not.toHaveBeenCalled();
    fireEvent.click(within(karta).getByTestId('karta-tasdiq-tugma'));
    await waitFor(() => expect(m.bog).toHaveBeenCalledWith(1, 'shartnoma_obyekt', 3, 5, 4, undefined));
  });

  it('bo‘lmaydigan juftlik: sabab bilan rad, hech narsa yozilmaydi', async () => {
    mount();
    await waitFor(() => expect(tugun('kompaniya:1')).toBeTruthy());
    fireEvent.click(ulash('loyiha:7'));
    fireEvent.click(tugun('kompaniya:1'));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/avtomatik tegishli/), 'danger'));
    expect(screen.queryByTestId('karta-tasdiq')).toBeNull();
    expect(m.bog).not.toHaveBeenCalled();
  });

  it('tomon tugun va chiziq chiqadi (oqim belgisi faqat son > 0 bo‘lsa); tomon → obyekt = ko‘rish huquqi (grant)', async () => {
    mount();
    await waitFor(() => expect(tugun('tomon:11')).toBeTruthy());
    expect(tugun('tomon:11').textContent).toMatch(/Buyurtmachi MChJ/);
    expect(document.querySelector('[data-oqim]')?.textContent).toMatch(/2 hujjat/);
    fireEvent.click(ulash('tomon:11'));
    fireEvent.click(tugun('obyekt:5'));
    const karta = await screen.findByTestId('karta-tasdiq');
    const grant = await within(karta).findByTestId('karta-grant');
    fireEvent.click(within(grant).getByRole('checkbox'));
    fireEvent.click(within(karta).getByTestId('karta-tasdiq-tugma'));
    await waitFor(() => expect(m.grant).toHaveBeenCalledWith(1, 11, [{ resurs: 'f2', amallar: ['korish'], obyekt_id: 5 }]));
  });

  it('tomon/odam tugunlarining joyi shu brauzerda kompaniya bo‘yicha eslab qolinadi', async () => {
    window.localStorage.setItem('mindmap-karta-joy-v1:1', JSON.stringify({ 'tomon:11': { x: 777, y: 333 } }));
    mount();
    await waitFor(() => expect(tugun('tomon:11')).toBeTruthy());
    expect(tugun('tomon:11').style.left).toBe('777px');
    expect(tugun('tomon:11').style.top).toBe('333px');
  });

  it('turlar legendasi: filtr tugmasi shu turni yashiradi', async () => {
    mount();
    await waitFor(() => expect(tugun('obyekt:5')).toBeTruthy());
    const legenda = screen.getByTestId('karta-legenda');
    fireEvent.click(within(legenda).getByRole('button', { name: /Obyekt/ }));
    expect(tugun('obyekt:5')).toBeNull();
  });

  it('obyekt → subpudratchi tomon: tasdiq kartasi → mavjud topshirish sahifasi oldindan to‘ldirilgan ochiladi (qayta yozilmaydi)', async () => {
    mount();
    await waitFor(() => expect(tugun('tomon:12')).toBeTruthy());
    fireEvent.click(ulash('obyekt:5'));
    fireEvent.click(tugun('tomon:12'));
    const karta = await screen.findByTestId('karta-tasdiq');
    fireEvent.click(within(karta).getByTestId('karta-tasdiq-tugma'));
    await waitFor(() => expect(screen.getByTestId('yol').textContent).toBe('/admin/subpudrat?obyekt=5&aloqa=12'));
    expect(m.grant).not.toHaveBeenCalled();
  });

  it('kompaniya → kontragent, STIR yo‘q: rad emas — taklif kartasi STIR so‘raydi va yuboradi', async () => {
    m.taklif.mockResolvedValue({ ok: true, natija: { id: 1, holat: 'taklif', kod_kerak: false } });
    mount();
    await waitFor(() => expect(tugun('kontragent:9')).toBeTruthy());
    fireEvent.click(ulash('kontragent:9'));
    fireEvent.click(tugun('kompaniya:1'));
    const karta = await screen.findByTestId('karta-tasdiq');
    const tugma = within(karta).getByTestId('karta-tasdiq-tugma') as HTMLButtonElement;
    fireEvent.change(within(karta).getByTestId('karta-rol'), { target: { value: 'zakazchik' } });
    expect(tugma.disabled).toBe(true);
    fireEvent.change(within(karta).getByTestId('karta-inn'), { target: { value: '987654321' } });
    expect(tugma.disabled).toBe(false);
    fireEvent.click(tugma);
    await waitFor(() => expect(m.taklif).toHaveBeenCalledWith(1, { qabulInn: '987654321', qabulNom: 'Yangi MChJ', taklifRol: 'pudratchi', qabulRol: 'zakazchik' }));
  });

  it('tomon tugunida ham «⋯»: kabinet, huquqlar, aloqani tugatish', async () => {
    mount();
    await waitFor(() => expect(tugun('tomon:11')).toBeTruthy());
    await waitFor(() => expect(tugun('tomon:11').querySelector('[data-karta-amal]')).toBeTruthy());
    fireEvent.click(tugun('tomon:11').querySelector('[data-karta-amal]')!);
    const menyu = screen.getByTestId('mindmap-amal-menyu');
    for (const kalit of ['tomon:kabinet', 'tomon:huquq', 'tomon:huquq-bekor', 'tomon:toxtat']) expect(menyu.querySelector('[data-amal="' + kalit + '"]'), kalit).toBeTruthy();
  });
});