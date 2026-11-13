import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17 } }) }));
vi.mock('../../api/supabase', () => ({ sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 127, kompaniya_id: 17, nom: 'Obyekt X', loyiha_id: 7, qator_soni: 3 }] }), yangiOperationId: () => 'test' }));
vi.mock('../../umumiy/daraxt/useT2Daraxt', () => ({
  useT2Daraxt: () => ({ rows: [{ id: 1, tur: 'rz', nom: 'R' }], states: [], tree: [{ id: 1, nom: 'Razdel', smeta: 100, stFakt: 0, stF2: 20 }], price: [], loading: false, yangilanmoqda: false, error: '', yuklash: vi.fn(), holatniYangila: vi.fn(), qatorniYangila: vi.fn() }),
}));
vi.mock('../../components/pto-workspace/ObjectTrail', () => ({ ObjectTrail: () => <nav>Iz</nav> }));
vi.mock('../../components/pto-workspace/ObjectMoneySummary', () => ({ ObjectMoneySummary: () => null }));
vi.mock('../../umumiy/daraxt/SmetaTree', () => ({ SmetaTree: () => <div>Smeta daraxti</div> }));
vi.mock('../../components/smeta-hujjat/SmetaAnatomiya', () => ({ SmetaAnatomiya: () => <div>Anatomiya paneli</div> }));

vi.mock('../../components/smeta-studio-pro/MarketPriceComparison', () => ({ MarketPriceComparison: () => null }));
vi.mock('../../umumiy/hujjat/HujjatKorinish', () => ({ useHujjatKorinish: () => ({ oyna: null }) }));
vi.mock('../../umumiy/hujjat/HujjatTomonlari', () => ({ useHujjatTomonlari: () => [{}, vi.fn()], HujjatTomonlariPanel: () => null }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: 127, projectId: 7 }, loading: { hierarchy: false, periods: false }, periods: [], sourceDocuments: [], objects: [], refresh: vi.fn() }) }));
vi.mock('./OstatkaIstisnoPanel', () => ({ useOstatkaIstisnolari: () => ({ royxat: [], yangila: vi.fn() }), OstatkaIstisnoPanel: () => null }));
vi.mock('./NarxNazoratNative', () => ({ default: () => <div>Narx nazorati paneli</div> }));
vi.mock('./ResursVedomostNative', () => ({ default: () => <div>Resurs paneli</div> }));
vi.mock('./SmetaYuklaNative', () => ({ default: () => <div>Yuklash paneli</div> }));
vi.mock('./IshVaraq', () => ({ IshVaraq: () => <div>Ish varag‘i grid</div> }));
import HolatNative from './HolatNative';

afterEach(() => { cleanup(); });
function Joy() { const l = useLocation(); return <output data-testid="joy">{l.search}</output>; }
function start(suffix = '') {
  render(<MemoryRouter initialEntries={[`/admin/holat/127${suffix}`]}><Routes><Route path="/admin/holat/:id" element={<><HolatNative /><Joy /></>} /></Routes></MemoryRouter>);
}

describe('HolatNative — Daraxt | Ish varag‘i rejimi', () => {
  it('sukut — Daraxt (o‘zgarishsiz): daraxt va panellar ko‘rinadi, varaq yo‘q', async () => {
    start();
    await screen.findByText('Smeta daraxti');
    expect(screen.getByText('Anatomiya paneli')).toBeTruthy();
    expect(screen.queryByText('Ish varag‘i grid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Daraxt' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('rejim kaliti URL ?rejim=varaq ni yozadi/o‘chiradi (route emas); og‘ir panellar yashiriladi', async () => {
    start();
    await screen.findByText('Smeta daraxti');
    fireEvent.click(screen.getByRole('button', { name: 'Ish varag‘i' }));
    expect(await screen.findByText('Ish varag‘i grid')).toBeTruthy();
    expect(screen.getByTestId('joy').textContent).toBe('?rejim=varaq');
    expect(screen.queryByText('Smeta daraxti')).toBeNull();
    expect(screen.queryByText('Anatomiya paneli')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resurslar' })).toBeNull(); // tab-chiziq yashirin
    expect(screen.getByRole('button', { name: 'Hujjatlar va eksport' })).toBeTruthy(); // rasmiy hujjatlar tugmasi o‘zgarmas
    fireEvent.click(screen.getByRole('button', { name: 'Daraxt' }));
    expect(screen.getByTestId('joy').textContent).toBe('');
    expect(await screen.findByText('Smeta daraxti')).toBeTruthy();
  });

  it('«⋯ Boshqa» — yashirilgan panellar/tablar bitta tugma ortida (mavjud tab holati qayta ishlatiladi)', async () => {
    start('?rejim=varaq');
    expect(await screen.findByText('Ish varag‘i grid')).toBeTruthy();
    fireEvent.click(screen.getByTestId('boshqa-tugma'));
    fireEvent.click(await screen.findByRole('button', { name: 'Resurslar' }));
    expect(await screen.findByText('Resurs paneli')).toBeTruthy();
    expect(screen.getAllByText('Ish varag‘i grid')).toHaveLength(1); // varaq joyida qoladi (takror mount yo‘q)
  });
});
