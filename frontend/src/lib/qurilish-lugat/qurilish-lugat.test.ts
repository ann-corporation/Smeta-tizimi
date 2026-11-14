import { afterEach, describe, expect, it } from 'vitest';
import { birlikOdam, lugatKengaytir, lugatOrnat, lugatTop, lugatTushuntir, odamNomi, uzKirill } from './index';
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import { qidiruvMoslagich } from '../f2-moslash-v3/qidiruv';

afterEach(() => lugatOrnat(null));

describe('lugatTop — oddiy til ↔ smeta tili', () => {
  it('g‘isht (lotin), ғишт (kirill), кирпич, кладка — bir tushuncha', () => {
    for (const s of ["g'isht", 'gisht', 'ғишт', 'кирпич', 'кладка', 'kirpich', "g'isht terish"]) expect(lugatTop(s)[0]).toBe('gisht');
  });
  it('стяжка / pol quyish → styajka; polietilen «pol» bilan adashmaydi', () => {
    expect(lugatTop('Устройство стяжек цементных')[0]).toBe('styajka');
    expect(lugatTop('pol quyish')).toContain('styajka');
    expect(lugatTop('полиэтиленовых труб')).not.toContain('pol');
  });
  it('normativ ish nomi → asosiy tushuncha', () => {
    expect(lugatTop('Гидроизоляция боковая обмазочная битумная в 2 слоя')[0]).toBe('gidroizolyatsiya');
    expect(lugatTop('Армирование: вязка каркасов арматурных')).toContain('armatura');
    expect(lugatTop('Разработка грунта в траншеях экскаватором')[0]).toBe('qazish');
  });
  it('mos kelmasa — bo‘sh; bir xil kirish — bir xil natija', () => {
    expect(lugatTop('xyzabc')).toEqual([]);
    expect(lugatTop('beton')).toEqual(lugatTop('beton'));
  });
});

describe('lugatKengaytir — qidiruv kengaytmasi', () => {
  it('g‘isht → КИРПИЧ, КЛАДК', () => {
    const k = lugatKengaytir("g'isht");
    expect(k).toContain('КИРПИЧ'); expect(k).toContain('КЛАДК');
  });
  it('qisqa/begona so‘z — bo‘sh', () => { expect(lugatKengaytir('')).toEqual([]); expect(lugatKengaytir('ab')).toEqual([]); });
  it('universal qidiruv: «g‘isht» smeta qatorini topadi (avval topmasdi)', () => {
    const topadi = qidiruvTayyorla("g'isht");
    expect(topadi('Кладка наружных стен из кирпича')).toBe(true);
    expect(topadi('Устройство бетонной подготовки')).toBe(false);
    const f2 = qidiruvMoslagich("g'isht");
    expect(f2?.('КЛАДКА СТЕН ИЗ КИРПИЧА')).toBe(true);
    expect(qidiruvMoslagich('pol quyish')?.('Устройство стяжек')).toBe(false); // ikkala so‘z ham bo‘lishi shart («quyish» — umumiy fe’l)
    expect(qidiruvMoslagich('стяжка')?.('УСТРОЙСТВО СТЯЖЕК')).toBe(true);
  });
});

describe('odamNomi / birlikOdam', () => {
  it('normativ nom → qisqa nom (+ diametr/qalinlik)', () => {
    expect(odamNomi({ nom: 'Кладка стен кирпичных наружных простых при высоте этажа до 4 м' })).toBe("G'isht terish");
    expect(odamNomi({ nom: 'Прокладка трубопроводов водоснабжения из полиэтиленовых труб диаметром 110 мм' }, 'ru')).toContain('Ø110');
    expect(odamNomi({ nom: 'Устройство стяжек цементных толщиной 20 мм' }, 'uz')).toBe('Pol styajkasi (quyish), qalinligi 20 mm');
    expect(odamNomi({ nom: 'Кладка стен кирпичных' }, 'uzKir')).toBe('Ғишт териш');
  });
  it('lug‘atda yo‘q nom — qisqartirilgan asl nom', () => {
    const s = odamNomi({ nom: 'Совершенно особая работа, с учетом всех факторов' });
    expect(s).toBe('Совершенно особая работа');
  });
  it('birlik odam tilida', () => {
    expect(birlikOdam('100 м2')).toBe('100 kvadrat');
    expect(birlikOdam('м3')).toBe('kub');
    expect(birlikOdam('чел-ч')).toBe('odam-soat');
    expect(birlikOdam('100 м2', 'ru')).toBe('100 м²');
    expect(birlikOdam('1000 шт', 'uzKir')).toBe('1000 дона');
    expect(birlikOdam('неизвестная')).toBe('неизвестная');
  });
  it('uzKirill: ғ ў қ ҳ, sh/ch/yo', () => {
    expect(uzKirill("o'rnatish")).toBe('ўрнатиш');
    expect(uzKirill("Shag'al")).toBe('Шағал');
    expect(uzKirill('chiroq')).toBe('чироқ');
  });
});

describe('kompaniya lug‘ati', () => {
  it('qo‘shilgan sinonim tushunchaga ulanadi va qidiruvni kengaytiradi', () => {
    expect(lugatTop('kishlak')).toEqual([]);
    lugatOrnat({ sinonim: [{ kalit: 'gisht', soz: 'kishlak' }] });
    expect(lugatTop('kishlak')[0]).toBe('gisht');
    expect(lugatKengaytir('kishlak')).toContain('КИРПИЧ');
  });
  it('yangi tushuncha va o‘z nom', () => {
    lugatOrnat({ sinonim: [{ kalit: 'maxsus', soz: 'zumrad' }], nomlar: [{ kalit: 'maxsus', uz: 'Zumrad ish', ru: 'Особая работа' }, { kalit: 'gisht', uz: 'Terish (bizda)' }] });
    expect(lugatTop('zumrad')[0]).toBe('maxsus');
    expect(odamNomi({ nom: 'Кладка стен' })).toBe('Terish (bizda)');
  });
  it('noto‘g‘ri kirish tashlanadi; null — umumiy lug‘at', () => {
    lugatOrnat({ sinonim: [{ kalit: '', soz: 'x' }, null as never] });
    expect(lugatTop('кирпич')[0]).toBe('gisht');
  });
  it('lugatTushuntir: topilmasa aniq xabar', () => {
    expect(lugatTushuntir('qwerty')).toContain('topilmadi');
    expect(lugatTushuntir("g'isht")).toContain('КИРПИЧ');
  });
});
