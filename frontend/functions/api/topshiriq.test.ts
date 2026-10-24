import { describe, expect, it } from 'vitest';
import { butun, xatoJavobi, yozishYuki } from './topshiriq';

const OP = '123e4567-e89b-42d3-a456-426614174000';
describe('topshiriq shlyuzi', () => {
  it('butun faqat musbat butun son', () => {
    expect(butun('5')).toBe(5); expect(butun(0)).toBeNull(); expect(butun('x')).toBeNull(); expect(butun(1.5)).toBeNull(); expect(butun('')).toBeNull();
  });
  it('ber: sarlavha va operation_id majburiy, actor tanadan olinmaydi', () => {
    expect(yozishYuki({ amal: 'ber', kompaniya_id: 1, sarlavha: 'x' })).toMatch(/operation_id/);
    expect(yozishYuki({ amal: 'ber', kompaniya_id: 1, operation_id: OP, sarlavha: '  ' })).toMatch(/Sarlavha/);
    const r = yozishYuki({ amal: 'ber', kompaniya_id: 1, operation_id: OP, sarlavha: 'Devor', actor_id: 99, p_actor_id: 99 });
    expect(typeof r).toBe('object');
    if (typeof r === 'object') { expect(r.rpc).toBe('t2_topshiriq_ber_v1'); expect(r.yuk).not.toHaveProperty('p_actor_id'); expect(r.yuk.p_tur).toBe('ish'); expect(r.yuk.p_muddat).toBeNull(); }
  });
  it('ber: noto‘g‘ri tur rad, noto‘g‘ri sana null', () => {
    expect(yozishYuki({ amal: 'ber', kompaniya_id: 1, operation_id: OP, sarlavha: 'a', tur: 'hack' })).toMatch(/Tur/);
    const r = yozishYuki({ amal: 'ber', kompaniya_id: 1, operation_id: OP, sarlavha: 'a', muddat: '2026-13-x' });
    if (typeof r === 'object') expect(r.yuk.p_muddat).toBeNull();
  });
  it('otish: versiya, holat va dalil cheklovi', () => {
    expect(yozishYuki({ amal: 'otish', kompaniya_id: 1, operation_id: OP, topshiriq_id: 3, holat: 'bajarildi' })).toMatch(/kutilgan_versiya/);
    expect(yozishYuki({ amal: 'otish', kompaniya_id: 1, operation_id: OP, topshiriq_id: 3, kutilgan_versiya: 1, holat: 'yo‘q' })).toMatch(/Holat/);
    const r = yozishYuki({ amal: 'otish', kompaniya_id: 1, operation_id: OP, topshiriq_id: 3, kutilgan_versiya: 2, holat: 'bajarildi', dalil_hujjat_idlar: [1, 'x', 2, -1] });
    if (typeof r === 'object') { expect(r.rpc).toBe('t2_topshiriq_otish_v1'); expect(r.yuk.p_dalil_hujjat_idlar).toEqual([1, 2]); }
  });
  it('noma‘lum amal va kompaniyasiz so‘rov rad', () => {
    expect(yozishYuki({ amal: 'del', kompaniya_id: 1, operation_id: OP })).toMatch(/Amal/);
    expect(yozishYuki({ amal: 'ber', operation_id: OP, sarlavha: 'a' })).toMatch(/Kompaniya/);
  });
  it('42501 -> 403 RUXSAT_YOQ, boshqasi 502 (ichki matn sizmaydi)', () => {
    expect(xatoJavobi('{"code":"42501","message":"PERMISSION_DENIED"}').status).toBe(403);
    const x = xatoJavobi('{"code":"XX","message":"secret table detail"}');
    expect(x.status).toBe(502); expect(JSON.stringify(x.body)).not.toContain('secret');
  });
});
