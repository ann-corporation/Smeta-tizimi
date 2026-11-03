import { describe, expect, it } from 'vitest';
import { bosqichFoizlari, davrOraligi, diqqatYoli, kartaHolati, trendNuqtalari } from './markaz';
import type { RahbarPanel } from '../../api/t2-rahbar-panel';

const paket = { qqs_bilan: 112, qqs: 12, ustamali: 100, ustamasiz: 80, qqs_foiz: 12, ustamasiz_qism: 0,
  kesim: { chel: 80, mash: 0, mat: 0, ob: 0, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0 }, soat: { chel: 0, mash: 0, mashinist: 0 },
  subpudratchilar: [], narxsiz_soni: 0, qator_soni: 1 };
function panel(o: Partial<RahbarPanel['kartalar']> = {}): RahbarPanel {
  return { kartalar: {
    portfel: { shartnoma_qqs_bilan: null, shartnoma_soni: 0, smeta: paket },
    bajarildi: { davr: paket, jami: paket, akt_soni: 1, foiz_smeta: 50, foiz_shartnoma: null, reestr: null },
    tolandi: { davr: null, jami: null, yozuv_soni: 0, manbalar_yoq: ['tolov'] },
    debitor: { qiymat: null, hujjatlangan: 112, tolangan: null, yosh: null, asos: 'f2', manbalar_yoq: ['tolov'] },
    kreditor: { qiymat: null, manbalar_yoq: ['1c_prixod'] },
    rentabellik: { daromad: 100, tannarx: null, marja: null, foiz: null, manbalar_yoq: ['xarajat'] },
    ...o,
  } } as unknown as RahbarPanel;
}

describe('rahbar markazi yordamchilari', () => {
  it('davr: oy/chorak/yil boshidan bugungacha; hammasi — chegarasiz', () => {
    const b = new Date(2026, 10, 3);
    expect(davrOraligi('hammasi', b)).toEqual({ dan: null, gacha: null });
    expect(davrOraligi('oy', b)).toEqual({ dan: '2026-11-01', gacha: '2026-11-03' });
    expect(davrOraligi('chorak', b)).toEqual({ dan: '2026-10-01', gacha: '2026-11-03' });
    expect(davrOraligi('yil', b)).toEqual({ dan: '2026-01-01', gacha: '2026-11-03' });
  });
  it('karta holati: kiritilmagan — nomalum (yaxshi deb taxmin qilinmaydi)', () => {
    const p = panel();
    expect(kartaHolati('tolandi', p)).toBe('nomalum');
    expect(kartaHolati('debitor', p)).toBe('nomalum');
    expect(kartaHolati('rentabellik', p)).toBe('nomalum');
    expect(kartaHolati('bajarildi', p)).toBe('yaxshi');
  });
  it('karta holati: 60+ kunlik qarz — xavf; manfiy rentabellik — xavf; reestr farqi — e’tibor', () => {
    expect(kartaHolati('debitor', panel({ debitor: { qiymat: 10, hujjatlangan: 20, tolangan: 10, yosh: { k0_30: 0, k30_60: 0, k60: 10 }, asos: 'f2', manbalar_yoq: [] } }))).toBe('xavf');
    expect(kartaHolati('rentabellik', panel({ rentabellik: { daromad: 100, tannarx: 120, marja: -20, foiz: -20, manbalar_yoq: [] } }))).toBe('xavf');
    expect(kartaHolati('bajarildi', panel({ bajarildi: { davr: paket, jami: paket, akt_soni: 1, foiz_smeta: 1, foiz_shartnoma: null, reestr: { qqs_bilan: 1, soni: 1, farq: 50 } } }))).toBe('etibor');
  });
  it('trend: null oy null bo‘lib qoladi (0 emas)', () => {
    expect(trendNuqtalari([{ oy: '2026-10', bajarildi: 5, tolov: null, xarajat: null }], 'tolov')).toEqual([null]);
    expect(trendNuqtalari([{ oy: '2026-10', bajarildi: 5, tolov: null, xarajat: null }], 'bajarildi')).toEqual([5]);
  });
  it('diqqat yo‘li — mavjud sahifalarga; obyekt bilan', () => {
    expect(diqqatYoli({ kod: 'fakt_topshirilmagan', obyekt_id: 7, nom: 'x', summa_tasir: 1, soni: null })).toBe('/admin/f2-tayyorlash?obyekt=7');
    expect(diqqatYoli({ kod: 'narxsiz', obyekt_id: null, nom: null, summa_tasir: null, soni: 3 })).toBe('/admin/smeta-narxlash');
    expect(diqqatYoli({ kod: 'nomalum_kod', obyekt_id: 4, nom: null, summa_tasir: null, soni: null })).toBe('/admin/holat/4');
  });
  it('bosqich foizlari 0–100 ga cheklanadi, null saqlanadi', () => {
    expect(bosqichFoizlari({ fakt: 140, f2: -3, f3: null })).toEqual([{ kalit: 'fakt', foiz: 100 }, { kalit: 'f2', foiz: 0 }, { kalit: 'f3', foiz: null }]);
  });
});
