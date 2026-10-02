import { describe, expect, it } from 'vitest';
import { narxIzohi } from './izoh';
import { manbaRekviziti } from '../narx-asoslash-export';
import { catalogQatorlariniApiFormatga } from '../catalog-manba-import';

describe('Narx izohi (egasi 2026-10-02: narx qayerdan olingani bir qatorda)', () => {
  it('platforma katalogi: davr, hudud, zavod, NDS', () => {
    expect(narxIzohi({ manba_tur: 'katalog', platforma: true, yil: 2026, kvartal: 2, region: 'г. Ташкент', ishlab_chiqaruvchi: 'ООО "TTZ"', nds_holati: 'nds_siz' }))
      .toBe('Platforma katalog · 2026 y. 2-kvartal · г. Ташкент · ООО "TTZ" zavodi · NDS siz');
  });
  it('chel.-soat va mash.-soat; yo‘q ma’lumot tashlanadi (taxmin yo‘q)', () => {
    expect(narxIzohi({ manba_tur: 'chel_chas', yil: 2026, kvartal: 3, narx_varianti: 'ijtimoiy_12' })).toBe('chel.-soat narxi · 2026 y. 3-kvartal · ijtimoiy soliq 12%');
    expect(narxIzohi({ manba_tur: 'kalkulyatsiya_mash' })).toBe('mash.-soat kalkulyatsiyasi');
    expect(narxIzohi({ manba_tur: 'katalog', nds_holati: 'nomalum', nds_izoh: 'НДС 12%' })).toBe('katalog · НДС 12%');
  });
  it('Обоснование rekviziti: ishlab chiqaruvchi va NDS izohi', () => {
    expect(manbaRekviziti({ manba_nom: 'Каталог', manba_raqam: null, manba_sana: null, yetkazuvchi: null, yetkazuvchi_inn: null, yil: 2026, kvartal: 2, region: 'г. Нукус', nds_holati: 'nomalum', ishlab_chiqaruvchi: 'ООО "Нукус ТББЗ"', nds_izoh: 'НДС 12%' }))
      .toBe('Каталог, 2 кв. 2026, г. Нукус, производитель: ООО "Нукус ТББЗ", НДС 12%');
  });
  it('katalog importi: hudud, yil/kvartal, variant, NDS va zavod sarlavhasi (guruh) yuqori darajada', () => {
    const [q] = catalogQatorlariniApiFormatga([{
      sourceKey: 'k', varaqqa: 'Toshkent', manbaQatori: 5, nom: 'Плита', birlik: 'шт', kod: null, hudud: 'Toshkent', narx: 100,
      narxVarianti: 'nds_siz', valyuta: 'UZS', davr: { yil: 2026, kvartal: 2, yorliq: '2026 II', ishonch: 'yuqori' },
      izoh: JSON.stringify({ guruh: '12. ООО "TTZ". (НДС 12%)' }), ogohlantirishlar: [],
    }]);
    expect(q).toMatchObject({ hudud: 'Toshkent', guruh: '12. ООО "TTZ". (НДС 12%)', yil: 2026, kvartal: 2, narx_varianti: 'nds_siz', nds_holati: 'nds_siz' });
  });
});
