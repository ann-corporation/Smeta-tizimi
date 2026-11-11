import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ ol: vi.fn() }));
vi.mock('../../api/t2-qarzdorlik', () => ({ qarzSvodOl: m.ol }));
import { DebitorPanel } from './DebitorPanel';

describe('DebitorPanel', () => {
  it('debitor qatorini va F3 yo‘q ogohlantirishini ko‘rsatadi, kreditorni yashiradi', async () => {
    m.ol.mockResolvedValue({ ok: true, qatorlar: [
      { shartnoma_id: 1, raqam: 'A-1', nom: null, yonalish: 'debitor', kontragent: 'Buyurtmachi X', shartnoma_summa: 1000, f3_sotuv: 0, tolangan: 0, f2_nakrutkasiz: 500, qarz: 0, oxirgi_tolov_sana: null, obyektlar: [] },
      { shartnoma_id: 2, raqam: 'B-2', nom: null, yonalish: 'kreditor', kontragent: 'Postavshik', shartnoma_summa: 9, f3_sotuv: null, tolangan: 0, f2_nakrutkasiz: null, qarz: null, oxirgi_tolov_sana: null, obyektlar: [] },
    ] });
    render(<DebitorPanel kid={1} />);
    await waitFor(() => expect(screen.getByText('Buyurtmachi X')).toBeTruthy());
    expect(screen.queryByText('Postavshik')).toBeNull();
    expect(screen.getAllByText(/hisob-faktura \(F3\) chiqarilmagan/).length).toBeGreaterThan(0);
  });
  it('xatoda yiqilmaydi', async () => {
    m.ol.mockResolvedValue({ ok: false, error: 'yo‘q' });
    render(<DebitorPanel kid={1} />);
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
  });
});