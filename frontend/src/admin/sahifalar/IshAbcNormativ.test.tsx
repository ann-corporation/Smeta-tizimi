import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NormWork } from '../../lib/catalog-extraction/norm-catalog';

const m = vi.hoisted(() => ({ narx: vi.fn(async () => [] as unknown[]), saqla: vi.fn(), tanla: vi.fn() }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []), narxTakliflari: m.narx, ishAbcSaqla: m.saqla, ishAbcTahrir: vi.fn(), abcXato: () => 'xato' }));
vi.mock('../../api/smeta-ai', () => ({ smetachiTanla: m.tanla }));

const ISH: NormWork = { id: 'norm-library:w1', code: 'Е08-02-001-01', name: 'КЛАДКА СТЕН ИЗ КИРПИЧА', collection: 'E08', section: null, subsection: null, tableCode: '08-02-001', unitCode: 'u' };
const BLOK: NormWork = { ...ISH, id: 'norm-library:w2', code: 'Е08-03-002-01', name: 'КЛАДКА ИЗ БЛОКОВ' };
const retsept = (id: string, name: string, unitCode: string, type: string, norm: string) => ({ id, workCode: ISH.code, resourceCode: id, resourceIdCode: id, norm, resourceStatus: 'EXACT', matchBasis: 'SOURCE_ROW',
  candidates: [{ id, code: `С${id}`, resourceIdCode: id, name, unitCode, type }], candidateCount: 1, prices: [], priceCount: 0 });
/** Smeta Studio katalogi shaklidagi soxta katalog (daraxt: to'plam → jadval → pozitsiya). */
const katalog = {
  manifest: { revision: 'test' },
  childNodes: (p: number) => ({ total: p === -1 ? 1 : 0, nodes: p === -1 ? [{ index: 0, name: 'E08 Kladka', workCount: 2, status: 'OK', hasChildren: false, isTable: true }] : [] }),
  node: () => ({ index: 0, name: 'E08 Kladka', workCount: 2, status: 'OK', hasChildren: false, isTable: true }),
  breadcrumb: () => [{ index: 0, name: 'E08 Kladka', workCount: 2, status: 'OK', hasChildren: false, isTable: true }],
  search: (q: string) => { const rows = [ISH, BLOK].filter((w) => !q || `${w.code} ${w.name}`.toLowerCase().includes(q.toLowerCase())); return { rows, total: rows.length }; },
  allWorks: () => [ISH, BLOK], tableLabel: () => 'Кладка', collectionTitle: () => 'Каменные конструкции',
  unit: () => null, sourceBasis: () => ({ scale: '1', unitLabel: 'м3', evidence: 'manba', origin: 'SOURCE' }),
  load: vi.fn(async () => undefined),
  detail: (id: string) => ({ work: id === ISH.id ? ISH : BLOK, workCodeAmbiguous: false, recipeCount: 2, recipes: [
    retsept('1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', '001', 'NORM_LABOUR', '5.4'),
    retsept('2', 'КИРПИЧ КЕРАМИЧЕСКИЙ', '015', 'NORM_MATERIAL', '394'),
  ] }),
};
vi.mock('../../lib/fakt-normativ', async (orig) => ({ ...(await orig<typeof import('../../lib/fakt-normativ')>()), normKatalogOch: vi.fn(async () => katalog) }));

import { IshAbcModal } from './IshAbcModal';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const ishZamena = () => render(<IshAbcModal kompaniyaId={1} obyektId={8} sana="2026-10-25" bolimlar={[]} onYop={vi.fn()} onSaqlandi={vi.fn()}
  rejim={{ tur: 'replacement', eski: { id: 5, kod: 'E1', nom: 'Bloklar terish', birlik: 'м3', otaId: 1, otaVersiya: 1, hajm: 10 } }} />);

describe('Zamena oynasi — normativ katalog va AI (2-bosqich)', () => {
  it('katalog daraxtidan ish tanlanadi → ish shifri, nomi, birligi va normativ resurslari (norma ÷ masshtab) to‘ladi', async () => {
    ishZamena();
    fireEvent.click(screen.getByRole('button', { name: /Normativ katalogdan/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /E08 Kladka/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /E08 Kladka/ }));
    fireEvent.click(await screen.findByRole('button', { name: /КЛАДКА СТЕН ИЗ КИРПИЧА/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Shu ishni tanlash/ }));
    await waitFor(() => expect((screen.getByLabelText('Ish shifri') as HTMLInputElement).value).toBe('Е08-02-001-01'));
    expect((screen.getByLabelText('Ish turi nomi') as HTMLInputElement).value).toBe('КЛАДКА СТЕН ИЗ КИРПИЧА');
    expect((screen.getByLabelText('Ish birligi') as HTMLInputElement).value).toBe('м3');
    expect((screen.getByLabelText('1-resurs nomi') as HTMLInputElement).value).toBe('ЗАТРАТЫ ТРУДА РАБОЧИХ');
    expect((screen.getByLabelText('1-resurs normasi') as HTMLInputElement).value).toBe('5.4');
    expect((screen.getByLabelText('2-resurs birligi') as HTMLInputElement).value).toBe('шт');
    expect((screen.getByLabelText('2-resurs kategoriyasi') as HTMLSelectElement).value).toBe('МАТ');
    expect(screen.queryByTestId('normativ-oyna')).toBeNull();
    expect(m.saqla).not.toHaveBeenCalled(); // forma to'ldi, yozuv faqat «Saqlash» bilan
  });

  it('AI «Tavsiflab qidirish»: faqat katalogdagi nomzodlar; AI tavsiyasi belgilanadi; ochilganda katalogda tanlanadi', async () => {
    m.tanla.mockResolvedValueOnce({ ok: true, tanlovlar: [{ id: 'z1', ishId: null, sabab: '', qidiruv: ['кладка стен из кирпича'] }] })
      .mockResolvedValueOnce({ ok: true, tanlovlar: [{ id: 'z1', ishId: ISH.id, sabab: 'g‘isht devor, 25 sm' }] });
    ishZamena();
    fireEvent.click(screen.getByRole('button', { name: /Tavsiflab qidirish/ }));
    const inp = await screen.findByLabelText('Ishni tavsiflang');
    fireEvent.change(inp, { target: { value: 'bloklar o‘rniga g‘isht terish, 25 sm' } });
    fireEvent.click(screen.getByRole('button', { name: /AI bilan topish/ }));
    const tavsiya = await screen.findByTestId('ai-tavsiya');
    expect(tavsiya.textContent).toMatch(/Е08-02-001-01.*AI tavsiyasi: g‘isht devor, 25 sm/);
    expect(m.tanla).toHaveBeenCalledTimes(2);
    // Serverga yuborilgan nomzodlar — faqat katalog pozitsiyalari.
    const ikkinchi = (m.tanla.mock.calls[1] as unknown as [number, Array<{ nomzodlar: Array<{ id: string }> }>])[1][0].nomzodlar.map((n) => n.id);
    expect(ikkinchi.every((id) => id === ISH.id || id === BLOK.id)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pozitsiyani ochish: Е08-02-001-01' }));
    fireEvent.click(await screen.findByRole('button', { name: /Shu ishni tanlash/ }));
    await waitFor(() => expect((screen.getByLabelText('Ish shifri') as HTMLInputElement).value).toBe('Е08-02-001-01'));
  });

  it('AI katalogda yo‘q shifrni tavsiya qilsa — ko‘rsatilmaydi', async () => {
    m.tanla.mockResolvedValueOnce({ ok: true, tanlovlar: [{ id: 'z1', ishId: 'norm-library:toqilgan', sabab: 'x' }] });
    ishZamena();
    fireEvent.click(screen.getByRole('button', { name: /Tavsiflab qidirish/ }));
    fireEvent.change(await screen.findByLabelText('Ishni tavsiflang'), { target: { value: 'кладка из блоков' } });
    fireEvent.click(screen.getByRole('button', { name: /AI bilan topish/ }));
    await waitFor(() => expect(m.tanla).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Qidirilmoqda/)).toBeNull());
    expect(screen.queryByTestId('ai-tavsiya')).toBeNull();
  });

  it('resurs zamenasi: katalogdagi ish jadvalidan RESURS tanlanadi, norma asl qatordan qoladi', async () => {
    render(<IshAbcModal kompaniyaId={1} obyektId={8} sana="2026-10-25" bolimlar={[]} onYop={vi.fn()} onSaqlandi={vi.fn()}
      rejim={{ tur: 'resurs_zamena', eski: { id: 7, nom: 'Ж/Б БЛОКИ', birlik: 'шт', kat: 'МАТ', norma: 12.5 }, ishHajm: 4 }} />);
    fireEvent.click(screen.getByRole('button', { name: /Normativ katalogdan resurs/ }));
    fireEvent.click(await screen.findByRole('button', { name: /E08 Kladka/ }));
    fireEvent.click(await screen.findByRole('button', { name: /КЛАДКА СТЕН ИЗ КИРПИЧА/ }));
    expect(screen.queryByRole('button', { name: /Shu ishni tanlash/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Resursni tanlash: КИРПИЧ КЕРАМИЧЕСКИЙ' }));
    await waitFor(() => expect((screen.getByLabelText('1-resurs nomi') as HTMLInputElement).value).toBe('КИРПИЧ КЕРАМИЧЕСКИЙ'));
    expect((screen.getByLabelText('1-resurs normasi') as HTMLInputElement).value).toBe('12.5');
    expect((screen.getByLabelText('1-resurs birligi') as HTMLInputElement).value).toBe('шт');
  });
});
