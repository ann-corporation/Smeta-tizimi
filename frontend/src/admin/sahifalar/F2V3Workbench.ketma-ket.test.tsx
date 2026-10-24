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

// SINTETIK: F2 ishining «resurslari» smetada bo'limdagi ketma-ket mustaqil qatorlar (egasi holati, real ma'lumot emas).
const SMETA: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'BOLIM', birlik: null, hajm: null, tartib: 1 },
  { id: 2, otaId: 1, tur: 'bl', kod: 'T1', nom: 'SINOV ISHI', birlik: '100М', hajm: 2, tartib: 2 },
  { id: 10, otaId: 1, tur: 'mat', kod: '90-1', nom: 'ДЕТАЛЬ Д-20ММ', birlik: 'ШТ', hajm: 3, tartib: 10 },
  { id: 11, otaId: 1, tur: 'mat', kod: '90-2', nom: 'ДЕТАЛЬ Д-25ММ', birlik: 'ШТ', hajm: 2, tartib: 11 },
  { id: 12, otaId: 1, tur: 'mat', kod: '90-3', nom: 'ДЕТАЛЬ Д-32ММ', birlik: 'ШТ', hajm: 2, tartib: 12 },
];
const raw = new Map<number, T2Qator>(SMETA.map((s) => [s.id, { id: s.id, ota_id: s.otaId, tur: s.tur, nom: s.nom, versiya: 1 } as unknown as T2Qator]));
const res = (uid: string, kod: string, nom: string, birlik: string, qator: number): F2Tugun => ({ uid, tur: 'rs', kod, nom, birlik, hajm: 1, narx: 10, summa: 10,
  manzil: { fayl: 'f', varaq: 'A', qator }, yol: ['BOLIM'], bolalar: [], barg: true });
const r1 = res('r1', '90-1', 'ДЕТАЛЬ Д-20ММ', 'ШТ', 3), r2 = res('r2', '90-2', 'ДЕТАЛЬ Д-25ММ', 'ШТ', 4), r3 = res('r3', '90-3', 'ДЕТАЛЬ Д-32ММ', 'ШТ', 5);
const r4 = res('r4', '90-4', 'ДЕТАЛЬ Д-40ММ', 'М', 6);
const ish: F2Tugun = { uid: 'ish', tur: 'bl', kod: 'T1', nom: 'SINOV ISHI', birlik: '100М', hajm: 1, narx: null, summa: 40,
  manzil: { fayl: 'f', varaq: 'A', qator: 2 }, yol: ['BOLIM'], bolalar: [r1, r2, r3, r4], barg: false };
const rz: F2Tugun = { uid: 'frz', tur: 'rz', kod: null, nom: 'BOLIM', birlik: null, hajm: null, narx: null, summa: null,
  manzil: { fayl: 'f', varaq: 'A', qator: 1 }, yol: [], bolalar: [ish], barg: false };

function chiz(bog: Array<[string, { qatorId: number; holat: 'qolda' | 'taklif'; usul: string }]> = []) {
  const ij = { bog: new Map([['ish', { qatorId: 2, holat: 'qolda', usul: 'qolda' }], ...bog]), otkaz: new Set() } as unknown as IshJoyi;
  const natija: F2MoslashNatija = { natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 4 } };
  const akt = { fayl: 'f', varaq: 'A', davr: '2026-10', daraxt: [rz], jami: { pryamye: 40, vsego: 40, ranee: null, raznica: null, nds: null },
    qatorlarJami: 40, barglarSoni: 4, ishlarSoni: 1, ogohlantirishlar: [], anatomiya: { review: [] } } as unknown as F2Akt;
  const onIj = vi.fn();
  render(<F2V3Workbench akt={akt} ind={f2Indeks([rz])} natija={natija} S={smetaIndeks(SMETA)} raw={raw} oldingi={new Map()}
    ij={ij} onIj={onIj} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined} zamenaAsl={new Map()} onQoshilganOzgardi={vi.fn()} />);
  return { onIj };
}
afterEach(cleanup);

describe('F2 import — ketma-ket tarqatib bog‘lash (operator)', () => {
  it('bir nechta F2 qatori belgilanib smeta qatori USTIGA sudralsa — pastdagilarga ketma-ket bog‘lanadi, bitta «Orqaga» qadami', () => {
    const { onIj } = chiz();
    fireEvent.click(screen.getByRole('button', { name: 'Belgilash: ДЕТАЛЬ Д-20ММ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Belgilash: ДЕТАЛЬ Д-40ММ' }), { shiftKey: true });
    expect(screen.getByText('4 ta belgilandi:')).toBeTruthy();
    const row = within(screen.getByRole('region', { name: 'F2 akt' })).getByRole('group', { name: /ДЕТАЛЬ Д-25ММ/ });
    const target = document.querySelector('[data-sid="10"]') as HTMLElement;
    const asl = document.elementFromPoint;
    document.elementFromPoint = (() => target) as typeof document.elementFromPoint;
    try {
      fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(document, { clientX: 60, clientY: 0 });
      fireEvent.pointerUp(document, { clientX: 60, clientY: 0 });
    } finally {
      document.elementFromPoint = asl;
    }
    expect(onIj).toHaveBeenCalledTimes(1);
    const next = onIj.mock.calls[0][0] as IshJoyi;
    expect(next.bog.get('r1')?.qatorId).toBe(10);
    expect(next.bog.get('r2')?.qatorId).toBe(11);
    expect(next.bog.get('r3')?.qatorId).toBe(12);
    expect(next.bog.has('r4')).toBe(false);
    const status = screen.getByRole('status').textContent ?? '';
    expect(status).toContain('3 ta qator ketma-ket bog‘landi');
    expect(status).toContain('1 ta mos topilmadi');
    expect(status).toContain('ДЕТАЛЬ Д-40ММ');
    expect(screen.queryByText('4 ta belgilandi:')).toBeNull();
  });

  it('«⇊ Pastdagi mos qatorlarni ham bog‘lash»: qo‘lda bog‘langan qatordan pastga davom etadi', () => {
    const { onIj } = chiz([['r1', { qatorId: 10, holat: 'qolda', usul: 'qolda' }]]);
    const row = within(screen.getByRole('region', { name: 'F2 akt' })).getByRole('group', { name: /ДЕТАЛЬ Д-20ММ/ });
    fireEvent.click(row.querySelector('button:not([aria-pressed])') ?? row);
    fireEvent.click(screen.getByRole('button', { name: '⇊ Pastdagi mos qatorlarni ham bog‘lash' }));
    expect(onIj).toHaveBeenCalledTimes(1);
    const next = onIj.mock.calls[0][0] as IshJoyi;
    expect(next.bog.get('r2')?.qatorId).toBe(11);
    expect(next.bog.get('r3')?.qatorId).toBe(12);
    expect(screen.getByRole('status').textContent).toContain('2 ta qator ketma-ket bog‘landi');
  });
});
