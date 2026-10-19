import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';
import { f2Indeks, smetaIndeks, type IshJoyi } from '../../lib/f2-moslash-v3/ishJoyi';
import type { F2MoslashNatija, SmetaQator } from '../../lib/f2-moslash-v3';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';

const m = vi.hoisted(() => ({ ochir: vi.fn() }));
vi.mock('../../api/t2-ish-abc', async () => ({
  ...(await vi.importActual<typeof import('../../api/t2-ish-abc')>('../../api/t2-ish-abc')),
  ishAbcOchir: m.ochir,
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 40,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 40, size: 40, key: index })),
    measureElement: () => undefined, scrollToIndex: () => undefined,
  }),
}));

const { F2V3Workbench } = await import('./F2V3Workbench');

// Smeta: 2 — asl (o'rniga zamena kiritilgan), 3 — qo'shimcha ish (foydalanuvchi), 4 — zamena (2 o'rniga), 5 — asl.
const SMETA: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'KONSTRUKSIYA', birlik: null, hajm: null },
  { id: 2, otaId: 1, tur: 'bl', kod: 'E1', nom: 'Beton B25', birlik: 'm3', hajm: 10 },
  { id: 3, otaId: 1, tur: 'bl', kod: 'E2', nom: 'Qazib olish (karyer)', birlik: 'm3', hajm: 5 },
  { id: 4, otaId: 1, tur: 'bl', kod: 'E3', nom: 'Beton B30', birlik: 'm3', hajm: 10 },
  { id: 5, otaId: 1, tur: 'bl', kod: 'E4', nom: 'Armatura', birlik: 't', hajm: 1 },
];
const raw = new Map<number, T2Qator>(SMETA.map((s) => [s.id, {
  id: s.id, ota_id: s.otaId, tur: s.tur, kod: s.kod, nom: s.nom, birlik: s.birlik, hajm: s.hajm, versiya: 1,
  qoshimcha: s.id === 3 || s.id === 4, zamena: s.id === 4, kat: null, narx_usul: null, norma: null, narx: null,
} as unknown as T2Qator]));

function f2(uid: string, nom: string): F2Tugun {
  return { uid, tur: 'bl', kod: null, nom, birlik: 'm3', hajm: 1, narx: 10, summa: 10, manzil: { fayl: 'f', varaq: 'A', qator: 2 }, yol: ['KONSTRUKSIYA'], bolalar: [], barg: true };
}
const fq = f2('fq', 'Qazib olish');
const rz: F2Tugun = { uid: 'frz', tur: 'rz', kod: null, nom: 'KONSTRUKSIYA', birlik: null, hajm: null, narx: null, summa: null, manzil: { fayl: 'f', varaq: 'A', qator: 1 }, yol: [], bolalar: [fq], barg: false };

function chiz(onQoshilganOzgardi = vi.fn(async () => undefined)) {
  const ij: IshJoyi = { bog: new Map([['fq', { qatorId: 3, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() };
  const natija: F2MoslashNatija = { natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 0 } };
  const akt = { fayl: 'f', varaq: 'A', davr: '2026-10', daraxt: [rz], jami: { pryamye: 10, vsego: 10, ranee: null, raznica: null, nds: null }, qatorlarJami: 10, barglarSoni: 1, ishlarSoni: 1, ogohlantirishlar: [], anatomiya: { review: [] } } as unknown as F2Akt;
  render(<F2V3Workbench akt={akt} ind={f2Indeks([rz])} natija={natija} S={smetaIndeks(SMETA)} raw={raw} oldingi={new Map()}
    ij={ij} onIj={vi.fn()} onRzBog={vi.fn()} companyId={1} objectId={7} onYaratildi={async () => undefined}
    zamenaAsl={new Map([[4, 2]])} onQoshilganOzgardi={onQoshilganOzgardi} />);
  return { onQoshilganOzgardi };
}
const qator = (id: number) => document.querySelector(`[data-sid="${id}"]`) as HTMLElement;

afterEach(() => { cleanup(); m.ochir.mockReset(); vi.restoreAllMocks(); });

describe('F2 import — siz qo‘shgan qatorlar boshqariladi, smeta qatorlari o‘zgarmas', () => {
  it('har qator manbasi rangi bilan: asl, qo‘shimcha, zamena, almashtirilgan; rang izohi ko‘rinadi', () => {
    chiz();
    expect(qator(5).dataset.qatorTuri).toBe('asl');
    expect(qator(3).dataset.qatorTuri).toBe('qoshimcha');
    expect(qator(4).dataset.qatorTuri).toBe('zamena');
    expect(qator(2).dataset.qatorTuri).toBe('almashtirilgan');
    expect(qator(3).className).toMatch(/border-l-emerald-500/);
    expect(qator(4).className).toMatch(/border-l-amber-500/);
    expect(qator(2).className).toMatch(/border-l-rose-500/);
    expect(screen.getByLabelText('Qator ranglari izohi').textContent).toMatch(/Smetadan — o‘zgarmas/);
  });

  it('tahrirlash/o‘chirish faqat siz qo‘shgan qatorlarda; smeta qatorida yo‘q', () => {
    chiz();
    expect(screen.getByRole('button', { name: 'O‘chirish: Qazib olish (karyer)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tahrirlash: Beton B30' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'O‘chirish: Beton B25' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'O‘chirish: Armatura' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tahrirlash: Armatura' })).toBeNull();
  });

  it('o‘chirish: tasdiqdan keyin server chaqiriladi, sahifaga qator va uning bolalari id lari beriladi', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('xato qo‘shilgan');
    m.ochir.mockResolvedValue({ ok: true, ochirildi: 1 });
    const { onQoshilganOzgardi } = chiz();
    fireEvent.click(screen.getByRole('button', { name: 'O‘chirish: Qazib olish (karyer)' }));
    await waitFor(() => expect(onQoshilganOzgardi).toHaveBeenCalledWith([3], null));
    expect(m.ochir).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 1, obyektId: 7, qatorId: 3, sabab: 'xato qo‘shilgan' }));
  });

  it('bekor qilinsa (prompt Cancel) — hech narsa o‘chmaydi; server rad etsa — sahifa yangilanmaydi, sabab ko‘rinadi', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce('');
    m.ochir.mockResolvedValue({ ok: false, code: 'F2_DA', xabar: '1 ta qator F2 aktida — avval F2 ni bekor qiling.' });
    const { onQoshilganOzgardi } = chiz();
    fireEvent.click(screen.getByRole('button', { name: 'O‘chirish: Qazib olish (karyer)' }));
    expect(m.ochir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'O‘chirish: Qazib olish (karyer)' }));
    await waitFor(() => expect(m.ochir).toHaveBeenCalled());
    expect(await screen.findByText(/F2 aktida/)).toBeTruthy();
    expect(onQoshilganOzgardi).not.toHaveBeenCalled();
  });
  it('rapid repeat cancellation cannot create concurrent writes', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('xato');
    let finish!: (v: {ok:boolean;ochirildi:number}) => void;
    m.ochir.mockImplementation(()=>new Promise((resolve)=>{finish=resolve;}));
    const {onQoshilganOzgardi}=chiz();
    const button=screen.getByRole('button',{name:'O‘chirish: Qazib olish (karyer)'});
    fireEvent.click(button); fireEvent.click(button);
    expect(m.ochir).toHaveBeenCalledTimes(1);
    finish({ok:true,ochirildi:1});
    await waitFor(()=>expect(onQoshilganOzgardi).toHaveBeenCalledTimes(1));
  });
  it('network retry preserves the exact cancellation operation ID', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('xato');
    m.ochir.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ok:true,ochirildi:1});
    const {onQoshilganOzgardi}=chiz();
    const name='O‘chirish: Qazib olish (karyer)';
    fireEvent.click(screen.getByRole('button',{name}));
    await screen.findByText('Javob olinmadi. Bog‘lanishlar saqlangan — qayta urinib ko‘ring.');
    expect(onQoshilganOzgardi).not.toHaveBeenCalled();
    const first=m.ochir.mock.calls[0][0].operationId;
    expect(first).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name}));
    await waitFor(()=>expect(onQoshilganOzgardi).toHaveBeenCalledTimes(1));
    expect(m.ochir.mock.calls[1][0].operationId).toBe(first);
  });

});
