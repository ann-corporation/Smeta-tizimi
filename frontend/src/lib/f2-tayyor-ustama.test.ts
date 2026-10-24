import { describe, expect, it } from 'vitest';
import { axborotResursmi, f2KatKesim, type F2Qator } from './f2-tayyor';
import { NAKRUTKA_STANDART, nakrutkaKaskad } from './nakrutka-kaskad';
import { ustamaliHisobla } from './ustamali-summa';

const q = (tur: F2Qator['tur'], kat: string | null, summa: number): F2Qator => ({ id: 1, ishId: null, tur, kat, nom: 'x', birlik: null, hajm: 1, narx: summa, summa, manba: 'smeta', narxsiz: false });

describe('F2 ustamali jami (yagona qatlam) va axborot resurs', () => {
  it('axborot resurs nomi aniqlanadi', () => {
    expect(axborotResursmi('ЗАТРАТЫ ТРУДА МАШИНИСТОВ')).toBe(true);
    expect(axborotResursmi('Цемент М400')).toBe(false);
  });
  it('kat bo\'yicha kesim: M/K, КАБ, БЕЗ СКЛАД ajratiladi, kat\'siz - noma\'lum', () => {
    const k = f2KatKesim([q('rs', 'ЧЕЛ', 100), q('mat', 'М/К', 200), q('mat', 'КАБ', 10), q('mat', 'БЕЗ СКЛАД', 5), q('ob', null, 50)]);
    expect(k.nomalum).toBe(50);
    const r = ustamaliHisobla(k, NAKRUTKA_STANDART);
    expect(r.ustamali).toBe(nakrutkaKaskad({ chel: 100, mash: 0, mat: 215, ob: 0, mk: 200, kab: 10, bez: 5 }, NAKRUTKA_STANDART).itogo4);
  });
  it('koeffitsient yo\'q bo\'lsa ustamali null', () => { expect(ustamaliHisobla(f2KatKesim([q('mat', 'МАТ', 100)]), null).ustamali).toBeNull(); });
});
