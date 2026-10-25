/** Egasi 2026-10-25 (Sun'iy ko'l): ish qo'shimcha qilinganda qo'lda boshqa joyga bog'langan daraxtlar (bola qatorlar)
 *  yangi ish tarkibiga tortib olinmasin — faqat belgilangan va bog'lanmaganlar o'tadi. */
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
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'KO‘KALAMZORLASHTIRISH', birlik: null, hajm: null },
  { id: 2, otaId: 1, tur: 'bl', kod: 'E1', nom: 'Daraxt ekish', birlik: 'dona', hajm: 10 },
  { id: 3, otaId: 2, tur: 'mat', kod: null, nom: 'Eman ko‘chati', birlik: 'dona', hajm: 10 },
  { id: 4, otaId: 2, tur: 'mat', kod: null, nom: 'Zarang ko‘chati', birlik: 'dona', hajm: 5 },
];
const raw = new Map<number, T2Qator>(SMETA.map((s) => [s.id, { id: s.id, ota_id: s.otaId, tur: s.tur, nom: s.nom, versiya: 1 } as unknown as T2Qator]));
const tugun = (uid: string, tur: F2Tugun['tur'], nom: string, birlik: string, hajm: number, qator: number, bolalar: F2Tugun[] = []): F2Tugun => ({
  uid, tur, kod: null, nom, birlik, hajm, narx: 10, summa: 10 * hajm, manzil: { fayl: 'f', varaq: 'A', qator }, yol: ['KO‘KALAMZORLASHTIRISH'], bolalar, barg: !bolalar.length });
const d1 = tugun('d1', 'mat', 'Eman', 'dona', 10, 3);
const d2 = tugun('d2', 'mat', 'Zarang', 'dona', 5, 4);
const mehnat = tugun('m', 'rs', 'Mehnat sarfi', 'ЧЕЛ-Ч', 40, 5);
const ish = tugun('w', 'bl', 'Sun’iy ko‘l qirg‘og‘ini obodonlashtirish', 'm2', 100, 2, [d1, d2, mehnat]);
const rz: F2Tugun = { uid: 'frz', tur: 'rz', kod: null, nom: 'KO‘KALAMZORLASHTIRISH', birlik: null, hajm: null, narx: null, summa: null,
  manzil: { fayl: 'f', varaq: 'A', qator: 1 }, yol: [], bolalar: [ish], barg: false };

function chiz() {
  // Daraxtlar qo'lda smetaning kerakli joylariga bog'langan, ish va mehnat — bog'lanmagan.
  const ij = { bog: new Map([
    ['d1', { qatorId: 3, holat: 'qolda', usul: 'qolda' }],
    ['d2', { qatorId: 4, holat: 'qolda', usul: 'qolda' }],
  ]), otkaz: new Set() } as unknown as IshJoyi;
  const natija = { natijalar: new Map(), rzDiag: [{ f2Uid: 'frz', smetaRzIdlar: [1] }], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 2 } } as unknown as F2MoslashNatija;
  const akt = { fayl: 'f', varaq: 'A', davr: '2026-10', daraxt: [rz], jami: { pryamye: 1550, vsego: 1550, ranee: null, raznica: null, nds: null },
    qatorlarJami: 1550, barglarSoni: 3, ishlarSoni: 1, ogohlantirishlar: [], anatomiya: { review: [] } } as unknown as F2Akt;
  const onRejali = vi.fn(); const onIj = vi.fn();
  render(<F2V3Workbench akt={akt} ind={f2Indeks([rz])} natija={natija} S={smetaIndeks(SMETA)} raw={raw} oldingi={new Map()}
    ij={ij} onIj={onIj} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined} zamenaAsl={new Map()}
    onQoshilganOzgardi={vi.fn()} onRejali={onRejali} />);
  return { onRejali, onIj, tb: () => within(screen.getByRole('toolbar', { name: 'Belgilangan F2 qatorlari' })) };
}
afterEach(cleanup);

describe('F2 import — qo‘shimcha ish bog‘langan bola qatorlarni tortib olmaydi', () => {
  it('ish (resurslari bilan belgilangan) qo‘shimcha bo‘lganda faqat bog‘lanmagan resurs o‘tadi', () => {
    const { onRejali, onIj, tb } = chiz();
    fireEvent.click(screen.getByRole('button', { name: `Belgilash: ${ish.nom}` }));
    fireEvent.click(tb().getByRole('button', { name: /Hammasi qo‘shimcha/ }));
    expect(onRejali).toHaveBeenCalledTimes(1);
    const [f, b] = onRejali.mock.calls[0];
    expect(f.uid).toBe('w');
    expect(f.bolalar.map((r: F2Tugun) => r.uid)).toEqual(['m']);
    expect(b).toMatchObject({ kind: 'additional', tur: 'bl', otaQatorId: 1 });
    expect(b.resurslar.map((r: { nom: string }) => r.nom)).toEqual(['Mehnat sarfi']);
    expect(onIj).not.toHaveBeenCalled(); // daraxtlar bog'lanishiga tegilmaydi
    expect(screen.getByText(/2 ta resurs boshqa smeta qatoriga bog‘langan — bog‘lanishi saqlandi/)).toBeTruthy();
  });

  it('faqat ishning o‘zi belgilangan — faqat ish qo‘shiladi, bog‘lanmagan resurs uchun ko‘rsatma', () => {
    const { onRejali, tb } = chiz();
    fireEvent.click(screen.getByRole('button', { name: `Belgilash: ${ish.nom}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Belgilash: Mehnat sarfi' })); // mehnatni belgidan olish
    fireEvent.click(tb().getByRole('button', { name: /Hammasi qo‘shimcha/ }));
    const [f, b] = onRejali.mock.calls[0];
    expect(f.bolalar).toEqual([]);
    expect(b.resurslar).toEqual([]);
    expect(b.tur).toBe('bl');
    expect(screen.getByText(/1 ta bog‘lanmagan resurs ishga qo‘shilmadi/)).toBeTruthy();
  });
});
