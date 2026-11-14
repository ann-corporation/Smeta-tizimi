import { describe, expect, it } from 'vitest';
import { AMALLAR, quraOchiq, quraRpc, rasmKalitiYaroqli } from './bozor';

const OP = '3f2b8c1e-5d4a-4b6c-9e1f-0a1b2c3d4e5f';

describe('bozor gateway oq royxati', () => {
  it('noma\'lum amalni rad etadi, actor tanadan olinmaydi', () => {
    expect(quraRpc('drop_table', 5, {})).toEqual({ ok: false, code: 'AMAL_NOMA_LUM' });
    const q = quraRpc('kabinet', 7, { p_actor_id: 99 });
    expect(q).toEqual({ ok: true, rpc: 't2_bz_kabinet_v1', body: { p_actor_id: 7 } });
  });
  it('yozish amallari operation_id talab qiladi va faqat oq royxat maydonlarini o\'tkazadi', () => {
    expect(quraRpc('elon_saqla', 7, { data: { sarlavha: 'x' } })).toEqual({ ok: false, code: 'OPERATION_ID_REQUIRED' });
    const q = quraRpc('elon_saqla', 7, { operation_id: OP, data: { sarlavha: 'Sement', sotuvchi_id: 1, holat: 'faol', rasmlar: ['bz/u7/a.jpg', 5] } });
    expect(q.ok && q.body).toEqual({ p_actor_id: 7, p_operation_id: OP, p_data: { sarlavha: 'Sement', holat: 'faol', rasmlar: ['bz/u7/a.jpg'] } });
  });
  it('xaridor amallari kompaniya_id talab qiladi', () => {
    expect(quraRpc('golib_tanla', 7, { operation_id: OP, data: { sorov_id: 1, taklif_id: 2 } })).toEqual({ ok: false, code: 'KOMPANIYA_KERAK' });
    const q = quraRpc('golib_tanla', 7, { kompaniya_id: 3, operation_id: OP, data: { sorov_id: 1, taklif_id: 2 } });
    expect(q.ok && q.body).toEqual({ p_kompaniya_id: 3, p_actor_id: 7, p_operation_id: OP, p_data: { sorov_id: 1, taklif_id: 2 } });
    expect(quraRpc('taqqos', 7, { kompaniya_id: 3, data: {} })).toEqual({ ok: false, code: 'SOROV_KERAK' });
  });
  it('barcha amallar t2_bz_ RPC ga olib boradi (smeta/narx jadvaliga yo\'l yo\'q)', () => {
    for (const a of Object.values(AMALLAR)) expect(a.rpc).toMatch(/^t2_bz_[a-z_]+_v1$/);
  });
});

describe('bozor ochiq (kirmasdan) oq royxati', () => {
  it('faqat t2_bz_ochiq_* RPC lar', () => {
    expect(quraOchiq('qidir', new URLSearchParams('q=sement&q=цемент&tur=tovar'))).toEqual({ ok: true, rpc: 't2_bz_ochiq_qidir_v1', body: { p_filtr: { tur: 'tovar', q: ['sement', 'цемент'] } } });
    expect(quraOchiq('elon', new URLSearchParams('id=5'))).toEqual({ ok: true, rpc: 't2_bz_ochiq_elon_v1', body: { p_id: 5 } });
    expect(quraOchiq('elon', new URLSearchParams('id=abc'))).toEqual({ ok: false, code: 'ID_KERAK' });
    expect(quraOchiq('kabinet', new URLSearchParams())).toEqual({ ok: false, code: 'AMAL_NOMA_LUM' });
  });
  it('rasm kaliti faqat bz/u<id>/<uuid>.<ext> shaklida', () => {
    expect(rasmKalitiYaroqli(`bz/u12/${OP}.jpg`)).toBe(true);
    expect(rasmKalitiYaroqli('bz/u12/../x.jpg')).toBe(false);
    expect(rasmKalitiYaroqli('yb/u12/a.jpg')).toBe(false);
  });
});
