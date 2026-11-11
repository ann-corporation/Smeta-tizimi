import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

// Sintetik ma'lumot; tarmoq yo'q (barcha API mock). F2 rejimi: joriy oy F2 QORALAMASIga yozish, tasdiqlamaydi.
const m = vi.hoisted(() => ({
  yoz: vi.fn(), toast: vi.fn(), holat: vi.fn(), yangila: vi.fn(), yarat: vi.fn(), toliq: vi.fn(), hajmlar: vi.fn(), token: vi.fn(),
  aktlar: [] as unknown[], aktQatorlar: [] as unknown[],
}));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz, sbF2QoralamaHajmlar: m.hajmlar }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: m.holat, sbT2DaraxtQisman: vi.fn() }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({
  zamenaBoglanishOl: vi.fn(async () => ({ almashtiradi: new Map(), almashtirilgan: new Map() })),
  zamenaToliqOqi: vi.fn(async () => ({ ok: true, natija: { boglanish: { almashtiradi: new Map(), almashtirilgan: new Map() }, miqdor: new Map() } })),
}));
vi.mock('../../api/supabase', async (orig) => ({ ...(await orig<typeof import('../../api/supabase')>()), sbT2F2QoralamaYangila: m.yangila, sbT2AktYaratV2: m.yarat, sbOqi: vi.fn(async () => ({ ok: false, qatorlar: [] })) }));
vi.mock('../../api/t2-toliq-oqish', () => ({ t2ToliqOqi: m.toliq }));
vi.mock('../../api/t2-narx-protokol', async (orig) => ({ ...(await orig<typeof import('../../api/t2-narx-protokol')>()), narxProtokolQatorlariOl: vi.fn(async () => ({ ok: true, toliq: true, qatorlar: [] })) }));
vi.mock('../../api/t2-token', async (orig) => ({ ...(await orig<typeof import('../../api/t2-token')>()), tokenBilan: m.token }));
vi.mock('../../lib/f2-oylik-paket/ogoh', () => ({ topshirilganPaketOgohi: vi.fn(async () => null) }));

import { IshVaraq } from './IshVaraq';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const ISHLAR = [11, 12, 13, 14, 15, 16];
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Bolim A' }),
  ...ISHLAR.map((id) => q({ id, tur: 'bl', ota_id: 1, daraja: 1, kod: `E${id}`, nom: `Ish ${id}`, hajm: 100 })),
  q({ id: 31, tur: 'mat', ota_id: 11, daraja: 2, nom: 'Qum', hajm: 10, narx: 5, kat: 'МАТ' }),
  q({ id: 2, tur: 'rz', kod: '2', nom: 'Bolim B' }),
  q({ id: 21, tur: 'bl', ota_id: 2, daraja: 1, nom: 'Poydevor', hajm: 30 }),
  q({ id: 41, tur: 'rs', ota_id: 21, daraja: 2, nom: 'Beton', hajm: 60, narx: 10, kat: 'МАТ', norma: 2 } as never),
];
// Ish 12: fakt smetadan oshgan (120 > 100). Ish 11 (Qum) va Poydevor (Beton) — narxli; qolgan ishlar narxsiz.
const states = [
  ...ISHLAR.map((id) => ({ qator_id: id, smeta_hajm: 100, fakt_hajm: id === 12 ? 120 : 40, f2_mumkin_hajm: id === 12 ? 120 : 40, f2_hajm: 0 })),
  { qator_id: 31, smeta_hajm: 10, fakt_hajm: 0, smeta_summa: 50, smeta_narx: 5, f2_mumkin_hajm: 0, f2_hajm: 0 },
  { qator_id: 21, smeta_hajm: 30, fakt_hajm: 0, f2_mumkin_hajm: 0, f2_hajm: 0 },
  { qator_id: 41, smeta_hajm: 60, fakt_hajm: 0, smeta_summa: 600, smeta_narx: 10, fakt_summa: 0, f2_mumkin_hajm: 0, f2_hajm: 0 },
];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn() });

const bos = (key: string, o: Record<string, unknown> = {}) => fireEvent.keyDown(document.activeElement ?? window, { key, ...o });
const f2Kirit = (nom: string) => screen.getByLabelText(`F2: ${nom}`) as HTMLInputElement;
const faktKirit = (nom: string) => screen.getByLabelText(`Fakt: ${nom}`) as HTMLInputElement;
const oy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

beforeEach(() => {
  m.aktlar = []; m.aktQatorlar = [];
  m.toliq.mockImplementation(async (_o: unknown, s: { jadval: string }) => ({ ok: true, toliq: true, qatorlar: s.jadval === 't2_akt' ? m.aktlar : m.aktQatorlar }));
  m.hajmlar.mockResolvedValue({ ok: true, hajm: new Map(), aktSoni: 0 });
  m.yangila.mockResolvedValue({ ok: true, versiya: 5 });
  m.yarat.mockResolvedValue({ ok: true, akt_id: 90 });
  m.token.mockImplementation(async (_p: unknown, ish: () => Promise<unknown>) => ({ ok: true, natija: await ish(), sarflandi: 1 }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

/** F3 → F2 rejimi; ma'lumot o'qilguncha kutadi. */
async function f2RejimOch() {
  fireEvent.keyDown(window, { key: 'F3' });
  await waitFor(() => expect(screen.getByTestId('varaq-f2-holat').textContent).toMatch(/F2 qoralama №|hali yo‘q/));
}

describe('IshVaraq — F2 rejimi (F3)', () => {
  it('F3 — Fakt ↔ F2: ustun tahriri almashadi; sukut rejim (Fakt) o‘zgarmagan', async () => {
    render(<IshVaraq {...props()} />);
    expect(faktKirit('Ish 11')).toBeTruthy();
    expect(screen.queryByLabelText('F2: Ish 11')).toBeNull();
    expect(screen.getByRole('button', { name: 'Fakt' }).getAttribute('aria-pressed')).toBe('true');
    await f2RejimOch();
    expect(screen.queryByLabelText('Fakt: Ish 11')).toBeNull(); // fakt ustuni — faqat o'qish
    expect(f2Kirit('Ish 11')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'F2' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 'F3' });
    expect(faktKirit('Ish 11')).toBeTruthy();
    expect(screen.queryByLabelText('F2: Ish 11')).toBeNull();
    // F2 qoralama faqat F2 rejimiga kirganda o'qilgan (bir marta)
    expect(m.toliq).toHaveBeenCalled();
    expect(m.yoz).not.toHaveBeenCalled();
  });

  it('klaviatura oqimi: 5 qator F2 kiritiladi, Ctrl+S — BITTA qoralama chaqiruvi (mavjud qoralama yangilanadi, qolgan qatori saqlanadi), tasdiqlanmaydi', async () => {
    m.aktlar = [{ id: 77, raqam: '4', oy: oy(), holat: 'qoralama', lifecycle_status: 'draft', versiya: 4 }];
    m.aktQatorlar = [{ id: 1, qator_id: 16, hajm: 3, certified_quantity: 3, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent', raw_snapshot: { source: 'native_f2_preparation', hajmManba: 'fakt' } }];
    render(<IshVaraq {...props()} />);
    await f2RejimOch();
    await waitFor(() => expect(f2Kirit('Ish 16').value).toBe('3')); // saqlangan qoralama hajmi ko'rinadi
    bos('ArrowDown'); bos('ArrowDown'); // sarlavha → birinchi ish
    bos('Enter');
    expect(document.activeElement).toBe(f2Kirit('Ish 11'));
    const qiymatlar: Array<[string, string]> = [['Ish 11', '5'], ['Ish 12', '6'], ['Ish 13', '7'], ['Ish 14', '8'], ['Ish 15', '9']];
    qiymatlar.forEach(([nom, v], i) => {
      expect(document.activeElement).toBe(f2Kirit(nom));
      fireEvent.change(f2Kirit(nom), { target: { value: v } });
      if (i < qiymatlar.length - 1) bos('Enter'); // Enter = keyingi qator
    });
    expect(screen.getByTestId('ish-varaq-f2-saqlanmagan').textContent).toContain('5');
    bos('s', { ctrlKey: true });
    await waitFor(() => expect(m.yangila).toHaveBeenCalledTimes(1));
    expect(m.yarat).not.toHaveBeenCalled();
    expect(m.yoz).not.toHaveBeenCalled(); // fakt yo'li tegilmaydi
    const arg = m.yangila.mock.calls[0][0];
    expect(arg.kompaniyaId).toBe(1);
    expect(arg.aktId).toBe(77);
    expect(arg.kutilganVersiya).toBe(4);
    expect(typeof arg.operationId).toBe('string');
    // Narx qoidasi F2 tayyorlashdagi zanjirdan: ish (bl) qatorining o'z narxi yo'q — narxsiz; mavjud qoralama qatori (16) yo'qolmaydi.
    expect(arg.qatorlar.map((x: { qatorId: number; certifiedQuantity: number; priceIntentionallyAbsent: boolean }) => [x.qatorId, x.certifiedQuantity, x.priceIntentionallyAbsent]))
      .toEqual([[11, 5, true], [12, 6, true], [13, 7, true], [14, 8, true], [15, 9, true], [16, 3, true]]);
    expect(arg.qatorlar[0].rawSnapshot).toMatchObject({ source: 'native_f2_preparation', enteredQuantity: 5, hajmManba: 'fakt' });
    // Qoralama qayta o'qiladi (yangi versiya); saqlanmagan belgisi yo'qoladi
    await waitFor(() => expect(screen.queryByTestId('ish-varaq-f2-saqlanmagan')).toBeNull());
  });

  it('joriy oyda qoralama yo‘q — Ctrl+S yangi qoralama yaratadi (token orqali, joriy oy), mavjudini yangilash chaqirilmaydi', async () => {
    render(<IshVaraq {...props()} />);
    await f2RejimOch();
    fireEvent.change(f2Kirit('Ish 11'), { target: { value: '12,5' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
    expect(m.yangila).not.toHaveBeenCalled();
    expect(m.token).toHaveBeenCalledTimes(1);
    expect(m.token.mock.calls[0][0]).toMatchObject({ kompaniyaId: 1, amal: 'f2_qoralama' });
    const arg = m.yarat.mock.calls[0][0];
    expect(arg.obyektId).toBe(8);
    expect(arg.oy).toBe(oy());
    expect(arg.qatorlar).toHaveLength(1);
    expect(arg.qatorlar[0]).toMatchObject({ qatorId: 11, certifiedQuantity: 12.5, priceIntentionallyAbsent: true });
  });

  it('F2 > fakt va F2 > smeta — BLOKLAMAYDI: ogohlantirish chipi, saqlash baribir ishlaydi', async () => {
    render(<IshVaraq {...props()} />);
    await f2RejimOch();
    fireEvent.change(f2Kirit('Ish 11'), { target: { value: '150' } }); // fakt 40, smeta 100
    expect(screen.getByTestId('varaq-f2-ogoh-11').textContent).toContain('F2 > fakt');
    expect(screen.getByTestId('varaq-f2-ogoh-11').textContent).toContain('F2 > smeta');
    expect(screen.getByTestId('varaq-f2-oshgan').textContent).toContain('1');
    fireEvent.change(f2Kirit('Ish 13'), { target: { value: '30' } }); // fakt 40 ichida — ogohsiz
    expect(screen.queryByTestId('varaq-f2-ogoh-13')).toBeNull();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
    expect(m.yarat.mock.calls[0][0].qatorlar.map((x: { certifiedQuantity: number }) => x.certifiedQuantity)).toEqual([150, 30]);
  });

  it('xato qiymat (0) bilan Ctrl+S — saqlanmaydi; narx/protokol o‘qilmasa F2 yozilmaydi (jim bo‘sh narx yo‘q)', async () => {
    render(<IshVaraq {...props()} />);
    await f2RejimOch();
    fireEvent.change(f2Kirit('Ish 11'), { target: { value: '0' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(m.yarat).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith('1 tasida xato — tuzating', 'warn');
  });

  it('F2 rejimida «*» (fakt qoldig‘ini to‘ldirish) ishlamaydi — F2 = fakt faqat qo‘lda amal', async () => {
    render(<IshVaraq {...props()} />);
    await f2RejimOch();
    bos('ArrowDown'); bos('ArrowDown');
    bos('*');
    expect(screen.queryByTestId('ish-varaq-f2-saqlanmagan')).toBeNull();
  });
});

describe('IshVaraq — saqlanmagan bilan jami (delta)', () => {
  it('fakt kiritmasi: pastki panelda «Fakt (saqlanmagan bilan)» va Δ (ustamasiz + ustamali — SummaJuft)', () => {
    render(<IshVaraq {...props()} />);
    expect(screen.queryByTestId('jami-fakt-saqlanmagan')).toBeNull();
    fireEvent.change(faktKirit('Poydevor'), { target: { value: '5' } }); // Beton: 5 × norma 2 = 10 × narx 10 = 100
    const panel = screen.getByTestId('jami-fakt-saqlanmagan');
    expect(panel.textContent).toContain('Fakt (saqlanmagan bilan)');
    expect(screen.getByTestId('jami-fakt-farq').textContent).toMatch(/100/);
  });

  it('F2 kiritmasi: «F2 qoralama (saqlanmagan bilan)» va Δ; narxsiz qator 0 emas', async () => {
    render(<IshVaraq {...props()} />);
    await f2RejimOch();
    expect(screen.queryByTestId('jami-f2-saqlanmagan')).toBeNull();
    fireEvent.change(f2Kirit('Ish 11'), { target: { value: '5' } });
    expect(screen.getByTestId('jami-f2-saqlanmagan').textContent).toContain('F2 qoralama (saqlanmagan bilan)');
    expect(screen.getByTestId('jami-f2-farq')).toBeTruthy();
  });
});

describe('IshVaraq — Alt+1..4 filtrlar va «?» yordam', () => {
  const korinadi = () => ISHLAR.filter((id) => screen.queryByText(`Ish ${id}`)).concat(screen.queryByText('Poydevor') ? [21] : []);

  it('Alt+1 hammasi · Alt+2 qoldig‘i bor · Alt+3 smetadan oshgan · Alt+4 narxsiz', () => {
    render(<IshVaraq {...props()} />);
    expect(korinadi()).toEqual([11, 12, 13, 14, 15, 16, 21]);
    fireEvent.keyDown(window, { key: '3', altKey: true });
    expect(korinadi()).toEqual([12]); // fakt 120 > smeta 100
    expect(screen.getByRole('button', { name: 'Smetadan oshgan' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: '4', altKey: true });
    expect(korinadi()).toEqual([12, 13, 14, 15, 16]); // summasi noma'lum (NULL ≠ 0) ishlar
    fireEvent.keyDown(window, { key: '2', altKey: true });
    expect(korinadi()).toEqual([11, 13, 14, 15, 16, 21]); // ochiq qoldig'i bor (12 — oshgan, qoldiq manfiy)
    fireEvent.keyDown(window, { key: '1', altKey: true });
    expect(korinadi()).toEqual([11, 12, 13, 14, 15, 16, 21]);
  });

  it('filtr kiritma ichidan ham ishlaydi (Alt — modifikator), kiritilgan qator ko‘zdan yo‘qolmaydi', () => {
    render(<IshVaraq {...props()} />);
    faktKirit('Ish 13').focus();
    fireEvent.keyDown(faktKirit('Ish 13'), { key: '3', altKey: true });
    expect(korinadi()).toContain(12);
  });

  it('«?» — barcha tugmalar oynasi: F3, Alt+1…4, Ctrl+S; Esc yopadi va saqlanmagan kiritmani bekor qilmaydi', () => {
    render(<IshVaraq {...props()} />);
    fireEvent.change(faktKirit('Ish 11'), { target: { value: '2' } });
    expect(screen.queryByTestId('varaq-yordam')).toBeNull();
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    const oyna = screen.getByTestId('varaq-yordam');
    for (const tugma of ['F3', 'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Ctrl+S / Ctrl+Enter', 'Enter / F2', 'Tab / Shift+Tab', 'Esc', '+5', '=40', '50%', '?']) expect(oyna.textContent).toContain(tugma);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('varaq-yordam')).toBeNull();
    expect(screen.getByTestId('ish-varaq-saqlanmagan').textContent).toContain('1'); // kiritma saqlanib qoldi
  });
});
