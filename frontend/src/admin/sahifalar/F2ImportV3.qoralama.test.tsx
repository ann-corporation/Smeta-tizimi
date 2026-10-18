import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';
import type { F2IshchiQoralama } from '../../lib/f2-ishchi-qoralama';

const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), parse: vi.fn(), match: vi.fn(), create: vi.fn(), tree: vi.fn(), cloudSave: vi.fn(), cloudRead: vi.fn(), preflight: vi.fn() }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5 }, yuklanmoqda: false }) }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: null }, setObjectId: vi.fn() }) }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 3, nom: 'Amfiteatr', loyiha_id: 1 }] }),
  sbT2DaraxtOl: m.tree, sbOqi: (s: {jadval: string}) => s.jadval === 't2_akt' ? m.preflight(s) : Promise.resolve({ ok: true, qatorlar: [] }), sbT2AktYaratV2: m.create, yangiOperationId: () => 'op',
}));
vi.mock('../../api/t2-nakopitelniy', () => ({ t2NakopitelniyToliq: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../api/t2-fayl', () => ({ faylExplorerOl: async () => ({ fayllar: [] }), faylBaytlari: async () => new Uint8Array([1]) }));
vi.mock('../../lib/f2-moslash-v3/fonda', () => ({ f2AktlarniOqiFonda: m.parse, f2MoslashV3Fonda: m.match }));
vi.mock('../../lib/f2-ishchi-qoralama', async (original) => ({ ...(await original<typeof import('../../lib/f2-ishchi-qoralama')>()), f2IshchiOl: m.read, f2IshchiSaqla: m.save, f2ServerSaqla: m.cloudSave, f2ServerOl: m.cloudRead }));
vi.mock('./F2V3Workbench', () => ({ F2V3Workbench: ({ ij, onIj }: { ij: F2IshchiQoralama['ij']; onIj: (i: F2IshchiQoralama['ij']) => void }) => (
  <div><span>Qo‘lda bog‘lanish: {ij.bog.get('plus')?.qatorId ?? 'yo‘q'}</span>
    <button onClick={() => onIj({ bog: new Map([['plus', { qatorId: 7, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() })}>Plusni bog‘lash</button>
  </div>
) }));
import F2ImportV3 from './F2ImportV3';

const node = (uid: string, hajm: number): F2Tugun => ({ uid, tur: 'mat', nom: 'БЕТОН B20', kod: 'x', birlik: 'м3', hajm, narx: 100, summa: hajm * 100,
  yol: ['Fundament'], bolalar: [], barg: true, manzil: { fayl: 'F2.xlsx', varaq: 'Akt', qator: 1 } });
const act = { fayl: 'F2.xlsx', varaq: 'Akt', davr: '2026-10', davrMatn: 'октябрь', daraxt: [node('minus', -10), node('plus', 12)],
  jami: { pryamye: 200 }, qatorlarJami: 200, ishlarSoni: 0, barglarSoni: 2, ogohlantirishlar: [] } as unknown as F2Akt;
let saved: F2IshchiQoralama | null;
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset()); saved = null;
  m.read.mockImplementation(async () => saved); m.save.mockImplementation(async (d: F2IshchiQoralama) => { saved = d; });
  m.parse.mockResolvedValue([act]);
  m.preflight.mockResolvedValue({ok:true,qatorlar:[]});
  m.match.mockResolvedValue({ natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: 2 } });
  m.tree.mockResolvedValue({ ok: true, qatorlar: [{ id: 7, ota_id: null, tur: 'mat', nom: 'БЕТОН B20', kod: 'x', birlik: 'м3', hajm: 20, narx: 100 }] });
});
afterEach(cleanup);
async function start() {
  render(<F2ImportV3 />);
  fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('F2 fayl (XLSX)'), { target: { files: [new File(['original'], 'F2.xlsx')] } });
  fireEvent.click(await screen.findByText('Plusni bog‘lash'));
}
describe('F2 independent working draft', () => {
  it('warns before matching when the object/month already has an F2 and never creates a duplicate', async () => {
    m.preflight.mockResolvedValue({ok:true,qatorlar:[{id:99,oy:'2026-10-01',raqam:null,holat:'tasdiqlangan',lifecycle_status:'approved'}]});
    await start();
    await screen.findByText('Bu obyekt va davr uchun F2 avval kiritilgan. Qayta bog‘lash shart emas.');
    expect(screen.getByRole('link',{name:'Mavjud F2 tarixini boshqa oynada ochish'}).getAttribute('target')).toBe('_blank');
    const button=screen.getByRole('button',{name:'Mos qatorlarni bog‘lash'}) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button);
    expect((screen.getByRole('button',{name:/F2 qoralama aktini saqlash/}) as HTMLButtonElement).disabled).toBe(true);
    expect(m.match).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
    expect(screen.getByText('Qo‘lda bog‘lanish: 7')).toBeTruthy();
  });

  it('does not report no duplicate on a failed check, and supports retry without resetting decisions', async () => {
    m.preflight.mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true,qatorlar:[]});
    await start();
    await screen.findByText(/Avvalgi F2 tekshirilmadi/);
    expect((screen.getByRole('button',{name:/F2 qoralama aktini saqlash/}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Qayta tekshirish'}));
    await waitFor(()=>expect((screen.getByRole('button',{name:'Mos qatorlarni bog‘lash'}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText('Qo‘lda bog‘lanish: 7')).toBeTruthy();
    expect(m.match).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });

  it('selection never links; explicit button preserves manual decisions', async () => {
    await start();
    expect(m.match).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mos qatorlarni bog‘lash' }));
    await waitFor(() => expect(m.match).toHaveBeenCalledTimes(1));
    expect(m.match.mock.calls[0][2].ishBog.get('plus')).toBe(7);
    expect(await screen.findByText('Qo‘lda bog‘lanish: 7')).toBeTruthy();
    expect(m.create).not.toHaveBeenCalled();
  });

  async function restored() {
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Ish holatini saqlash (davom ettirish uchun)' }));
    await screen.findByText(/Ish holati shu brauzerda saqlandi/);
    saved!.source.documentId = 42;
    cleanup(); render(<F2ImportV3 />);
    fireEvent.click(await screen.findByRole('button', { name: /Saqlangan ishni davom ettirish/ }));
    await screen.findByText('Qo‘lda bog‘lanish: 7');
    await waitFor(()=>expect((screen.getByRole('button',{name:/F2 qoralama aktini saqlash/}) as HTMLButtonElement).disabled).toBe(false));
    m.cloudSave.mockImplementation(async (d: F2IshchiQoralama) => { d.server = { jobId: 11, versiya: 3, rows: new Map([['minus', 1], ['plus', 1]]) }; return d.server; });
  }

  it('saves a real draft act with confirmed positives while preserving unresolved negatives on server', async () => {
    await restored();
    m.create.mockResolvedValue({ ok: true, akt_id: 99 });
    fireEvent.click(screen.getByRole('button', { name: /F2 qoralama aktini saqlash/ }));
    await screen.findByText(/F2 qoralamasi saqlandi \(akt #99, 1 qator\)/);
    expect(m.cloudSave).toHaveBeenCalledTimes(1);
    const draft = m.cloudSave.mock.calls[0][0] as F2IshchiQoralama;
    expect(draft.ij.otkaz.size).toBe(0); expect(draft.aktlar[0].daraxt[0].hajm).toBe(-10);
    expect(m.create.mock.calls[0][0]).toMatchObject({ obyektId: 3, oy: '2026-10-01', qatorlar: [{
      qatorId: 7, certifiedQuantity: 12, certifiedUnitPrice: 100, certifiedAmount: 1200,
      rawSnapshot: { import_job_id: 11, partial: true, unresolved_count: 1, hujjat_id: 42 },
    }] });
    expect(m.cloudSave.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
    await screen.findByText(/1 ta bog‘lanmagan yoki tasdiqlanmagan qator aktga kiritilmadi/);
  });

  it('explains an existing act conflict, preserves decisions and opens history without abandoning the working tab', async () => {
    await restored();
    m.create.mockResolvedValue({ok:false,code:'F2_ACT_NUMBER_CONFLICT'});
    fireEvent.click(screen.getByRole('button', { name: /F2 qoralama aktini saqlash/ }));
    await screen.findByText(/bu raqamdagi F2 allaqachon mavjud/);
    const link=screen.getByRole('link',{name:'Mavjud F2 tarixini boshqa oynada ochish'});
    expect(link.getAttribute('href')).toBe('/admin/f2-tarix?obyekt=3');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(saved!.ij.bog.get('plus')?.qatorId).toBe(7);
    expect(screen.queryByText(/F2 qoralamasi saqlandi \(akt/)).toBeNull();
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it('does not write an act or claim success if the complete working backup fails', async () => {
    await restored();
    m.cloudSave.mockRejectedValue(new Error('STALE_DRAFT_VERSION'));
    fireEvent.click(screen.getByRole('button', { name: /F2 qoralama aktini saqlash/ }));
    await screen.findByText('STALE_DRAFT_VERSION');
    expect(m.create).not.toHaveBeenCalled();
    expect(screen.queryByText(/F2 qoralamasi saqlandi/)).toBeNull();
    expect(saved!.ij.bog.get('plus')?.qatorId).toBe(7);
  });

  it('saves unresolved minus, original file and manual links; remount restores without parsing/resetting decisions', async () => {
    await start();
    await waitFor(()=>expect((screen.getByRole('button', { name: /F2 qoralama aktini saqlash/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Ish holatini saqlash (davom ettirish uchun)' }));
    await screen.findByText(/Ish holati shu brauzerda saqlandi/);
    expect(saved!.ij.bog.get('plus')?.qatorId).toBe(7);
    expect(saved!.aktlar[0].daraxt[0].hajm).toBe(-10);
    expect(saved!.source.blob.size).toBe(8);
    expect(m.create).not.toHaveBeenCalled();
    cleanup(); render(<F2ImportV3 />);
    fireEvent.click(await screen.findByRole('button', { name: /Saqlangan ishni davom ettirish/ }));
    await screen.findByText('Qo‘lda bog‘lanish: 7');
    await waitFor(() => expect((screen.getByRole('button', { name: /F2 qoralama aktini saqlash/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(m.parse).toHaveBeenCalledTimes(1); expect(m.match).not.toHaveBeenCalled();
    expect(m.tree).toHaveBeenCalledTimes(2);
  });

  it('shows persistence failure and does not claim success or create an act', async () => {
    m.save.mockRejectedValue(new Error('disk quota exceeded'));
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Ish holatini saqlash (davom ettirish uchun)' }));
    await screen.findByText(/disk quota exceeded/);
    expect(screen.queryByText(/Ish holati shu brauzerda saqlandi/)).toBeNull();
    expect(m.create).not.toHaveBeenCalled();
  });

  it('F2 draft button saves unresolved negatives on server; another browser resumes all manual decisions', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Ish holatini saqlash (davom ettirish uchun)' }));
    await screen.findByText(/Ish holati shu brauzerda saqlandi/);
    saved!.source.documentId = 42;
    cleanup(); render(<F2ImportV3 />);
    fireEvent.click(await screen.findByRole('button', { name: /Saqlangan ishni davom ettirish/ }));
    await screen.findByText('Qo‘lda bog‘lanish: 7');
    m.cloudSave.mockImplementation(async (d: F2IshchiQoralama) => { d.server = { jobId: 11, versiya: 3, rows: new Map([['minus', 1], ['plus', 1]]) }; return d.server; });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Server ish holatini saqlash' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Server ish holatini saqlash' }));
    await screen.findByText(/F2 ish qoralamasi serverda saqlandi: #11/);
    const d = m.cloudSave.mock.calls[0][0] as F2IshchiQoralama;
    expect(d.aktlar[0].daraxt[0].hajm).toBe(-10); expect(d.ij.bog.has('minus')).toBe(false);
    expect(m.cloudSave.mock.calls[0][1]).toBe(42); expect(m.create).not.toHaveBeenCalled();
    cleanup(); saved = null; // Another browser has no local draft.
    m.cloudRead.mockResolvedValue({ objectId: 3, cursor: { sourceDocumentId: 42, actIdx: 0, month: '2026-10', file: 'F2.xlsx',
      sourceOperationId: 'op', writeOperationId: 'op', rzBog: [] }, ij: d.ij, state: d.server,
      sourceRows: act.daraxt.map((n) => ({ uid: n.uid, hajm: n.hajm, narx: n.narx, summa: n.summa })) });
    render(<F2ImportV3 />);
    fireEvent.change(await screen.findByLabelText('Server qoralamasi raqami'), { target: { value: '11' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Obyekt' }).textContent).toContain('Amfiteatr'));
    fireEvent.click(screen.getByRole('button', { name: 'Serverdagi qoralamani davom ettirish' }));
    await screen.findByText('Qo‘lda bog‘lanish: 7');
    await waitFor(()=>expect((screen.getByRole('button', { name: /F2 qoralama aktini saqlash/ }) as HTMLButtonElement).disabled).toBe(false));
  });
});
