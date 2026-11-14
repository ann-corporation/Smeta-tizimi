import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { T2Qator } from '../../api/supabase';

// Sintetik ma'lumot; tarmoq yo'q. Ish varag'ida F2 rejimi YO'Q: F3 va «F2» tugmasi F2 tayyorlash sahifasiga olib boradi.
const m = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: vi.fn(), sbT2DaraxtQisman: vi.fn() }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: vi.fn(async () => ({ almashtiradi: new Map(), almashtirilgan: new Map() })) }));

import { IshVaraq } from './IshVaraq';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [q({ id: 1, tur: 'rz', kod: '1', nom: 'Bolim A' }), q({ id: 11, tur: 'bl', ota_id: 1, daraja: 1, kod: 'E11', nom: 'Ish 11', hajm: 100 })];
const states = [{ qator_id: 11, smeta_hajm: 100, fakt_hajm: 40 }];

function Joy() { const l = useLocation(); return <p data-testid="joy">{l.pathname + l.search}</p>; }
const chiz = () => render(<MemoryRouter initialEntries={['/admin/holat/8']}><IshVaraq kompaniyaId={1} obyektId={8} rows={rows} states={states} holatniYangila={vi.fn()} /><Joy /></MemoryRouter>);

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe('IshVaraq — F2 yaratish F2 tayyorlashda', () => {
  it('F3 — F2 tayyorlashga o‘tkazadi (fakt hajmlari bilan, avto=1); Ish varag‘ida F2 kiritish katagi yo‘q', () => {
    chiz();
    expect(screen.queryByLabelText('F2: Ish 11')).toBeNull();
    fireEvent.keyDown(window, { key: 'F3' });
    expect(screen.getByTestId('joy').textContent).toBe('/admin/f2-tayyorlash?obyekt=8&avto=1');
  });

  it('«F2» tugmasi ham shu yerga olib boradi', () => {
    chiz();
    fireEvent.click(screen.getByRole('button', { name: 'F2' }));
    expect(screen.getByTestId('joy').textContent).toBe('/admin/f2-tayyorlash?obyekt=8&avto=1');
  });

  it('saqlanmagan fakt bor — o‘tmaydi, avval saqlash so‘raladi', () => {
    chiz();
    fireEvent.change(screen.getByLabelText('Fakt: Ish 11'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'F2' }));
    expect(screen.getByTestId('joy').textContent).toBe('/admin/holat/8');
    expect(m.toast).toHaveBeenCalled();
  });
});
