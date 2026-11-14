import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { T2Qator, T2QatorHolat } from '../../api/supabase';
import type { SvodYaxlit } from '../../lib/svod-yaxlit';

/* Sintetik. Egasi bosadigan tugmalar: «Hisoblash» → к доплате / к снятию; «К доплате → Ф-2 qoralama» / «К снятию → tuzatuvchi Ф-2 qoralama». */
const m = vi.hoisted(() => ({ yarat: vi.fn(), ustama: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/supabase', async (orig) => ({ ...(await orig<typeof import('../../api/supabase')>()), sbT2AktYaratV2: m.yarat, yangiOperationId: () => 'op-1' }));
vi.mock('../../lib/oylik-hujjat/ostatka-slichitelniy', () => ({ ustamaManbaOl: m.ustama }));
vi.mock('./F2DublikatPanel', () => ({ useObyektF2Aktlari: () => ({ aktlar: [], yuklandi: true, xato: false, qayta: () => undefined }) }));
vi.mock('../../umumiy/ui/useUstamaliSumma', () => ({ useUstamaliSumma: () => null }));
vi.mock('../../umumiy/ui/SummaJuft', () => ({ SummaJuft: (p: { ustamasiz: number }) => <span data-testid="juft">{p.ustamasiz}</span> }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: () => Promise.resolve(true) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-token', () => ({ tokenBilan: async (_o: unknown, f: () => Promise<unknown>) => ({ ok: true, natija: await f() }) }));

import { SlichitelniyTsikl } from './SlichitelniyTsikl';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const q = (id: number, ota: number | null, tur: string, hajm: number | null, nom: string): T2Qator => ({
  id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: null, nom, birlik: 'м3', hajm, narx: tur === 'bl' || tur === 'rz' ? null : 1000,
  summa: null, kat: tur === 'bl' || tur === 'rz' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null,
} as unknown as T2Qator);
const h = (id: number, fakt: number | null, f2h: number): T2QatorHolat => ({ qator_id: id, fakt_hajm: fakt, fakt_summa: fakt == null ? null : fakt * 1000, f2_hajm: f2h, f2_summa: f2h * 1000 } as unknown as T2QatorHolat);

const ROWS = [q(1, null, 'rz', null, 'СВОД'), q(2, 1, 'bl', 3, 'ИШ'), q(3, 2, 'mat', 10, 'А'), q(4, 2, 'mat', 10, 'Б'), q(5, 2, 'mat', 10, 'В'),
  q(10, null, 'rz', null, 'ОБЫЧНЫЙ'), q(11, 10, 'bl', 3, 'ИШ2'), q(12, 11, 'mat', 10, 'Г'), q(13, 11, 'mat', 10, 'Д')];
const HOLAT = [h(3, 8, 5), h(4, 4, 7), h(5, 9, 5), h(12, 8, 5), h(13, 4, 7)];
const SVOD = { qqssiz: 30000, barglar: 30000, summasiz: 0, bolimlar: [{ id: 1, qator_id: 1, nom: 'S', svod_summa: 33600, qqs_stavka: 12, qqssiz: 30000, barglar: 30000, asos: 'svod', dalil: {} }] } as unknown as SvodYaxlit;

const ochish = () => render(<MemoryRouter><SlichitelniyTsikl kompaniyaId={1} obyektId={1} qatorlar={ROWS} holatlar={HOLAT} /></MemoryRouter>);

describe('SlichitelniyTsikl — egasi tugmalari', () => {
  it('«Hisoblash»: к доплате/к снятию sahifa va hujjat bilan bir xil (svod bo‘limi sof)', async () => {
    m.ustama.mockResolvedValue({ ok: true, ustama: { svodYaxlit: SVOD } });
    ochish();
    expect(screen.queryByTestId('juft')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Hisoblash/ }));
    await waitFor(() => expect(screen.getAllByTestId('juft').length).toBe(2));
    expect(screen.getAllByTestId('juft').map((x) => x.textContent)).toEqual(['7000', '3000']);
  });

  it('o‘qilmasa — xato ko‘rinadi, tugmalar chiqmaydi (jim 0 emas)', async () => {
    m.ustama.mockResolvedValue({ ok: false, xato: 'ustama o‘qilmadi' });
    ochish();
    fireEvent.click(screen.getByRole('button', { name: /Hisoblash/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('ustama o‘qilmadi');
    expect(screen.queryByTestId('juft')).toBeNull();
  });

  it('raqamsiz qoralama yaratilmaydi; raqam bilan — sof summali qatorlar yoziladi (tasdiqlanmaydi)', async () => {
    m.ustama.mockResolvedValue({ ok: true, ustama: { svodYaxlit: SVOD } });
    m.yarat.mockResolvedValue({ ok: true });
    ochish();
    fireEvent.click(screen.getByRole('button', { name: /Hisoblash/ }));
    const dop = await screen.findByRole('button', { name: /К доплате → Ф-2 qoralama/ });
    fireEvent.click(dop);
    expect(m.yarat).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('12-П'), { target: { value: '12-П' } });
    fireEvent.click(dop);
    await waitFor(() => expect(m.yarat).toHaveBeenCalledTimes(1));
    const a = m.yarat.mock.calls[0][0] as { raqam: string; qatorlar: Array<{ qatorId: number; certifiedAmount: number }> };
    expect(a.raqam).toBe('12-П-Д');
    expect(a.qatorlar.reduce((s, x) => s + x.certifiedAmount, 0)).toBe(7000);
    expect(a.qatorlar.map((x) => x.qatorId).sort((x, y) => x - y)).toEqual([3, 5, 12]); // svod: faqat sof ishorali (+) qatorlar
  });
});
