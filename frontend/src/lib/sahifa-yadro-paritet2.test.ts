import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { sbT2TreeQur } from '../api/supabase';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { f2MumkinIshorali } from './hisob-yadro';
import { nakBarglar, nakFaktJami, nakFaktSumma } from './nakopitelniy-korinish';
import { umumiyKesim } from './smeta-korinish';
import { lrvPlusFaylBaytlari, lrvPlusQatorlarniHisobla } from './lrv-plus-export';

/*
 * Ko'rib chiqish tuzatishlari (sintetik ma'lumot): sahifadagi YAGONA fakt puli (narx qoidasi), MAX(fakt, F2) yo'q,
 * «F2 ga olish mumkin» ishorali, ЛРВ+ da noma'lum fakt summasi bo'sh katak.
 */
function nq(p: Partial<NakopitelniyQator> & { qator_id: number; tur: NakopitelniyQator['tur'] }): NakopitelniyQator {
  return {
    tartib: p.qator_id, kod: null, nom: 'Поз', birlik: null, kat: null, qoshimcha: false, zamena: false, ota_id: null,
    smeta_hajm: 1, smeta_narx: 1000, smeta_summa: 1000, fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
    jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
    jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
  } as NakopitelniyQator;
}

describe('1 — Nakopitelniy: KPI / jadval / grafik bitta fakt jamisi (F2 narxida)', () => {
  // Smeta 12 000 / m², F2 35 000 da olingan; fakt 2 m² (F2 dan kam — normal).
  const Q = [
    nq({ qator_id: 1, tur: 'rz' }),
    nq({ qator_id: 2, tur: 'mat', ota_id: 1, smeta_hajm: 10, smeta_narx: 12000, smeta_summa: 120000, fakt_hajm: 2, fakt_summa: 24000, jami_hajm: 5, jami_summa: 175000 }),
    nq({ qator_id: 3, tur: 'mat', ota_id: 1, fakt_hajm: 1, fakt_summa: 1000 }),
  ];
  it('qator: F2 narxida; F2 yo‘q qator — odatdagi', () => {
    expect(nakFaktSumma(Q[1])).toBe(70000);
    expect(nakFaktSumma(Q[2])).toBe(1000);
    expect(nakBarglar(Q).map((q) => q.qator_id)).toEqual([2, 3]);
  });
  it('jami: barglar F2 narxida; ro‘yxat qirqilgan — server jamisi, taxminiy (≈)', () => {
    expect(nakFaktJami(Q, 25000, false)).toEqual({ summa: 71000, taxminiy: false });
    expect(nakFaktJami(Q, 25000, true)).toEqual({ summa: 25000, taxminiy: true });
  });
});

describe('2 — MAX(fakt, F2) yo‘q; «F2 ga olish mumkin» ishorali', () => {
  it('f2MumkinIshorali: musbat — max(0, fakt − F2); manfiy qator — min(0, …), nolga tushirilmaydi; NULL — NULL', () => {
    expect(f2MumkinIshorali(5, 3, 10)).toBe(2);
    expect(f2MumkinIshorali(2, 3, 10)).toBe(0);
    expect(f2MumkinIshorali(-5, -3, -10)).toBe(-2);
    expect(f2MumkinIshorali(-2, -3, -10)).toBe(0);
    expect(f2MumkinIshorali(-5, null, null)).toBe(-5);
    expect(f2MumkinIshorali(null, 3, 10)).toBeNull();
  });
  const q = (id: number, hajm: number, extra: Partial<T2Qator> = {}): T2Qator => ({ id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id: null, daraja: 0, tartib: id, tur: 'mat', kod: null, nom: 'П' + id, birlik: 'м2', hajm, narx: 12000, summa: hajm * 12000, kat: 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...extra } as T2Qator);
  const h = (id: number, p: Partial<T2QatorHolat>): T2QatorHolat => ({ id, qator_id: id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: null, ...p } as T2QatorHolat);
  it('daraxt (SmetaAnatomiya manbasi): stFakt F2 narxida, qoldiq = smeta − F2 aynan (fakt < F2 bo‘lsa ham)', () => {
    const tree = sbT2TreeQur([q(1, 10), q(2, -4)], [
      h(1, { fakt_hajm: 2, fakt_summa: 24000, f2_hajm: 5, f2_summa: 175000 }),
      h(2, { fakt_hajm: -3, fakt_summa: -36000, f2_hajm: -1, f2_summa: -12000 }),
    ]);
    expect(tree[0].stFakt).toBe(70000);
    expect(tree[0].stF2Mum).toBe(0);            // fakt summasi (70 000) < F2 (175 000) — musbat qator: 0
    expect(tree[1].stF2Mum).toBe(-24000);       // manfiy qator: −36 000 − (−12 000), nolga tushirilmaydi
    expect(tree[1].f2mum).toBe(-2);
    const k = umumiyKesim(tree);
    expect(k.qoldiq).toBe(120000 - 48000 - (175000 - 12000)); // smeta − F2, fakt hisobga olinmaydi
    expect(k.faktUlush).toBeCloseTo((70000 - 36000) / 72000, 6);
  });
});

describe('3 — ЛРВ+: noma‘lum fakt summasi bo‘sh, jami faqat ma‘lumlardan, «не определена» izohi', () => {
  const qator = (p: Partial<T2Qator>): T2Qator => ({ obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id: null, daraja: 0, kod: null, nom: 'П', birlik: 'м2', hajm: 1, narx: 1000, summa: 1000, kat: 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...p } as T2Qator);
  const holat = (p: Partial<T2QatorHolat> & { qator_id: number }): T2QatorHolat => ({ id: p.qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: null, ...p } as T2QatorHolat);
  const D = [qator({ id: 1, tartib: 1, tur: 'rz', hajm: null, narx: null, summa: null }), qator({ id: 2, tartib: 2, tur: 'mat', daraja: 1, ota_id: 1 }), qator({ id: 3, tartib: 3, tur: 'mat', daraja: 1, ota_id: 1 })];
  const H = [holat({ qator_id: 2, fakt_hajm: 1, fakt_summa: 1000, f2_hajm: 2, f2_summa: null as unknown as number }), holat({ qator_id: 3, fakt_hajm: 1, fakt_summa: 1000 })];
  it('model: F2 narxi noma‘lum — null (0 emas); ota — faqat ma‘lumlar', () => {
    const r = lrvPlusQatorlarniHisobla(D, H);
    expect(r.find((x) => x.id === 2)!.faktSumma).toBeNull();
    expect(r.find((x) => x.id === 1)!.faktSumma).toBe(1000);
  });
  it('fayl: T katagi bo‘sh, jami T3 = 1000 va izoh', async () => {
    const XLSX = await import('xlsx-js-style');
    const wb = XLSX.read(await lrvPlusFaylBaytlari(D, 'Sinov', H), { type: 'array' });
    const ws = wb.Sheets['LRV_PLUS'];
    const qatorRaqam = lrvPlusQatorlarniHisobla(D, H).find((x) => x.id === 2)!.row;
    expect(ws[`T${qatorRaqam}`]?.v ?? '').toBe('');
    expect(ws['T3'].v).toBe(1000);
  });
});
