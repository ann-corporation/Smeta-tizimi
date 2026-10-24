import { describe, expect, it } from 'vitest';
import { axborotResursmi, f2UstamaliJami, type F2Qator } from './f2-tayyor';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';

const q = (tur: F2Qator['tur'], kat: string | null, summa: number): F2Qator => ({ id: 1, ishId: null, tur, kat, nom: 'x', birlik: null, hajm: 1, narx: summa, summa, manba: 'smeta', narxsiz: false });

describe('F2 ustamali jami va axborot resurs', () => {
  it('axborot resurs nomi aniqlanadi', () => {
    expect(axborotResursmi('ЗАТРАТЫ ТРУДА МАШИНИСТОВ')).toBe(true);
    expect(axborotResursmi('Цемент М400')).toBe(false);
  });
  it('koeffitsient yo\'q bo\'lsa null', () => { expect(f2UstamaliJami([q('mat', null, 100)], null)).toBeNull(); });
  it('ustamali jami ustamasizdan katta', () => {
    const r = f2UstamaliJami([q('rs', 'ЧЕЛ', 100), q('mat', null, 200), q('ob', null, 50)], NAKRUTKA_STANDART)!;
    expect(r.ustamasiz).toBe(350);
    expect(r.ustamali).toBeGreaterThan(350);
    expect(r.ndsBilan).toBeGreaterThan(r.ustamali);
  });
});
