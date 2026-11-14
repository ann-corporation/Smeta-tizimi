import { describe, expect, it } from 'vitest';
import { sbT2TreeQur, type T2Qator, type T2QatorHolat } from '../api/supabase';
import type { TreeNode } from '../api/types';
import { bolimSummalari } from './fakt-jurnal';
import { oshganQatorlar, ozgarishSoni, umumiyKesim } from './smeta-korinish';

/** HISOB_YADRO_V1: sintetik ma'lumot (haqiqiy summa yo'q). Smeta/qoldiq/fakt/oshgan/zamena sonlari bitta qoidada. */
const q = (p: Partial<T2Qator> & { id: number }): T2Qator => ({ obyekt_id: 1, tur: 'rs', nom: 'x', versiya: 1, ...p } as unknown as T2Qator);
const h = (p: Partial<T2QatorHolat> & { qator_id: number }): T2QatorHolat => ({ fakt_hajm: 0, f2_hajm: 0, f2_summa: 0, fakt_summa: 0, qoldiq_hajm: null, qoldiq_summa: null, ...p } as unknown as T2QatorHolat);

describe('smeta jami — bo‘lim summasi barglardan (saqlangan eskirgan rz.summa emas)', () => {
  it('eskirgan rz.summa e’tiborga olinmaydi: bo‘lim = barg qatorlar yig‘indisi', () => {
    const rows = [
      q({ id: 1, tur: 'rz', nom: 'R', summa: 100 }), // saqlangan 100, lekin barglar 300
      q({ id: 2, tur: 'mat', ota_id: 1, summa: 200 }), q({ id: 3, tur: 'mat', ota_id: 1, summa: 100 }),
    ];
    const t = sbT2TreeQur(rows, []);
    expect(t[0].smeta).toBe(300);
  });
  it('hamma barg noma’lum — bo‘lim null (0 emas)', () => {
    const t = sbT2TreeQur([q({ id: 1, tur: 'rz', summa: 5 }), q({ id: 2, tur: 'mat', ota_id: 1, summa: null })], []);
    expect(t[0].smeta).toBeNull();
  });
  it('qoldiq serverning qator qoldig‘idan yig‘iladi; umumiy kesim shuni ko‘rsatadi', () => {
    const rows = [q({ id: 1, tur: 'rz', summa: 0 }), q({ id: 2, tur: 'mat', ota_id: 1, summa: 100 }), q({ id: 3, tur: 'mat', ota_id: 1, summa: 50 })];
    const t = sbT2TreeQur(rows, [h({ qator_id: 2, qoldiq_summa: 70, f2_summa: 30 }), h({ qator_id: 3, qoldiq_summa: 50 })]);
    expect(t[0].stOst).toBe(120);
    expect(umumiyKesim(t).qoldiq).toBe(120);
  });
});

describe('«smetadan oshgan» — ish bir marta, resurs takrorlanmaydi', () => {
  const nd = (p: Partial<TreeNode>): TreeNode => ({ type: 'rs', nom: 'x', varaq: 'v', row: 0, smetaHajm: null, smeta: null, narx: null, fakt: null, qoldiq: null, f2ol: 0, f2mum: 0, ...p });
  it('673% ish va uning 3 resursi — bitta qator', () => {
    const tree = [nd({ id: 1, type: 'rz', nom: 'R', children: [
      nd({ id: 2, type: 'bl', nom: 'Ish', smetaHajm: 1, faktHajm: 6.73, children: [
        nd({ id: 3, smetaHajm: 2, faktHajm: 13.46 }), nd({ id: 4, smetaHajm: 3, faktHajm: 20.19 }), nd({ id: 5, smetaHajm: 4, faktHajm: 26.92 }),
      ] }),
    ] })];
    const d = oshganQatorlar(tree);
    expect(d).toHaveLength(1);
    expect(d[0].nom).toBe('Ish');
  });
});

describe('zamena / qo‘shimcha — o‘zgarish yozuvlari soni (ichidagi resurslar emas)', () => {
  const nd = (p: Partial<TreeNode>): TreeNode => ({ type: 'rs', nom: 'x', varaq: 'v', row: 0, smetaHajm: null, smeta: null, narx: null, fakt: null, qoldiq: null, f2ol: 0, f2mum: 0, ...p });
  it('qo‘shimcha ish ichidagi 3 resurs — 1 ta; zamena (REPLACEMENT) — o‘zi', () => {
    const tree = [nd({ id: 1, type: 'rz', children: [
      nd({ id: 2, type: 'bl', isQosh: true, ozgarishGuruh: 'qoshimcha', ozgarishOzi: 'ADDITIONAL', children: [
        nd({ id: 3, isQosh: true, ozgarishGuruh: 'qoshimcha', ozgarishOzi: 'ADDITIONAL' }), nd({ id: 4, isQosh: true, ozgarishGuruh: 'qoshimcha', ozgarishOzi: 'ADDITIONAL' }),
      ] }),
      nd({ id: 5, type: 'mat', isZamena: true, ozgarishGuruh: 'zamena', ozgarishOzi: 'REPLACEMENT' }),
    ] })];
    expect(ozgarishSoni(tree)).toEqual({ qoshimcha: 1, zamena: 1 });
  });
});

describe('fakt — ishning o‘z fakti resurslari BL_NORMA bo‘lsa ikki marta sanalmaydi', () => {
  it('ish fakti 10 (resurslari undan hosil) + resurs fakti 100 → 100', () => {
    const rows = [q({ id: 1, tur: 'rz' }), q({ id: 2, tur: 'bl', ota_id: 1, hajm: 1 }), q({ id: 3, tur: 'rs', ota_id: 2, kat: 'МАТ' })];
    const states = [
      { qator_id: 2, smeta_hajm: 1, fakt_hajm: 1, fakt_summa: 10, f2_summa: 0 },
      { qator_id: 3, smeta_hajm: 1, fakt_hajm: 1, smeta_summa: 500, fakt_summa: 100, f2_summa: 0, fakt_manbasi: 'BL_NORMA' },
    ];
    expect(bolimSummalari(rows, states).get(0)?.fakt.ustamasiz).toBe(100);
  });
});
