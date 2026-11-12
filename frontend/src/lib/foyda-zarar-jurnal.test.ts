import { describe, expect, it } from 'vitest';
import { jurnalPaketi, jurnalQatorlari } from './foyda-zarar-jurnal';
import { foydaZararDaraxti, type FzObyekt } from './foyda-zarar';
import type { BuxPulQator } from '../api/t2-bux-hisob';

const q = (p: Partial<BuxPulQator>): BuxPulQator => ({ obyekt_id: 1, shartnoma_id: 5, daromad: 0, daromad_qqs: 0, xarajat: 0, xarajat_chel: 0, xarajat_mat: 0, xarajat_mash: 0,
  xarajat_ob: 0, xarajat_sub: 0, tannarx: 0, davr_xarajat: 0, tushgan: 0, qarz: 0, kreditor: 0, pul: 0, ...p });

describe('foyda/zarar jurnaldan', () => {
  it('jurnal qatorlari daraxt shakliga o‘giriladi: toifa, toifasiz qoldiq, tushgan, daromad', () => {
    const j = jurnalQatorlari([q({ daromad: 1000, daromad_qqs: 120, xarajat: 600, xarajat_chel: 300, xarajat_mash: 200, tushgan: 500 }), q({ obyekt_id: null, shartnoma_id: null, daromad: 50 })]);
    expect(j.xarajat).toEqual([{ obyekt_id: 1, shartnoma_id: 5, kat: 'ЧЕЛ', summa: 300 }, { obyekt_id: 1, shartnoma_id: 5, kat: 'МАШ', summa: 200 }, { obyekt_id: 1, shartnoma_id: 5, kat: null, summa: 100 }]);
    expect(j.tolov).toHaveLength(1);
    expect(j.daromad.get(1)).toEqual({ net: 1000, qqs: 120 });
    expect(j.taqsimlanmaganDaromad).toBe(50);
  });
  it('daraxt: foyda = jurnal daromadi − jurnal xarajati', () => {
    const j = jurnalQatorlari([q({ daromad: 1000, daromad_qqs: 120, xarajat: 600, xarajat_chel: 600, tushgan: 500 })]);
    const d = j.daromad.get(1)!;
    const ob: FzObyekt = { obyekt_id: 1, nom: 'O', loyiha_id: 1, loyiha_nom: 'L', shartnoma: { id: 5, raqam: 'S' }, f2: jurnalPaketi(d.net, d.qqs) };
    const { root } = foydaZararDaraxti({ kompaniyaNom: 'K', obyektlar: [ob], xarajat: j.xarajat, tolov: j.tolov });
    expect(root.foyda).toBe(400); expect(root.turi).toBe('plyus'); expect(root.tushgan).toBe(500); expect(root.qarz).toBe(620);
  });
});