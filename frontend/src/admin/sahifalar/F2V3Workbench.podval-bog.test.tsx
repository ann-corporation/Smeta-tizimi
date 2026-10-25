/** Egasi 2026-10-25 (Sun'iy ko'l): podval qatorlari (bojxona, shef-montaj) smetadagi siz qo'shgan qatorlarga bog'lanmayotgan edi —
 *  smeta tomondagi «Bog'lash» «Bu resursni o'zingiz qo'shgansiz» deb rad etardi. Endi: to'g'ridan-to'g'ri bog'lanadi; takror bo'lsa
 *  «Faqat izoh» (aktga kirmaydi). */
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

const SMETA: SmetaQator[] = [
  { id: 950874, otaId: null, tur: 'rz', kod: null, nom: '17. ОБОРУДОВАНИЕ MAGIC FUN', birlik: null, hajm: null },
  { id: 950885, otaId: 950874, tur: 'ob', kod: null, nom: 'Шефмонтажные работы', birlik: 'компл', hajm: 1 },
  { id: 950888, otaId: 950874, tur: 'ob', kod: null, nom: 'Таможенные расходы (НДС 12%)', birlik: 'компл', hajm: 1 },
];
const raw = new Map<number, T2Qator>(SMETA.map((s) => [s.id, { id: s.id, ota_id: s.otaId, tur: s.tur, nom: s.nom, versiya: 1, qoshimcha: s.tur !== 'rz' } as unknown as T2Qator]));
const pq = (uid: string, nom: string, summa: number, qator: number): F2Tugun => ({ uid, tur: 'bl', kod: null, nom, birlik: 'КОМПЛ', hajm: 1, narx: summa, summa,
  manzil: { fayl: 'f', varaq: 'A', qator }, yol: ['ПОДВАЛ АКТА (ДОПОЛНИТЕЛЬНЫЕ СТРОКИ)'], bolalar: [], barg: true, podval: true });
const shefAsosiy: F2Tugun = { uid: 'sh', tur: 'bl', kod: null, nom: 'Шефмонтажные работы', birlik: 'компл', hajm: 0.5, narx: 4_009_740_240, summa: 2_004_870_120,
  manzil: { fayl: 'f', varaq: 'A', qator: 2 }, yol: ['ОБОРУДОВАНИЕ'], bolalar: [], barg: true };
const rzA: F2Tugun = { uid: 'rzA', tur: 'rz', kod: null, nom: 'ОБОРУДОВАНИЕ', birlik: null, hajm: null, narx: null, summa: null, manzil: { fayl: 'f', varaq: 'A', qator: 1 }, yol: [], bolalar: [shefAsosiy], barg: false };
const shef = pq('p1', 'ШЕФ-МОНТАЖНАЯ РАБОТА', 2_004_870_120, 10);
const bojxona = pq('p2', 'ТАМОЖЕННЫЕ РАСХОДЫ И НДС ДЛЯ ОБОРУДОВАНИЕ', 4_046_929_242.85, 11);
const rzP: F2Tugun = { uid: 'A!podval', tur: 'rz', kod: null, nom: 'ПОДВАЛ АКТА (ДОПОЛНИТЕЛЬНЫЕ СТРОКИ)', birlik: null, hajm: null, narx: null, summa: null,
  manzil: { fayl: 'f', varaq: 'A', qator: 10 }, yol: [], bolalar: [shef, bojxona], barg: false, podval: true };

function chiz(ij: IshJoyi) {
  const natija = { natijalar: new Map(), rzDiag: [{ f2Uid: 'rzA', smetaRzIdlar: [950874], ok: true }], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 0 } } as unknown as F2MoslashNatija;
  const akt = { fayl: 'f', varaq: 'A', davr: '2026-10', daraxt: [rzA, rzP], jami: { pryamye: 1, vsego: 1, ranee: null, raznica: null, nds: null },
    qatorlarJami: 1, barglarSoni: 3, ishlarSoni: 3, ogohlantirishlar: [], anatomiya: { review: [] } } as unknown as F2Akt;
  const onIj = vi.fn();
  render(<F2V3Workbench akt={akt} ind={f2Indeks([rzA, rzP])} natija={natija} S={smetaIndeks(SMETA)} raw={raw} oldingi={new Map()}
    ij={ij} onIj={onIj} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined} zamenaAsl={new Map()}
    onQoshilganOzgardi={vi.fn()} onRejali={vi.fn()} />);
  return { onIj };
}
afterEach(cleanup);

describe('F2 import — podval qatorlari smeta qatoriga to‘g‘ridan-to‘g‘ri bog‘lanadi', () => {
  it('bo‘lim yozuvi bo‘limga majburlamaydi; smeta tomondagi «Bog‘lash» siz qo‘shgan qatorga bog‘laydi', () => {
    const { onIj } = chiz({ bog: new Map([['sh', { qatorId: 950885, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() } as unknown as IshJoyi);
    expect(screen.queryByText('bo‘lim ulanmagan — mos smeta bo‘limiga torting')).toBeNull();
    fireEvent.click(screen.getByText(bojxona.nom)); // F2 qatorini tanlash
    const bogTugmalar = screen.getAllByRole('button', { name: /Bog‘lash$/ });
    // Smeta tomondagi har qatorda «Bog'lash»: tartib — 950874 (rz), 950885, 950888.
    fireEvent.click(bogTugmalar[bogTugmalar.length - 1]);
    expect(onIj).toHaveBeenCalledTimes(1);
    expect((onIj.mock.calls[0][0] as IshJoyi).bog.get('p2')?.qatorId).toBe(950888);
  });

  it('takror (shef-montaj asosiy qismda olingan) — ogohlantirish va «Faqat izoh» aktdan chiqaradi', () => {
    const { onIj } = chiz({ bog: new Map([['sh', { qatorId: 950885, holat: 'qolda', usul: 'qolda' }], ['p1', { qatorId: 950885, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() } as unknown as IshJoyi);
    expect(screen.getByText(/Takror: bu smeta qatori aktning asosiy qismida ham olingan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Faqat izoh: ${shef.nom}` }));
    const next = onIj.mock.calls[0][0] as IshJoyi;
    expect(next.otkaz.has('p1')).toBe(true);
    expect(next.bog.has('p1')).toBe(false);
    expect(next.bog.get('sh')?.qatorId).toBe(950885);
  });
});
