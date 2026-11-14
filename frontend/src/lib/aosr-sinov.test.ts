import { describe, expect, it } from 'vitest';
import type { AosrCoverage } from '../api/t2-aosr';
import { bosqichAniqla, guruhResurslari, namunaAkt, zanjirQur } from './aosr-zanjir';
import { coverageTurBilan, resursKatmi } from './aosr-resurs';
import { hajmQatorlari } from './aosr-ilova';

// Real Stella 152 topilmalari (sintetik ma'lumot bilan).
const c = (id: number, nom: string, kat: string | null, fakt = 1, birlik = 'т'): AosrCoverage => ({ qator_id: id, obyekt_id: 1, nom, kod: null, birlik, kat, fakt_hajm: fakt, yashirin: true, akt_bor: false });

describe('АОСР: real obyekt topilmalari', () => {
  it('resurs kategoriyasi kirillcha («МАТ», «ОБ») ham, lotincha ham tanilsin', () => {
    expect(['МАТ', 'ОБ', 'mat', 'ob', 'мат'].every(resursKatmi)).toBe(true);
    expect(['ЧЕЛ', 'МАШ', null, ''].some(resursKatmi)).toBe(false);
    // hajm hisobi resursni ish sifatida sanamaydi
    expect(hajmQatorlari([c(1, 'АРМАТУРА', 'МАТ'), c(2, 'БЕТОНИРОВАНИЕ', null, 3, 'м3')])).toHaveLength(1);
  });

  it('kategoriyasiz material (kat NULL) smeta turi (mat) bo‘yicha resurs deb olinadi', () => {
    const cov = [c(1, 'БЕТОН ТЯЖЕЛЫЙ В15', null), c(2, 'УСТРОЙСТВО ФУНДАМЕНТА', null)];
    const t = coverageTurBilan(cov, [{ id: 1, tur: 'mat' }, { id: 2, tur: 'bl' }]);
    expect(t.map((x) => resursKatmi(x.kat))).toEqual([true, false]);
    expect(cov[0].kat).toBeNull(); // asl o‘zgarmaydi
  });

  it('material ish emas, razdel ostida turadi: guruh resurslari bosqichiga tushadi, materiallarda ko‘rinadi', () => {
    const ish = [c(10, 'ИЗГОТОВЛЕНИЕ АРМАТУРНЫХ КАРКАСОВ', null), c(11, 'УСТРОЙСТВО ФУНДАМЕНТНОЙ ПЛИТЫ Е6-1', null)];
    const mat = [c(20, 'АРМАТУРА КЛАССА А-III ДИАМ. 12 ММ', 'МАТ'), c(21, 'ЧУЖАЯ АРМАТУРА', 'МАТ')];
    const ota = new Map<number, number | null>([[10, 1], [11, 1], [20, 1], [21, 2]]);
    const g = guruhResurslari([...ish, ...mat], ota, new Set([10, 11]));
    expect(g.map((x) => x.qator_id)).toEqual([20]); // boshqa razdeldagi material kirmaydi
    const z = zanjirQur({ ishlar: ish, resurslar: new Map(), guruhResurslar: g, konstruksiya: 'ФУНДАМЕНТ ПФ-1' });
    const arm = z.qoralamalar.find((q) => q.bosqich === 'armatura')!;
    expect(arm.resurslar.map((r) => r.qator_id)).toEqual([20]);
    expect(arm.malumot.materiallar).toContain('АРМАТУРА');
    expect(arm.malumot.ish_nomi).toMatch(/— ФУНДАМЕНТ ПФ-1$/);
    // bosqichi zanjirda yo‘q material yangi bosqich yaratmaydi
    expect(z.qoralamalar.some((q) => q.bosqich === 'gidroizol')).toBe(false);
  });

  it('namuna akt: eng yangisi emas, komissiya FIO si eng to‘liqi (bo‘sh qoralama bo‘shlikni ko‘chirmasin)', () => {
    const k = (...f: string[]) => f.map((fio, i) => ({ rol: ['smo', 'texnadzor', 'loyihachi'][i], fio }));
    const a = [{ holat: 'yangi' as const, komissiya: k('Б', '', '') }, { holat: 'bekor' as const, komissiya: k('X', 'Y', 'Z') }, { holat: 'qogoz' as const, komissiya: k('Б', 'Ж', 'К') }];
    expect(namunaAkt(a)).toBe(a[2]);
    expect(namunaAkt([])).toBeUndefined();
  });

  it('закладные детали — alohida bosqich (beton emas); bitumli izolyatsiya — gidroizolyatsiya', () => {
    expect(bosqichAniqla({ nom: 'УСТАНОВКА ЗАКЛАДНЫХ ДЕТАЛЕЙ ВЕСОМ ДО 20 КГ', kod: 'Е6-1-1' })).toBe('zakladnoy');
    expect(bosqichAniqla({ nom: 'ИЗОЛЯЦИЯ ИЗДЕЛИЯМИ ИЗ ПЕНОПЛАСТА НА БИТУМЕ СТЕН', kod: null })).toBe('gidroizol');
    const z = zanjirQur({ ishlar: [c(1, 'УСТАНОВКА ЗАКЛАДНЫХ ДЕТАЛЕЙ', null), c(2, 'БЕТОНИРОВАНИЕ КОЛОНН', null)], resurslar: new Map() });
    expect(z.qoralamalar.map((q) => q.bosqich)).toEqual(['zakladnoy', 'beton']);
  });
});
