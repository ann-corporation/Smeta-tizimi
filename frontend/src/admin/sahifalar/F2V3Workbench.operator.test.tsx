import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { F2V3Workbench } from './F2V3Workbench';
import { f2Indeks, smetaIndeks, type IshJoyi } from '../../lib/f2-moslash-v3/ishJoyi';
import type { F2MoslashNatija, SmetaQator } from '../../lib/f2-moslash-v3';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 40,
    // Emulate a viewport: even a 30k-row tree must render only a small window.
    getVirtualItems: () => Array.from({ length: Math.min(count, 24) }, (_, index) => ({ index, start: index * 40, size: 40, key: index })),
    measureElement: () => undefined,
  }),
}));

const leaf = (uid: string, nom: string, tur: F2Tugun['tur'] = 'bl'): F2Tugun => ({
  uid, tur, kod: uid, nom, birlik: 'm3', hajm: 1, narx: 100, summa: uid === 'f1' ? 125 : 50,
  manzil: { fayl: 'f2.xlsx', varaq: 'Akt', qator: Number(uid.slice(1)) + 9 }, yol: ['Beton ishlari'], bolalar: [], barg: true,
});

function renderWorkbench(rowCount = 2, specialTypes: F2Tugun['tur'][] = [], review: Array<{ kod: string; izoh: string; manzil?: { fayl: string; varaq: string; qator: number } }> = []) {
  const f2Rows = Array.from({ length: rowCount }, (_, index) => leaf(
    `f${index + 1}`,
    index === 0 ? 'Beton B25' : index === 1 ? 'Armatura A500' : `Ish ${index + 1}`,
    specialTypes[index] ?? 'bl',
  ));
  const rz: F2Tugun = {
    uid: 'frz', tur: 'rz', kod: null, nom: 'KONSTRUKSIYA', birlik: null, hajm: null, narx: null, summa: null,
    manzil: { fayl: 'f2.xlsx', varaq: 'Akt', qator: 1 }, yol: ['KONSTRUKSIYA'], bolalar: f2Rows, barg: false,
  };
  const smetaRows: SmetaQator[] = [
    { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'KONSTRUKSIYA', birlik: null, hajm: null },
    ...Array.from({ length: rowCount }, (_, index) => ({
      id: index + 2, otaId: 1, tur: 'bl' as const, kod: `f${index + 1}`,
      nom: index === 0 ? 'Beton B25' : index === 1 ? 'Armatura A500' : `Ish ${index + 1}`,
      birlik: 'm3', hajm: 10, narx: 100,
    })),
  ];
  const smeta = smetaIndeks(smetaRows);
  const candidate = { qatorId: 2, ball: 70, yol: 'KONSTRUKSIYA', qavatlar: [
    { nom: 'razdel' as const, ball: 25, izoh: 'exact' }, { nom: 'shifr' as const, ball: 25, izoh: 'exact' },
    { nom: 'nom' as const, ball: 15, izoh: 'similar' }, { nom: 'birlik' as const, ball: 0, izoh: 'same' },
  ], sabab: ['razdel', 'shifr'] };
  const natija: F2MoslashNatija = {
    natijalar: new Map([['f1', { uid: 'f1', holat: 'taklif', qatorId: 2, nomzodlar: [candidate], sabab: 'Operator tasdig‘i kerak' }]]),
    rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 1, topilmadi: 1 },
  };
  const ij: IshJoyi = { bog: new Map([['f1', { qatorId: 2, holat: 'taklif', usul: 'nomzod' }]]), otkaz: new Set() };
  const akt = {
    fayl: 'f2.xlsx', varaq: 'Akt', davr: '2026-08', davrMatn: 'Avgust 2026', daraxt: [rz],
    jami: { pryamye: 175, vsego: 175, ranee: null, raznica: null, nds: null },
    qatorlarJami: 125 + Math.max(0, rowCount - 1) * 50,
    barglarSoni: rowCount, ishlarSoni: rowCount, ogohlantirishlar: [], anatomiya: { review },
  } as unknown as F2Akt;
  const onIj = vi.fn();
  render(<F2V3Workbench
    akt={{ ...akt, jami: { ...akt.jami, pryamye: 125 + Math.max(0, rowCount - 1) * 50, vsego: 125 + Math.max(0, rowCount - 1) * 50 } }}
    ind={f2Indeks([rz])} natija={natija} S={smeta} raw={new Map()} oldingi={new Map()}
    ij={ij} onIj={onIj} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined}
  />);
  return { onIj };
}

afterEach(cleanup);

describe('F2 workbench operator controls', () => {
  it('keeps both trees visible, exposes whole-tree and per-depth controls, and shows exact amount reconciliation', () => {
    renderWorkbench();
    expect(screen.getByRole('region', { name: 'F2 akt' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Smeta' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Hammasini ochish' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Hammasini yopish' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '1-qavatdagi barcha bo‘limlarni ochish/yopish' })).toHaveLength(2);
    const sourceSum = screen.getByText('F2 hujjat jami').parentElement;
    expect(sourceSum?.textContent).toContain('hujjat ИТОГО ПРЯМЫЕ: 175');
    expect(screen.getByText('✓ Bog‘langan')).toBeTruthy();
    const f2Tree = within(screen.getByRole('region', { name: 'F2 akt' }));
    expect(screen.getByRole('button', { name: 'Barcha qatorlar' }).getAttribute('aria-pressed')).toBe('true');
    expect(f2Tree.getByText('KONSTRUKSIYA')).toBeTruthy();
    expect(f2Tree.getByRole('group', { name: 'F2 qatori (Ish): Beton B25' }).textContent).toContain('125');
    expect(screen.getByRole('button', { name: 'Bog‘lanishni uzish: Beton B25' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bog‘lash variantlari: Beton B25' }));
    expect(screen.getAllByText('93%').length).toBeGreaterThan(0);
  });

  it('separates source-reading review from row matching and never claims all source rows were checked', () => {
    renderWorkbench(2, [], [{ kod: 'noaniq_qator', izoh: 'manbada tanilmagan qator: "ПОЛ"', manzil: { fayl: 'f2.xlsx', varaq: 'Akt', qator: 284 } }]);
    const review = screen.getByRole('alert', { name: 'F2 faylini o‘qish tekshiruvi' });
    expect(review.textContent).toContain('1 ta qator yoki sarlavha');
    expect(review.textContent).toContain('fayldagi har bir qator to‘liq o‘qildi degani emas');
    fireEvent.click(screen.getByText('Tekshiruv qatorlarini ko‘rish (birinchi 1 ta)'));
    expect(review.textContent).toContain('Manba qatori 284');
    expect(review.textContent).toContain('tanilmagan qator');
    expect(screen.queryByText(/hammasi tekshirilgan/i)).toBeNull();
  });

  it('filters to unbound F2 lines without hiding the source tree or its explicit bind action', () => {
    renderWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'Bog‘lanmagan' }));
    const f2Tree = within(screen.getByRole('region', { name: 'F2 akt' }));
    expect(f2Tree.getByText('KONSTRUKSIYA')).toBeTruthy();
    expect(f2Tree.getByText('Armatura A500')).toBeTruthy();
    expect(f2Tree.queryByText('Beton B25')).toBeNull();
    expect(f2Tree.getByRole('button', { name: 'Bog‘lash variantlari: Armatura A500' })).toBeTruthy();
  });

  it('labels standalone materials and equipment in PTO language, not as generic resources', () => {
    renderWorkbench(2, ['mat', 'ob']);
    const f2Tree = within(screen.getByRole('region', { name: 'F2 akt' }));
    expect(f2Tree.getByRole('group', { name: 'F2 qatori (Mustaqil material): Beton B25' })).toBeTruthy();
    expect(f2Tree.getByRole('group', { name: 'F2 qatori (Mustaqil uskuna): Armatura A500' })).toBeTruthy();
  });

  it('opens/closes all and toggles exactly one hierarchy level', () => {
    renderWorkbench();
    const f2Tree = within(screen.getByRole('region', { name: 'F2 akt' }));
    expect(f2Tree.getByText('Beton B25')).toBeTruthy();
    fireEvent.click(f2Tree.getByRole('button', { name: '1-qavatdagi barcha bo‘limlarni ochish/yopish' }));
    expect(f2Tree.queryByText('Beton B25')).toBeNull();
    fireEvent.click(f2Tree.getByRole('button', { name: 'Hammasini ochish' }));
    expect(f2Tree.getByText('Beton B25')).toBeTruthy();
    fireEvent.click(f2Tree.getByRole('button', { name: 'Hammasini yopish' }));
    expect(f2Tree.queryByText('Beton B25')).toBeNull();
  });

  it('keeps a 30,000-line pair of trees virtualized instead of mounting every row', () => {
    renderWorkbench(30_000);
    const f2Region = screen.getByRole('region', { name: 'F2 akt' });
    const smetaRegion = screen.getByRole('region', { name: 'Smeta' });

    expect(screen.getByText(/qator ko‘rinmoqda/).textContent).toContain('30');
    expect(f2Region.querySelectorAll('[data-index]')).toHaveLength(24);
    expect(smetaRegion.querySelectorAll('[data-index]')).toHaveLength(24);
  });
});
