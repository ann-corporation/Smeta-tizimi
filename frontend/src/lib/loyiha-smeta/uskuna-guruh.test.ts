import { describe, expect, it } from 'vitest';
import { uskunaGuruhlari } from './uskuna-guruh';
import { farqlarniHisobla, type FarqMiqdor } from './farq';
import type { SmetaQator } from './moslash';

const smeta: SmetaQator[] = [
  { id: 1, ota_id: null, tur: 'rz', nom: 'ОТОПЛЕНИЕ (ОВ-3)', birlik: null, hajm: null, narx: null },
  { id: 2, ota_id: 1, tur: 'bl', nom: 'УСТАНОВКА РАДИАТОРОВ ОТОПЛЕНИЯ СТАЛЬНЫХ', birlik: 'шт', hajm: 12, narx: 100 },
  { id: 3, ota_id: 1, tur: 'bl', nom: 'УСТАНОВКА НАСОСОВ ЦИРКУЛЯЦИОННЫХ', birlik: 'шт', hajm: 2, narx: 500 },
];
const els = [
  { id: 10, nom: 'Радиатор стальной тип 22, 500х1000', birlik: 'шт', miqdor: 5 }, { id: 11, nom: 'Радиатор стальной тип 11, 500х800', birlik: 'шт', miqdor: 7 },
  { id: 12, nom: 'Насос циркуляционный Grundfos', birlik: 'шт', miqdor: 2 }, { id: 13, nom: 'Клапан балансировочный', birlik: 'шт', miqdor: 4 },
];

describe('uskunalar: smeta yig‘ma qatori bo‘yicha guruh (1:1 emas)', () => {
  it('bir nechta radiator qatori bitta yig‘ma qatorga guruhlanadi; jami farq bilan; mos kelmagan element guruhsiz', () => {
    const g = uskunaGuruhlari(els, smeta);
    expect(g.map((x) => [x.qatorId, x.elementlar.map((e) => e.id), x.loyihaJami, x.farq])).toEqual([[2, [10, 11], 12, 0], [3, [12], 2, 0]]);
    expect(g.flatMap((x) => x.elementlar.map((e) => e.id))).not.toContain(13);
  });
  it('birlik mos emas yoki miqdor noma‘lum -> jami null (0 emas)', () => {
    const g = uskunaGuruhlari([{ id: 1, nom: 'Радиатор стальной', birlik: 'м', miqdor: 3 }, { id: 2, nom: 'Радиатор панельный', birlik: 'шт', miqdor: null }], smeta);
    expect(g[0].loyihaJami).toBeNull(); expect(g[0].farq).toBeNull();
  });
  it('farq hisobi: uskuna elementlari bir qatorga bog‘langanda JAMI smeta qatori bilan solishtiriladi (har biri butun yig‘ma bilan emas)', () => {
    const bog = { qator_id: 2, kod: null, nom: 'УСТАНОВКА РАДИАТОРОВ', birlik: 'шт', hajm: 12, narx: 100, hajm_norm: 12, fakt: null, fakt_norm: null };
    const m = (id: number, q: number): FarqMiqdor => ({ miqdor_id: id, varaq: 'ОВ-3', nom: 'Радиатор ' + id, belgi: null, tur: 'uskuna', birlik: 'шт', miqdor: q, miqdor_norm: q, baza: 'dona', qaror: null, boglar: [bog] });
    expect(farqlarniHisobla([m(10, 5), m(11, 7)], smeta, new Set([2])).filter((x) => x.tur === 'hajm_farqi')).toHaveLength(0);
    const r = farqlarniHisobla([m(10, 5), m(11, 9)], smeta, new Set([2])).filter((x) => x.tur === 'hajm_farqi');
    expect(r).toHaveLength(1); expect(r[0].loyiha).toBe(14); expect(r[0].smeta).toBe(12); expect(r[0].farq).toBe(2); expect(r[0].izoh).toContain('uskuna_guruh:2');
  });
});
