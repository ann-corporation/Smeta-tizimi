import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
// Obyektlar ro'yxati O'QILMADI — daraxt va eksport baribir ishlashi kerak (ular faqat daraxtga bog'liq).
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17 } }) }));
vi.mock('../../api/supabase', () => ({ sbT2ObyektlarOlKomp: async () => ({ ok: false, error: 'timeout' }), yangiOperationId: () => 'test' }));
vi.mock('../../umumiy/daraxt/useT2Daraxt', () => ({ useT2Daraxt: () => ({ rows: [{ id: 1 }], states: [], tree: [{ id: 1, nom: 'Razdel', smeta: 100, stFakt: 0, stF2: 20 }], price: [], loading: false, yangilanmoqda: false, error: '', yuklash: vi.fn(), holatniYangila: vi.fn(), qatorniYangila: vi.fn(), qoshimchaTayyor: true }) }));
vi.mock('../../components/pto-workspace/ObjectTrail', () => ({ ObjectTrail: () => null }));
vi.mock('../../components/pto-workspace/ObjectMoneySummary', () => ({ ObjectMoneySummary: () => null }));
vi.mock('../../umumiy/daraxt/SmetaTree', () => ({ SmetaTree: () => <div>Smeta daraxti</div> }));
vi.mock('../../components/smeta-hujjat/SmetaAnatomiya', () => ({ SmetaAnatomiya: () => <div>Anatomiya</div> }));
vi.mock('../../umumiy/daraxt/MuhrFarqXulosa', () => ({ MuhrFarqXulosa: () => null, useMuhrFarq: () => ({ royxat: [], xarita: new Map() }) }));
vi.mock('./SmetaVersiyaFarq', () => ({ SmetaVersiyaFarq: () => null, VersiyaAlmashtirilganBelgi: () => null }));
vi.mock('../../umumiy/hujjat/HujjatKorinish', () => ({ useHujjatKorinish: () => ({ oyna: null }) }));
vi.mock('../../umumiy/hujjat/HujjatTomonlari', () => ({ useHujjatTomonlari: () => [{}, vi.fn()], HujjatTomonlariPanel: () => null }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: 127, projectId: 7 }, loading: { hierarchy: false, periods: false }, periods: [], sourceDocuments: [], objects: [], refresh: vi.fn(), setObjectId: vi.fn(), scopeSearch: () => '' }) }));
vi.mock('./OstatkaIstisnoPanel', () => ({ useOstatkaIstisnolari: () => ({ royxat: [], yangila: vi.fn() }), OstatkaIstisnoPanel: () => null }));
vi.mock('./BajarilmadiPanel', () => ({ BajarilmadiPanel: () => null }));
vi.mock('./NarxNazoratNative', () => ({ default: () => null }));
vi.mock('./ResursVedomostNative', () => ({ default: () => null }));
vi.mock('./SmetaYuklaNative', () => ({ default: () => null }));
import HolatNative from './HolatNative';
afterEach(cleanup);

describe('HolatNative — daraxt obyektlar ro‘yxatiga bog‘liq emas', () => {
  it('ro‘yxat xato bersa ham daraxt, anatomiya va eksport ochiq; xato faqat ogohlantirish', async () => {
    render(<MemoryRouter initialEntries={['/admin/holat/127']}><Routes><Route path="/admin/holat/:id" element={<HolatNative />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Smeta daraxti')).toBeTruthy();
    expect(screen.getByText('Anatomiya')).toBeTruthy();
    expect(await screen.findByText(/Obyektlar kanonik ro‘yxatdan o‘qilmadi/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull(); // daraxt xatosi yo'q — qizil ogohlantirish yo'q
    fireEvent.click(screen.getByRole('button', { name: 'Hujjatlar va eksport' }));
    expect((screen.getByRole('button', { name: 'LRV Excel' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
