import { describe, expect, it } from 'vitest';
import type { AktNode } from './f2-match-engine/types';
import { ierarxiyaTiklashRejasi, rejaYuki } from './smeta-ierarxiya-tiklash';

const ish = (uid: string): AktNode => ({ uid, type: 'bl', nom: 'Ish ' + uid, children: [{ uid: uid + 'r', type: 'rs', nom: 'Res' }] });
const rz = (uid: string, nom: string, children: AktNode[]): AktNode => ({ uid, type: 'rz', nom, children });

// Административное здание › КЖ › Земляные работы (2 ish) ; КЖ › Фундамент (1 ish) ; Благоустройство (1 ish, ildizda)
const TREE: AktNode[] = [
  rz('a', 'Административное здание', [
    rz('kj', 'КЖ', [rz('z', 'Земляные  работы', [ish('1'), ish('2')]), rz('f', 'Фундамент', [ish('3')])]),
  ]),
  rz('b', 'Благоустройство', [ish('4')]),
];

describe('bo‘lim ierarxiyasini asl fayldan tiklash rejasi', () => {
  it('ishli bo‘limlar fayl tartibida (bazadagi rz bilan indeks bo‘yicha), yo‘qolgan otalar — yangi', () => {
    const r = ierarxiyaTiklashRejasi(TREE);
    expect(r.yangi).toEqual([
      { k: 'y1', nom: 'Административное здание', ota: null },
      { k: 'y2', nom: 'КЖ', ota: 'y1' },
    ]);
    expect(r.ishli).toEqual([
      { nom: 'Земляные работы', ishSoni: 2, ota: 'y2' },
      { nom: 'Фундамент', ishSoni: 1, ota: 'y2' },
      { nom: 'Благоустройство', ishSoni: 1, ota: null },
    ]);
    expect(r.yollar[0]).toBe('Административное здание › КЖ › Земляные  работы');
    expect(r.maxChuqurlik).toBe(3);
    expect(rejaYuki(r).ishli[0]).toEqual(['y2', 2, 'Земляные работы']);
  });

  it('ishli bo‘lim o‘zi ham ota bo‘lsa (ishlar + ichki bo‘lim) — yangi qator yaratilmaydi, indeks bilan bog‘lanadi', () => {
    const r = ierarxiyaTiklashRejasi([rz('p', 'Земляные работы (КР-2)', [ish('1'), rz('c', 'Лист КР-87', [ish('2')])])]);
    expect(r.yangi).toEqual([]);
    expect(r.ishli.map((x) => x.ota)).toEqual([null, 0]);
  });
});
