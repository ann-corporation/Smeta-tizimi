import { describe, expect, it } from 'vitest';
import { AMALLAR, dalilPrefiks, quraRpc, xatoHolati, yukTashishAmalmi } from './yuk-tashish';

const OP = '123e4567-e89b-42d3-a456-426614174000';

describe('yuk-tashish gateway (sof qurilish)', () => {
  it('noma\'lum amal rad; actor faqat argumentdan (tanadagi actor_id e\'tiborga olinmaydi)', () => {
    expect(quraRpc('boshqa', 5, {})).toEqual({ ok: false, code: 'AMAL_NOMA_LUM' });
    const q = quraRpc('holat', 7, { operation_id: OP, data: { onlayn: true, lat: 41.3, lng: 69.2, actor_id: 999, p_actor_id: 999, evil: 'x' } });
    expect(q.ok).toBe(true);
    if (q.ok) { expect(q.body.p_actor_id).toBe(7); expect(q.body.p_data).toEqual({ onlayn: true, lat: 41.3, lng: 69.2 }); expect(q.ega).toBe(false); }
  });
  it('yozuvchi amal operation_id talab qiladi; joy va yaqin talab qilmaydi', () => {
    expect(quraRpc('qabul', 1, { data: { yuk_id: 3 } })).toEqual({ ok: false, code: 'OPERATION_ID_REQUIRED' });
    expect(quraRpc('joy', 1, { data: { bron_id: 3, lat: 1, lng: 2 } }).ok).toBe(true);
    expect(quraRpc('yaqin', 1, { data: { lat: 1, lng: 2 } }).ok).toBe(true);
    expect(quraRpc('reys', 1, {})).toMatchObject({ ok: true, rpc: 't2_yb_p2_reys_v1', body: { p_actor_id: 1 } });
  });
  it('yuk egasi amallari kompaniya_id talab qiladi', () => {
    expect(quraRpc('ega_kuzat', 1, { data: { yuk_id: 3 } })).toEqual({ ok: false, code: 'KOMPANIYA_KERAK' });
    const q = quraRpc('ega_kuzat', 1, { kompaniya_id: 9, data: { yuk_id: 3 } });
    expect(q).toMatchObject({ ok: true, ega: true, body: { p_kompaniya_id: 9, p_actor_id: 1, p_yuk_id: 3 } });
    expect(quraRpc('yuk_qosh', 1, { kompaniya_id: 9, data: { yuk_id: 3 } })).toEqual({ ok: false, code: 'OPERATION_ID_REQUIRED' });
  });
  it('isbot R2 kaliti faqat o\'z prefiksida; boshqa odam fayli yoki .. rad', () => {
    const ok = quraRpc('dalil', 4, { operation_id: OP, data: { bron_id: 1, tur: 'yetkazish', r2_kalit: dalilPrefiks(4) + 'a.jpg' } });
    expect(ok.ok).toBe(true);
    expect(quraRpc('dalil', 4, { operation_id: OP, data: { bron_id: 1, tur: 'yetkazish', r2_kalit: dalilPrefiks(5) + 'a.jpg' } })).toEqual({ ok: false, code: 'R2_KALIT_NOTOGRI' });
    expect(quraRpc('dalil', 4, { operation_id: OP, data: { bron_id: 1, tur: 'yetkazish', r2_kalit: dalilPrefiks(4) + '../x' } })).toEqual({ ok: false, code: 'R2_KALIT_NOTOGRI' });
    expect(quraRpc('qadam', 4, { operation_id: OP, data: { bron_id: 1, qadam: 'yetkazdi', imzo_r2_kalit: 'yb/u9/x.png' } })).toEqual({ ok: false, code: 'R2_KALIT_NOTOGRI' });
  });
  it('faqat t2_yb_* RPC lar oq ro\'yxatda; pg xato kodlari xaritasi', () => {
    for (const a of Object.values(AMALLAR)) expect(a.rpc).toMatch(/^t2_yb_/);
    expect(yukTashishAmalmi('profil')).toBe(true); expect(yukTashishAmalmi('__proto__')).toBe(false);
    expect(xatoHolati('42501')).toBe(403); expect(xatoHolati('P0002')).toBe(404); expect(xatoHolati('XX')).toBe(500);
  });
});
