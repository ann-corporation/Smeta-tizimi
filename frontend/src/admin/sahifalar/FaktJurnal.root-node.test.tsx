import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
const baj = vi.hoisted(() => ({ royxat: vi.fn(async () => ({ ok: true, qatorlar: [] as unknown[] })), belgila: vi.fn(), bekor: vi.fn() }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: baj.royxat, bajarilmadiBelgila: baj.belgila, bajarilmadiBekor: baj.bekor }));
const abc = vi.hoisted(() => ({ ochir: vi.fn() }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []), narxTakliflari: vi.fn(async () => []), ishAbcSaqla: vi.fn(), ishAbcTahrir: vi.fn(), ishAbcOchir: abc.ochir, abcXato: () => '' }));

const hq = vi.hoisted(() => ({ ol: vi.fn(async () => ({ ok: true, qatorlar: [{ qator_id: 2, fakt_hajm: 40 }, { qator_id: 3, fakt_hajm: 0 }, { qator_id: 5, fakt_hajm: 0 }] as unknown[] })) }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: hq.ol, sbT2DaraxtQisman: vi.fn() }));
const zb = vi.hoisted(() => ({ ol: vi.fn(async () => ({ almashtiradi: new Map<number, number>(), almashtirilgan: new Map<number, number>() })) }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: zb.ol }));

import { FaktJurnal } from './FaktJurnal';
import { qoldimYoz } from '../../lib/fakt-klaviatura';
import { urinishOchir, yozilganOchir } from '../../lib/fakt-qamrov-urinish';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Yer ishlari' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Grunt', hajm: 100 }),
  q({ id: 3, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Qum', hajm: 10 }),
  q({ id: 4, tur: 'rz', kod: '2', nom: 'Beton ishlari' }),
  q({ id: 5, tur: 'bl', ota_id: 4, daraja: 1, nom: 'Poydevor', hajm: 30 }),
];
const states = [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }, { qator_id: 3, smeta_hajm: 10, fakt_hajm: 0 }, { qator_id: 5, smeta_hajm: 30, fakt_hajm: 0 }];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn() });

afterEach(() => { cleanup(); vi.clearAllMocks(); urinishOchir(1, 8); yozilganOchir(1, 8); localStorage.clear(); });

const rootRows = [q({ id: 10, tur: 'bl', nom: 'Ildiz ish', hajm: 20 }), q({ id: 11, tur: 'mat', ota_id: 10, nom: 'Ildiz qum', hajm: 5 }), q({ id: 12, tur: 'rs', ota_id: 10, nom: 'Ildiz mashina', hajm: 3, norma: 0.15 })];
const rootProps = (mixed = false) => ({ ...props(), rows: [...(mixed ? rows : []), ...rootRows], states: [...states, ...rootRows.map(r => ({ qator_id: r.id, smeta_hajm: r.hajm, fakt_hajm: 0 }))] });
describe('FaktJurnal virtual root', () => {
 it('root-only work and both resource kinds are visible', () => {
  render(<FaktJurnal {...rootProps()} />);
  expect(screen.getByTestId('bolimsiz-node').getAttribute('aria-current')).toBe('true');
  for (const id of [10,11,12]) expect(screen.getByTestId(id === 10 ? 'ish-10' : 'resurs-'+id)).toBeTruthy();
  expect(screen.queryByText(/Bu obyektda smeta yo‘q/)).toBeNull();
 });
 it('mixed selection survives autoselect and Cyrillic resource search', () => {
  render(<FaktJurnal {...rootProps(true)} />);
  expect(screen.queryByTestId('ish-10')).toBeNull();
  fireEvent.click(screen.getByTestId('bolimsiz-node'));
  expect(screen.getByTestId('ish-10')).toBeTruthy();
  expect(screen.queryByTestId('ish-2')).toBeNull();
  fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'илдиз машина' } });
  expect(screen.getByTestId('resurs-12')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: '' } });
  expect(screen.getByTestId('bolimsiz-node').getAttribute('aria-current')).toBe('true');
 });
 it.each([false,true])('restores root material and resolves Ctrl+B (mixed=%s)', async mixed => {
  qoldimYoz(1,8,11); render(<FaktJurnal {...rootProps(mixed)} />);
  expect((await screen.findByTestId('qoldim-xabar')).textContent).toContain('Ildiz qum');
  expect(screen.getByTestId('bolimsiz-node').getAttribute('aria-current')).toBe('true');
  fireEvent.keyDown(screen.getByLabelText('Bugun bajarildi: Ildiz qum'), { key: 'b', ctrlKey: true });
  expect(await screen.findByRole('dialog')).toBeTruthy();
 });
 it('restores automatic resource; genuinely empty object has no virtual node', () => {
  qoldimYoz(1,8,12);const view=render(<FaktJurnal {...rootProps(true)} />);
  expect(screen.getByTestId('qoldim-xabar').textContent).toContain('Ildiz mashina');
  view.unmount();localStorage.clear();render(<FaktJurnal {...props()} rows={[]} states={[]} />);
  expect(screen.queryByTestId('bolimsiz-node')).toBeNull();
  expect(screen.getByText(/Bu obyektda smeta yo‘q/)).toBeTruthy();
 });
});
