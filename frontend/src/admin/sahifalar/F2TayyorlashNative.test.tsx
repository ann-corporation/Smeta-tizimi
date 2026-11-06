import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { T2Qator } from '../../api/supabase';

const m = vi.hoisted(() => ({ yarat: vi.fn(), toast: vi.fn(), yangila: vi.fn(), oqi: vi.fn(), belgila: vi.fn(), baj: [] as unknown[], reestr: vi.fn(), tasdiq: vi.fn(async () => true), komp: { joriy: { id: 1 } as Record<string, unknown>, superadmin: false } }));
const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', nom: 'Poydevor' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е6-1', nom: 'Beton quyish', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'Ishchi', norma: 2, narx: 25000 }),
  q({ id: 4, tur: 'rs', ota_id: 2, kat: 'МАШ', nom: 'Kran', norma: 0.5, narx: null }),
  q({ id: 5, tur: 'rz', nom: 'Devor' }),
  q({ id: 6, tur: 'bl', ota_id: 5, nom: 'G‘isht terish', hajm: 4 }),
];
const holat = [
  { qator_id: 2, tur: 'bl', nom: 'Beton quyish', f2_mumkin_hajm: 6, f2_hajm: 0, smeta_hajm: 10 },
  { qator_id: 3, tur: 'rs', nom: 'Ishchi', kat: 'ЧЕЛ', f2_mumkin_hajm: 12 },
  { qator_id: 4, tur: 'rs', nom: 'Kran', kat: 'МАШ', f2_mumkin_hajm: 3 },
  { qator_id: 6, tur: 'bl', nom: 'G‘isht terish', f2_mumkin_hajm: 4 },
];

vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 8, nom: 'Ko‘l' }, { id: 9, nom: 'Ikkinchi' }] })),
  sbT2DaraxtOl: vi.fn(async () => ({ ok: true, qatorlar: rows })),
  sbT2AktYaratV2: m.yarat,
  sbT2F2QoralamaYangila: m.yangila,
  sbOqi: m.oqi,
  sbT2AktReestrOl: m.reestr,
  yangiOperationId: () => '00000000-0000-4000-8000-000000000001',
}));
// Token daftari: sarf muvaffaqiyatli — amal bajariladi (token mantig'i t2-token/f2-yacheyka testlarida).
vi.mock('../../api/t2-token', () => ({ tokenBilan: vi.fn(async (_p: unknown, ish: () => Promise<unknown>) => ({ ok: true, natija: await ish(), sarflandi: 1 })) }));
vi.mock('../../api/t2-fakt', () => ({ sbQatorHolatOl: vi.fn(async () => ({ ok: true, qatorlar: holat })), sbF2QoralamaHajmlar: vi.fn(async () => ({ ok: true, hajm: new Map(), aktSoni: 0 })) }));
vi.mock('../../api/t2-narx-protokol', async (asl) => ({ ...(await asl<typeof import('../../api/t2-narx-protokol')>()), narxProtokolQatorlariOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-aosr', () => ({ sbAosrCoverageOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
// «Bajarilmaydi» qatlami (ishdan chiqarilgan resurslar): ro'yxat m.baj dan; belgilash — m.belgila.
vi.mock('../../api/t2-bajarilmadi', async (asl) => ({ ...(await asl<typeof import('../../api/t2-bajarilmadi')>()),
  bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: m.baj })), bajarilmadiBelgila: m.belgila, bajarilmadiBekor: vi.fn() }));
vi.mock('../../api/t2-shartnoma-liniya', () => ({ shartnomaLiniyaOl: vi.fn(async () => ({ ok: true, natija: {
  loyihalar: [], rollar: [], turlar: [],
  obyektlar: [{ id: 8, nom: 'Ko‘l', loyiha_id: 1, asosiy_shartnoma_id: 45 }],
  shartnomalar: [
    { id: 45, loyiha_id: 1, raqam: '45', nom: 'Bosh pudrat', turi: null, asosiy: true, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null, izoh: null, versiya: 1,
      tomonlar: [{ rol: 'Buyurtmachi', nom: 'Дирекция', inn: null }, { rol: 'Pudratchi', nom: 'ООО «NTB»', inn: null }], obyektlar: [8] },
    { id: 46, loyiha_id: 1, raqam: '46', nom: 'Subpudrat', turi: 'Subpudrat', asosiy: false, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null, izoh: null, versiya: 1,
      tomonlar: [{ rol: 'Subpudratchi', nom: 'ООО «Суб»', inn: null }], obyektlar: [8] },
  ],
} })) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: m.tasdiq }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => m.komp }));
vi.mock('./F2StornoOyna', () => ({ F2StornoOyna: (p: { akt: { id: number }; onYaratildi?: (id: number) => void }) => <button type="button" onClick={() => p.onYaratildi?.(555)}>storno-oyna-{p.akt.id}</button> }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: null }, setObjectId: vi.fn() }) }));
vi.mock('../../umumiy/hujjat/HujjatTomonlari', () => ({ useHujjatTomonlari: () => [{}, vi.fn()], HujjatTomonlariPanel: () => null }));
vi.mock('../../umumiy/hujjat/HujjatKorinish', () => ({ useHujjatKorinish: () => ({ oyna: null, ochish: vi.fn() }) }));

import { F2TayyorlashNative } from './F2TayyorlashNative';
import { bajarilmadiRoyxatOl } from '../../api/t2-bajarilmadi';

afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); m.komp.joriy = { id: 1 }; m.komp.superadmin = false; });
// sbOqi sukut: bo'sh, lekin MUVAFFAQIYATLI javob (o'qilmagan ro'yxat endi jim bo'sh emas — sabab bo'lib saqlashni to'xtatadi).
beforeEach(() => { m.oqi.mockReset(); m.oqi.mockImplementation(async () => ({ ok: true, qatorlar: [] })); });
const Joy = () => <output data-testid="joy">{useLocation().search}</output>;
const ochish = () => render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8']}><F2TayyorlashNative /></MemoryRouter>);

describe('F2 tayyorlash', () => {
  it('ish hajmi → resurslar avtomatik; narxsiz resurs ongli belgilanadi; bitta F2 yuboriladi', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 1 });
    ochish();
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect((hajm as HTMLInputElement).value).toBe('6');
    fireEvent.click(screen.getByRole('button', { name: 'Resurslarni ko‘rish: Beton quyish' }));
    // Egasi 2026-11-06: Kran (smetada narx yo'q) qoralamani TO'SMAYDI — ogohlantirish, ongli «narxsiz» bir bosishda.
    expect(screen.getByTestId('avto-narxsiz')).toBeTruthy();
    const saqla = screen.getByRole('button', { name: /F2 qoralama yaratish/ }) as HTMLButtonElement;
    await waitFor(() => expect(saqla.disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /«narxsiz» belgilash/ }));
    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: '7' } });
    expect(saqla.disabled).toBe(false);
    fireEvent.click(saqla);
    await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
    const a = m.yarat.mock.calls[0][0];
    expect(a.raqam).toBe('7');
    expect(a.qatorlar.map((x: { qatorId: number; certifiedQuantity: number; certifiedAmount?: number; priceIntentionallyAbsent: boolean }) => [x.qatorId, x.certifiedQuantity, x.certifiedAmount ?? null, x.priceIntentionallyAbsent]))
      .toEqual([[2, 6, null, true], [3, 12, 300000, false], [4, 3, null, true]]);
  });

  it('resurs amallari: mehnat (ЧЕЛ) zamenasi va chiqarish YO‘Q; kran — ishdan chiqarish to‘liq smeta hajmi bilan yoziladi', async () => {
    const kran = holat[2] as Record<string, unknown>; kran.smeta_hajm = 5;
    m.belgila.mockResolvedValue({ ok: true, yaratildi: 1, otkazildi: 0 });
    try {
      ochish();
      await screen.findByLabelText('F2 hajmi: Beton quyish');
      fireEvent.click(screen.getByRole('button', { name: 'Resurslarni ko‘rish: Beton quyish' }));
      expect(screen.getByTitle(/zamena qilinmaydi/)).toBeTruthy();                      // Ishchi (ЧЕЛ) — zamena yo'q, sababi tooltip'da
      expect(screen.getByTitle(/ishdan chiqarib bo‘lmaydi/)).toBeTruthy();             // va hozircha chiqarilmaydi
      expect(screen.queryByRole('button', { name: 'Ishdan chiqarish: Ishchi' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Zamena: Kran' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Ishdan chiqarish: Kran' }));
      expect(screen.getByTestId('chiqarish-hajm').textContent).toBe('5');
      fireEvent.click(screen.getByRole('button', { name: /^Chiqarish/ }));
      await waitFor(() => expect(m.belgila).toHaveBeenCalledTimes(1));
      expect(m.belgila.mock.calls[0][0]).toMatchObject({ kompaniyaId: 1, obyektId: 8, qatorlar: [{ qator_id: 4, hajm: 5 }], sabab: 'buyurtmachi_chiqardi' });
    } finally { delete kran.smeta_hajm; }
  });

  it('ishdan chiqarilgan resurs (kran) F2 qoralamaga KIRMAYDI; belgisi ko‘rinadi', async () => {
    const kran = holat[2] as Record<string, unknown>; kran.smeta_hajm = 5;
    m.baj = [{ id: 9, obyekt_id: 8, qator_id: 4, bajarilmagan_hajm: 5, hajm: 5, holat: 'faol' }];
    m.yarat.mockResolvedValue({ ok: true, akt_id: 1 });
    try {
      ochish();
      await screen.findByLabelText('F2 hajmi: Beton quyish');
      fireEvent.click(screen.getByRole('button', { name: 'Resurslarni ko‘rish: Beton quyish' }));
      await screen.findByTestId('chiqarilgan-belgi');
      fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
      fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: '8' } });
      const saqla = screen.getByRole('button', { name: /F2 qoralama yaratish/ }) as HTMLButtonElement;
      await waitFor(() => expect(saqla.disabled).toBe(false)); // kran narxsiz edi — endi u F2 da yo'q, blok ham yo'q
      fireEvent.click(saqla);
      await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
      expect(m.yarat.mock.calls[0][0].qatorlar.map((x: { qatorId: number }) => x.qatorId)).toEqual([2, 3]);
    } finally { delete kran.smeta_hajm; m.baj = []; }
  });

  it('?avto=1 (fakt oynasidan): barcha mumkin hajm bir yo‘la olinadi, qoralama o‘zi yaratilmaydi', async () => {
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&avto=1']}><F2TayyorlashNative /></MemoryRouter>);
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    await waitFor(() => expect((hajm as HTMLInputElement).value).toBe('6'));
    expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('Fakt bo‘yicha'), 'ok');
    expect(m.yarat).not.toHaveBeenCalled();
  });
  it('«Faktdan F2» tez yo‘li (?avto=1&oy=YYYY-MM): davr fakt sahifasidagi oy, faqat olinganlar ko‘rinadi; qoralama — faqat operator tasdig‘i bilan', async () => {
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&avto=1&oy=2026-09']}><F2TayyorlashNative /></MemoryRouter>);
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    await waitFor(() => expect((hajm as HTMLInputElement).value).toBe('6'));
    expect((screen.getByLabelText('F2 davri') as HTMLInputElement).value).toBe('2026-09');
    expect((screen.getByRole('checkbox', { name: 'Faqat kiritilganlar' }) as HTMLInputElement).checked).toBe(true);
    expect(m.yarat).not.toHaveBeenCalled();
  });
  it('bo‘limlar navigatori va qidiruv', async () => {
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    expect(screen.queryByText('G‘isht terish')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Devor/ }));
    expect(screen.getByText('G‘isht terish')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'kran' } });
    expect(screen.getByText('Beton quyish')).toBeTruthy();
    expect(screen.queryByText('G‘isht terish')).toBeNull();
  });

  it('ТН·КМ qatori yonida taklif: A = tonnali material Σ tonna × km (tugma hajmni to‘ldiradi)', async () => {
    rows.push(q({ id: 11, tur: 'bl', ota_id: 1, nom: 'Перевозка: песок, 10 км', birlik: 'ТН·КМ', hajm: 10000 }), q({ id: 12, tur: 'bl', ota_id: 1, nom: 'Песок природный', birlik: 'т', hajm: 50 }));
    holat.push({ qator_id: 11, tur: 'bl', nom: 'x', f2_mumkin_hajm: 10000, f2_hajm: 0, smeta_hajm: 10000 } as never, { qator_id: 12, tur: 'bl', nom: 'y', f2_mumkin_hajm: 50, f2_hajm: 0, smeta_hajm: 50 } as never);
    try {
      ochish();
      const pesok = await screen.findByLabelText('F2 hajmi: Песок природный');
      expect(screen.getByLabelText('F2 hajmi: Перевозка: песок, 10 км')).toBeTruthy();
      fireEvent.change(pesok, { target: { value: '30' } });
      const a = await screen.findByRole('button', { name: /^A:/ });
      fireEvent.click(a);
      expect((screen.getByLabelText('F2 hajmi: Перевозка: песок, 10 км') as HTMLInputElement).value).toBe('300');
    } finally { rows.splice(rows.length - 2, 2); holat.splice(holat.length - 2, 2); }
  });

  it('«Faqat kiritilganlar» — hamma bo‘limlardan faqat hajmi kiritilgan ishlar; Enter keyingi ish hajmiga o‘tadi', async () => {
    ochish();
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.change(hajm, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Devor/ }));
    expect(screen.getByText('G‘isht terish')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Faqat kiritilganlar'));
    expect(screen.getByText('Beton quyish')).toBeTruthy();
    expect(screen.queryByText('G‘isht terish')).toBeNull();
    fireEvent.click(screen.getByLabelText('Faqat kiritilganlar'));
    fireEvent.click(screen.getByRole('button', { name: /Poydevor/ }));
    const birinchi = screen.getByLabelText('F2 hajmi: Beton quyish') as HTMLInputElement;
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'e' } });
    expect(birinchi.value).toBe('2');
  });

  it('faktsiz rejim: fakt qoldig‘i yo‘q obyektda ham F2 yasaladi (chegara — smeta qoldig‘i), oshsa blok yo‘q', async () => {
    holat.forEach((h) => { h.f2_mumkin_hajm = 0; }); // fakt umuman yo'q
    holat[0].smeta_hajm = 10; (holat as Array<Record<string, unknown>>)[3].smeta_hajm = 4; (holat as Array<Record<string, unknown>>)[3].f2_hajm = 0;
    m.yarat.mockResolvedValue({ ok: true, akt_id: 2 });
    ochish();
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    expect(screen.getByRole('button', { name: 'Smeta qoldig‘i', pressed: true })).toBeTruthy();
    fireEvent.change(hajm, { target: { value: '12' } }); // smeta qoldig'i 10 dan ko'p — faqat ogohlantirish
    expect(screen.queryByText('Fakt qoldig‘idan oshdi')).toBeNull();
    expect(screen.getByText('smeta hajmidan oshadi (ruxsat, ogohlantirish)')).toBeTruthy();
  });

  it('fakt rejimida qoldiqdan oshgan hajm xato emas - faqat ogohlantirish (hajmni bloklama)', async () => {
    holat.forEach((h) => { h.f2_mumkin_hajm = h.qator_id === 2 ? 6 : h.f2_mumkin_hajm || 12; });
    (holat as Array<Record<string, unknown>>)[0].smeta_hajm = 100;
    ochish();
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.change(hajm, { target: { value: '9' } });
    expect(screen.getByText('fakt qoldig‘idan oshadi (ruxsat, ogohlantirish)')).toBeTruthy();
    expect(screen.queryByText('Fakt qoldig‘idan oshdi')).toBeNull(); // eski OSHDI xatosi yo'q (1 xato - faqat Kran narxi)
  });

  it('klaviatura: ↑↓ ish hajmi maydonlari orasida; "/" qidiruvga o‘tadi; ish yonida 1 birlik narxi', async () => {
    holat.forEach((h) => { if (h.f2_mumkin_hajm === 0) h.f2_mumkin_hajm = 5; });
    ochish();
    const birinchi = await screen.findByLabelText('F2 hajmi: Beton quyish') as HTMLInputElement;
    expect(screen.getByText(/narx \(1 birlik, NDS siz\)/)).toBeTruthy();
    birinchi.focus();
    fireEvent.keyDown(birinchi, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(birinchi); // bu bo‘limda bitta ish - chegarada qoladi
    fireEvent.keyDown(document.body, { key: '/' });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Qidirish');
  });

  it('imzolovchilar va shartnoma raqami shartnoma liniyasidan avtomatik (3 tomonlama — subpudratchi)', async () => {
    ochish();
    expect(await screen.findByText(/№ 45 — Bosh pudrat · Дирекция · ООО «NTB» · ООО «Суб»/)).toBeTruthy();
  });

  it('?akt=ID: qoralama akt qatorlari yuklanadi, saqlash yangi akt yaratmaydi - sbT2F2QoralamaYangila (versiya, raqam saqlanadi)', async () => {
    const akt = { id: 77, raqam: '5', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', versiya: 4 };
    m.oqi.mockImplementation(async (s: { jadval: string }) => s.jadval === 't2_akt' ? { ok: true, qatorlar: [akt] } : { ok: true, qatorlar: [
      { id: 901, qator_id: 2, hajm: 6, certified_quantity: 6, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent' },
      { id: 902, qator_id: 3, hajm: 12, certified_quantity: 12, certified_unit_price: 25000, certified_amount: 300000, provenance_status: 'source_certified' },
      { id: 903, qator_id: 4, hajm: 3, certified_quantity: 3, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent' },
    ] });
    m.yangila.mockResolvedValue({ ok: true, akt_id: 77 });
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&akt=77']}><F2TayyorlashNative /></MemoryRouter>);
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish');
    await waitFor(() => expect((hajm as HTMLInputElement).value).toBe('6'));
    expect((screen.getByLabelText('F2 raqami') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('F2 raqami') as HTMLInputElement).disabled).toBe(true);
    const saqla = await screen.findByRole('button', { name: /F2 qoralamani yangilash/ }) as HTMLButtonElement;
    await waitFor(() => expect(saqla.disabled).toBe(false));
    fireEvent.click(saqla);
    await waitFor(() => expect(m.yangila).toHaveBeenCalledTimes(1));
    expect(m.yarat).not.toHaveBeenCalled();
    const a = m.yangila.mock.calls[0][0];
    expect([a.kompaniyaId, a.aktId, a.kutilganVersiya]).toEqual([1, 77, 4]);
    expect(a.qatorlar.map((x: { qatorId: number; certifiedQuantity: number; certifiedAmount?: number }) => [x.qatorId, x.certifiedQuantity, x.certifiedAmount ?? null]))
      .toEqual([[2, 6, null], [3, 12, 300000], [4, 3, null]]);
  });

  it('?akt=ID: tasdiqlangan akt - faqat ko‘rish, saqlash o‘chiq', async () => {
    m.oqi.mockImplementation(async (s: { jadval: string }) => s.jadval === 't2_akt'
      ? { ok: true, qatorlar: [{ id: 78, raqam: '6', oy: '2026-09-01', holat: 'tasdiqlangan', lifecycle_status: 'approved', versiya: 2 }] }
      : { ok: true, qatorlar: [{ id: 904, qator_id: 2, hajm: 6, certified_quantity: 6, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent' }] });
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&akt=78']}><F2TayyorlashNative /></MemoryRouter>);
    expect(await screen.findByText(/faqat ko‘rish/)).toBeTruthy();
    const saqla = screen.getByRole('button', { name: /F2 qoralamani yangilash/ }) as HTMLButtonElement;
    expect(saqla.disabled).toBe(true);
    expect(m.yangila).not.toHaveBeenCalled();
  });

  describe('davom: shu oyning qoralamasi jim yangi akt o‘rniga ochiladi', () => {
    const J = () => <output data-testid="joy2">{useLocation().search}</output>;
    const royxat = (holat: string) => m.oqi.mockImplementation(async (q: { jadval: string; filtr?: string }) => {
      if (q.jadval === 't2_akt' && !String(q.filtr).includes('id=eq.')) return { ok: true, qatorlar: [
        { id: 700, raqam: '534', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: 1 },
        { id: 714, raqam: '535-С', oy: '2026-09-01', holat, lifecycle_status: holat === 'qoralama' ? 'draft' : 'approved', hujjat_jami: 1 },
        { id: 720, raqam: '536', oy: '2026-10-01', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: 1 },
      ] };
      if (q.jadval === 't2_akt') return { ok: true, qatorlar: [{ id: 714, raqam: '535-С', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', versiya: 1 }] };
      return { ok: true, qatorlar: [] };
    });
    it('?akt siz: shu oyning eng yangi qoralamasi ochiladi, xabar va «Yangi alohida F2 boshlash»', async () => {
      royxat('qoralama');
      render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&oy=2026-09']}><F2TayyorlashNative /><J /></MemoryRouter>);
      await waitFor(() => expect(screen.getByTestId('joy2').textContent).toContain('akt=714'));
      expect(screen.getByTestId('joy2').textContent).toContain('davom=1');
      const yangi = await screen.findByTestId('yangi-alohida-f2');
      expect(yangi.getAttribute('href')).toBe('/admin/f2-tayyorlash?obyekt=8&yangi=1');
    });
    it('?yangi=1 — qoralama ochilmaydi (alohida yangi F2)', async () => {
      royxat('qoralama');
      render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&oy=2026-09&yangi=1']}><F2TayyorlashNative /><J /></MemoryRouter>);
      await screen.findByLabelText('F2 raqami');
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByTestId('joy2').textContent).not.toContain('akt=');
    });
  });

  describe('eski F2 ni storno qilish (F2 tayyorlash oynasida)', () => {
    const akt = (o: Record<string, unknown>) => ({ tur: 'f2', oy: '2026-09-01', holat: 'tasdiqlangan', lifecycle_status: 'approved', qator_soni: 3, hujjat_jami: 1000, ...o });
    const ochishJoy = (url = '/admin/f2-tayyorlash?obyekt=8') => render(<MemoryRouter initialEntries={[url]}><F2TayyorlashNative /><Joy /></MemoryRouter>);

    it('tugma f2.prepare bo‘lsa ko‘rinadi, bo‘lmasa yashirin; superadmin ko‘radi; yopiq rolda yo‘q', async () => {
      ochishJoy();
      await screen.findByLabelText('F2 raqami');
      expect(screen.queryByTestId('storno-tanlov-tugma')).toBeNull();
      cleanup();
      m.komp.joriy = { id: 1, permissions: ['f2.prepare'] };
      ochishJoy();
      expect(await screen.findByTestId('storno-tanlov-tugma')).toBeTruthy();
      cleanup();
      m.komp.joriy = { id: 1, permissions: [] }; m.komp.superadmin = true;
      ochishJoy();
      expect(await screen.findByTestId('storno-tanlov-tugma')).toBeTruthy();
      cleanup();
      m.komp.joriy = { id: 1, permissions: ['f2.prepare'], rol: 'bugalter' }; m.komp.superadmin = false;
      ochishJoy();
      await screen.findByLabelText('F2 raqami');
      expect(screen.queryByTestId('storno-tanlov-tugma')).toBeNull();
    });

    it('tanlagich faqat tasdiqlangan F2 ni chiqaradi (qoralama/bekor/rad/superseded yo‘q); tanlash F2StornoOyna ni ochadi; yaratilgach ?akt=yangi ga o‘tadi', async () => {
      m.komp.joriy = { id: 1, permissions: ['f2.prepare'] };
      m.reestr.mockResolvedValue({ ok: true, qatorlar: [
        akt({ id: 11, raqam: '1' }),
        akt({ id: 12, raqam: '2', holat: 'bekor', lifecycle_status: 'cancelled' }),
        akt({ id: 13, raqam: '3', holat: 'qoralama', lifecycle_status: 'rejected' }),
        akt({ id: 14, raqam: '4', lifecycle_status: 'superseded' }),
        akt({ id: 15, raqam: '5', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: null }),
        { ...akt({ id: 16, raqam: 'X' }), tur: 'boshqa' },
      ] });
      ochishJoy();
      fireEvent.click(await screen.findByTestId('storno-tanlov-tugma'));
      const qatorlar = await screen.findAllByTestId('storno-tanlov-akt');
      expect(qatorlar.map((x) => x.querySelector('td')?.textContent)).toEqual(['1']);
      fireEvent.click(qatorlar[0].querySelector('button') as HTMLElement);
      fireEvent.click(await screen.findByText('storno-oyna-11'));
      await waitFor(() => expect(screen.getByTestId('joy').textContent).toBe('?obyekt=8&akt=555'));
      expect(screen.queryByText('storno-oyna-11')).toBeNull();
    });

    it('?akt= storno qoralamasida qaysi F2 storno qilinayotgani ko‘rinadi', async () => {
      m.oqi.mockImplementation(async (s: { jadval: string }) => s.jadval === 't2_akt'
        ? { ok: true, qatorlar: [{ id: 77, raqam: '5-С', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', versiya: 1, manba: null }] }
        : s.jadval === 't2_akt_qator'
          ? { ok: true, qatorlar: [{ id: 905, qator_id: 2, hajm: -6, certified_quantity: -6, certified_unit_price: 100, certified_amount: -600, provenance_status: 'source_certified', raw_snapshot: { source: 'storno', stornoOf: 11 } }] }
          : { ok: true, qatorlar: [] });
      ochishJoy('/admin/f2-tayyorlash?obyekt=8&akt=77');
      expect((await screen.findByTestId('storno-manba')).textContent).toContain('№11');
    });

    /** Storno qoralamasi: qator 2 eski F2 da 6 (tasdiqlangan), storno −6; fakt to'g'rilangan 9 → yangi plyus 9 (fakt − BOSHQA F2). */
    const stornoQoralama = () => {
      const h2 = holat[0] as Record<string, unknown>;
      const eski = { ...h2 };
      Object.assign(h2, { f2_hajm: 6, fakt_hajm: 9, f2_mumkin_hajm: 3 });
      m.oqi.mockImplementation(async (s: { jadval: string }) => s.jadval === 't2_akt'
        ? { ok: true, qatorlar: [{ id: 77, raqam: '5-С', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', versiya: 3 }] }
        : s.jadval === 't2_akt_qator'
          ? { ok: true, qatorlar: [{ id: 905, qator_id: 2, hajm: -6, certified_quantity: -6, certified_unit_price: 100, certified_amount: -600, provenance_status: 'source_certified', raw_snapshot: { source: 'storno', stornoOf: 11 } }] }
          : { ok: true, qatorlar: [] });
      return () => { for (const k of Object.keys(h2)) delete h2[k]; Object.assign(h2, eski); };
    };
    const yuboriladi = async () => {
      ochishJoy('/admin/f2-tayyorlash?obyekt=8&akt=77');
      expect((await screen.findByTestId('ish-storno-olingan')).textContent).toMatch(/0.*storno qilingan.*6/);
      fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
      expect((screen.getByLabelText('F2 hajmi: Beton quyish') as HTMLInputElement).value).toBe('9');
      fireEvent.click(screen.getByRole('button', { name: 'Resurslarni ko‘rish: Beton quyish' }));
      fireEvent.click(screen.getByRole('button', { name: /«narxsiz» belgilash/ }));
      const saqla = await screen.findByRole('button', { name: /F2 qoralamani yangilash/ }) as HTMLButtonElement;
      await waitFor(() => expect(saqla.disabled).toBe(false));
      fireEvent.click(saqla);
    };
    const juft = (x: { qatorId: number; certifiedQuantity: number }) => [x.qatorId, x.certifiedQuantity];

    it('bir qator storno blokida (minus, tepada) VA yangi blokda (plyus, pastda) saqlanadi; yangi hajm = fakt − boshqa F2', async () => {
      const tikla = stornoQoralama();
      m.yangila.mockResolvedValue({ ok: true, akt_id: 77 });
      try {
        await yuboriladi();
        await waitFor(() => expect(m.yangila).toHaveBeenCalledTimes(1));
        expect(m.yangila.mock.calls[0][0].qatorlar.map(juft).slice(0, 2)).toEqual([[2, -6], [2, 9]]);
        expect(m.tasdiq).not.toHaveBeenCalled();
      } finally { tikla(); }
    });

    it('server DUPLICATE_F2_SOURCE_LINE desa: jim tashlanmaydi — rozilik so‘raladi, keyin plyus qatorsiz saqlanadi', async () => {
      const tikla = stornoQoralama();
      m.yangila.mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_F2_SOURCE_LINE' }).mockResolvedValueOnce({ ok: true, akt_id: 77 });
      try {
        await yuboriladi();
        await waitFor(() => expect(m.yangila).toHaveBeenCalledTimes(2));
        expect(m.tasdiq).toHaveBeenCalledTimes(1);
        const ikkinchi = m.yangila.mock.calls[1][0].qatorlar.map(juft);
        expect(ikkinchi.filter(([id]: number[]) => id === 2)).toEqual([[2, -6]]);
        expect(m.toast.mock.calls.some((c) => String(c[0]).includes('server cheklovi'))).toBe(true);
      } finally { tikla(); }
    });
  });});

/** Audit A (2026-11-06) tuzatish paketi: har BLOCKER/MAJOR uchun UI sinovi (sintetik ma'lumot). */
describe('F2 tayyorlash — tuzatish paketi A', () => {
  const saqlaTugma = () => screen.getByRole('button', { name: /F2 qoralama( yaratish|ni yangilash)/ }) as HTMLButtonElement;
  const aktRejim = (qatorlar: unknown, aktQ?: (s: { filtr?: string }) => unknown) => m.oqi.mockImplementation(async (s: { jadval: string; filtr?: string }) => {
    if (s.jadval === 't2_akt' && String(s.filtr).startsWith('id=eq.')) return { ok: true, qatorlar: [{ id: 77, raqam: '5', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', versiya: 4 }] };
    if (s.jadval === 't2_akt_qator') return aktQ ? aktQ(s) : { ok: true, qatorlar };
    return { ok: true, qatorlar: [] };
  });

  it('narxsiz resurs qoralamani to‘smaydi: priceIntentionallyAbsent + narxsizSabab avto_qoralama, summa yo‘q (0 emas)', async () => {
    m.yarat.mockResolvedValue({ ok: true, akt_id: 1 });
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    await waitFor(() => expect(saqlaTugma().disabled).toBe(false));
    expect(screen.queryByTestId('saqlash-sabab')).toBeNull();
    fireEvent.click(saqlaTugma());
    await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
    const kran = m.yarat.mock.calls[0][0].qatorlar.find((x: { qatorId: number }) => x.qatorId === 4);
    expect(kran).toMatchObject({ certifiedQuantity: 3, priceIntentionallyAbsent: true, rawSnapshot: { narxsizSabab: 'avto_qoralama', hajmManba: 'fakt' } });
    expect(kran.certifiedAmount).toBeUndefined();
  });

  it('zamena/chiqarilgan resurslar kutilayotganda — sababi tugma yonida va Tekshiruv tepasida; «toza» yo‘q; qayta urinish', async () => {
    vi.mocked(bajarilmadiRoyxatOl).mockImplementationOnce(() => new Promise(() => undefined));
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect((await screen.findByTestId('saqlash-sabab')).textContent).toContain('o‘qilmoqda');
    expect(saqlaTugma().disabled).toBe(true);
    expect(screen.getByTestId('tekshiruv-sabablar').textContent).toContain('Zamena va ishdan chiqarilgan resurslar o‘qilmoqda');
    expect(screen.queryByText('Tekshiruv: toza')).toBeNull();
    expect(screen.queryByText('Saqlashni to‘suvchi xato yo‘q')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinib ko‘rish' }));
    await waitFor(() => expect(saqlaTugma().disabled).toBe(false));
  });

  it('zamena bog‘lanishi o‘qilmasa — jim bo‘sh xarita emas: saqlash yopiq, sababi ko‘rinadi', async () => {
    m.oqi.mockImplementation(async (s: { jadval: string }) => (s.jadval === 't2_qator' ? { ok: false, error: 'x' } : { ok: true, qatorlar: [] }));
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect((await screen.findByTestId('saqlash-sabab')).textContent).toContain('Zamena bog‘lanishlari o‘qilmadi');
    expect(saqlaTugma().disabled).toBe(true);
    fireEvent.click(saqlaTugma());
    expect(m.yarat).not.toHaveBeenCalled();
  });

  it('qoralama 1e-7 hajm bilan ochiladi — «0.0000001», yolg‘on «0 bo‘lmasin» xatosi yo‘q', async () => {
    aktRejim([{ id: 1, qator_id: 2, hajm: 1e-7, certified_quantity: 1e-7, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent', raw_snapshot: { source: 'native_f2_preparation' } }]);
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&akt=77']}><F2TayyorlashNative /></MemoryRouter>);
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish') as HTMLInputElement;
    await waitFor(() => expect(hajm.value).toBe('0.0000001'));
    expect(screen.queryByText('Hajm 0 bo‘lmasligi kerak (minus ham mumkin)')).toBeNull();
  });

  it('akt qatorlari to‘liq o‘qilmasa (shlyuz sahifasi) — saqlash yopiq, qisman qoralama yozilmaydi', async () => {
    let n = 0;
    aktRejim([], () => (++n === 1 ? { ok: true, qatorlar: [{ id: 1, qator_id: 2, hajm: 6, certified_quantity: 6, provenance_status: 'price_intentionally_absent' }], toliq: false } : { ok: false, error: 'limit' }));
    m.yangila.mockResolvedValue({ ok: true });
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&akt=77']}><F2TayyorlashNative /></MemoryRouter>);
    expect((await screen.findAllByText(/F2 akti o‘qilmadi/)).length).toBeGreaterThan(0);
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect(saqlaTugma().disabled).toBe(true);
    expect(m.yangila).not.toHaveBeenCalled();
  });

  it('obyekt almashtirilganda F2 raqami tozalanadi (eski raqam yangi obyektga o‘tmaydi)', async () => {
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.change(screen.getByLabelText('F2 raqami'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Obyekt'), { target: { value: '9' } });
    await waitFor(() => expect((screen.getByLabelText('F2 raqami') as HTMLInputElement).value).toBe(''));
  });

  it('hamma fakt allaqachon F2 qilingan obyekt — jim «smeta qoldig‘i» ga o‘tmaydi (manba fakt)', async () => {
    const eski = holat.map((h) => ({ ...h }));
    holat.forEach((h) => { h.f2_mumkin_hajm = 0; (h as Record<string, unknown>).fakt_hajm = 5; (h as Record<string, unknown>).f2_hajm = 5; });
    try {
      ochish();
      await screen.findByLabelText('F2 raqami');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Fakt', pressed: true })).toBeTruthy());
    } finally { holat.forEach((h, i) => { for (const k of Object.keys(h)) delete (h as Record<string, unknown>)[k]; Object.assign(h, eski[i]); }); }
  });

  it('«Barcha mumkin hajmni olish» natijasini aytadi (olindi / chang / qoldiq 0)', async () => {
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getByRole('button', { name: 'Barcha mumkin hajmni olish' }));
    await waitFor(() => expect(m.toast.mock.calls.some((c) => /ta olindi/.test(String(c[0])))).toBe(true));
  });

  it('ikki marta tez bosish — bitta akt (qulf tasdiq/paket ogohidan oldin)', async () => {
    let tugat: (v: unknown) => void = () => undefined;
    m.yarat.mockImplementation(() => new Promise((ok) => { tugat = ok; }));
    ochish();
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    await waitFor(() => expect(saqlaTugma().disabled).toBe(false));
    const b = saqlaTugma();
    fireEvent.click(b); fireEvent.click(b); fireEvent.click(b);
    await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
    tugat({ ok: true, akt_id: 1 });
    await new Promise((r) => setTimeout(r, 30));
    expect(m.yarat).toHaveBeenCalledTimes(1);
  });

  it('STALE_VERSION — jim qayta yuklanmaydi/ustidan yozilmaydi: xabar va «Qayta yuklash» amali', async () => {
    aktRejim([{ id: 1, qator_id: 2, hajm: 6, certified_quantity: 6, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent', raw_snapshot: { source: 'native_f2_preparation' } }]);
    m.yangila.mockResolvedValue({ ok: false, code: 'STALE_VERSION' });
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&akt=77']}><F2TayyorlashNative /></MemoryRouter>);
    const hajm = await screen.findByLabelText('F2 hajmi: Beton quyish') as HTMLInputElement;
    await waitFor(() => expect(hajm.value).toBe('6'));
    fireEvent.change(hajm, { target: { value: '5' } });
    await waitFor(() => expect(saqlaTugma().disabled).toBe(false));
    fireEvent.click(saqlaTugma());
    await waitFor(() => expect(m.toast.mock.calls.some((c) => String(c[0]).includes('qayta yuklang'))).toBe(true));
    const c = m.toast.mock.calls.find((x) => String(x[0]).includes('qayta yuklang'))!;
    expect(c[4]).toMatchObject({ label: 'Qayta yuklash' });
    expect(hajm.value).toBe('5'); // operator kiritmasi saqlanib qoldi
  });

  it('importdan kelgan qoralama avtomatik «davom» bilan ochilmaydi', async () => {
    const J = () => <output data-testid="joy3">{useLocation().search}</output>;
    m.oqi.mockImplementation(async (q: { jadval: string; filtr?: string; ustunlar?: string }) => {
      if (q.jadval === 't2_akt') return { ok: true, qatorlar: [{ id: 714, raqam: '9', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: 1 }] };
      if (q.jadval === 't2_akt_qator') return { ok: true, qatorlar: [{ raw_snapshot: { manba: 'f2_v3' } }] };
      return { ok: true, qatorlar: [] };
    });
    render(<MemoryRouter initialEntries={['/admin/f2-tayyorlash?obyekt=8&oy=2026-09']}><F2TayyorlashNative /><J /></MemoryRouter>);
    await screen.findByLabelText('F2 hajmi: Beton quyish');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('joy3').textContent).not.toContain('akt=');
  });
});
