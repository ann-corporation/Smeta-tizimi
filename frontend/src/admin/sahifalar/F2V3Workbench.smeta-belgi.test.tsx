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

/* Egasi 2026-10-21: «smeta va F2 tarafda bir xil funksiyalar kerak — qatorlarni smeta tarafda tanlab bo'lmaydi»;
 * «razdelni yasash va o'chirish funksiyasi ham kerak». */
const SMETA: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'ASL BOLIM', birlik: null, hajm: null },
  { id: 2, otaId: 1, tur: 'bl', kod: 'E1', nom: 'Asl ish', birlik: 'm3', hajm: 10 },
  { id: 5, otaId: null, tur: 'rz', kod: null, nom: 'QOSHILGAN BOLIM', birlik: null, hajm: null },
  { id: 6, otaId: 5, tur: 'bl', kod: null, nom: 'Qoshilgan ish', birlik: 'm2', hajm: 3 },
];
const raw = new Map<number, T2Qator>(SMETA.map((s) => [s.id, { id: s.id, ota_id: s.otaId, tur: s.tur, nom: s.nom, versiya: 4, qoshimcha: s.id >= 5 } as unknown as T2Qator]));
const f2 = (uid: string, nom: string, qator: number): F2Tugun => ({ uid, tur: 'bl', kod: null, nom, birlik: 'm3', hajm: 1, narx: 10, summa: 10,
  manzil: { fayl: 'f', varaq: 'A', qator }, yol: ['X'], bolalar: [], barg: true });
const a = f2('a', 'F2 beton', 2), c = f2('c', 'F2 stяжка', 3);
const rz: F2Tugun = { uid: 'frz', tur: 'rz', kod: null, nom: 'X', birlik: null, hajm: null, narx: null, summa: null,
  manzil: { fayl: 'f', varaq: 'A', qator: 1 }, yol: [], bolalar: [a, c], barg: false };

function chiz() {
  const ij = { bog: new Map([
    ['a', { qatorId: 2, holat: 'qolda', usul: 'qolda' }],
    ['c', { qatorId: 6, holat: 'qolda', usul: 'qolda' }],
  ]), otkaz: new Set() } as unknown as IshJoyi;
  const natija: F2MoslashNatija = { natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 0 } };
  const akt = { fayl: 'f', varaq: 'A', davr: '2026-10', daraxt: [rz], jami: { pryamye: 20, vsego: 20, ranee: null, raznica: null, nds: null },
    qatorlarJami: 20, barglarSoni: 2, ishlarSoni: 2, ogohlantirishlar: [], anatomiya: { review: [] } } as unknown as F2Akt;
  const onIj = vi.fn(); const onOchirishRejali = vi.fn(); const onBolimRejali = vi.fn(() => -7); const onRejaliOchir = vi.fn();
  render(<F2V3Workbench akt={akt} ind={f2Indeks([rz])} natija={natija} S={smetaIndeks(SMETA)} raw={raw} oldingi={new Map()}
    ij={ij} onIj={onIj} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined} zamenaAsl={new Map()} onQoshilganOzgardi={vi.fn()}
    onOchirishRejali={onOchirishRejali} onBolimRejali={onBolimRejali} onRejaliOchir={onRejaliOchir} onRejali={vi.fn()} />);
  return { onIj, onOchirishRejali, onBolimRejali, toolbar: () => within(screen.getByRole('toolbar', { name: 'Belgilangan smeta qatorlari' })) };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('F2 import — smeta tomonda belgilash va bo‘limlar', () => {
  it('Shift bilan oraliq belgilanadi; «Qo‘shilganlarni o‘chirish» faqat siz qo‘shganlarni (ota bilan birga) qoralamaga beradi', () => {
    const { onOchirishRejali, toolbar } = chiz();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Smetada belgilash: ASL BOLIM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Smetada belgilash: Qoshilgan ish' }), { shiftKey: true });
    expect(screen.getByRole('toolbar', { name: 'Belgilangan smeta qatorlari' }).textContent).toContain('4 ta belgilandi:');
    fireEvent.click(toolbar().getByRole('button', { name: /Qo‘shilganlarni o‘chirish/ }));
    // Asl bo'lim (1) va uning ichidagi asl ish (2) o'tkazib yuboriladi; qo'shilgan bo'lim (5) ichidagi ish (6) bilan bitta buyruq.
    expect(onOchirishRejali).toHaveBeenCalledTimes(1);
    expect(onOchirishRejali.mock.calls[0][0]).toMatchObject({ qatorId: 5, versiya: 4, eskiIdlar: [5, 6] });
  });

  it('belgilangan smeta qatorlariga bog‘langan F2 qatorlari bitta amalda uziladi', () => {
    const { onIj, toolbar } = chiz();
    fireEvent.click(screen.getByRole('button', { name: 'Smetada belgilash: QOSHILGAN BOLIM' }));
    fireEvent.click(toolbar().getByRole('button', { name: /F2 bog‘lanishlarini uzish/ }));
    expect(onIj).toHaveBeenCalledTimes(1);
    const next = onIj.mock.calls[0][0] as IshJoyi;
    expect(next.bog.has('c')).toBe(false);
    expect(next.bog.has('a')).toBe(true);
  });

  it('«＋ Bo‘lim» (yuqori daraja) va bo‘lim qatoridagi «Ichki bo‘lim» qoralamaga bo‘lim qo‘shadi; asl bo‘limda o‘chirish tugmasi yo‘q', () => {
    const { onBolimRejali } = chiz();
    vi.spyOn(window, 'prompt').mockReturnValue('КРОВЛЯ');
    fireEvent.click(screen.getByTitle('Smetaning yuqori darajasiga yangi bo‘lim (oxiriga)'));
    expect(onBolimRejali).toHaveBeenLastCalledWith('КРОВЛЯ', null, undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Ichida yangi bo‘lim: ASL BOLIM' }));
    expect(onBolimRejali).toHaveBeenLastCalledWith('КРОВЛЯ', 1, undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Keyin yangi bo‘lim: ASL BOLIM' }));
    expect(onBolimRejali).toHaveBeenLastCalledWith('КРОВЛЯ', null, 1);
    expect(screen.queryByRole('button', { name: 'Bo‘limni o‘chirish: ASL BOLIM' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bo‘limni o‘chirish: QOSHILGAN BOLIM' })).toBeTruthy();
  });
});
