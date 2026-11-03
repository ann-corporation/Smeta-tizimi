import { describe, expect, it } from 'vitest';
import { podvalMoslash, reestrBilanMosmi, type MoslashVaraq } from './akt-podval-moslash';
import type { AktPodvalYuk } from './akt-podval';
import type { PodvalNomzod } from '../api/t2-akt-podval';

const podval = (itogo4: number, vsego: number): AktPodvalYuk => ({
  nk: { ПРОЧИЕ_ПОДРЯДЧИК: 10, НДС: 12 }, qatorlar: [], itogo1: null, itogo2: null, itogo3: null, itogo4,
  hujjat: { pryamye: 1000, itogo4, nds: vsego - itogo4, vsego }, masshtab: 1,
  tekshiruv: { holat: 'topildi', toliq: true, isbotsiz: [], isbotNomos: 0, nisbatdan: [] },
});
const nomzod = (id: number, pryamye: number, qatorSoni: number, rq: number | null, rb: number | null): PodvalNomzod => ({
  akt_id: id, raqam: String(id), oy: '2026-03-01', holat: 'tasdiqlangan', qator_soni: qatorSoni, pryamye, podval_manba: null, reestr_qqssiz: rq, reestr_qqs: null, reestr_qqs_bilan: rb,
});
const varaq = (p: AktPodvalYuk | null, pryamye = 1000, barglar = 7): MoslashVaraq => ({ varaq: 'F2', pryamye, barglarSoni: barglar, podval: p });

describe('podval backfill moslash', () => {
  it('ПРЯМЫЕ + qator soni + reestr mos — yetakchi variant tavsiya qilinadi', () => {
    const [r] = podvalMoslash([varaq(podval(1100, 1232))], [nomzod(1, 1000, 7, 1100, 1232), nomzod(2, 5000, 7, null, null)]);
    expect(r.variantlar[0].nomzod.akt_id).toBe(1);
    expect(r.variantlar[0].reestrMos).toBe(true);
    expect(r.tavsiya).toBe(0);
  });

  it('ikki bir xil jamli akt — tavsiya yo‘q (foydalanuvchi tanlaydi)', () => {
    const [r] = podvalMoslash([varaq(podval(1100, 1232))], [nomzod(1, 1000, 7, null, null), nomzod(2, 1000, 7, null, null)]);
    expect(r.variantlar).toHaveLength(2);
    expect(r.tavsiya).toBeNull();
  });

  it('reestr jami nomos — reestrMos false; reestr yo‘q — null', () => {
    expect(reestrBilanMosmi(podval(1100, 1232), { reestr_qqssiz: 999, reestr_qqs_bilan: 1232 })).toBe(false);
    expect(reestrBilanMosmi(podval(1100, 1232), { reestr_qqssiz: null, reestr_qqs_bilan: null })).toBeNull();
    expect(reestrBilanMosmi(null, { reestr_qqssiz: 1100, reestr_qqs_bilan: null })).toBeNull();
  });
});
