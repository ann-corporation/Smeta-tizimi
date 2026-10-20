import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { F2Akt, F2Tugun } from '../../lib/smeta-anatomiya/f2';
import type { F2IshchiQoralama } from '../../lib/f2-ishchi-qoralama';

const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), parse: vi.fn(), match: vi.fn(), create: vi.fn(), tree: vi.fn(), cloudSave: vi.fn(), cloudRead: vi.fn(), preflight: vi.fn(), correction: vi.fn(), update: vi.fn(), resurs: vi.fn(), ochir: vi.fn() }));
vi.mock('../../api/t2-ish-abc', () => ({ ishAbcOchir: m.ochir, abcXato: () => 'xato' }));
vi.mock('../../api/t2-additional-replacement', () => ({ sbT2ResursBolaQosh: m.resurs, sbT2IshResurslarBilanYarat: vi.fn(), sbT2QoshimchaIshYarat: vi.fn(), sbT2ZamenaIshYarat: vi.fn() }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5 }, yuklanmoqda: false }) }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: null }, setObjectId: vi.fn() }) }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 3, nom: 'Amfiteatr', loyiha_id: 1 }] }),
  sbT2DaraxtOl: m.tree, sbOqi: (s: {jadval: string; ustunlar?: string}) => s.jadval === 't2_akt' ? m.preflight(s) : s.jadval === 't2_qator' && s.ustunlar === 'id,versiya' ? Promise.resolve({ ok: true, qatorlar: [{ id: 7, versiya: 3 }] }) : Promise.resolve({ ok: true, qatorlar: [] }), sbT2AktYaratV2: m.create, sbT2F2QoralamaYangila: m.update, yangiOperationId: () => 'op',
}));
vi.mock('../../api/t2-nakopitelniy', () => ({ t2NakopitelniyToliq: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../api/t2-fayl', () => ({ faylExplorerOl: async () => ({ fayllar: [] }), faylBaytlari: async () => new Uint8Array([1]) }));
vi.mock('../../lib/f2-moslash-v3/fonda', () => ({ f2AktlarniOqiFonda: m.parse, f2MoslashV3Fonda: m.match }));
vi.mock('../../lib/f2-ishchi-qoralama', async (original) => ({ ...(await original<typeof import('../../lib/f2-ishchi-qoralama')>()), f2IshchiOl: m.read, f2IshchiSaqla: m.save, f2ServerSaqla: m.cloudSave, f2ServerCorrectionSaqla: m.correction, f2ServerOl: m.cloudRead }));
vi.mock('./F2V3Workbench', () => ({ F2V3Workbench: ({ ij, onIj, onQoshilganOzgardi, onRejali, onOchirishRejali }: { onOchirishRejali?: (b: unknown) => void; onRejali?: (f: unknown, b: unknown) => void; onQoshilganOzgardi?: (oldIds:number[],newId:number)=>Promise<void>; ij: F2IshchiQoralama['ij']; onIj: (i: F2IshchiQoralama['ij']) => void }) => (
  <div><button onClick={() => onOchirishRejali?.({ qatorId: 7, versiya: 2, eskiIdlar: [7], nom: 'XATO QO‘SHILGAN', sabab: 's' })}>O‘chirishni belgilash</button><button onClick={() => onRejali?.({ uid: 'plus', tur: 'mat', bolalar: [] }, { kind: 'additional', tur: 'mat', otaQatorId: 7, nom: 'QO‘SHIMCHA BETON', birlik: 'м3', hajm: 12, sabab: 'test', resurslar: [], operationId: 'op-r' })}>Rejali qo‘shish</button><button onClick={()=>void onQoshilganOzgardi?.([7],8).catch(()=>undefined)}>Tuzatish natijasini qo‘llash</button><span>Qo‘lda bog‘lanish: {ij.bog.get('plus')?.qatorId ?? 'yo‘q'}</span>
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
  m.correction.mockResolvedValue(undefined);
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
  it('restores a committed correction after tree refresh failure without losing source or other decisions', async () => {
    await start();
    m.tree.mockRejectedValueOnce(new Error('refresh failed'));
    fireEvent.click(screen.getByRole('button',{name:'Tuzatish natijasini qo‘llash'}));
    await screen.findByText('refresh failed');
    expect(saved!.correction).toEqual({oldIds:[7],newId:8});
    expect(saved!.ij.bog.get('plus')?.qatorId).toBe(7);
    expect(saved!.aktlar[0].daraxt[0].hajm).toBe(-10);
    m.tree.mockResolvedValue({ok:true,qatorlar:[{id:8,ota_id:null,tur:'mat',nom:'БЕТОН B20',kod:'x',birlik:'м3',hajm:20,narx:100}]});
    cleanup();render(<F2ImportV3/>);
    fireEvent.click(await screen.findByRole('button',{name:/Saqlangan ishni davom ettirish/}));
    await screen.findByText('Qo‘lda bog‘lanish: 8');
    expect(m.create).not.toHaveBeenCalled(); expect(m.match).not.toHaveBeenCalled();
  });

  it('existing F2 for the object/month warns and blocks only a NEW act save — linking stays available', async () => {
    m.preflight.mockResolvedValue({ok:true,qatorlar:[{id:99,oy:'2026-10-01',raqam:null,holat:'tasdiqlangan',lifecycle_status:'approved'}]});
    await start();
    await screen.findByText('Bu obyekt va oy uchun F2 akt allaqachon bor. Bog‘lashni davom ettirishingiz mumkin — faqat yangi akt saqlanmaydi.');
    expect(screen.getByRole('link',{name:'Mavjud F2 tarixini boshqa oynada ochish'}).getAttribute('target')).toBe('_blank');
    const button=screen.getByRole('button',{name:'Mos qatorlarni bog‘lash'}) as HTMLButtonElement;
    expect(button.disabled).toBe(false); fireEvent.click(button);
    await waitFor(() => expect(m.match).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button',{name:/F2 ni yozish/}) as HTMLButtonElement).disabled).toBe(true);
    expect(m.create).not.toHaveBeenCalled();
    expect(screen.getByText('Qo‘lda bog‘lanish: 7')).toBeTruthy();
  });

  it('does not report no duplicate on a failed check, and supports retry without resetting decisions', async () => {
    m.preflight.mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true,qatorlar:[]});
    await start();
    await screen.findByText(/Avvalgi F2 tekshirilmadi/);
    // Tekshiruv xatosi bog'lashni ham, saqlashni ham qulflamaydi (server unique-cheklovi takrorni baribir rad etadi).
    expect((screen.getByRole('button',{name:'Mos qatorlarni bog‘lash'}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'Qayta tekshirish'}));
    await waitFor(()=>expect((screen.getByRole('button',{name:'Mos qatorlarni bog‘lash'}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText('Qo‘lda bog‘lanish: 7')).toBeTruthy();
    expect(m.match).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });

  it('undo (button and Ctrl+Z) reverts the last local linking decision without any server write', async () => {
    await start();
    expect(screen.getByText('Qo‘lda bog‘lanish: 7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Orqaga [(]1[)]/ }));
    expect(await screen.findByText('Qo‘lda bog‘lanish: yo‘q')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Orqaga/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Plusni bog‘lash'));
    await screen.findByText('Qo‘lda bog‘lanish: 7');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(await screen.findByText('Qo‘lda bog‘lanish: yo‘q')).toBeTruthy();
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
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
    await waitFor(()=>expect((screen.getByRole('button',{name:/F2 ni yozish/}) as HTMLButtonElement).disabled).toBe(false));
    m.cloudSave.mockImplementation(async (d: F2IshchiQoralama) => { d.server = { jobId: 11, versiya: 3, rows: new Map([['minus', 1], ['plus', 1]]) }; return d.server; });
  }

  it('saves a real draft act with confirmed positives while preserving unresolved negatives on server', async () => {
    await restored();
    m.create.mockResolvedValue({ ok: true, akt_id: 99 });
    fireEvent.click(screen.getByRole('button', { name: /F2 ni yozish/ }));
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

  it('an existing DRAFT act for the month is updated in place — no duplicate act, decisions kept', async () => {
    m.preflight.mockResolvedValue({ok:true,qatorlar:[{id:55,oy:'2026-10-01',raqam:null,holat:'qoralama',lifecycle_status:'draft',versiya:4}]});
    await restored();
    await screen.findByText('Bu oy uchun F2 qoralama bor. Bog‘lashni davom ettiring — «Saqlash» shu qoralamani yangilaydi.');
    m.update.mockResolvedValue({ ok: true, akt_id: 55 });
    fireEvent.click(screen.getByRole('button', { name: /F2 ni yozish/ }));
    await screen.findByText(/F2 qoralamasi yangilandi \(akt #55, 1 qator\)/);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update.mock.calls[0][0]).toMatchObject({ kompaniyaId: 5, aktId: 55, kutilganVersiya: 4, qatorlar: [{ qatorId: 7, certifiedQuantity: 12 }] });
  });

  it('qo‘shimcha darhol qoralamaga qo‘shiladi (serverga yozilmaydi); «Saqlash» avval uni, keyin aktni haqiqiy id bilan yozadi', async () => {
    await restored();
    fireEvent.click(screen.getByText('Rejali qo‘shish'));
    await screen.findByText('Qo‘lda bog‘lanish: -1');
    expect(m.resurs).not.toHaveBeenCalled();
    expect(screen.getByText(/1 ta qo‘shimcha\/zamena qoralamada/)).toBeTruthy();
    m.resurs.mockResolvedValue({ ok: true, qator_id: 900 });
    m.create.mockResolvedValue({ ok: true, akt_id: 77 });
    fireEvent.click(screen.getByRole('button', { name: /F2 ni yozish/ }));
    await screen.findByText(/F2 qoralamasi saqlandi \(akt #77/);
    expect(m.resurs).toHaveBeenCalledTimes(1);
    expect(m.resurs.mock.calls[0][0]).toMatchObject({ otaQatorId: 7, expectedVersion: 3, tur: 'mat', operationId: 'op-r' });
    expect(m.create.mock.calls[0][0].qatorlar[0]).toMatchObject({ qatorId: 900, certifiedQuantity: 12 });
    expect(m.resurs.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
  });

  it('qo‘shilgan qatorni o‘chirish qoralamaga tushadi: serverga darhol yozilmaydi, F2 bog‘lanishi bo‘shaydi, bekor qilinadi', async () => {
    await restored();
    fireEvent.click(screen.getByText('O‘chirishni belgilash'));
    await screen.findByText('Qo‘lda bog‘lanish: yo‘q');
    expect(m.ochir).not.toHaveBeenCalled();
    expect(screen.getByText(/1 ta qator o‘chirishga belgilangan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    expect(screen.queryByText(/o‘chirishga belgilangan/)).toBeNull();
  });

  it('an existing APPROVED act still blocks saving a new act', async () => {
    m.preflight.mockResolvedValue({ok:true,qatorlar:[{id:56,oy:'2026-10-01',raqam:null,holat:'tasdiqlangan',lifecycle_status:'approved',versiya:9}]});
    await start();
    await screen.findByText('Bu obyekt va oy uchun F2 akt allaqachon bor. Bog‘lashni davom ettirishingiz mumkin — faqat yangi akt saqlanmaydi.');
    expect((screen.getByRole('button',{name:/F2 ni yozish/}) as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains an existing act conflict, preserves decisions and opens history without abandoning the working tab', async () => {
    await restored();
    m.create.mockResolvedValue({ok:false,code:'F2_ACT_NUMBER_CONFLICT'});
    fireEvent.click(screen.getByRole('button', { name: /F2 ni yozish/ }));
    expect((await screen.findAllByText(/bu raqamdagi F2 allaqachon mavjud/)).length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole('button', { name: /F2 ni yozish/ }));
    await screen.findByText('STALE_DRAFT_VERSION');
    expect(m.create).not.toHaveBeenCalled();
    expect(screen.queryByText(/F2 qoralamasi saqlandi/)).toBeNull();
    expect(saved!.ij.bog.get('plus')?.qatorId).toBe(7);
    // Jarayon oynasi: qaysi qadamda to'xtagani ko'rinadi, qolganlari bajarilmagan, qayta urinish mumkin.
    const holat = (id: string) => document.querySelector(`[data-qadam="${id}"]`)?.getAttribute('data-holat');
    expect(holat('tekshiruv')).toBe('tayyor'); expect(holat('fayl')).toBe('tayyor');
    expect(holat('qoralama')).toBe('xato'); expect(holat('akt')).toBe('kutish');
    m.cloudSave.mockImplementation(async (d: F2IshchiQoralama) => { d.server = { jobId: 11, versiya: 3, rows: new Map() }; return d.server; });
    m.create.mockResolvedValue({ ok: true, akt_id: 99 });
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    await waitFor(() => expect(holat('akt')).toBe('tayyor'));
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it('saves unresolved minus, original file and manual links; remount restores without parsing/resetting decisions', async () => {
    await start();
    await waitFor(()=>expect((screen.getByRole('button', { name: /F2 ni yozish/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Ish holatini saqlash (davom ettirish uchun)' }));
    await screen.findByText(/Ish holati shu brauzerda saqlandi/);
    expect(saved!.ij.bog.get('plus')?.qatorId).toBe(7);
    expect(saved!.aktlar[0].daraxt[0].hajm).toBe(-10);
    expect(saved!.source.blob.size).toBe(8);
    expect(m.create).not.toHaveBeenCalled();
    cleanup(); render(<F2ImportV3 />);
    fireEvent.click(await screen.findByRole('button', { name: /Saqlangan ishni davom ettirish/ }));
    await screen.findByText('Qo‘lda bog‘lanish: 7');
    await waitFor(() => expect((screen.getByRole('button', { name: /F2 ni yozish/ }) as HTMLButtonElement).disabled).toBe(false));
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
    await waitFor(()=>expect((screen.getByRole('button', { name: /F2 ni yozish/ }) as HTMLButtonElement).disabled).toBe(false));
  });
});
