import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { KirimKunlikJurnal } from './KirimKunlikJurnal';

const api = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../api/supabase', () => ({ sbOqi: api.read }));
afterEach(cleanup);

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 91, kompaniya_id: 17, obyekt_id: 41, operatsiya: 'rasxod', turi: 'mat', sana: '2026-10-27',
  nomi: 'Armatura', birligi: 'kg', obyomi: 12, postavshik: null, qabul_qiluvchi: 'Usta B', qabul_turi: 'prarab',
  izoh: null, operation_id: 'op-91', holat: 'bekor', yaratildi: '2026-10-27T09:10:00Z', kim: null,
  manba: 'sklad', m29_hujjat_id: null, ...overrides,
});

describe('KirimKunlikJurnal', () => {
  it('queries by both active company and object, shows statuses and leaves missing audit fields unknown', async () => {
    api.read.mockResolvedValueOnce({ ok: true, qatorlar: [row()] });
    render(<KirimKunlikJurnal kompaniyaId={17} obyektId={41} obyektNomi="Obyekt 41" />);
    expect(await screen.findByText('bekor')).toBeTruthy();
    expect(screen.getByText('Usta B')).toBeTruthy();
    expect(screen.getByText('2026-10-27T09:10:00Z')).toBeTruthy();
    expect(screen.getAllByText('Noma’lum').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/bu yetkazib berilgan, qabul qilingan yoki sarflanganini alohida tasdiqlamaydi/)).toBeTruthy();
    expect(api.read).toHaveBeenCalledWith(expect.objectContaining({
      jadval: 't2_sklad_harakat', filtr: 'kompaniya_id=eq.17&obyekt_id=eq.41',
      ustunlar: expect.stringContaining('yaratildi,kim,manba,m29_hujjat_id'),
      tartib: 'yaratildi.desc,id.desc',
    }));
  });

  it('ignores a late response from the previous company/object scope', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    api.read.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const view = render(<KirimKunlikJurnal kompaniyaId={17} obyektId={41} />);
    view.rerender(<KirimKunlikJurnal kompaniyaId={18} obyektId={52} />);
    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]({ ok: true, qatorlar: [row({ id: 92, kompaniya_id: 18, obyekt_id: 52, nomi: 'Aktual obyekt materiali' })] });
    expect(await screen.findByText('Aktual obyekt materiali')).toBeTruthy();
    resolvers[0]({ ok: true, qatorlar: [row({ nomi: 'Eskirgan obyekt materiali' })] });
    await waitFor(() => expect(screen.queryByText('Eskirgan obyekt materiali')).toBeNull());
    expect(screen.getByText('Aktual obyekt materiali')).toBeTruthy();
  });
});
