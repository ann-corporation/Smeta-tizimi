import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyDoc, type RecipeSnapshot, type UnitBasis, type WorkSource } from '../../lib/smeta-studio/model';
import { applyCommand, type StudioCommand } from '../../lib/smeta-studio/commands';
import { calcDoc } from '../../lib/smeta-studio/calc';
import type { KatalogQatori } from '../../lib/narx-katalog/types';

const row = (id: number, nom: string, birlik: string, narx: number): KatalogQatori => ({ id, manba_id: 5, kod: null, nom, birlik, narx, hudud: null,
  ishlab_chiqaruvchi: null, nds_holati: 'nds_siz', nds_izoh: null, yil: 2026, kvartal: 1, narx_varianti: null, guruh: null, hudud_kalit: null,
  manba_nom: 'Каталог 1 кв. 2026', manba_tur: 'katalog' });
const rows = [row(11, 'Песок природный для строительных работ, фр. 0-5 мм', 'м3', 90000)];
const view = { size: rows.length, name: (i: number) => rows[i].nom, unit: (i: number) => rows[i].birlik, region: () => null, price: (i: number) => rows[i].narx, row: (i: number) => rows[i] };
vi.mock('../../lib/narx-katalog/price-remote', () => ({ narxKatalogi: async () => ({ rows, dict: { hudud: [], hududKalit: [] }, matchView: () => view }) }));
vi.mock('../../lib/hour-price-catalog', () => ({ loadHourCatalog: async () => { throw new Error('offline'); } }));
vi.mock('../../lib/smeta-studio/company-prices', () => ({ kompaniyaKuzatuvlari: async () => [], kompaniyaMoslik: () => null }));
vi.mock('../../api/t2-nakrutka', async (orig) => ({ ...(await orig<typeof import('../../api/t2-nakrutka')>()),
  t2NakrutkaKoefOl: async () => ({ ok: true, shartnoma_id: null, koeffitsientlar: { ЗТР_СОЦСТРАХ: 12, ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75,
    ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 }, jadval: {} }) }));
const tanla = vi.fn(async (_k: number, s: Array<{ id: string; nomzodlar: Array<{ id: string }> }>) =>
  ({ ok: true as const, tanlovlar: s.map(x => ({ id: x.id, tanlov: x.nomzodlar[0]?.id ?? null, ishonch: 'yuqori' as const, sabab: 'ma’nosi mos' })) }));
vi.mock('../../api/smeta-ai', () => ({ smetachiNarxTanla: (...a: unknown[]) => tanla(...(a as [number, never])) }));
vi.mock('../../components/smeta-studio-pro/MarketPriceComparison', () => ({ MarketPriceComparison: () => null }));

const { NarxlashBosqichi } = await import('./StudioBosqichlar');

const recipe: RecipeSnapshot[] = [{ recipeId: 'r1', status: 'EXACT', resource: { id: '1', code: 'С140-1', resourceIdCode: '012303', name: 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ', unitCode: '003', type: 'M' },
  norm: '1.1', candidates: [], candidateCount: 1, prices: [], priceCount: 0 }];
const source: WorkSource = { catalogRevision: 'rev', workId: 'w', code: 'E6-1-1-1', name: 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', unitCode: '007', tableLabel: null };
const basis: UnitBasis = { scale: '100', unitLabel: 'м3', evidence: '100 М3', origin: 'OBSERVED' };
const doc = ([{ type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'Fundament' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 's', source, recipe, quantity: '10', basis }] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));
const unitText = (c: string | null) => (c === '003' ? 'м3' : null);

describe('Narxlash bosqichi (UI)', () => {
  it('AI bilan narxlash: katalogdan ma’nosi mos narx dalil bilan bitta BATCH da qo‘yiladi; stavkalar tasdiqlanadi', async () => {
    const command = vi.fn((_c: StudioCommand) => true);
    render(<NarxlashBosqichi doc={doc} hisob={calcDoc(doc)} command={command} kompaniyaId={17} hudud="" setHudud={() => {}} unitText={unitText} onNext={() => {}} />);
    await screen.findByText(/Narx katalogi: 1 qator/);
    fireEvent.click(screen.getByRole('button', { name: 'AI bilan narxlash' }));
    await waitFor(() => expect(command).toHaveBeenCalled());
    const c = command.mock.calls[0][0];
    expect(c).toMatchObject({ type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '90000', basis: 'CATALOG_CANDIDATE', sourcePriceId: 'narx-katalog:11' } });
    expect((c as { price: { evidence: string } }).price.evidence).toContain('Tanlash sababi: ma’nosi mos');
    expect(tanla).toHaveBeenCalledTimes(1);

    await waitFor(() => expect((screen.getByLabelText('ПРОЧИЕ_ПОДРЯДЧИК') as HTMLInputElement).value).toBe('18'));
    fireEvent.click(screen.getByRole('button', { name: 'Stavkalarni tasdiqlash' }));
    expect(command).toHaveBeenLastCalledWith({ type: 'SET_RATES', rates: expect.objectContaining({ source: 'Kompaniya nakrutka sozlamasi', values: expect.objectContaining({ НДС: 12, ПРОЧИЕ_ПОДРЯДЧИК: 18 }) }) });
  });
});
