import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { f2Imzo, f2MoslashV3, type SmetaQator } from './index';

// Sintetik: F2 kichik bo'lim nomlari smetadagidan farq qiladi; razdel xotirasi.
const man = { varaq: 'v', qator: 1, ustun: 1 };
let n = 0;
function tugun(p: Partial<F2Tugun> & { tur: F2Tugun['tur'] }): F2Tugun {
  return { uid: `u${++n}`, kod: null, nom: 'X', birlik: null, hajm: null, narx: null, summa: null, norma: null, bolalar: [], barg: false, yol: [], manzil: man, ...p } as unknown as F2Tugun;
}
const sq = (id: number, otaId: number | null, tur: string, kod: string | null, nom: string, birlik: string | null = null): SmetaQator =>
  ({ id, otaId, tur, kod, nom, birlik, hajm: 1, narx: 10, tartib: id });

const smeta: SmetaQator[] = [
  sq(1, null, 'rz', null, 'КАРКАС ЗДАНИЯ'),
  sq(2, 1, 'rz', null, 'ПОЯСА'),
  sq(3, 2, 'bl', 'Q1-1', 'УСТРОЙСТВО ПОЯСОВ', '100М3'),
  sq(4, 1, 'rz', null, 'СТОЙКИ'),
  sq(5, 4, 'bl', 'Q2-2', 'МОНТАЖ СТОЕК', 'Т'),
  sq(10, null, 'rz', null, 'ПЛОЩАДКА'),
  sq(11, 10, 'bl', 'Q3-3', 'ПЛАНИРОВКА', 'М2'),
  sq(20, null, 'rz', null, 'ПЛОЩАДКА'),
  sq(21, 20, 'bl', 'Q3-3', 'ПЛАНИРОВКА', 'М2'),
];
const ish = (kod: string, nom: string, birlik: string, yol: string[]) => tugun({ tur: 'bl', kod, nom, birlik, hajm: 0.5, yol });
const rz = (nom: string, yol: string[], bolalar: F2Tugun[]) => tugun({ tur: 'rz', nom, yol, bolalar });

describe('F2 bo‘lim doirasi kengaytmalari', () => {
  it('kichik bo‘lim so‘z o‘zagi bo‘yicha (ПОЯС ↔ ПОЯСА) — doira aniqlanadi, ish ✓', () => {
    const w = ish('Q1-1', 'УСТРОЙСТВО ПОЯСОВ', '100М3', ['КАРКАС ЗДАНИЯ', 'ПОЯС']);
    const r = f2MoslashV3([rz('КАРКАС ЗДАНИЯ', [], [rz('ПОЯС', ['КАРКАС ЗДАНИЯ'], [w])])], smeta);
    expect(r.natijalar.get(w.uid)).toMatchObject({ holat: 'aniq', qatorId: 3 });
    expect(r.rzDiag.find((d) => d.nom === 'ПОЯС')).toMatchObject({ ok: true, usul: 'nom_ozak', smetaRzIdlar: [2] });
  });

  it('kichik bo‘lim umuman topilmasa — ota bo‘lim ichidagi yagona mos ish faqat ◐', () => {
    const w = ish('Q2-2', 'МОНТАЖ СТОЕК', 'Т', ['КАРКАС ЗДАНИЯ', 'МЕТАЛЛ ДЕТАЛЛАРИ']);
    const r = f2MoslashV3([rz('КАРКАС ЗДАНИЯ', [], [rz('МЕТАЛЛ ДЕТАЛЛАРИ', ['КАРКАС ЗДАНИЯ'], [w])])], smeta);
    expect(r.natijalar.get(w.uid)).toMatchObject({ holat: 'taklif', qatorId: 5 });
  });

  it('razdel xotirasi: bir xil nomli ikki bo‘limdan o‘tgan oylarda tasdiqlangani — faqat ◐', () => {
    const yol = ['ПЛОЩАДКА'];
    const w = ish('Q3-3', 'ПЛАНИРОВКА', 'М2', yol);
    const f2 = [rz('ПЛОЩАДКА', [], [w])];
    expect(f2MoslashV3(f2, smeta).natijalar.get(w.uid)?.qatorId).not.toBe(21);
    // Xotira: shu bo'lim yo'li bilan 3 ta tasdiqlangan ish 20-razdelda turgan.
    const yolKalit = f2Imzo(w).split('|')[0];
    const xotira = new Map<string, number>([[`${yolKalit}|A|1`, 21], [`${yolKalit}|B|2`, 21], [`${yolKalit}|C|3`, 21]]);
    const r = f2MoslashV3(f2, smeta, { xotira });
    expect(r.natijalar.get(w.uid)).toMatchObject({ holat: 'taklif', qatorId: 21 });
    expect(r.rzDiag[0]).toMatchObject({ usul: 'xotira', smetaRzIdlar: [20] });
  });
});
