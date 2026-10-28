import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ sbOqi: vi.fn() }));
import { faktManbaYigish } from './t2-f2-narx';

describe('faktManbaYigish', () => {
  it('o‘z fakti — hujjatlar hajmi yig‘indisi; eski «Fakt = F2» — birorta qatori f2_sertifikat bo‘lmagan F2 hujjati', () => {
    const aktlar = [
      { id: 1, raqam: 'F1', sana: '2026-10-01', izoh: 'Fakt = F2: Butun obyekt', hujjat_jami: 100 },
      { id: 2, raqam: 'F2', sana: '2026-10-02', izoh: 'Fakt = F2: Butun obyekt', hujjat_jami: 200 },
      { id: 3, raqam: 'F3', sana: '2026-10-03', izoh: 'Qamrov 50%: x', hujjat_jami: null },
    ];
    const { directFakt, qolda, f2Delta, nusxalangan, eskiAktlar } = faktManbaYigish(aktlar, [
      { akt_id: 1, qator_id: 10, hajm: 2, narx_manba: 'smeta' },
      { akt_id: 2, qator_id: 10, hajm: 0.1, narx_manba: 'f2_sertifikat', manba_akt_qator_id: 501 },
      { akt_id: 2, qator_id: 10, hajm: 0, narx_manba: 'f2_sertifikat', manba_akt_qator_id: 502 },
      { akt_id: 3, qator_id: 11, hajm: -1, narx_manba: null },
      { akt_id: 3, qator_id: 12, hajm: 4, narx_manba: 'f2_sertifikat' },
    ]);
    expect(directFakt.get(10)).toBe(2.1);
    expect(directFakt.get(11)).toBe(-1);
    expect(qolda.get(10)).toBe(2); expect(qolda.get(11)).toBe(-1); expect(f2Delta.get(12)).toBe(4);
    expect([...nusxalangan]).toEqual([501, 502]);
    // 1:1 nusxa satri bor hujjat (2) eski emas; nusxasiz «Fakt = F2» (1) — eski.
    expect(eskiAktlar).toEqual([{ id: 1, raqam: 'F1', sana: '2026-10-01', jami: 100 }]);
  });
});
