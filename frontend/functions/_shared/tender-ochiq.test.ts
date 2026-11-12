import { describe, expect, it } from 'vitest';
import { AMALLAR, quraOchiq, quraRpc } from './tender-ochiq';

const OP = '3f2b8c1e-5d4a-4b6c-9e1f-0a1b2c3d4e5f';

describe('tender ochiq gateway oq royxati', () => {
  it('ochiq GET faqat royxat va lot, tanlangan RPC lar t2_tn_ochiq_*', () => {
    expect(quraOchiq('royxat', new URLSearchParams('tur=material&q=sement'))).toEqual({ ok: true, rpc: 't2_tn_ochiq_royxat_v1', body: { p_filtr: { tur: 'material', q: 'sement' } } });
    expect(quraOchiq('lot', new URLSearchParams('id=7'))).toEqual({ ok: true, rpc: 't2_tn_ochiq_lot_v1', body: { p_id: 7 } });
    expect(quraOchiq('lot', new URLSearchParams('id=x'))).toEqual({ ok: false, code: 'ID_KERAK' });
    expect(quraOchiq('bayonnoma', new URLSearchParams('id=7'))).toEqual({ ok: false, code: 'AMAL_NOMA_LUM' });
  });
  it('xaridor amallari kompaniya_id, yozish operation_id talab qiladi; actor tanadan olinmaydi', () => {
    expect(quraRpc('aloqa', 5, { operation_id: OP, data: {} })).toEqual({ ok: false, code: 'KOMPANIYA_KERAK' });
    expect(quraRpc('aloqa', 5, { kompaniya_id: 2, data: { rfq_id: 1 } })).toEqual({ ok: false, code: 'OPERATION_ID_REQUIRED' });
    const q = quraRpc('aloqa', 5, { kompaniya_id: 2, operation_id: OP, p_actor_id: 99, data: { rfq_id: 1, taklif_id: 3, boshqa: 'x' } });
    expect(q.ok && q.body).toEqual({ p_kompaniya_id: 2, p_actor_id: 5, p_operation_id: OP, p_data: { rfq_id: 1, taklif_id: 3 } });
    expect(quraRpc('bayonnoma', 5, { kompaniya_id: 2, data: {} })).toEqual({ ok: false, code: 'RFQ_KERAK' });
    const o = quraRpc('bayonnoma', 5, { kompaniya_id: 2, data: { rfq_id: 4 } });
    expect(o.ok && o.body).toEqual({ p_kompaniya_id: 2, p_actor_id: 5, p_rfq_id: 4 });
  });
  it('hamma amal faqat t2_tn_ RPC ga olib boradi', () => { for (const a of Object.values(AMALLAR)) expect(a.rpc).toMatch(/^t2_tn_[a-z_]+_v1$/); });
});
