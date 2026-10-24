import { describe, expect, it } from 'vitest';
import type { T2F2DavomQator } from '../api/t2-f2-davom';
import { eskiYozilmagan, navbatdagilar, tartiblangan } from './f2-ketma-ketlik';

const q = (job_id: number, oy: string | null, raqam: string | null, o: Partial<T2F2DavomQator> = {}): T2F2DavomQator => ({
  job_id, obyekt_id: 153, obyekt_nom: 'O', raqam, oy, fayl: null, akt_idx: 0, status: 'queued', jami: 1, aniq: 1, taklif: 0, topilmadi: 0, otkaz: 0,
  yangilandi: '2026-10-24', yaratildi: '2026-10-24', kim: null, yozilgan: false, akt_id: null, akt_holat: null, ...o,
});

describe('F2 qoralamalari ketma-ketligi', () => {
  it('eski oydan yangiga, keyin F2 raqami (sonli: 9 < 10 < 11)', () => {
    const r = tartiblangan([q(1, '2026-05', '37'), q(2, '2025-12', '16'), q(3, '2025-12', '9'), q(4, '2025-12', '10'), q(5, null, '1')]);
    expect(r.map((x) => x.job_id)).toEqual([3, 4, 2, 1, 5]);
  });

  it('har obyektda bitta «Navbatdagi»: eng eski yozilmagan (yozilganlar hisobga olinmaydi)', () => {
    const l = [q(1, '2025-09', '6', { yozilgan: true }), q(2, '2025-09', '7'), q(3, '2025-12', '16'), q(4, '2026-03', '3', { obyekt_id: 154 })];
    expect([...navbatdagilar(l)].sort()).toEqual([2, 4]);
  });

  it('kechroq oyni yozmoqchi bo‘lganda eskiroq yozilmagan qoralama topiladi; o‘zi, yozilgan va boshqa obyekt hisobga olinmaydi', () => {
    const l = [q(1, '2025-09', '6'), q(2, '2025-07', '5'), q(3, '2025-06', '4', { yozilgan: true }), q(4, '2025-05', '1', { obyekt_id: 154 }), q(5, '2026-05', '37')];
    expect(eskiYozilmagan(l, 153, '2026-05', 5)?.job_id).toBe(2);
    expect(eskiYozilmagan(l, 153, '2025-07', 2)).toBeNull();
    expect(eskiYozilmagan(l, 153, '2025-09', null)?.job_id).toBe(2);
    expect(eskiYozilmagan(l, 154, '2025-05')).toBeNull();
  });
});