import { describe, expect, it } from 'vitest';
import { ishMaterialMoslik, ishMaterialMoslikQatorlar, moslikGuruhi, type MoslikQator } from './ish-material-moslik';

const mat = (nom: string, hajm: number | null, birlik = 'М3', extra: object = {}) => ({ id: null, nom, birlik, hajm, ...extra });

describe('ish-material-moslik: haqiqiy holatlar', () => {
  it('gazobeton kladka: ish 173,83 m3, bloklar 99,55 + 38,265 + 13,25 → taklif 151,065', () => {
    const n = ishMaterialMoslik(
      { nom: 'Кладка стен из газобетонных блоков', birlik: 'М3', hajm: 173.83 },
      [mat('Блоки газобетонные D500 600х200х300', 99.55), mat('Блоки газобетонные D500 600х200х400', 38.265), mat('Блоки газобетонные D500 600х250х300', 13.25), mat('Клей для газобетонных блоков', 3, 'Т')],
    );
    expect(n).not.toBeNull();
    expect(n?.guruh).toBe('gazobeton');
    expect(n?.taklif).toBe(151.065);
    expect(n?.kiritilgan).toBe(173.83);
    expect(n?.materiallar).toHaveLength(3); // yelim (Т) asos emas
  });

  it('tashqi issiqlik izolyatsiya: ish 3,4 (100 m2), plita va to‘r 143,4 m2 → taklif 1,434 (100 m2)', () => {
    const n = ishMaterialMoslik(
      { nom: 'Наружная теплоизоляция стен', birlik: '100М2', hajm: 3.4 },
      [mat('Плиты из минеральной ваты', 143.4, 'М2'), mat('Сетка стеклотканевая', 143.4, 'М2'), mat('Дюбели', 1500, 'ШТ')],
    );
    expect(n?.guruh).toBe('issiqlik');
    expect(n?.taklif).toBe(1.434);
    expect(n?.ishBirlik).toBe('100М2');
  });
});

describe('ish-material-moslik: ogohlantirish bo‘lmasligi kerak bo‘lgan holatlar', () => {
  it('profnastil 255,6 m2 ish, material 268,38 m2 (≈5 % ustma-ust) → ogohlantirish yo‘q', () => {
    const n = ishMaterialMoslik({ nom: 'Устройство кровли из профнастила', birlik: 'М2', hajm: 255.6 }, [mat('Профилированный настил С-21', 268.38, 'М2')]);
    expect(n).toBeNull();
  });

  it('profnastil: ish 200 m2 bo‘lsa — ogohlantirish, taklif 255,6 (ustma-ust 5 % ayrilgan)', () => {
    const n = ishMaterialMoslik({ nom: 'Устройство кровли из профнастила', birlik: 'М2', hajm: 200 }, [mat('Профилированный настил С-21', 268.38, 'М2')]);
    expect(n?.taklif).toBe(255.6);
  });

  it('smeta normasi aniq (k=1,05) bo‘lsa ustma-ust qayta qo‘shilmaydi', () => {
    const n = ishMaterialMoslik({ nom: 'Устройство кровли из профнастила', birlik: 'М2', hajm: 200 }, [mat('Профилированный настил', 268.38, 'М2', { kNorm: 1.05 })]);
    expect(n?.taklif).toBe(255.6);
    expect(ishMaterialMoslik({ nom: 'Устройство кровли из профнастила', birlik: 'М2', hajm: 255.6 }, [mat('Профилированный настил', 268.38, 'М2', { kNorm: 1.05 })])).toBeNull();
  });

  it('sendvich 88,5 m2 material, ish 0,885 (100 m2) → ogohlantirish yo‘q', () => {
    expect(ishMaterialMoslik({ nom: 'Монтаж сэндвич-панелей стен', birlik: '100М2', hajm: 0.885 }, [mat('Сэндвич-панели 100 мм', 88.5, 'М2')])).toBeNull();
  });

  it('materialsiz ish → ogohlantirish yo‘q', () => {
    expect(ishMaterialMoslik({ nom: 'Кладка стен из газобетонных блоков', birlik: 'М3', hajm: 173.83 }, [])).toBeNull();
  });

  it('komponentning biror materiali kiritilmagan (null/0) → xulosa yo‘q (NULL ≠ 0)', () => {
    const ish = { nom: 'Кладка стен из газобетонных блоков', birlik: 'М3', hajm: 173.83 };
    expect(ishMaterialMoslik(ish, [mat('Блоки газобетонные А', 99.55), mat('Блоки газобетонные Б', null)])).toBeNull();
    expect(ishMaterialMoslik(ish, [mat('Блоки газобетонные А', 99.55), mat('Блоки газобетонные Б', 0)])).toBeNull();
  });

  it('ish hajmi noma‘lum yoki guruh noma‘lum → jim', () => {
    expect(ishMaterialMoslik({ nom: 'Кладка стен из газобетонных блоков', birlik: 'М3', hajm: null }, [mat('Блоки газобетонные', 10)])).toBeNull();
    expect(ishMaterialMoslik({ nom: 'Окраска стен', birlik: 'М2', hajm: 10 }, [mat('Краска', 1, 'Т')])).toBeNull();
  });

  it('o‘lcham oilasi boshqa (blok dona, ish m3) → solishtirilmaydi', () => {
    expect(ishMaterialMoslik({ nom: 'Кладка стен из газобетонных блоков', birlik: 'М3', hajm: 10 }, [mat('Блоки газобетонные', 500, 'ШТ')])).toBeNull();
  });
});

describe('ish-material-moslik: tolerans, norma, birlik o‘girish', () => {
  const ish = { nom: 'Кладка стен из газобетонных блоков', birlik: 'М3', hajm: 100 };
  it('sukut tolerans 3 %: 102,9 → jim, 103,5 → ogohlantirish', () => {
    expect(ishMaterialMoslik({ ...ish, hajm: 102.9 }, [mat('Блоки газобетонные', 100)])).toBeNull();
    expect(ishMaterialMoslik({ ...ish, hajm: 103.5 }, [mat('Блоки газобетонные', 100)])?.taklif).toBe(100);
  });
  it('tolerans sozlanadi', () => {
    expect(ishMaterialMoslik({ ...ish, hajm: 103.5 }, [mat('Блоки газобетонные', 100)], { tolerans: 0.05 })).toBeNull();
    expect(ishMaterialMoslik({ ...ish, hajm: 101 }, [mat('Блоки газобетонные', 100)], { tolerans: 0.005 })?.taklif).toBe(100);
  });
  it('aniq norma: material = ish × 1,02 → taklif Σ ÷ norma', () => {
    const n = ishMaterialMoslik({ ...ish, hajm: 120 }, [mat('Блоки газобетонные', 102, 'М3', { norma: 1.02 })]);
    expect(n?.taklif).toBe(100);
  });
  it('birlik o‘girish: ish 100М3, material М3 va ish М3, material 100М3', () => {
    expect(ishMaterialMoslik({ ...ish, birlik: '100М3', hajm: 1 }, [mat('Блоки газобетонные', 100, 'М3')])).toBeNull();
    expect(ishMaterialMoslik({ ...ish, birlik: '100М3', hajm: 2 }, [mat('Блоки газобетонные', 100, 'М3')])?.taklif).toBe(1);
    expect(ishMaterialMoslik({ ...ish, birlik: 'М3', hajm: 100 }, [mat('Блоки газобетонные', 1, '100М3')])).toBeNull();
  });
  it('guruh aniqlash', () => {
    expect(moslikGuruhi('Устройство кровли из профилированного настила')).toBe('krovlya');
    expect(moslikGuruhi('Окраска')).toBeNull();
  });
});

describe('ishMaterialMoslikQatorlar: smeta qatorlari bo‘yicha (yadro bog‘lanishi orqali)', () => {
  const qator = (id: number, tur: string, nom: string, birlik: string, hajm: number, tartib: number, extra: Partial<MoslikQator> = {}): MoslikQator =>
    ({ id, ota_id: 1, tur, nom, birlik, hajm, tartib, kat: tur === 'mat' ? 'МАТ' : null, ...extra });
  const rows: MoslikQator[] = [
    { id: 1, ota_id: null, tur: 'rz', nom: 'Стены', birlik: null, hajm: null, tartib: 1 },
    qator(2, 'bl', 'Кладка стен из газобетонных блоков', 'М3', 173.83, 2),
    qator(3, 'mat', 'Блоки газобетонные D500 600х200х300', 'М3', 173.83, 3),
  ];
  it('ish va material kiritilgan: material 151,065 → ish uchun taklif', () => {
    const h = new Map<number, number>([[2, 173.83], [3, 151.065]]);
    const r = ishMaterialMoslikQatorlar(rows, h);
    expect(r).toHaveLength(1);
    expect(r[0].ishId).toBe(2);
    expect(r[0].taklif).toBe(151.065);
  });
  it('material kiritilmagan (hajmlarda yo‘q) → jim', () => {
    expect(ishMaterialMoslikQatorlar(rows, new Map([[2, 173.83]]))).toEqual([]);
  });
  it('mos kiritma → jim; `faqat` filtri', () => {
    expect(ishMaterialMoslikQatorlar(rows, new Map([[2, 151.065], [3, 151.065]]))).toEqual([]);
    expect(ishMaterialMoslikQatorlar(rows, new Map([[2, 173.83], [3, 151.065]]), { faqat: new Set([99]) })).toEqual([]);
  });
  it('rs bola normasi bilan: norma 0,5 va rs hajmi 40 → ish 80', () => {
    const q: MoslikQator[] = [
      { id: 1, ota_id: null, tur: 'rz', nom: 'Стены', birlik: null, hajm: null, tartib: 1 },
      { id: 2, ota_id: 1, tur: 'bl', nom: 'Устройство теплоизоляции', birlik: 'М2', hajm: 100, tartib: 2 },
      { id: 3, ota_id: 2, tur: 'rs', nom: 'Плиты минераловатные', birlik: 'М2', hajm: 50, tartib: 3, norma: 0.5 },
    ];
    const r = ishMaterialMoslikQatorlar(q, new Map([[2, 100], [3, 40]]));
    expect(r[0]?.taklif).toBe(80);
  });
});
