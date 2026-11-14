import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ sbUstaQaror: vi.fn(), sbUstaQoralamalarOl: vi.fn(), ustaXatoMatni: (r: { error?: string }) => r.error ?? 'xato' }));
vi.mock('../../api/t2-usta', () => api);
const nar = vi.hoisted(() => ({ naryadlarOl: vi.fn() }));
vi.mock('../../api/t2-naryad', () => nar);
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => 'op-q' }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));

import { UstaKutilmoqda } from './UstaKutilmoqda';

const q = (id: number, ustiga = {}) => ({ id, kompaniya_id: 17, obyekt_id: 5, qator_id: 301, sana: '2026-11-12', hajm: 3, izoh: null, foto_hujjat_id: null, yozgan_actor_id: 9, holat: 'qoralama', qaror_izoh: null, created_at: '', ...ustiga });
beforeEach(() => { nar.naryadlarOl.mockReset(); nar.naryadlarOl.mockResolvedValue([]); api.sbUstaQaror.mockReset(); api.sbUstaQoralamalarOl.mockReset(); api.sbUstaQoralamalarOl.mockResolvedValue({ ok: true, qatorlar: [q(1), q(2, { izoh: 'ertalab' })] }); api.sbUstaQaror.mockResolvedValue({ ok: true }); });
afterEach(cleanup);

describe('Tasdiqlash kutilmoqda (prorab/PTO)', () => {
  it('qoralamalar ko‘rinadi; tasdiq bitta operation_id bilan qaror RPC siga ketadi va qator ro‘yxatdan chiqadi', async () => {
    const tayyor = vi.fn();
    render(<UstaKutilmoqda kompaniyaId={17} obyektId={5} qatorlar={[{ id: 301, nom: 'Beton quyish', birlik: '100 м2' }]} onTasdiqlandi={tayyor} />);
    expect(await screen.findByText(/Tasdiqlash kutilmoqda \(2\)/)).toBeTruthy();
    expect(screen.getAllByText(/Beton quyish/)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Tasdiqlash' })[0]);
    await waitFor(() => expect(api.sbUstaQaror).toHaveBeenCalledWith({ kompaniyaId: 17, idlar: [1], qaror: 'tasdiqlangan', izoh: null, operationId: 'op-q' }));
    await waitFor(() => expect(tayyor).toHaveBeenCalled());
  });
  it('3 kundan eski qoralama ajratib ko‘rsatiladi (muddat yo‘q — faqat belgi)', async () => {
    api.sbUstaQoralamalarOl.mockResolvedValue({ ok: true, qatorlar: [q(1, { created_at: new Date(Date.now() - 4 * 86_400_000).toISOString() }), q(2, { created_at: new Date().toISOString() })] });
    const { container } = render(<UstaKutilmoqda kompaniyaId={17} obyektId={5} qatorlar={[]} />);
    await screen.findByText(/Eskirgan: 4 kundan/);
    expect(container.querySelectorAll('[data-eskirgan]')).toHaveLength(1);
  });
  it('usta «bajarildi» naryadlari fakt qoralamalari yonida; «Qabul» mavjud naryad sahifasiga olib boradi (yangi qabul mantig‘i yo‘q)', async () => {
    api.sbUstaQoralamalarOl.mockResolvedValue({ ok: true, qatorlar: [q(1)] });
    nar.naryadlarOl.mockResolvedValue([{ id: 5, obyekt_id: 5, raqam: 'N-7', usta_nom: 'Usta', brigada: null, holat: 'bajarildi', versiya: 2, davr_dan: null, davr_gacha: null, qator_soni: 3, reja_summa: null, narxsiz_soni: 0, fakt_holat: null, xarajat_summa: null, yaratildi: '' }]);
    render(<UstaKutilmoqda kompaniyaId={17} obyektId={5} qatorlar={[]} />);
    expect(await screen.findByText(/Tasdiqlash kutilmoqda \(2\)/)).toBeTruthy();
    expect(screen.getByTestId('usta-naryad-kutilmoqda').textContent).toContain('N-7');
    expect(screen.getByRole('link', { name: 'Qabul' }).getAttribute('href')).toBe('/admin/naryad?id=5');
    expect(nar.naryadlarOl).toHaveBeenCalledWith(17, { obyektId: 5, holat: 'bajarildi', limit: 20 });
  });
  it('qoralama bo‘lmasa umuman ko‘rinmaydi', async () => {
    api.sbUstaQoralamalarOl.mockResolvedValue({ ok: true, qatorlar: [] });
    const { container } = render(<UstaKutilmoqda kompaniyaId={17} obyektId={5} qatorlar={[]} />);
    await waitFor(() => expect(api.sbUstaQoralamalarOl).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
