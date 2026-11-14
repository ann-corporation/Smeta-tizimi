import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const s = vi.hoisted(() => ({
  royxat: { ok: true, qatorlar: [] as unknown[] } as { ok: boolean; qatorlar?: unknown[]; error?: string },
  daraxt: {} as Record<string, unknown>,
}));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17 } }) }));
vi.mock('../../api/supabase', () => ({ sbT2ObyektlarOlKomp: async () => s.royxat, yangiOperationId: () => 'test', sbOqi: async () => ({ ok: true, qatorlar: [] }) }));
vi.mock('../../umumiy/daraxt/useT2Daraxt', () => ({ useT2Daraxt: () => s.daraxt }));
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

const OBYEKT = { id: 127, kompaniya_id: 17, nom: 'Sinov obyekt', loyiha_id: 7 };
const tayyorDaraxt = () => ({ rows: [{ id: 1 }], states: [], tree: [{ id: 1, nom: 'Razdel', smeta: 100, stFakt: 0, stF2: 20 }], price: [], loading: false, yangilanmoqda: false, error: '',
  yuklash: vi.fn(), holatniYangila: vi.fn(), qatorniYangila: vi.fn(), qoshimchaHolat: 'tayyor', qoshimchaTayyor: true, serverTasdiq: true });
beforeEach(() => { s.royxat = { ok: true, qatorlar: [OBYEKT] }; s.daraxt = tayyorDaraxt(); });
afterEach(cleanup);
const start = () => render(<MemoryRouter initialEntries={['/admin/holat/127']}><Routes><Route path="/admin/holat/:id" element={<HolatNative />} /></Routes></MemoryRouter>);
const lrvTugma = () => { fireEvent.click(screen.getByRole('button', { name: 'Hujjatlar va eksport' })); return screen.getByRole('button', { name: 'LRV Excel' }) as HTMLButtonElement; };

describe('HolatNative — daraxt, kompaniya chegarasi va eksport darvozasi', () => {
  it('tasdiqlangan obyekt + server tasdiqlagan daraxt — eksport ochiq', async () => {
    start();
    expect(await screen.findByText('Smeta daraxti')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Hujjatlar va eksport' })).toBeTruthy();
    expect(lrvTugma().disabled).toBe(false);
  });

  it('ro‘yxat xato bersa — daraxt ko‘rinadi, lekin eksport yo‘q (nom noma’lum, «Obyekt #id» yozilmaydi)', async () => {
    s.royxat = { ok: false, error: 'timeout' };
    start();
    expect(await screen.findByText('Smeta daraxti')).toBeTruthy();
    expect(screen.getByText('Anatomiya')).toBeTruthy();
    expect(await screen.findByText(/Obyektlar kanonik ro‘yxatdan o‘qilmadi/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hujjatlar va eksport' })).toBeNull();
    expect(screen.queryByText(/Obyekt #127/)).toBeNull();
  });

  it('boshqa kompaniya obyekti — daraxt ham, eksport ham yo‘q', async () => {
    s.royxat = { ok: true, qatorlar: [{ ...OBYEKT, kompaniya_id: 99 }] };
    start();
    expect(await screen.findByText(/joriy kompaniya ro‘yxatida topilmadi/)).toBeTruthy();
    expect(screen.queryByText('Smeta daraxti')).toBeNull();
    expect(screen.queryByText('Anatomiya')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hujjatlar va eksport' })).toBeNull();
  });

  it('eskirgan keshdan ko‘rsatilib, fonda tekshirilayotganda — eksport yopiq, «Yangilanmoqda…» ko‘rinadi', async () => {
    s.daraxt = { ...tayyorDaraxt(), serverTasdiq: false, yangilanmoqda: true };
    start();
    expect(await screen.findByText('Smeta daraxti')).toBeTruthy();
    expect(screen.getByText('Yangilanmoqda…')).toBeTruthy();
    await screen.findByRole('button', { name: 'Hujjatlar va eksport' });
    expect(lrvTugma().disabled).toBe(true);
    expect(screen.getByText(/server bilan tekshirilmoqda/)).toBeTruthy();
  });

  it('qo‘shimcha/zamena belgilari o‘qilmasa — eksport bloklanadi, aniq sabab bilan', async () => {
    s.daraxt = { ...tayyorDaraxt(), qoshimchaHolat: 'xato', qoshimchaTayyor: false };
    start();
    await screen.findByRole('button', { name: 'Hujjatlar va eksport' });
    expect(lrvTugma().disabled).toBe(true);
    expect(screen.getByText(/qo‘shimcha\/zamena belgilari o‘qilmadi/)).toBeTruthy();
  });
});
