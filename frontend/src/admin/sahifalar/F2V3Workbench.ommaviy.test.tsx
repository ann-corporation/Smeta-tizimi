import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';
import { f2Indeks, smetaIndeks, type IshJoyi } from '../../lib/f2-moslash-v3/ishJoyi';
import type { F2MoslashNatija, SmetaQator } from '../../lib/f2-moslash-v3';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 40,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 40, size: 40, key: index })),
    measureElement: () => undefined, scrollToIndex: () => undefined,
  }),
}));
const { F2V3Workbench } = await import('./F2V3Workbench');

const SMETA: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'KONSTRUKSIYA', birlik: null, hajm: null },
  { id: 2, otaId: 1, tur: 'bl', kod: 'E1', nom: 'Beton B25', birlik: 'm3', hajm: 10 },
  { id: 3, otaId: 1, tur: 'bl', kod: 'E2', nom: 'Armatura', birlik: 't', hajm: 5 },
  { id: 4, otaId: 1, tur: 'bl', kod: 'E3', nom: 'Qum', birlik: 'm3', hajm: 5 },
];
const raw = new Map<number, T2Qator>(SMETA.map((s) => [s.id, { id: s.id, ota_id: s.otaId, tur: s.tur, nom: s.nom, versiya: 1 } as unknown as T2Qator]));
const f2 = (uid: string, nom: string, qator: number): F2Tugun => ({ uid, tur: 'bl', kod: null, nom, birlik: 'm3', hajm: 1, narx: 10, summa: 10,
  manzil: { fayl: 'f', varaq: 'A', qator }, yol: ['KONSTRUKSIYA'], bolalar: [], barg: true });
const a = f2('a', 'Beton', 2), b = f2('b', 'Armatura', 3), c = f2('c', 'Qum', 4);
const rz: F2Tugun = { uid: 'frz', tur: 'rz', kod: null, nom: 'KONSTRUKSIYA', birlik: null, hajm: null, narx: null, summa: null,
  manzil: { fayl: 'f', varaq: 'A', qator: 1 }, yol: [], bolalar: [a, b, c], barg: false };

function chiz() {
  const ij = { bog: new Map([
    ['a', { qatorId: 2, holat: 'taklif', usul: 'taklif' }],
    ['b', { qatorId: 3, holat: 'taklif', usul: 'taklif' }],
    ['c', { qatorId: 4, holat: 'qolda', usul: 'qolda' }],
  ]), otkaz: new Set() } as unknown as IshJoyi;
  const natija: F2MoslashNatija = { natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 2, topilmadi: 0 } };
  const akt = { fayl: 'f', varaq: 'A', davr: '2026-10', daraxt: [rz], jami: { pryamye: 30, vsego: 30, ranee: null, raznica: null, nds: null },
    qatorlarJami: 30, barglarSoni: 3, ishlarSoni: 3, ogohlantirishlar: [], anatomiya: { review: [] } } as unknown as F2Akt;
  const onIj = vi.fn();
  render(<F2V3Workbench akt={akt} ind={f2Indeks([rz])} natija={natija} S={smetaIndeks(SMETA)} raw={raw} oldingi={new Map()}
    ij={ij} onIj={onIj} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined} zamenaAsl={new Map()} onQoshilganOzgardi={vi.fn()} />);
  return { onIj, toolbar: () => within(screen.getByRole('toolbar', { name: 'Belgilangan F2 qatorlari' })) };
}
afterEach(cleanup);

describe('F2 import — ommaviy belgilash', () => {
  it('Shift bilan oraliq belgilanadi va bitta amalda tasdiqlanadi (bitta onIj = bitta «Orqaga» qadami)', () => {
    const { onIj, toolbar } = chiz();
    fireEvent.click(screen.getByRole('button', { name: 'Belgilash: Beton' }));
    fireEvent.click(screen.getByRole('button', { name: 'Belgilash: Armatura' }), { shiftKey: true });
    expect(screen.getByText('2 ta belgilandi:')).toBeTruthy();
    fireEvent.click(toolbar().getByRole('button', { name: /Tasdiqlash/ }));
    expect(onIj).toHaveBeenCalledTimes(1);
    const next = onIj.mock.calls[0][0] as IshJoyi;
    expect(next.bog.get('a')?.holat).toBe('qolda');
    expect(next.bog.get('b')?.holat).toBe('qolda');
    expect(screen.queryByText('2 ta belgilandi:')).toBeNull();
  });

  it('ko‘rinadiganlarni belgilab aktga kiritmaslik — hammasi chiqariladi, bog‘lanishlar olinadi', () => {
    const { onIj, toolbar } = chiz();
    fireEvent.click(toolbar().getByRole('button', { name: 'Ko‘rinadiganlarni belgilash' }));
    expect(screen.getByText('3 ta belgilandi:')).toBeTruthy();
    fireEvent.click(toolbar().getByRole('button', { name: 'Aktga kiritmaslik' }));
    const next = onIj.mock.calls[0][0] as IshJoyi;
    expect([...next.otkaz].sort()).toEqual(['a', 'b', 'c']);
    expect(next.bog.size).toBe(0);
  });
});
