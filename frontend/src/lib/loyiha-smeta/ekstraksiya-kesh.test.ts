import { describe, expect, it } from 'vitest';
import { paketdanOl, paketla } from './ekstraksiya-kesh';

describe('xom ekstraksiya keshi (R2)', () => {
  it('kompakt paket aylanma: yo‘qotishsiz (bir xonali yaxlitlash), yaroqsiz format rad', () => {
    const items = [{ s: 'Бетон кл. В20', x: 10.04, y: 20.06, w: 50, h: 8, sahifa: 3 }, { s: '54.470', x: 400, y: 23, w: 30, h: 8, sahifa: 3 }];
    expect(paketdanOl(paketla(items))).toEqual([{ ...items[0], x: 10, y: 20.1 }, items[1]]);
    expect(paketdanOl({ v: 99, items: [] })).toBeNull();
    expect(paketdanOl({ v: 1, items: [['a', 'x', 1, 1, 1, 1]] })).toBeNull();
  });
});
