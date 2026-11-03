import { describe, expect, it } from 'vitest';
import { qarzHisobla, qatorSumma, royxatJami, yigNull, type AsosQator } from './hisob';

// Faqat sintetik raqamlar.
const q = (p: Partial<AsosQator> & Pick<AsosQator, 'tur'>): AsosQator => ({
  hujjat_raqam: null, sana: null, nomi: null, birlik: null, hajm: null, narx: null, summa: null, izoh: null, ...p,
});

describe('qatorSumma', () => {
  it('kiritilgan summa ustun; bo‘lmasa hajm x narx; bo‘lmasa NULL', () => {
    expect(qatorSumma({ summa: 500, hajm: 2, narx: 10 })).toBe(500);
    expect(qatorSumma({ summa: null, hajm: 10, narx: 100 })).toBe(1000);
    expect(qatorSumma({ summa: null, hajm: 10, narx: null })).toBeNull();
    expect(qatorSumma({ summa: null, hajm: null, narx: null })).toBeNull();
  });
  it('0 haqiqiy qiymat (noma‘lum emas); minus hajm minus summa beradi', () => {
    expect(qatorSumma({ summa: 0, hajm: null, narx: null })).toBe(0);
    expect(qatorSumma({ summa: null, hajm: -3, narx: 100 })).toBe(-300);
  });
});

describe('yigNull', () => {
  it('noma‘lumlarni tashlaydi, hammasi noma‘lum bo‘lsa NULL (0 emas)', () => {
    expect(yigNull([1, null, 2])).toBe(3);
    expect(yigNull([null, undefined])).toBeNull();
    expect(yigNull([])).toBeNull();
    expect(yigNull([0, null])).toBe(0);
  });
});

describe('qarzHisobla', () => {
  const lines = [
    q({ tur: 'yetkazib_berish', hajm: 10, narx: 100 }), // 1000
    q({ tur: 'yetkazib_berish', summa: 500 }),
    q({ tur: 'bajarilgan_ish', summa: 300 }),
    q({ tur: 'tolov', summa: 600 }),
  ];

  it('musbat qarz: qabul 1800 - to‘langan 600 = 1200 (biz qarzmiz)', () => {
    const h = qarzHisobla({ qatorlar: lines });
    expect(h.qabul).toBe(1800);
    expect(h.tolangan).toBe(600);
    expect(h.qarz).toBe(1200);
    expect(h.farq).toBeNull(); // spravka yo‘q
    expect(h.ogohlantirishlar).toEqual([]);
  });

  it('manfiy qarz (avans / ortiqcha to‘lov) ogohlantiriladi', () => {
    const h = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 100 }), q({ tur: 'tolov', summa: 400 })] });
    expect(h.qarz).toBe(-300);
    expect(h.ogohlantirishlar.map((o) => o.kod)).toContain('avans');
  });

  it('minus qator (qaytarish) qabulni kamaytiradi', () => {
    const h = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 1000 }), q({ tur: 'yetkazib_berish', hajm: -2, narx: 100 }), q({ tur: 'tolov', summa: 300 })] });
    expect(h.yetkazilgan).toBe(800);
    expect(h.qarz).toBe(500);
  });

  it('boshlang‘ich qoldiq qarzga qo‘shiladi', () => {
    const h = qarzHisobla({ qatorlar: [q({ tur: 'boshlangich_qoldiq', summa: 50 }), q({ tur: 'yetkazib_berish', summa: 100 }), q({ tur: 'tolov', summa: 20 })] });
    expect(h.boshlangich).toBe(50);
    expect(h.qarz).toBe(130);
  });

  it('NULL != 0: asossiz shartnomada qarz va qabul NULL', () => {
    const h = qarzHisobla({ qatorlar: [], spravkaQarz: 700 });
    expect(h.qabul).toBeNull();
    expect(h.tolangan).toBeNull();
    expect(h.qarz).toBeNull();
    expect(h.farq).toBeNull();
    expect(h.ogohlantirishlar.map((o) => o.kod)).toEqual(['asossiz_spravka']);
  });

  it('faqat yetkazish bor, to‘lov yo‘q: to‘langan NULL, qarz = qabul', () => {
    const h = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 250 })] });
    expect(h.tolangan).toBeNull();
    expect(h.qarz).toBe(250);
  });

  it('narxsiz qator qarzni buzmaydi, lekin ogohlantiriladi', () => {
    const h = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 100 }), q({ tur: 'yetkazib_berish', hajm: 5, narx: null })] });
    expect(h.qabul).toBe(100);
    expect(h.nomalumQator).toBe(1);
    expect(h.ogohlantirishlar.map((o) => o.kod)).toContain('summasiz_qator');
  });

  it('FARQ = hisob - spravka; chegaradan katta farq xato', () => {
    const h = qarzHisobla({ qatorlar: lines, spravkaQarz: 1000 });
    expect(h.farq).toBe(200);
    expect(h.ogohlantirishlar.find((o) => o.kod === 'farq')?.daraja).toBe('xato');
    expect(qarzHisobla({ qatorlar: lines, spravkaQarz: 1200 }).ogohlantirishlar).toEqual([]);
    expect(qarzHisobla({ qatorlar: lines, spravkaQarz: 1200 }).farq).toBe(0);
  });

  it('qabul shartnoma summasidan oshsa — ogohlantirish; teng bo‘lsa yo‘q', () => {
    expect(qarzHisobla({ qatorlar: lines, shartnomaSumma: 1500 }).ogohlantirishlar.map((o) => o.kod)).toContain('qabul_oshgan');
    expect(qarzHisobla({ qatorlar: lines, shartnomaSumma: 1800 }).ogohlantirishlar).toEqual([]);
    expect(qarzHisobla({ qatorlar: lines, shartnomaSumma: null }).ogohlantirishlar).toEqual([]);
  });

  it('t2_tolov bilan: bog‘lanmagan to‘lov qo‘shiladi, tolov_id bilan bog‘langan ikki marta sanalmaydi', () => {
    const a = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 1000 }), q({ tur: 'tolov', summa: 600 })], tolovT2: 100 });
    expect(a.tolangan).toBe(700);
    const b = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 1000 }), q({ tur: 'tolov', summa: 600, tolov_id: 5 })], tolovT2: 600 });
    expect(b.tolangan).toBe(600);
    expect(b.qarz).toBe(400);
    const c = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 1000 })], tolovT2: 250 });
    expect(c.tolangan).toBe(250);
  });

  it('spravkadagi to‘langan tizimdagidan ko‘p bo‘lsa ogohlantiradi', () => {
    const h = qarzHisobla({ qatorlar: lines, spravkaTolangan: 900 });
    expect(h.ogohlantirishlar.map((o) => o.kod)).toContain('tolov_spravkadan_kam');
  });

  it('kasr yaxlitlanadi (float shovqini yo‘q)', () => {
    const h = qarzHisobla({ qatorlar: [q({ tur: 'yetkazib_berish', summa: 0.1 }), q({ tur: 'yetkazib_berish', summa: 0.2 })] });
    expect(h.qabul).toBe(0.3);
  });
});

describe('royxatJami', () => {
  it('noma‘lum qarzlar jamiga kirmaydi va sanaladi', () => {
    const j = royxatJami([
      { qabul: 100, tolangan: 40, qarz: 60, farq: 10, shartnomaSumma: 200, spravkaQarz: 50 },
      { qabul: null, tolangan: null, qarz: null, farq: null, shartnomaSumma: 300, spravkaQarz: 20 },
    ]);
    expect(j.qarz).toBe(60);
    expect(j.qarzNomalum).toBe(1);
    expect(j.shartnomaSumma).toBe(500);
    expect(j.spravkaQarz).toBe(70);
    expect(royxatJami([]).qarz).toBeNull();
  });
});
