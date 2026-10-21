import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

/* Egasi 2026-10-21: «F2 da ПК dan ПБ ga o'zgargan materialni zamena qilmoqchi edim, lekin resurs o'rniga ishni
 * (karyerdan) qilib yubordi». F2 dagi resurssiz «ish» qatori smeta resursiga tashlansa — material bog'lash/zamenasi. */
const SMETA: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'ПЕРЕКРЫТИЯ', birlik: null, hajm: null },
  { id: 2, otaId: 1, tur: 'mat', kod: null, nom: 'ПЛИТА ПК-8-59-10', birlik: 'шт', hajm: 12 },
];
const raw = new Map<number, T2Qator>(SMETA.map((s) => [s.id, { id: s.id, ota_id: s.otaId, tur: s.tur, nom: s.nom, versiya: 1 } as unknown as T2Qator]));
const pb: F2Tugun = { uid: 'pb', tur: 'bl', kod: 'С101', nom: 'ПЛИТА ПЕРЕКРЫТИЯ ПБ-8-59-10', birlik: 'шт', hajm: 12, narx: 10, summa: 120,
  manzil: { fayl: 'f', varaq: 'A', qator: 2 }, yol: ['X'], bolalar: [], barg: true };
const rz: F2Tugun = { uid: 'frz', tur: 'rz', kod: null, nom: 'X', birlik: null, hajm: null, narx: null, summa: null,
  manzil: { fayl: 'f', varaq: 'A', qator: 1 }, yol: [], bolalar: [pb], barg: false };

afterEach(cleanup);

describe('F2 import — material zamenasi (resurssiz ish → smeta resursi)', () => {
  it('«resurs o‘rniga ish» emas: bog‘lash va «Zamena material» taklif qilinadi', () => {
    const ij = { bog: new Map(), otkaz: new Set() } as unknown as IshJoyi;
    const natija: F2MoslashNatija = { natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 1 } };
    const akt = { fayl: 'f', varaq: 'A', davr: '2026-10', daraxt: [rz], jami: { pryamye: 120, vsego: 120, ranee: null, raznica: null, nds: null },
      qatorlarJami: 120, barglarSoni: 1, ishlarSoni: 1, ogohlantirishlar: [], anatomiya: { review: [] } } as unknown as F2Akt;
    render(<F2V3Workbench akt={akt} ind={f2Indeks([rz])} natija={natija} S={smetaIndeks(SMETA)} raw={raw} oldingi={new Map()}
      ij={ij} onIj={vi.fn()} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined} zamenaAsl={new Map()} onRejali={vi.fn()} />);
    fireEvent.click(screen.getByText('ПЛИТА ПЕРЕКРЫТИЯ ПБ-8-59-10'));
    fireEvent.click(screen.getByText('ПЛИТА ПК-8-59-10'));
    const oyna = screen.getByRole('dialog', { name: 'Bog‘lash turi' });
    expect(oyna.textContent).toContain('Zamena material');
    expect(oyna.textContent).not.toContain('Shu resurs o‘rniga ish');
  });
});
