import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MindmapGraf } from '../api/t2-mindmap';

const m = vi.hoisted(() => ({
  kompaniya: { current: null as any },
  graf: vi.fn(),
}));

vi.mock('./KompaniyaTanlov', () => ({ useKompaniya: () => m.kompaniya.current }));
vi.mock('./Graf3D', () => ({ Graf3D: () => <div data-testid="graf3d" /> }));
vi.mock('./Graf2D', () => ({ Graf2D: () => <div data-testid="graf2d" /> }));
vi.mock('../api/t2-hodisa', () => ({
  sbObyektHodisalariOl: vi.fn(async () => ({ qatorlar: [] })), qachon: () => '', MODUL_RANG: {},
}));
vi.mock('../api/t2-mindmap', async (orig) => ({ ...(await orig<typeof import('../api/t2-mindmap')>()), sbMindmapGrafOl: m.graf }));

import TestXarita from './TestXarita';
import { SAHIFA_YOLI, belgiYoli, obyektZayavkaYoli } from '../lib/mindmap-yollar';

const grafFixture = (): MindmapGraf => ({
  tugunlar: [
    { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
    { id: 'loyiha:7', tur: 'loyiha', nom: 'Park', meta: { versiya: 1 }, x: null, y: null },
    { id: 'obyekt:5', tur: 'obyekt', nom: 'Amfiteatr', x: null, y: null, meta: { versiya: 1, loyiha_id: 7, smeta: 1000, fakt: 600, f2: 400, fakt_foiz: 60, f2_foiz: 40, belgi: [] } },
  ],
  bogichlar: [
    { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
    { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
  ],
});

const joriy = (o: Record<string, unknown> = {}) => ({ id: 1, nom: 'K', kod: 'k', rol: 'pto', is_director: false, mavqe: null, permissions: ['document.read', 'document.write'], ...o });
const kontekst = (j: any, superadmin = false) => ({ joriy: j, superadmin });

function mount(url = '/', props: Parameters<typeof TestXarita>[0] = {}) {
  return render(<MemoryRouter initialEntries={[url]}><TestXarita {...props} /></MemoryRouter>);
}
const yuklandi = () => waitFor(() => expect(screen.getByRole('heading', { name: 'Kompaniya xaritasi' })).toBeTruthy());

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  m.graf.mockReset();
  m.graf.mockImplementation(async () => ({ ok: true, graf: grafFixture() }));
  m.kompaniya.current = kontekst(joriy());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('TestXarita: tahrir ruxsati', () => {
  it('document.write bor — Tahrir yorlig‘i bor; ochilganda «Yangi qo‘shish» va bog‘lash tugmalari chiqadi', async () => {
    mount();
    await yuklandi();
    fireEvent.click(screen.getByRole('tab', { name: /Tahrir/ }));
    expect(await screen.findByText('Yangi qo\'shish:')).toBeTruthy();
    expect(screen.queryByTestId('mindmap-faqat-oqish')).toBeNull();
  });

  it('document.write yo‘q — Tahrir yorlig‘i yo‘q; 2D ko‘rinishda «Yangi qo‘shish» o‘rniga sabab', async () => {
    m.kompaniya.current = kontekst(joriy({ permissions: ['document.read'] }));
    mount();
    await yuklandi();
    expect(screen.queryByRole('tab', { name: /Tahrir/ })).toBeNull();
    expect(screen.getByTestId('mindmap-faqat-oqish').textContent).toMatch(/document\.write/);
    fireEvent.click(screen.getByRole('tab', { name: '2D graf' }));
    await waitFor(() => expect(screen.getByTestId('graf2d')).toBeTruthy());
    expect(screen.queryByText('Yangi qo\'shish:')).toBeNull();
    expect(screen.queryByText(/Qayta terish/)).toBeNull();
    expect(screen.getByTestId('mindmap-faqat-oqish').textContent).toMatch(/document\.write/);
  });

  it('rahbar roli — ruxsat ro‘yxatida document.write bo‘lsa ham tahrir yopiq', async () => {
    m.kompaniya.current = kontekst(joriy({ rol: 'rahbar' }));
    mount();
    await yuklandi();
    expect(screen.queryByRole('tab', { name: /Tahrir/ })).toBeNull();
    expect(screen.getByTestId('mindmap-faqat-oqish').textContent).toMatch(/rahbar/);
  });

  it('boshqa kompaniya xaritasi (ichki, kompaniyaId farqli) — tahrir yopiq', async () => {
    mount('/', { ichki: true, kompaniyaId: 99 });
    await yuklandi();
    expect(m.graf).toHaveBeenCalledWith(99);
    expect(screen.queryByRole('tab', { name: /Tahrir/ })).toBeNull();
  });
});

describe('TestXarita: ichki nusxa va ?tugun=', () => {
  it('sahifa nusxasi ?tugun= ni o‘qiydi (tugun panelda ochiladi)', async () => {
    mount('/?tugun=obyekt%3A5');
    await yuklandi();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Tafsilot paneli' })).toBeTruthy());
  });

  it('ichki nusxa sahifaning ?tugun= ini O‘QIMAYDI', async () => {
    mount('/?tugun=obyekt%3A5', { ichki: true });
    await yuklandi();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog', { name: 'Tafsilot paneli' })).toBeNull();
  });
});

describe('TestXarita: 30 soniyalik yangilanish', () => {
  const hidden = (v: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
  afterEach(() => { hidden(false); });

  it('yashirin tabda so‘rov yuborilmaydi, ko‘rinsa — qayta o‘qiladi', async () => {
    vi.useFakeTimers();
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const boshida = m.graf.mock.calls.length;
    expect(boshida).toBeGreaterThanOrEqual(1);
    hidden(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    expect(m.graf.mock.calls.length).toBe(boshida);
    hidden(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0); });
    expect(m.graf.mock.calls.length).toBe(boshida + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    expect(m.graf.mock.calls.length).toBe(boshida + 2);
  });
});

describe('TestXarita: kanonik havolalar', () => {
  it('SAHIFA_YOLI va belgi yo‘llarida legacy /admin/test/* yoki yo‘naltiruvchi manzil yo‘q', () => {
    const yollar = (Object.values(SAHIFA_YOLI) as ((id: number, nom: string) => string)[]).map((f) => f(5, 'Nom'));
    for (const y of yollar) {
      expect(y).not.toMatch(/\/admin\/test\//);
      expect(y).not.toMatch(/^\/admin\/(shartnomalar|sklad)(\?|$)/);
    }
    expect(SAHIFA_YOLI.obyekt!(5, 'x')).toBe('/admin/holat/5');
    expect(SAHIFA_YOLI.loyiha!(1, 'x')).toBe('/admin/loyiha');
    expect(SAHIFA_YOLI.shartnoma!(1, 'x')).toBe('/admin/shartnoma-liniya');
    expect(SAHIFA_YOLI.sklad!(1, 'x')).toBe('/admin/logistika');
  });

  it('belgi va zayavka yo‘llari nom emas, ID bilan', () => {
    expect(obyektZayavkaYoli(5)).toBe('/admin/zayavka?obyekt=5');
    expect(obyektZayavkaYoli(5, true)).toBe('/admin/zayavka?obyekt=5&yarat=1');
    const obyekt = { id: 'obyekt:5', tur: 'obyekt' as const, entity_id: 5 };
    expect(belgiYoli(obyekt, { tur: 'zayavka' })).toBe('/admin/zayavka?obyekt=5');
    expect(belgiYoli(obyekt, { tur: 'narx_yoq' })).toBe('/admin/holat/5');
    expect(belgiYoli(obyekt, { tur: 'kozgu' })).toBe('/admin/system-control');
    expect(belgiYoli({ id: 'loyiha:7', tur: 'loyiha' }, { tur: 'zayavka' })).toBe('/admin/zayavka');
  });
});
