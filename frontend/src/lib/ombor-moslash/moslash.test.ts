import { describe, expect, it } from 'vitest';
import { birlikKaliti, guruhla, moslikBalli, nomKaliti, qidir } from './moslash';

// Faqat sintetik nomlar: haqiqiy ombor ma'lumoti testga kirmaydi.
describe('nomKaliti', () => {
  it('lotin/kirill o\'xshash harflar bitta kalit beradi', () => {
    // «Пoлиэтилен» — «о» lotin
    expect(nomKaliti('Пoлиэтилен труба ф25')).toBe(nomKaliti('Полиэтилен труба ф25'));
    expect(nomKaliti('Cтрoйка')).toBe(nomKaliti('Стройка'));
  });
  it('х / x / × / * o\'lcham ajratgichi va bo\'shliqlar farq qilmaydi', () => {
    const a = nomKaliti('Уголок 50х50х5');
    expect(nomKaliti('Уголок 50x50x5')).toBe(a);
    expect(nomKaliti('Уголок 50 × 50 × 5')).toBe(a);
    expect(nomKaliti('  уголок   50*50*5 ')).toBe(a);
  });
  it('o\'nli vergul va nuqta bir xil', () => {
    expect(nomKaliti('Лист 2,5 мм')).toBe(nomKaliti('лист 2.5 мм'));
  });
  it('o\'zbek lotin va rus kirill bir xil kalitga keladi (truba/quvur)', () => {
    expect(nomKaliti('Quvur 25')).toBe(nomKaliti('Труба 25'));
    expect(nomKaliti('Sement M400')).toBe(nomKaliti('Цемент М400'));
  });
});

describe('birlikKaliti', () => {
  it('birlik yozilishlari', () => {
    expect(birlikKaliti('шт')).toBe(birlikKaliti('dona'));
    expect(birlikKaliti('м2')).toBe(birlikKaliti('кв.м'));
    expect(birlikKaliti('м3')).toBe(birlikKaliti('куб'));
    expect(birlikKaliti('тн')).toBe(birlikKaliti('т'));
    expect(birlikKaliti('м')).not.toBe(birlikKaliti('шт'));
  });
});

describe('moslikBalli', () => {
  it('o\'lcham farqi birlashtirilmaydi', () => {
    expect(moslikBalli({ nomi: 'Труба ф25', birligi: 'м' }, { nomi: 'Труба ф32', birligi: 'м' }).ball).toBe(0);
  });
  it('birlik farqi birlashtirilmaydi', () => {
    expect(moslikBalli({ nomi: 'Труба ф25', birligi: 'м' }, { nomi: 'Труба ф25', birligi: 'шт' }).ball).toBe(0);
  });
  it('bir xil narsaning turli yozuvi yuqori ball', () => {
    const b = moslikBalli({ nomi: 'Полиэтилен труба ф25', birligi: 'м' }, { nomi: 'ПЭ труба Д25', birligi: 'м' });
    expect(b.ball).toBeGreaterThanOrEqual(0.8);
  });
});

describe('qidir', () => {
  const katalog = [
    { id: 1, nomi: 'Полиэтилен труба ф25', birligi: 'м' },
    { id: 2, nomi: 'Полиэтилен труба ф32', birligi: 'м' },
    { id: 3, nomi: 'Цемент М400', birligi: 'тн' },
    { id: 4, nomi: 'Электрод арсенал 3', birligi: 'кг' },
  ];
  it('qisman kiritish', () => {
    expect(qidir('труба 25', katalog)[0].id).toBe(1);
    expect(qidir('элек', katalog)[0].id).toBe(4);
  });
  it('lotin yozuvdagi so\'rov kirill katalogni topadi', () => {
    expect(qidir('sement', katalog)[0].id).toBe(3);
  });
  it('imlo xatosi', () => {
    expect(qidir('poletilen truba 32', katalog)[0].id).toBe(2);
  });
  it('bo\'sh so\'rov bo\'sh natija', () => {
    expect(qidir('   ', katalog)).toEqual([]);
  });
});

describe('guruhla', () => {
  it('variantlarni bitta guruhga yig\'adi, o\'lchamlarni ajratadi', () => {
    const g = guruhla([
      { nomi: 'Полиэтилен труба ф25', birligi: 'м', soni: 5 },
      { nomi: 'Пoлиэтилен труба ф25', birligi: 'м', soni: 1 },
      { nomi: 'ПЭ труба Д25', birligi: 'м', soni: 2 },
      { nomi: 'Полиэтилен труба ф32', birligi: 'м', soni: 4 },
      { nomi: 'Цемент М400', birligi: 'тн', soni: 3 },
    ]);
    const g25 = g.find((x) => x.variantlar.some((v) => v.nomi === 'ПЭ труба Д25'));
    expect(g25?.kanonik).toBe('Полиэтилен труба ф25');
    expect(g25?.variantlar.length).toBe(3);
    expect(g25?.jami).toBe(8);
    expect(g.find((x) => x.kanonik === 'Полиэтилен труба ф32')?.variantlar.length).toBe(1);
    expect(g.length).toBe(3);
  });
});
