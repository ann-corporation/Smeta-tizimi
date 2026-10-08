import { describe, expect, it } from 'vitest';
import { sessiyaKompaniya } from './ai-kompaniya';

const s = (komp: number[], uid: unknown = 7) => ({ foydalanuvchi_id: uid, kompaniyalar: komp.map((kompaniya_id) => ({ kompaniya_id })) });
describe('sessiyaKompaniya', () => {
  it('so‘ralgan kompaniya ruxsatda bo‘lsa — qabul', () => { expect(sessiyaKompaniya(s([5, 9]), 9)).toEqual({ ok: true, id: 9, actor: 7 }); expect(sessiyaKompaniya(s([5, 9]), '5')).toMatchObject({ ok: true, id: 5 }); });
  it('ruxsatsiz kompaniya 403; noto‘g‘ri id 400', () => { expect(sessiyaKompaniya(s([5]), 6)).toMatchObject({ ok: false, status: 403 }); expect(sessiyaKompaniya(s([5]), -1)).toMatchObject({ ok: false, status: 400 }); expect(sessiyaKompaniya(s([5]), 'x')).toMatchObject({ ok: false, status: 400 }); });
  it('so‘ralmasa: bitta kompaniya — shu; bir nechta — jimgina tanlamaydi (422)', () => { expect(sessiyaKompaniya(s([5]), undefined)).toMatchObject({ ok: true, id: 5 }); expect(sessiyaKompaniya(s([5, 9]), null)).toMatchObject({ ok: false, status: 422 }); expect(sessiyaKompaniya(s([]), undefined)).toMatchObject({ ok: false, status: 422 }); });
  it('foydalanuvchisiz yoki ruxsat ro‘yxatisiz sessiya rad', () => { expect(sessiyaKompaniya(s([5], null), 5)).toMatchObject({ ok: false, status: 401 }); expect(sessiyaKompaniya({ foydalanuvchi_id: 7 }, 5)).toMatchObject({ ok: false, status: 403 }); expect(sessiyaKompaniya(null, 5)).toMatchObject({ ok: false, status: 401 }); });
});
