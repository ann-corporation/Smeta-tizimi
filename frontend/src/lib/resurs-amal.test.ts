import { describe, expect, it } from 'vitest';
import { chiqarilganmi, chiqarishHajmi, chiqarishRuxsat, mehnatResursmi, zamenaRuxsat } from './resurs-amal';
import { faktYigindiHisobla } from './fakt-studio';

describe('Fakt yig‘indisi: chiqarilgan resursning (norma × ish faktidan) hosila fakt summasi jamiga kirmaydi', () => {
  const rows = [{ id: 1, tur: 'bl', kat: null, ota_id: null, qoshimcha: false, zamena: false }, { id: 2, tur: 'rs', kat: 'МАШ', ota_id: 1, qoshimcha: false, zamena: false }, { id: 3, tur: 'rs', kat: 'МАТ', ota_id: 1, qoshimcha: false, zamena: false }];
  const states = [{ qator_id: 2, smeta_hajm: 6, fakt_hajm: 3, fakt_summa: 900, smeta_narx: 300 }, { qator_id: 3, smeta_hajm: 10, fakt_hajm: 5, fakt_summa: 500, smeta_narx: 100 }];
  it('to‘liq belgilangan — chiqarilgan (jamida yo‘q); qisman — fakt summasi qoladi', () => {
    expect(faktYigindiHisobla(rows, states, [{ qator_id: 2, bajarilmagan_hajm: 6, holat: 'faol' }]).faktUstamasiz).toBe(500);
    expect(faktYigindiHisobla(rows, states, [{ qator_id: 2, bajarilmagan_hajm: 2, holat: 'faol' }]).faktUstamasiz).toBe(1400);
    expect(faktYigindiHisobla(rows, states, [{ qator_id: 2, bajarilmagan_hajm: 6, holat: 'bekor' }]).faktUstamasiz).toBe(1400);
  });
});

const asos = { ishIchida: true, smeta: 10, ozFakt: 0, belgilangan: 0 };

describe('resurs-amal: ishchi mehnati aniqlagichi', () => {
  it('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ (ЧЕЛ) — mehnat', () => {
    expect(mehnatResursmi({ tur: 'rs', kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'ЧЕЛ.-Ч' })).toBe(true);
    // kat yo'q bo'lsa ham — nom va birlik bo'yicha (mavjud katAniqla)
    expect(mehnatResursmi({ tur: 'rs', kat: null, nom: 'Затраты труда рабочих', birlik: 'чел.-ч' })).toBe(true);
    expect(mehnatResursmi({ tur: 'rs', kat: null, nom: 'ЗАТРАТЫ ТРУДА МАСТЕРОВ', birlik: 'ЧЕЛ-Ч' })).toBe(true);
  });
  it('mashinistlar mehnati, mashina, material, uskuna, ish — mehnat emas', () => {
    expect(mehnatResursmi({ tur: 'rs', kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'ЧЕЛ.-Ч' })).toBe(false);
    expect(mehnatResursmi({ tur: 'rs', kat: null, nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'ЧЕЛ.-Ч' })).toBe(false);
    expect(mehnatResursmi({ tur: 'rs', kat: 'МАШ', nom: 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ', birlik: 'МАШ.-Ч' })).toBe(false);
    expect(mehnatResursmi({ tur: 'mat', kat: 'МАТ', nom: 'БЕТОН', birlik: 'М3' })).toBe(false);
    expect(mehnatResursmi({ tur: 'ob', kat: null, nom: 'НАСОС', birlik: 'ШТ' })).toBe(false);
    expect(mehnatResursmi({ tur: 'bl', kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'ЧЕЛ.-Ч' })).toBe(false);
  });
});

describe('resurs-amal: zamena va chiqarish ruxsati', () => {
  it('mehnat uchun zamena YO‘Q (sababi bilan); chiqarish ham hozircha yo‘q', () => {
    const m = { ...asos, tur: 'rs', kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'ЧЕЛ.-Ч' };
    const z = zamenaRuxsat(m); const c = chiqarishRuxsat(m);
    expect(z.mumkin).toBe(false); expect(!z.mumkin && z.sabab).toMatch(/zamena qilinmaydi/);
    expect(c.mumkin).toBe(false); expect(!c.mumkin && c.sabab).toMatch(/chiqarib bo‘lmaydi/);
  });
  it('mashina/material/perevozka — zamena va chiqarish mumkin', () => {
    for (const r of [{ tur: 'rs', kat: 'МАШ', nom: 'АВТОМОБИЛИ БОРТОВЫЕ', birlik: 'МАШ.-Ч' }, { tur: 'mat', kat: 'МАТ', nom: 'ЩЕБЕНЬ', birlik: 'М3' }, { tur: 'rs', kat: 'МАТ', nom: 'ПЕРЕВОЗКА ГРУЗОВ', birlik: 'Т' }]) {
      expect(zamenaRuxsat({ ...asos, ...r }).mumkin).toBe(true);
      expect(chiqarishRuxsat({ ...asos, ...r }).mumkin).toBe(true);
    }
  });
  it('chiqarish: o‘z fakti bor, belgi bor, smeta noma‘lum, ishsiz yoki qo‘shilgan resurs — yo‘q', () => {
    const r = { tur: 'mat', kat: 'МАТ', nom: 'ЩЕБЕНЬ', birlik: 'М3' };
    expect(chiqarishRuxsat({ ...asos, ...r, ozFakt: 2 }).mumkin).toBe(false);
    expect(chiqarishRuxsat({ ...asos, ...r, belgilangan: 1 }).mumkin).toBe(false);
    expect(chiqarishRuxsat({ ...asos, ...r, smeta: null }).mumkin).toBe(false);
    expect(chiqarishRuxsat({ ...asos, ...r, ishIchida: false }).mumkin).toBe(false);
    expect(chiqarishRuxsat({ ...asos, ...r, zamena: true }).mumkin).toBe(false);
    expect(zamenaRuxsat({ ...asos, ...r, qoshimcha: true }).mumkin).toBe(false);
  });
});

describe('resurs-amal: chiqarilgan (NULL ≠ 0)', () => {
  it('butun smeta hajmi belgilangan bo‘lsa — chiqarilgan; qisman — yo‘q', () => {
    expect(chiqarilganmi(12.5, 12.5)).toBe(true);
    expect(chiqarilganmi(12.5, 12.4)).toBe(false);
    expect(chiqarilganmi(-4, 4)).toBe(true); // chegirma qatori — modul bo'yicha
  });
  it('smeta NULL yoki 0, belgi NULL — chiqarilgan emas (to‘qilmaydi)', () => {
    expect(chiqarilganmi(null, 5)).toBe(false);
    expect(chiqarilganmi(0, 0)).toBe(false);
    expect(chiqarilganmi(10, null)).toBe(false);
    expect(chiqarilganmi(10, undefined)).toBe(false);
  });
  it('chiqarish hajmi — to‘liq smeta (modul), noma‘lum bo‘lsa null', () => {
    expect(chiqarishHajmi(3.1234567)).toBe(3.123457);
    expect(chiqarishHajmi(-2)).toBe(2);
    expect(chiqarishHajmi(null)).toBeNull();
    expect(chiqarishHajmi(0)).toBeNull();
  });
});
