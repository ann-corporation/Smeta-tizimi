import { describe, expect, it } from 'vitest';
import { daraxtResurslari, nomOxshashligi, transportVaraqOqi, transportVaraqmi, transportYoyYuki, zichlikHisobla } from './varaq';

const GRID = [
  ['Расчёт затрат транспорта'],
  [],
  ['№', 'Наименование материалов', 'Ед.изм', 'Кол-во', 'Кол-во (тн)', 'Дальность возки (км)', 'Грузооборот тн.км.', 'Стоимость тн.км', 'Стоимость всего'],
  [1, 'Гравийно-песчаная смесь', 'м3', 100, 150, 10, 1500, 1000, 1500000],
  [2, 'Щебень фракции 20-40', 'м3', 50, 75, 12, 900, 1000, 900000],
  [3, 'Эмульсия битумная', 'т', 4, 4, 15, 60, 1000, 60000],
  ['', 'ИТОГО', '', '', '', '', 2460, '', 2460000],
];

describe('transport varag\'i → transport_yoy yuki', () => {
  it('varaq aniqlanadi (nom yoki sarlavha matni)', () => {
    expect(transportVaraqmi('Трансп.', [])).toBe(true);
    expect(transportVaraqmi('Лист1', GRID)).toBe(true);
    expect(transportVaraqmi('Лист1', [['Смета']])).toBe(false);
  });

  it('ustunlar, narx va qatorlar o\'qiladi; ИТОГО tashlanadi', () => {
    const v = transportVaraqOqi(GRID)!;
    expect(v.qatorlar).toHaveLength(3);
    expect(v.tkm_narx).toBe(1000);
    expect(v.qatorlar[0]).toMatchObject({ material: 'Гравийно-песчаная смесь', birlik: 'м3', miqdor: 100, tonna: 150, km: 10, hisob_tkm: 1500 });
    expect(transportVaraqOqi([['Смета'], ['a', 'b']])).toBeNull();
  });

  it('zichlik = тн ÷ miqdor; tonna birligi — 1', () => {
    const v = transportVaraqOqi(GRID)!;
    expect(v.qatorlar.map(zichlikHisobla)).toEqual([1.5, 1.5, 1]);
  });

  it('nom o\'xshashligi so\'z boshi bo\'yicha', () => {
    expect(nomOxshashligi('Гравийно-песчаная смесь', 'СМЕСЬ ГРАВИЙНО-ПЕСЧАНАЯ С12303')).toBeGreaterThan(0.5);
    expect(nomOxshashligi('Щебень', 'Асфальтобетон')).toBe(0);
  });

  it('yuk: kodlar birlik + nom bo\'yicha; topilmagan — nom_pattern + topilmadi ro\'yxati', () => {
    const res = daraxtResurslari([{ type: 'rz', nom: 'Р', children: [{ type: 'bl', kod: 'Б', nom: 'Ish', children: [
      { type: 'mat', kod: '12303', nom: 'Смесь гравийно-песчаная', bir: 'м3' },
      { type: 'mat', kod: '12304', nom: 'Смесь гравийно-песчаная', bir: 'кг' },   // birlik mos emas
      { type: 'mat', kod: '30137', nom: 'Эмульсия битумная', bir: 'т' },
    ] }] }]);
    const y = transportYoyYuki(transportVaraqOqi(GRID)!, res);
    expect(y.tkm_narx).toBe(1000);
    expect(y.qatorlar[0]).toMatchObject({ zichlik: 1.5, km: 10, miqdor: 100, hisob_tkm: 1500, kodlar: ['12303'] });
    expect(y.qatorlar[2].kodlar).toEqual(['30137']);
    expect(y.qatorlar[1].kodlar).toBeUndefined();
    expect(y.qatorlar[1].nom_pattern).toContain('щебен');
    expect(y.topilmadi).toHaveLength(1);
  });
});