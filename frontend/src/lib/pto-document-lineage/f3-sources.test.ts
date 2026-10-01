import { describe, expect, it } from 'vitest';
import type { F2Tafsilot } from '../../api/t2-narx';
import { f3CertifiedSources, f3CertifiedHajm, f2OyKesimi } from './f3-sources';
import { validateF3Lineage } from './index';

const row = (p: Partial<F2Tafsilot> = {}): F2Tafsilot => ({
  kompaniya_id: 17, obyekt_id: 79, akt_id: 231, qator_id: 12, akt_holat: 'tasdiqlangan',
  oy: '2026-07-01', certified_quantity: 10, certified_unit_price: 123.45,
  certified_amount: 1234.49, summa: 1234.50, ...p,
} as F2Tafsilot);

describe('F2 → F3 certified source chain', () => {
  it('sentabrda akt yo‘q bo‘lsa iyulni joriy davrga ko‘chirmaydi', () => {
    const result = f2OyKesimi([row()], '2026-09');
    expect(result.oylar).toEqual(['2026-07', '2026-09']);
    expect(result.qiymat.get(12)?.get('2026-07')?.summa).toBe(1234.49);
    expect(result.qiymat.get(12)?.has('2026-09')).toBe(false);
  });

  it('bo‘sh tarixda hisobot davri bor, soxta qator yo‘q', () => {
    const result = f2OyKesimi([], '2026-09');
    expect(result.oylar).toEqual(['2026-09']);
    expect(result.qiymat.size).toBe(0);
  });

  it('oy kesimida draft va kelajak aktlari yo‘q', () => {
    expect(f2OyKesimi([row({ akt_holat: 'qoralama' }), row({ oy: '2026-10-01' })], '2026-09').qiymat.size).toBe(0);
  });

  it('oy kesimi noto‘g‘ri davrni jim yo‘qotmaydi', () => {
    expect(() => f2OyKesimi([row({ oy: '2026-13-01' })], '2026-09')).toThrow('F3_PERIOD_MISMATCH');
  });
  it.each(['2026-00', '2026-13', 'noto‘g‘ri'])('pul va hajm noto‘g‘ri manba davrini jim tashlamaydi: %s', oy => {
    for (const read of [f3CertifiedSources, f3CertifiedHajm]) {
      expect(() => read([row({ oy })], 17, 79, '2026-07')).toThrow('F3_PERIOD_MISMATCH');
    }
  });

  it.each(['', '2026-00', '2026-13'])('bo‘sh manbada ham hisobot davri tekshiriladi: %s', period => {
    for (const read of [f3CertifiedSources, f3CertifiedHajm]) {
      expect(() => read([], 17, 79, period)).toThrow('F3_PERIOD_MISMATCH');
    }
  });

  it.each([{ akt_id: 0 }, { qator_id: 0 }])('hajm ham canonical identitysiz qabul qilinmaydi: %j', patch => {
    expect(() => f3CertifiedHajm([row(patch)], 17, 79, '2026-07')).toThrow('F3_SOURCE_ID_REQUIRED');
  });
  it('retains the exact certified cent, separate from Q×price and legacy generated amount', () => {
    expect(f3CertifiedSources([row()], 17, 79, '2026-07')[0].summa).toBe(1234.49);
  });
  it('rejects a missing source amount even if legacy generated value exists', () => {
    expect(() => f3CertifiedSources([row({ certified_amount: null })], 17, 79, '2026-07')).toThrow('MISSING_CERTIFIED_AMOUNT');
  });
  it('preserves certified zero and negative reversal values', () => {
    expect(f3CertifiedSources([row({ certified_amount: 0 }), row({ certified_amount: -7.01 })],17,79,'2026-07').map(x=>x.summa)).toEqual([0,-7.01]);
  });
  it('keeps quantity-only work and resource records out of monetary totals without inventing zero', () => {
    const quantityOnly = { certified_amount: null, certified_unit_price: null, narx: null, summa: null };
    expect(f3CertifiedSources([row({ ...quantityOnly, qator_tur: 'bl' }), row({ ...quantityOnly, qator_tur: 'rs' }), row()],17,79,'2026-07').map(x=>x.summa)).toEqual([1234.49]);
  });
  it('refuses missing certified amount when a legacy monetary amount exists', () => {
    expect(() => f3CertifiedSources([row({ certified_amount: null, certified_unit_price: null, narx: null })],17,79,'2026-07')).toThrow('MISSING_CERTIFIED_AMOUNT');
  });
  it('excludes drafts and future periods from cumulative exports', () => {
    expect(f3CertifiedSources([row({ akt_holat:'qoralama' }),row({oy:'2026-08-01'}),row()],17,79,'2026-07')).toHaveLength(1);
  });
  it.each([{ kompaniya_id: 18 }, { obyekt_id: 80 }])('blocks cross-scope source %j', p => {
    expect(()=>f3CertifiedSources([row(p)],17,79,'2026-07')).toThrow('F3_SOURCE_SCOPE_MISMATCH');
  });
  it('allows two distinct approved acts for the same work in one month', () => {
    const scope={companyId:17,projectId:1,objectId:79,contractId:5,periodId:'2026-07'};
    const sources=['act1','act2'].map(documentId=>({documentId,scope,approved:true,qatorIds:[12]}));
    expect(validateF3Lineage({scope,sources}).ok).toBe(true);
    expect(validateF3Lineage({scope,sources:[sources[0],sources[0]]}).ok).toBe(false);
  });
});
