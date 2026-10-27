import * as React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../src/api/supabase';

const api = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../src/api/t2-fakt', () => ({ sbFaktYoz: api.yoz }));
vi.mock('../../src/umumiy/ui/Toast', () => ({ toast: api.toast }));
const baj = vi.hoisted(() => ({
  royxat: vi.fn(async () => ({ ok: true, qatorlar: [] as unknown[] })),
  belgila: vi.fn(), bekor: vi.fn(),
}));
vi.mock('../../src/api/t2-bajarilmadi', async (orig) => ({
  ...(await orig<typeof import('../../src/api/t2-bajarilmadi')>()),
  bajarilmadiRoyxatOl: baj.royxat,
  bajarilmadiBelgila: baj.belgila,
  bajarilmadiBekor: baj.bekor,
}));
const abc = vi.hoisted(() => ({ ochir: vi.fn() }));
vi.mock('../../src/api/t2-ish-abc', () => ({
  ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []),
  narxTakliflari: vi.fn(async () => []), ishAbcSaqla: vi.fn(), ishAbcTahrir: vi.fn(),
  ishAbcOchir: abc.ochir, abcXato: () => '',
}));
const zamena = vi.hoisted(() => ({
  ol: vi.fn(async () => ({ almashtiradi: new Map<number, number>(), almashtirilgan: new Map<number, number>() })),
}));
vi.mock('../../src/lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: zamena.ol }));

// This small controlled window exercises the component's focus and draft contracts.
// It is intentionally not a browser layout/performance test.
const virtualWindow = vi.hoisted(() => ({ moveTo: (_index: number) => undefined as void }));
vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (options: {
      count: number;
      getItemKey: (index: number) => string | number;
      rangeExtractor: (range: { startIndex: number; endIndex: number; overscan: number; count: number }) => number[];
      overscan: number;
    }) => {
      const [start, setStart] = React.useState(0);
      const current = React.useRef(options);
      current.current = options;
      virtualWindow.moveTo = (index) => setStart(Math.max(0, Math.min(index, current.current.count - 1)));
      const visibleCount = 6;
      return {
        scrollToIndex: (index: number) => setStart(Math.max(0, Math.min(index - visibleCount + 1, current.current.count - 1))),
        getVirtualItems: () => {
          const endIndex = Math.min(current.current.count - 1, start + visibleCount - 1);
          return current.current.rangeExtractor({ startIndex: start, endIndex, overscan: 0, count: current.current.count }).map((index) => ({
            index,
            key: current.current.getItemKey(index),
            start: 64 + index * 80,
            size: 80,
            end: 64 + (index + 1) * 80,
            lane: 0,
          }));
        },
        getTotalSize: () => current.current.count * 80,
        measureElement: () => undefined,
      };
    },
  };
});

import { FaktJurnal } from '../../src/admin/sahifalar/FaktJurnal';
import { urinishOchir, yozilganOchir } from '../../src/lib/fakt-qamrov-urinish';
import { _tilniTestdaQoy } from '../../src/i18n/til';

const qator = (x: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: x.id,
  kod: null, nom: 'Nomsiz', birlik: 'м3', hajm: null, narx: null, summa: null, kat: null,
  narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null,
  xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...x,
} as T2Qator);

const ishId = (i: number) => 10_000 + i * 3;
function jurnalIshlari(n: number, opts: { resources?: boolean; name?: (i: number) => string } = {}) {
  const rows: T2Qator[] = [qator({ id: 1, tur: 'rz', kod: '1', nom: 'Ishlar' })];
  for (let i = 0; i < n; i++) {
    const id = ishId(i);
    rows.push(qator({ id, tur: 'bl', ota_id: 1, daraja: 1, kod: String(i + 1), nom: opts.name?.(i) ?? `Ish ${String(i + 1).padStart(3, '0')}`, birlik: 'м3', hajm: 100 }));
    if (opts.resources) {
      rows.push(qator({ id: id + 1, tur: 'mat', ota_id: id, daraja: 2, nom: `Qo‘lda resurs ${String(i + 1).padStart(3, '0')}`, birlik: 'кг', hajm: 10, kat: 'МАТ' }));
      rows.push(qator({ id: id + 2, tur: 'rs', ota_id: id, daraja: 2, nom: `Avtomatik ${String(i + 1).padStart(3, '0')}`, birlik: 'чел.-ч', hajm: 5, kat: 'ЧЕЛ' }));
    }
  }
  return rows;
}
const props = (rows: readonly T2Qator[]) => ({
  kompaniyaId: 1, obyektId: 8, rows, states: [],
  holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn(),
});

beforeEach(() => {
  _tilniTestdaQoy('uz');
  api.yoz.mockReset().mockResolvedValue({ ok: true });
  virtualWindow.moveTo = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  urinishOchir(1, 8);
  yozilganOchir(1, 8);
  _tilniTestdaQoy('uz');
});

it('saqlaydi birinchi va oxirgi draftni, hatto birinchi input virtual oynadan chiqarilgandan keyin ham', async () => {
  const rows = jurnalIshlari(250);
  render(<FaktJurnal {...props(rows)} />);

  const first = screen.getByLabelText('Bugun bajarildi: Ish 001') as HTMLInputElement;
  first.focus();
  fireEvent.change(first, { target: { value: '1' } });

  act(() => virtualWindow.moveTo(250));
  const last = await screen.findByLabelText('Bugun bajarildi: Ish 250') as HTMLInputElement;
  last.focus(); // moves the focus pin; the first row is now outside the rendered window
  await waitFor(() => expect(screen.queryByLabelText('Bugun bajarildi: Ish 001')).toBeNull());
  fireEvent.change(last, { target: { value: '2' } });

  fireEvent.click(screen.getByRole('button', { name: /^Saqlash/ }));
  await waitFor(() => expect(api.yoz).toHaveBeenCalledTimes(1));
  expect(api.yoz.mock.calls[0][0].qatorlar).toEqual([
    { qator_id: ishId(0), hajm: 1 },
    { qator_id: ishId(249), hajm: 2 },
  ]);
});

it('сохраняет порядок ArrowDown, Enter и Tab при переходе через край окна и пропускает автоматический ресурс', () => {
  render(<FaktJurnal {...props(jurnalIshlari(150, { resources: true }))} />);
  const secondManual = screen.getByLabelText('Bugun bajarildi: Qo‘lda resurs 002') as HTMLInputElement;
  secondManual.focus();
  expect(screen.queryByLabelText('Bugun bajarildi: Avtomatik 002')).toBeNull();

  fireEvent.keyDown(secondManual, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Ish 003'));
  fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
  expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Qo‘lda resurs 003'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Ish 004'));
});

it('finds all 300 matches with Latin and equivalent Uzbek Cyrillic search', async () => {
  const rows = jurnalIshlari(300, { name: (i) => `G‘isht terish ${String(i + 1).padStart(3, '0')}` });
  render(<FaktJurnal {...props(rows)} />);
  const search = screen.getByLabelText('Qidirish') as HTMLInputElement;

  fireEvent.change(search, { target: { value: 'g‘isht' } });
  expect(screen.getByTestId('fakt-royxat-soni').textContent).toMatch(/300 ish\s*·\s*300 qator/);
  fireEvent.change(search, { target: { value: 'ғишт' } });
  expect(screen.getByTestId('fakt-royxat-soni').textContent).toMatch(/300 ish\s*·\s*300 qator/);
});

it('keeps all 300 eligible works in the new factless-F2 filter after merging the object workflow', () => {
  const rows = jurnalIshlari(300, { name: (i) => `G‘isht terish ${String(i + 1).padStart(3, '0')}` });
  const states = rows.filter((r) => r.tur === 'bl').map((r) => ({
    qator_id: r.id, smeta_hajm: 100, fakt_hajm: 0, f2_hajm: 1,
    smeta_summa: 1000, fakt_summa: 0, f2_summa: 10, qoldiq_summa: 990,
  }));
  render(<FaktJurnal {...props(rows)} states={states} boshFaktsizF2 />);
  expect(screen.getByTestId('fakt-royxat-soni').textContent).toMatch(/300 ish\s*·\s*300 qator/);
  fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'ғишт' } });
  expect(screen.getByTestId('fakt-royxat-soni').textContent).toMatch(/300 ish\s*·\s*300 qator/);
});



