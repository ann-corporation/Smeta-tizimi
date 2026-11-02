import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const otish = vi.fn();
vi.mock('../../api/t2-akt-lifecycle', () => ({ t2AktLifecycleTransition: (p: unknown) => otish(p) }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => '00000000-0000-4000-8000-000000000000' }));

import { F2BekorOyna, type F2BekorOynaAkt } from './F2BekorOyna';

const aktlar: F2BekorOynaAkt[] = [
  { id: 11, versiya: 7, lifecycle_status: 'approved', raqam: 'A1', oy: '2026-09-01', hujjat_jami: 1000, qator_soni: 5 },
  { id: 12, versiya: 2, lifecycle_status: 'draft', raqam: 'A2', oy: '2026-10-01', hujjat_jami: null, qator_soni: 1 },
];
const tugma = () => screen.getByRole('button', { name: /2 ta F2 ni bekor qilish/ }) as HTMLButtonElement;

describe('F2BekorOyna', () => {
  beforeEach(() => otish.mockReset());

  it('aktlarni ko‘rsatadi; sababsiz tugma faol emas', () => {
    render(<F2BekorOyna kompaniyaId={1} aktlar={aktlar} onYop={() => {}} onTugadi={() => {}} />);
    expect(screen.getAllByTestId('f2-bekor-akt')).toHaveLength(2);
    expect(tugma().disabled).toBe(true);
  });

  it('sabab bilan — har akt o‘z versiyasi bilan cancelled ga, natija qaytadi', async () => {
    otish.mockResolvedValue({ ok: true });
    const onTugadi = vi.fn();
    render(<F2BekorOyna kompaniyaId={5} aktlar={aktlar} onYop={() => {}} onTugadi={onTugadi} />);
    fireEvent.change(screen.getByLabelText('Bekor qilish sababi'), { target: { value: 'qayta import' } });
    fireEvent.click(tugma());
    await waitFor(() => expect(onTugadi).toHaveBeenCalled());
    expect(otish).toHaveBeenCalledTimes(2);
    expect(otish.mock.calls[0][0]).toMatchObject({ kompaniyaId: 5, aktId: 11, toStatus: 'cancelled', expectedVersion: 7, reason: 'qayta import' });
    expect(onTugadi.mock.calls[0][0]).toEqual({ bajarildi: [11, 12], xato: null });
  });

  it('ziddiyatda xabar ko‘rsatadi va to‘xtaydi', async () => {
    otish.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
    const onTugadi = vi.fn();
    render(<F2BekorOyna kompaniyaId={5} aktlar={aktlar} onYop={() => {}} onTugadi={onTugadi} />);
    fireEvent.change(screen.getByLabelText('Bekor qilish sababi'), { target: { value: 'x' } });
    fireEvent.click(tugma());
    expect((await screen.findByRole('alert')).textContent).toMatch(/A1/);
    expect(otish).toHaveBeenCalledTimes(1);
    expect(onTugadi.mock.calls[0][0].bajarildi).toEqual([]);
  });
});
