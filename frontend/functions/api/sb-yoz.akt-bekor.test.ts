import { describe, expect, it } from 'vitest';
import { aktBekorYoli, type AktBekorHolat } from './sb-yoz';

const P = { aktId: 7, actorId: 42, sabab: ' xato kiritilgan ', kutilganVersiya: 5, operationId: '11111111-1111-4111-8111-111111111111' };
const akt = (o: Partial<AktBekorHolat>): AktBekorHolat => ({ kompaniya_id: 9, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', versiya: 3, ...o });

describe('akt_bekor: holatga qarab yo‘l (eski t2_akt_bekor tasdiqlangan F2 da ishlamaydi)', () => {
  it('qoralama F2 va fakt hujjati — eski yo‘l', () => {
    expect(aktBekorYoli(akt({}), P)).toEqual({ yol: 'eski' });
    expect(aktBekorYoli(akt({ tur: 'fakt', lifecycle_status: null }), P)).toEqual({ yol: 'eski' });
    expect(aktBekorYoli(akt({ lifecycle_status: 'rejected' }), P)).toEqual({ yol: 'eski' });
  });
  it('holat o‘qilmasa — eski yo‘l (baza o‘zi tekshiradi)', () => {
    expect(aktBekorYoli(null, P)).toEqual({ yol: 'eski' });
  });
  it('tasdiqlangan F2 — lifecycle approved→cancelled: kutilgan versiya, actor, sabab, operation_id bilan', () => {
    const y = aktBekorYoli(akt({ holat: 'tasdiqlangan', lifecycle_status: 'approved' }), P);
    expect(y).toEqual({ yol: 'lifecycle', yuk: { p_kompaniya_id: 9, p_akt_id: 7, p_to_status: 'cancelled', p_actor_id: 42, p_expected_version: 5, p_operation_id: P.operationId, p_reason: 'xato kiritilgan' } });
  });
  it('versiya berilmasa aktning o‘z versiyasi olinadi; tasdiqlangan deb faqat holat=tasdiqlangan ham yetadi', () => {
    const y = aktBekorYoli(akt({ holat: 'tasdiqlangan', lifecycle_status: null, versiya: 8 }), { ...P, kutilganVersiya: null });
    expect(y).toMatchObject({ yol: 'lifecycle', yuk: { p_expected_version: 8 } });
  });
  it('tasdiqlangan F2: sabab majburiy; actor kerak; almashtirilgan — rad', () => {
    const t = akt({ holat: 'tasdiqlangan', lifecycle_status: 'approved' });
    expect(aktBekorYoli(t, { ...P, sabab: '  ' })).toMatchObject({ yol: 'rad', code: 'REASON_REQUIRED' });
    expect(aktBekorYoli(t, { ...P, actorId: 0 })).toMatchObject({ yol: 'rad', code: 'ACTOR_REQUIRED' });
    expect(aktBekorYoli(akt({ lifecycle_status: 'superseded' }), P)).toMatchObject({ yol: 'rad', code: 'INVALID_LIFECYCLE_TRANSITION' });
  });
});