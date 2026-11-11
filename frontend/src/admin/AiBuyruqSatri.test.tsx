import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { T2Qator } from '../api/supabase';
import type { JurnalHolat } from '../lib/fakt-jurnal';

const api = vi.hoisted(() => ({ suhbat: vi.fn() }));
vi.mock('../api/smeta-ai', () => ({ sahifaSuhbat: api.suhbat }));
vi.mock('../umumiy/ui/ModelChip', () => ({ ModelChip: () => null }));
vi.mock('../umumiy/kontekst/PTOWorkspaceContext', () => ({
  isPtoRoute: (p: string) => p.startsWith('/admin/fakt'),
  usePTOWorkspace: () => ({ isProvider: true, companyId: 17, scope: { objectId: 5 }, objects: [{ id: 5, nom: 'Maktab' }] }),
}));
vi.mock('../umumiy/ui/Toast', () => ({ toast: vi.fn() }));

import { AiBuyruqSatri, AiBuyruqSatriIchki, type BuyruqDeps } from './AiBuyruqSatri';
import { buyruqKeshTozala } from '../lib/ai-yordamchi/buyruq-narx';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 5, obyekt: null, kompaniya_id: 17, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Fundament' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е06-001-1', nom: 'Бетон монолитный', hajm: 40, narx: 1000 }),
  q({ id: 4, tur: 'mat', ota_id: 2, nom: 'Бетон B25', hajm: 41, kat: 'МАТ' }),
];
const states: JurnalHolat[] = [{ qator_id: 2, smeta_hajm: 40, fakt_hajm: 10, f2_hajm: 5, qoldiq_hajm: 35, smeta_narx: 1000 }];

function depsQur() {
  let n = 0;
  const faktYoz = vi.fn(async () => ({ ok: true, raqam: 'F1' }));
  const narxProtokol = vi.fn(async () => ({ ok: true, raqam: 'P1' }));
  const deps: BuyruqDeps = {
    malumotOl: vi.fn(async () => ({ ok: true as const, rows, states: states as never })),
    tokenOl: vi.fn(async () => null),
    yoz: { faktYoz, narxProtokol, yangiOperationId: () => `op-${++n}-bbbbbbbb` },
  };
  return { deps, faktYoz, narxProtokol };
}
const javob = (amallar: unknown[], javobMatn = 'Taklif tayyor') => ({ ok: true, model: 'm', javob: javobMatn, savollar: [], oqish: [], amallar });

async function ochiqSatr(deps: BuyruqDeps) {
  render(<MemoryRouter><AiBuyruqSatriIchki kompaniyaId={17} obyektId={5} obyektNomi="Maktab" ochiq onOchiq={() => undefined} deps={deps} /></MemoryRouter>);
  return screen.findByTestId('ai-buyruq-kirish');
}
async function yubor(kirish: HTMLElement, matn: string) {
  fireEvent.change(kirish, { target: { value: matn } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
}

beforeEach(() => { api.suhbat.mockReset(); localStorage.clear(); buyruqKeshTozala(); });
afterEach(() => { cleanup(); delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition; delete (window as unknown as Record<string, unknown>).SpeechRecognition; });

describe('AI buyruq satri — Ctrl+K', () => {
  it('Ctrl+K satrni ochadi (matn maydonida ham), Esc yopadi; PTO marshrutidan tashqarida ochilmaydi', async () => {
    const { deps } = depsQur();
    const { unmount } = render(<MemoryRouter initialEntries={['/admin/fakt']}><AiBuyruqSatri deps={deps} /></MemoryRouter>);
    expect(screen.queryByTestId('ai-buyruq-kirish')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(await screen.findByTestId('ai-buyruq-kirish')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('ai-buyruq-kirish'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('ai-buyruq-kirish')).toBeNull());
    unmount();
    render(<MemoryRouter initialEntries={['/admin/boshqa']}><AiBuyruqSatri deps={deps} /></MemoryRouter>);
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(screen.queryByTestId('ai-buyruq-kirish')).toBeNull();
    expect(screen.queryByTestId('ai-buyruq-tugma')).toBeNull();
  });
});

describe('AI buyruq satri — token chipi va taklif kartasi', () => {
  it('token chipi YUBORISHDAN OLDIN ko‘rinadi; bir xil buyruq qayta model chaqirmaydi (token takror yechilmaydi)', async () => {
    api.suhbat.mockResolvedValue(javob([]));
    const { deps } = depsQur();
    const kirish = await ochiqSatr(deps);
    expect(screen.getByTestId('ai-token-chip').textContent).toMatch(/token/);
    expect(api.suhbat).not.toHaveBeenCalled();
    await yubor(kirish, 'narxsiz qatorlarni ko‘rsat');
    await screen.findByText('Taklif tayyor');
    expect(api.suhbat).toHaveBeenCalledTimes(1);
    await yubor(screen.getByTestId('ai-buyruq-kirish'), 'narxsiz  qatorlarni ko‘rsat');
    await screen.findByText(/qayta yechilmadi/);
    expect(api.suhbat).toHaveBeenCalledTimes(1);
  });

  it('taklif → Bajarish → mavjud fakt yozuvi BIR marta, operation_id bilan; pul ikkinchi tasdiqsiz', async () => {
    api.suhbat.mockResolvedValueOnce(javob([{ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: 'aytilgan' }]));
    const { deps, faktYoz, narxProtokol } = depsQur();
    const kirish = await ochiqSatr(deps);
    await yubor(kirish, 'beton 5 qo‘sh');
    await screen.findByText('AI taklif qilgan amallar');
    expect(screen.getByTestId('ai-taklif-delta').textContent).toContain('→');
    expect(faktYoz).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
    await waitFor(() => expect(faktYoz).toHaveBeenCalledTimes(1));
    const p = faktYoz.mock.calls[0] as unknown as [{ operationId: string; obyektId: number; qatorlar: unknown[] }];
    expect(p[0].operationId).toMatch(/^op-1-/); expect(p[0].obyektId).toBe(5); expect(p[0].qatorlar).toEqual([{ qator_id: 2, hajm: 5 }]);
    expect(screen.queryByTestId('ai-pul-tasdiq')).toBeNull();
    expect(narxProtokol).not.toHaveBeenCalled();
    await screen.findByText(/operation_id op-1-bbb/);
  });

  it('PUL amali (narx tuzatish): «Bajarish» yozmaydi — ikkinchi «Tasdiqlayman» kerak; «Orqaga» yozmaydi', async () => {
    api.suhbat.mockResolvedValueOnce(javob([{ tur: 'narx_tuzat', qator: 4, qiymat: '900', izoh: 'protokol' }]));
    const { deps, faktYoz, narxProtokol } = depsQur();
    const kirish = await ochiqSatr(deps);
    await yubor(kirish, 'betonga narx 900');
    await screen.findByText('AI taklif qilgan amallar');
    fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
    const t2 = await screen.findByTestId('ai-pul-tasdiq');
    expect(narxProtokol).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-taklif-delta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Orqaga' }));
    expect(narxProtokol).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
    fireEvent.click(await screen.findByTestId('ai-pul-tasdiq'));
    await waitFor(() => expect(narxProtokol).toHaveBeenCalledTimes(1));
    expect(narxProtokol.mock.calls[0]).toBeTruthy();
    expect((narxProtokol.mock.calls[0] as unknown as [{ operationId: string }])[0].operationId).toBeTruthy();
    expect(faktYoz).not.toHaveBeenCalled();
    expect(t2).toBeTruthy();
  });
});

describe('AI buyruq satri — ovoz', () => {
  class SoxtaTanish {
    static oxirgi: SoxtaTanish | null = null;
    lang = ''; interimResults = false; continuous = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
    start = vi.fn(() => { SoxtaTanish.oxirgi = this; }); stop = vi.fn(() => { this.onend?.(); }); abort = vi.fn();
  }
  it('ovoz natijasi input’ni to‘ldiradi, lekin YUBORMAYDI va hech narsani tasdiqlamaydi; til UZ/RU tanlanadi', async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = SoxtaTanish;
    api.suhbat.mockResolvedValueOnce(javob([{ tur: 'narx_tuzat', qator: 4, qiymat: '900', izoh: '' }]));
    const { deps, narxProtokol } = depsQur();
    const kirish = await ochiqSatr(deps);
    fireEvent.change(screen.getByTestId('ai-ovoz-til'), { target: { value: 'ru-RU' } });
    fireEvent.click(screen.getByTestId('ai-ovoz-tugma'));
    expect(SoxtaTanish.oxirgi?.lang).toBe('ru-RU');
    act(() => { SoxtaTanish.oxirgi?.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'показать без цены' }], { isFinal: true })] }); });
    expect((kirish as HTMLInputElement).value).toBe('показать без цены');
    expect(api.suhbat).not.toHaveBeenCalled();
    // Pul taklifi kutilayotganda ovoz natijasi «Tasdiqlayman» ni bosa olmaydi
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await screen.findByText('AI taklif qilgan amallar');
    fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
    await screen.findByTestId('ai-pul-tasdiq');
    act(() => { SoxtaTanish.oxirgi?.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'tasdiqlayman' }], { isFinal: true })] }); });
    expect(narxProtokol).not.toHaveBeenCalled();
  });
  it('brauzer ovozni qo‘llamasa mikrofon tugmasi yo‘q, matn ishlaydi', async () => {
    const { deps } = depsQur();
    await ochiqSatr(deps);
    expect(screen.queryByTestId('ai-ovoz-tugma')).toBeNull();
    expect(screen.queryByTestId('ai-ovoz-til')).toBeNull();
    expect(screen.getByTestId('ai-buyruq-kirish')).toBeTruthy();
  });
});
