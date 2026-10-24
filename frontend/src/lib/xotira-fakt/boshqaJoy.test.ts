import { describe, expect, it } from 'vitest';
import type { IshTuriVariant } from '../../api/t2-ish-abc';
import { qatorlarniOqi } from './parse';
import { boshlangichHajm, boshqaJoySabab, variantResurslari } from './boshqaJoy';

const v: IshTuriVariant = {
  manba: 'smeta', qator_id: 77, kod: 'E6-1-1', nom: 'УСТРОЙСТВО СТЕН', birlik: '100М3', shu_obyekt: true, soni: 2,
  sostav: [
    { tur: 'rs', kat: 'ЧЕЛ', kod: null, nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', norma: 200, narx: 20000 },
    { tur: 'mat', kat: null, kod: '12-5', nom: 'БЕТОН', birlik: 'М3', norma: 102, narx: null },
  ],
};

describe('boshqa joydan olish (sof mantiq)', () => {
  it('resurslar: norma va narx saqlanadi; narxsiz resurs «qolda» va bo‘sh (narxsiz, 0 emas)', () => {
    const r = variantResurslari(v);
    expect(r.map((x) => [x.kat, x.norma, x.narx, x.manba])).toEqual([['ЧЕЛ', '200', '20000', 'smeta'], ['МАТ', '102', '', 'qolda']]);
  });
  it('hajm: m3 → 100М3 nisbati; birlik mos kelmasa bo‘sh; birliksiz son — o‘zi', () => {
    const [a, b, c] = qatorlarniOqi('devor 120 m3\ndevor 50 m2\ndevor 7');
    expect(boshlangichHajm(a, '100М3')).toBe('1.2');
    expect(boshlangichHajm(b, '100М3')).toBe('');
    expect(boshlangichHajm(c, '100М3')).toBe('7');
  });
  it('sabab manba qator id sini saqlaydi', () => {
    const [a] = qatorlarniOqi('devor 120 m3');
    expect(boshqaJoySabab(v, a.xom)).toContain('#77');
    expect(boshqaJoySabab({ ...v, shu_obyekt: false }, a.xom)).toContain('boshqa obyekt');
  });
});
