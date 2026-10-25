import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';
import type { F2IshchiQoralama } from '../../lib/f2-ishchi-qoralama';

const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), parse: vi.fn(), match: vi.fn(), create: vi.fn(), tree: vi.fn(), cloudSave: vi.fn(), update: vi.fn(), oqi: vi.fn() }));
vi.mock('../../api/t2-ish-abc', () => ({ ishAbcOchir: vi.fn(), ishAbcSaqla: vi.fn(), resursIshZamena: vi.fn(), abcXato: () => 'xato' }));
vi.mock('../../api/t2-additional-replacement', () => ({ sbT2ResursBolaQosh: vi.fn(), sbT2IshResurslarBilanYarat: vi.fn(), sbT2QoshimchaIshYarat: vi.fn(), sbT2ZamenaIshYarat: vi.fn() }));
vi.mock('../../api/t2-f2-davom', () => ({ f2DavomRoyxatOl: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5 }, yuklanmoqda: false }) }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: null }, setObjectId: vi.fn() }) }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 3, nom: 'Amfiteatr', loyiha_id: 1 }] }),
  sbT2DaraxtOl: m.tree, sbOqi: m.oqi, sbT2AktYaratV2: m.create, sbT2F2QoralamaYangila: m.update, yangiOperationId: () => 'op',
}));
vi.mock('../../api/t2-nakopitelniy', () => ({ t2NakopitelniyToliq: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../api/t2-fayl', () => ({ faylExplorerOl: async () => ({ fayllar: [] }), faylBaytlari: async () => new Uint8Array([1]) }));
vi.mock('../../lib/f2-moslash-v3/fonda', () => ({ f2AktlarniOqiFonda: m.parse, f2MoslashV3Fonda: m.match }));
vi.mock('../../lib/f2-ishchi-qoralama', async (original) => ({ ...(await original<typeof import('../../lib/f2-ishchi-qoralama')>()), f2IshchiOl: m.read, f2IshchiSaqla: m.save, f2ServerSaqla: m.cloudSave, f2ServerSaqlaBardoshli: async (d: unknown, docId: unknown, state: unknown) => ({ state: await m.cloudSave(d, docId, state) }) }));
vi.mock('./F2V3Workbench', () => ({ F2V3Workbench: ({ onIj }: { onIj: (i: F2IshchiQoralama['ij']) => void }) => (
  <button onClick={() => onIj({ bog: new Map([['plus', { qatorId: 7, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() })}>Plusni bog‘lash</button>
) }));
import F2ImportV3 from './F2ImportV3';

const node = (uid: string, hajm: number): F2Tugun => ({ uid, tur: 'mat', nom: 'БЕТОН B20', kod: 'x', birlik: 'м3', hajm, narx: 100, summa: hajm * 100,
  yol: ['Fundament'], bolalar: [], barg: true, manzil: { fayl: 'F2.xlsx', varaq: 'Akt', qator: 1 } });
const act = { fayl: 'F2.xlsx', varaq: 'Akt', davr: '2026-09', davrMatn: 'сентябрь', daraxt: [node('plus', 12)],
  jami: { pryamye: 100 }, qatorlarJami: 100, ishlarSoni: 0, barglarSoni: 1, ogohlantirishlar: [] } as unknown as F2Akt;
const qoralama = { id: 55, raqam: '5', oy: '2026-10-01', holat: 'qoralama', tur: 'f2', versiya: 4, lifecycle_status: 'draft' };

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.read.mockResolvedValue(null); m.save.mockResolvedValue(undefined);
  m.parse.mockResolvedValue([act]);
  m.match.mockResolvedValue({ natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 1 } });
  m.tree.mockResolvedValue({ ok: true, qatorlar: [{ id: 7, ota_id: null, tur: 'mat', nom: 'БЕТОН B20', kod: 'x', birlik: 'м3', hajm: 20, narx: 100 }] });
  m.cloudSave.mockImplementation(async (d: F2IshchiQoralama) => { d.server = { jobId: 11, versiya: 1, rows: new Map([['plus', 1]]) }; return d.server; });
  m.oqi.mockImplementation(async (s: { jadval: string; filtr: string }) => {
    if (s.jadval === 't2_akt_qator') return { ok: true, qatorlar: [{ akt_id: 55, qator_id: 7, hajm: 12, certified_quantity: 12, raw_snapshot: { source: 'native_f2_preparation' } }] };
    if (s.jadval === 't2_akt') return { ok: true, qatorlar: [qoralama] }; // ham akt sarlavhasi, ham takror tekshiruvi
    return { ok: true, qatorlar: [] };
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.history.pushState({}, '', '/admin/f2?obyekt=3&akt=55');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.pushState({}, '', '/'); });

describe('F2 import: tizimda yasalgan qoralamani fayldan yangilash (?akt=ID, manba hujjatsiz)', () => {
  it('xato o‘rniga fayl tanlash rejimi; davr/raqam aktniki; yozish yangi akt yaratmaydi - sbT2F2QoralamaYangila', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, document_id: 61 }), { status: 200 })));
    render(<F2ImportV3 />);
    await screen.findByText(/Mavjud F2 qoralamani fayldan yangilash/);
    expect(screen.queryByText(/manba hujjati yozilmagan/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Tizimda tahrirlash (F2 tayyorlash)' }).getAttribute('href')).toBe('/admin/f2-tayyorlash?obyekt=3&akt=55');
    fireEvent.change(screen.getByLabelText('F2 fayl (XLSX)'), { target: { files: [new File(['yangi'], 'F2.xlsx')] } });
    const raqam = await screen.findByLabelText('F2 raqami (akt №)') as HTMLInputElement;
    await waitFor(() => expect(raqam.value).toBe('5'));
    expect(raqam.disabled).toBe(true);
    fireEvent.click(await screen.findByText('Plusni bog‘lash'));
    await screen.findByText('Ha, qoralama #55 qatorlarini shu fayl bilan almashtirish');
    const yoz = await screen.findByRole('button', { name: /F2 ni yozish/ }) as HTMLButtonElement;
    await waitFor(() => expect(yoz.disabled).toBe(false));
    m.update.mockResolvedValue({ ok: true, akt_id: 55 });
    fireEvent.click(yoz);
    await screen.findByText(/F2 qoralamasi yangilandi \(akt #55/);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update.mock.calls[0][0]).toMatchObject({ kompaniyaId: 5, aktId: 55, kutilganVersiya: 4, qatorlar: [{ qatorId: 7, certifiedQuantity: 12 }] });
  });

  it('tasdiqlangan akt - fayl bilan yangilab bo‘lmaydi (taqiq xabari, fayl tanlash rejimi yo‘q)', async () => {
    m.oqi.mockImplementation(async (s: { jadval: string }) => s.jadval === 't2_akt_qator'
      ? { ok: true, qatorlar: [{ akt_id: 55, qator_id: 7, hajm: 12, raw_snapshot: null }] }
      : { ok: true, qatorlar: [{ ...qoralama, holat: 'tasdiqlangan', lifecycle_status: 'approved' }] });
    render(<F2ImportV3 />);
    await screen.findByText(/Tasdiqlangan yoki yuborilgan F2 ni fayl bilan yangilab bo‘lmaydi/);
    expect(screen.queryByText(/Mavjud F2 qoralamani fayldan yangilash/)).toBeNull();
  });
});
