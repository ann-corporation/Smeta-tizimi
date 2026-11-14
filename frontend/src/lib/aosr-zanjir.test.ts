import { describe, expect, it } from 'vitest';
import type { AosrCoverage } from '../api/t2-aosr';
import { avtoQoralamami, bekorQilsaBoladigan, bosqichAniqla, kodNormal, keyingiAosrRaqam, zanjirQur } from './aosr-zanjir';

const q = (id: number, nom: string, o: Partial<AosrCoverage> = {}): AosrCoverage => ({
  qator_id: id, obyekt_id: 1, nom, kod: null, birlik: 'м3', kat: 'bl', fakt_hajm: 10, yashirin: true, akt_bor: false, ...o,
});

describe('bosqichAniqla', () => {
  it('shifr prefiksi: Е6-1 beton, Е6-2 / С124 armatura, Е12-2 gidroizolyatsiya, Е11/Е15 qoplama (lotin/kirill farqsiz)', () => {
    expect(bosqichAniqla({ kod: 'E6-1-12', nom: 'Плита' })).toBe('beton');
    expect(bosqichAniqla({ kod: 'Е6-2-3', nom: 'Плита' })).toBe('armatura');
    expect(bosqichAniqla({ kod: 'C124-1', nom: 'Стержни' })).toBe('armatura');
    expect(bosqichAniqla({ kod: 'Е12-2-5', nom: 'Слой' })).toBe('gidroizol');
    expect(bosqichAniqla({ kod: 'E11-20', nom: 'Слой' })).toBe('qoplama');
    expect(bosqichAniqla({ kod: 'Е15-4', nom: 'Слой' })).toBe('qoplama');
    expect(kodNormal('e6-1')).toBe('Е6-1');
  });
  it('nom kalit so\'zlari shifrdan oldin aniq belgilar uchun (бетонная подготовка — beton emas)', () => {
    expect(bosqichAniqla({ kod: 'Е6-1-1', nom: 'Устройство бетонной подготовки' })).toBe('podgotovka');
    expect(bosqichAniqla({ nom: 'Устройство опалубки плиты' })).toBe('opalubka');
    expect(bosqichAniqla({ nom: 'Армирование плиты' })).toBe('armatura');
    expect(bosqichAniqla({ nom: 'Обмазочная гидроизоляция' })).toBe('gidroizol');
    expect(bosqichAniqla({ nom: 'Уплотнение грунта' })).toBe('zamin');
    expect(bosqichAniqla({ nom: 'Грунтовка стен' })).toBeNull();
    expect(bosqichAniqla({ nom: 'Укладка гранита' })).toBe('qoplama');
    expect(bosqichAniqla({ nom: 'Что-то непонятное' })).toBeNull();
  });
});

describe('zanjirQur', () => {
  const ishlar = [
    q(1, 'Уплотнение грунта'), q(2, 'Устройство бетонной подготовки'), q(3, 'Армирование плиты', { birlik: 'т' }),
    q(4, 'Бетонирование плиты B25'), q(5, 'Обмазочная гидроизоляция', { birlik: 'м2' }),
  ];
  it('bosqichlar qurilish tartibida, har biri alohida qoralama; keyingi ish keyingi bosqichdan', () => {
    const r = zanjirQur({ ishlar: [...ishlar].reverse(), resurslar: new Map() });
    expect(r.qoralamalar.map((x) => x.bosqich)).toEqual(['zamin', 'podgotovka', 'armatura', 'beton', 'gidroizol']);
    expect(r.qoralamalar[0].malumot.keyingi_ishlar).toContain('подготовк');
    expect(r.qoralamalar[3].malumot.keyingi_ishlar).toContain('гидроизоляц');
    // oxirgi mavjud bosqichdan keyingi — qat'iy tartib nomi (o'ylab topilmaydi, faqat keyingi bosqich turi)
    expect(r.yoq).toEqual(['opalubka']);
  });
  it('ish nomidan bosqich chiqmasa — resurslardan taqsimlanadi (armatura Ø/klass va beton sinfi belgilari)', () => {
    const plita = q(10, 'Устройство монолитной плиты перекрытия', { kat: 'bl' });
    const res = new Map([[10, [
      q(11, 'Арматура Ø12 А500С', { kat: 'mat', birlik: 'т', fakt_hajm: 2.5 }),
      q(12, 'Бетон тяжёлый В25 W6 F150', { kat: 'mat', birlik: 'м3', fakt_hajm: 45 }),
      q(13, 'Щиты опалубочные', { kat: 'mat', birlik: 'м2', fakt_hajm: 80 }),
      q(14, 'Затраты труда рабочих', { kat: 'rs', birlik: 'чел-ч', fakt_hajm: 100 }),
    ]]]);
    const r = zanjirQur({ ishlar: [plita], resurslar: res });
    expect(r.qoralamalar.map((x) => x.bosqich)).toEqual(['armatura', 'opalubka', 'beton']);
    const arm = r.qoralamalar[0]; const beton = r.qoralamalar[2];
    expect(arm.belgilar).toEqual(expect.arrayContaining(['Ø12', 'А500С']));
    expect(arm.malumot.materiallar).toContain('Арматура');
    expect(beton.belgilar).toEqual(expect.arrayContaining(['B25', 'W6', 'F150']));
    // mehnat (rs) resursi aktga kirmaydi
    expect(r.qoralamalar.flatMap((x) => x.qatorIds)).not.toContain(14);
    // materialsiz-ish bosqichda ham tavsif bo'sh emas
    expect(arm.malumot.ish_tavsifi).toBeTruthy();
    expect(arm.malumot.ish_nomi).toContain('плит');
  });
  it('bosqichi aniqlanmagan ish — alohida ro\'yxatda, zanjirga kirmaydi', () => {
    const r = zanjirQur({ ishlar: [q(20, 'Прочее')], resurslar: new Map() });
    expect(r.qoralamalar).toEqual([]);
    expect(r.aniqlanmagan.map((x) => x.qator_id)).toEqual([20]);
  });
});

describe('raqamlash va avto-qoralama', () => {
  it('davomli raqam: bekor qilinganlar hisobga kirmaydi; A-0078 → 79', () => {
    expect(keyingiAosrRaqam([])).toBe(1);
    expect(keyingiAosrRaqam([{ raqam: '12', holat: 'qogoz' }, { raqam: 'A-0078', holat: 'yangi' }, { raqam: '200', holat: 'bekor' }])).toBe(79);
  });
  it('avto-qoralama: faqat «avto:» izohli qoralama; yuborilgan/protokolli bekor qilinmaydi', () => {
    expect(avtoQoralamami({ holat: 'yangi', izoh: 'avto: slichitelniy asosi' })).toBe(true);
    expect(avtoQoralamami({ holat: 'tasdiqlangan', izoh: 'avto: x' })).toBe(false);
    expect(avtoQoralamami({ holat: 'yangi', izoh: 'ESKI-REESTR' })).toBe(false);
    const a = [
      { id: 1, holat: 'yangi' as const, izoh: 'avto: a', protokol_soni: 0 },
      { id: 2, holat: 'yangi' as const, izoh: 'avto: b', protokol_soni: 1 },
      { id: 3, holat: 'yangi' as const, izoh: 'avto: c', protokol_soni: 0 },
      { id: 4, holat: 'yangi' as const, izoh: null, protokol_soni: 0 },
    ];
    expect(bekorQilsaBoladigan(a, new Set([3]))).toEqual([1]);
  });
});
