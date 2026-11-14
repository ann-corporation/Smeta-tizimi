import { describe, expect, it } from 'vitest';
import { belgisizVaraqlar, varaqTasnifi } from './topilmagan';
import { bolimXaritasi, moslash, type SmetaQator } from './moslash';

const smeta: SmetaQator[] = [
  { id: 1, ota_id: null, tur: 'rz', nom: 'ФУНДАМЕНТ ТИП-A (КР-16)', birlik: null, hajm: null, narx: null },
  { id: 2, ota_id: 1, tur: 'bl', nom: 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', birlik: 'м3', hajm: 4.8, narx: 1 },
  { id: 3, ota_id: 1, tur: 'bl', nom: 'УСТРОЙСТВО ФУНДАМЕНТОВ ЖЕЛЕЗОБЕТОННЫХ', birlik: '100 м3', hajm: 0.2225, narx: 1 },
  { id: 4, ota_id: 1, tur: 'bl', nom: 'ИЗГОТОВЛЕНИЕ АРМАТУРНЫХ КАРКАСОВ', birlik: 'Т', hajm: 1.5, narx: 1 },
  { id: 5, ota_id: null, tur: 'rz', nom: 'ДРУГОЙ РАЗДЕЛ (КР-3)', birlik: null, hajm: null, narx: null },
  { id: 6, ota_id: 5, tur: 'bl', nom: 'БЕТОН МОНОЛИТНЫЙ', birlik: 'м3', hajm: 77, narx: 1 },
];

describe('belgisi smetada topilmagan varaqlar', () => {
  it('(a) boshqa nom: barcha miqdor (100 м3 va т koeffitsiyenti bilan) bitta bo‘limga teng', () => {
    const r = varaqTasnifi('КР-59', [{ tur: 'beton', nom: 'Бетон кл. В7.5', birlik: 'м3', miqdor: 4.8 }, { tur: 'beton', nom: 'Бетон кл. В20', birlik: 'м3', miqdor: 22.25 }, { tur: 'armatura', nom: 'Арматура', birlik: 'кг', miqdor: 1500 }], smeta);
    expect(r.turi).toBe('boshqa_nom'); expect(r.mosSoni).toBe(3); expect(r.takliflar[0]).toMatchObject({ bolimId: 1, mos: 3 });
  });
  it('(b) hech narsa mos emas -> ehtimol smetada yo‘q; (c) qisman -> noaniq; juda kichik miqdor sanalmaydi', () => {
    expect(varaqTasnifi('КР-81', [{ tur: 'beton', nom: 'Б', birlik: 'м3', miqdor: 123.4 }], smeta).turi).toBe('smetada_yoq');
    expect(varaqTasnifi('КР-64', [{ tur: 'beton', nom: 'Б', birlik: 'м3', miqdor: 4.8 }, { tur: 'beton', nom: 'Б', birlik: 'м3', miqdor: 99 }], smeta).turi).toBe('noaniq');
    expect(varaqTasnifi('КР-1', [{ tur: 'beton', nom: 'Б', birlik: 'м3', miqdor: 0.1 }], smeta).turi).toBe('miqdorsiz');
  });
  it('faqat belgisi smetada bo‘lmagan varaqlar chiqadi; tartib: avval taklifi borlar', () => {
    const g = new Map([['КР-3', [{ tur: 'beton', nom: 'Б', birlik: 'м3', miqdor: 77 }]], ['КР-59', [{ tur: 'beton', nom: 'Б', birlik: 'м3', miqdor: 4.8 }]], ['КР-81', [{ tur: 'beton', nom: 'Б', birlik: 'м3', miqdor: 123.4 }]]]);
    const x = bolimXaritasi(smeta); const belgilar = new Set([...x.values()].flatMap((v) => [...v.belgilar]));
    expect(belgisizVaraqlar(g, smeta, belgilar).map((v) => [v.varaq, v.turi])).toEqual([['КР-59', 'boshqa_nom'], ['КР-81', 'smetada_yoq']]);
  });
  it('qo‘lda/tasdiqlangan xarita varaqni bo‘limga bog‘laydi: matcher shu bo‘lim ichida nomzod beradi', () => {
    const qolda = new Map([['КР-59', new Set([1])]]);
    const bez = moslash({ nom: 'Бетон кл. В20', birlik: 'м3', tur: 'beton', varaq: 'КР-59' }, smeta, bolimXaritasi(smeta));
    const bilan = moslash({ nom: 'Бетон кл. В20', birlik: 'м3', tur: 'beton', varaq: 'КР-59' }, smeta, bolimXaritasi(smeta, undefined, qolda));
    expect(bez.nomzodlar.every((n) => n.sabab.includes('bolim_yoq'))).toBe(true);
    expect(bilan.nomzodlar[0].sabab).toContain('bolim_belgi'); expect([2, 3, 4]).toContain(bilan.nomzodlar[0].qatorId);
  });
});
