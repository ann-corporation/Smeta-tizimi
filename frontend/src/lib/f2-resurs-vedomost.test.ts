import { describe, expect, it } from 'vitest';
import type { NarxTaklif } from '../api/t2-narx-dalil';
import type { F2Qator } from './f2-tayyor';
import { f2ResursYigish, takliflarYigish } from './f2-resurs-vedomost';

const rs = (id: number, o: Partial<F2Qator>): F2Qator => ({
  id, ishId: 1, tur: 'rs', kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'ЧЕЛ-Ч', hajm: 10, narx: 1000, summa: 10000, manba: 'smeta', narxsiz: false, ...o,
});
const kodlar: Record<number, string> = { 1: '000001', 2: '1', 3: '3', 4: '002509', 5: '2499', 6: 'ЦЕНА' };

describe('F2 resurs vedomosti (tayyorlash)', () => {
  const qs: F2Qator[] = [
    rs(1, {}), rs(2, { birlik: 'ЧЕЛ.-Ч', hajm: 5, summa: 5000 }),
    rs(3, { kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', narx: null, summa: null, narxsiz: true, manba: 'yoq', hajm: 15 }),
    rs(4, { kat: 'МАШ', nom: 'АВТОМОБИЛИ БОРТОВЫЕ', birlik: 'МАШ.-Ч', narx: 100, summa: 200, hajm: 2 }),
    rs(5, { kat: 'МАШ', nom: 'Автомобили бортовые', birlik: 'МАШ-Ч', narx: 120, summa: 240, hajm: 2 }),
    rs(6, { tur: 'mat', kat: 'МАТ', nom: 'Цемент', birlik: 'т', narx: 800, summa: 1600, hajm: 2 }),
    { id: 99, ishId: null, tur: 'bl', kat: null, nom: 'Ish', birlik: 'м3', hajm: 1, narx: null, summa: null, manba: 'yoq', narxsiz: true },
  ];
  const g = f2ResursYigish(qs, (id) => kodlar[id]);

  it('takror resurs bitta qator; ish (bl) kirmaydi; kat bo‘yicha guruh', () => {
    expect(g.map((x) => x.kat)).toEqual(['ЧЕЛ', 'МАШ', 'МАТ']);
    const chel = g[0].qatorlar;
    expect(chel).toHaveLength(1);
    expect(chel[0].hajm).toBe(15); expect(chel[0].summa).toBe(15000); expect(chel[0].qatorIds).toEqual([1, 2]);
    expect(chel[0].kodlar).toBe('000001');
  });
  it('narxi farqli resurs alohida qatorlar + belgi (o‘rtacha narx yo‘q)', () => {
    const avto = g[1].qatorlar.filter((x) => x.nom.toUpperCase().startsWith('АВТО'));
    expect(avto.map((x) => [x.narx, x.narxFarqli])).toEqual([[100, true], [120, true]]);
  });
  it('machinist qatori: ma‘lumot qatori, narxsiz sanog‘iga kirmaydi', () => {
    const m = g[1].qatorlar.find((x) => x.axborot)!;
    expect(m.narxsizSoni).toBe(0); expect(m.summa).toBeNull(); expect(m.hajm).toBe(15);
  });
  it('guruh summasi va ustamali uchun kat kesimi', () => {
    expect(g[0].summa).toBe(15000);
    expect(g[1].summa).toBe(440);
    expect(g[1].katKesim.summalar['МАШ']).toBe(440);
  });
});

describe('takliflar yig‘ish', () => {
  const mt = (o: Partial<NarxTaklif>): NarxTaklif => ({
    kompaniya_id: 1, obyekt_id: 8, qator_id: 6, tur: 'mat', kat: 'МАТ', kod: null, nom: 'Цемент', birlik: 'т', smeta_narx: null,
    manba_qator_id: 100, manba_id: 1, manba_tur: 'faktura', manba_nom: 'Счёт', manba_raqam: '5', manba_sana: '2026-09-01', yil: null, kvartal: null, region: null, yetkazuvchi: 'A',
    nds_holati: 'nds_siz', manba_kod: null, manba_nom_qator: 'Цемент М400', manba_birlik: 'т', manba_narx: 800, moslik: 'nom_birlik', ...o,
  } as NarxTaklif);

  it('manba nomi va sanasi bor; boshqa qator takliflari kirmaydi; NDS bilan chetda', () => {
    const r = takliflarYigish([{ manba: 'smeta_obyekt', narx: 790, izoh: 'RES' }], [mt({}), mt({ manba_qator_id: 101, nds_holati: 'nds_bilan', manba_narx: 900 }), mt({ manba_qator_id: 102, qator_id: 7 })], new Set([6]));
    expect(r.chetda).toBe(1);
    expect(r.takliflar.map((t) => [t.narx, t.sana])).toEqual([[790, null], [800, '2026-09-01']]);
    expect(r.takliflar[1].manba).toContain('Счёт');
  });
  it('bir nechta yetkazuvchi - arifmetik o‘rtacha va xabar', () => {
    const r = takliflarYigish([], [mt({}), mt({ manba_qator_id: 101, yetkazuvchi: 'B', manba_narx: 900, manba_sana: '2026-09-10' })], new Set([6]));
    const o = r.takliflar.find((t) => t.tur === 'yetkazuvchi_ortacha')!;
    expect(o.narx).toBe(850); expect(o.sana).toBe('2026-09-10'); expect(o.xabar).toContain('2 ta yetkazuvchi');
  });
  it('taklif yo‘q bo‘lsa - bo‘sh (narx to‘qilmaydi)', () => {
    expect(takliflarYigish([], [], new Set([6])).takliflar).toEqual([]);
  });
});
