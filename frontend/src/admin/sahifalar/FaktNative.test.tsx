import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FaktNative from './FaktNative';
const m = vi.hoisted(() => ({ yoz: vi.fn(), jami: vi.fn(), toast: vi.fn() }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 1 }, yuklanmoqda: false }) }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 8, nom: 'Sinov obyekt' }] }),
  sbT2DaraxtOl: async () => ({ ok: true, qatorlar: [{ id: 22, obyekt_id: 8, kompaniya_id: 1, ota_id: null, tur: 'bl', kod: 'BL-01', nom: 'Beton', birlik: 'm3', hajm: 200, narx: 100, summa: 20000, kat: 'МАТ', versiya: 1 }] }),
  sbT2QatorHolatOl: async () => ({ ok: true, qatorlar: [{ id: 1, qator_id: 22, obyekt_id: 8, tur: 'bl', kod: 'BL-01', nom: 'Beton', birlik: 'm3', kat: 'МАТ', smeta_hajm: 200, smeta_summa: 20000, fakt_hajm: 125.4, fakt_summa: 12540, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 74.6, qoldiq_summa: 7460, f2_mumkin_hajm: 125.4, f2_mumkin_summa: 12540 }] }),
  yangiOperationId: () => 'op', sbT2TreeQur: (r: any[], h: any[]) => r.map(x => ({ id: x.id, versiya: x.versiya, type: x.tur, row: 1, varaq: 'x', kod: x.kod, nom: x.nom, birlik: x.birlik, kat: x.kat, smetaHajm: h[0].smeta_hajm, smeta: h[0].smeta_summa, fakt: h[0].fakt_hajm, qoldiq: h[0].qoldiq_hajm, f2ol: 0, f2mum: h[0].f2_mumkin_hajm, children: [] })),
}));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz, sbFaktBelgilaV2: m.jami }));
vi.mock('../../api/t2-price-control', () => ({ priceControlOl: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/daraxt/SmetaTree', () => ({ SmetaTree: ({ data, onFaktSave }: any) => <div data-testid="tree"><span>{data[0]?.smetaHajm}</span><button onClick={() => onFaktSave(data[0], 'qoshish', 3.5)}>Qo‘shish</button><button onClick={() => onFaktSave(data[0], 'jami', 128.75)}>Jami</button></div> }));
function renderFakt() { const r = render(<MemoryRouter initialEntries={['/admin/fakt?obyekt=8']}><FaktNative /></MemoryRouter>); void screen.findByRole('button', { name: 'Daraxt' }).then((b) => fireEvent.click(b)); return r; }
afterEach(() => { cleanup(); m.yoz.mockReset(); m.jami.mockReset(); m.toast.mockReset(); });
describe('Fakt daraxtli oqimi', () => {
  it('smeta hajmini ko‘rsatib, qo‘shish RPC kontraktini saqlaydi', async () => { m.yoz.mockResolvedValue({ ok: true }); renderFakt(); await screen.findByTestId('tree'); expect(screen.getByText('200')).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Qo‘shish' })); await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 8, qatorlar: [{ qator_id: 22, hajm: 3.5 }] }))); });
  it('jami rejimi expected Faktni yuboradi', async () => { m.jami.mockResolvedValue({ ok: true }); renderFakt(); await screen.findByTestId('tree'); fireEvent.click(screen.getByRole('button', { name: 'Jami' })); await waitFor(() => expect(m.jami).toHaveBeenCalledWith(expect.objectContaining({ qatorId: 22, expectedFaktHajm: 125.4, yangiFaktHajm: 128.75 }))); });
  it('conflict raw xatoga aylantirilmaydi', async () => { m.jami.mockResolvedValue({ ok: false, code: 'FAKT_CONFLICT' }); renderFakt(); await screen.findByTestId('tree'); fireEvent.click(screen.getByRole('button', { name: 'Jami' })); await waitFor(() => expect(m.jami).toHaveBeenCalled()); expect(m.toast).not.toHaveBeenCalledWith(expect.stringMatching(/PGRST|supabase|token/i), expect.anything()); });
});
