import { describe, expect, it } from 'vitest';
import { havolalarYig } from '../src/doira';
import { kattaOzgarish, MASOFAVIY_TOOLLAR, TAQIQLANGAN } from '../src/siyosat';

describe('xavfsizlik chegarasi (egasi 2026-11-22)', () => {
  it('150 tagacha qator — ruxsat, ko\'pi — rad', () => {
    const q = (n: number) => Array.from({ length: n }, (_, i) => ({ qator_id: i + 1, hajm: 1 }));
    expect(kattaOzgarish('fakt_yoz', { qatorlar: q(150) })).toBeNull();
    expect(kattaOzgarish('fakt_yoz', { qatorlar: q(151) })).toMatch(/chegarasi 150/);
    expect(kattaOzgarish('f2_qoralama_tahrir', { ozgartir: q(100), olib_tashla: Array.from({ length: 60 }, (_, i) => i + 1) })).toMatch(/160 ta/);
    expect(kattaOzgarish('obyektlar', { qatorlar: q(999) })).toBeNull();
  });
  it('xom yozish toollari hech qachon ochiq emas; yangi toollar ro\'yxatda', () => {
    const nomlar = MASOFAVIY_TOOLLAR.map((t) => t.nom);
    for (const t of TAQIQLANGAN) expect(nomlar).not.toContain(t);
    for (const t of ['f2_jami', 'transport_tekshir', 'fakt_qamrov', 'minus_fakt', 'transport_belgila', 'transport_yoy']) expect(nomlar).toContain(t);
  });
  it('rz_id va qamrov_id tenant tekshiruviga kiradi', () => {
    const h = havolalarYig('transport_yoy', { obyekt_id: 1, rz_id: 22 });
    expect([...h.qator]).toEqual([22]);
    expect([...havolalarYig('fakt_qamrov', { obyekt_id: 1, qamrov_id: 33 }).qator]).toEqual([33]);
  });
});
