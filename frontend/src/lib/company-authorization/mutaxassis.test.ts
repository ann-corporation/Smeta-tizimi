import { describe, expect, it } from 'vitest';
import { oqishYuki, yozishYuki } from '../../../functions/_shared/mutaxassis-yuk';
import { qisqaSumma } from '../../api/t2-mutaxassis';

/* T6 (egasi 2026-10-22): PTO o'z xizmatini istalgan kompaniyaga taklif qiladi; kompaniya rahbari qabul qiladi. */
describe('mutaxassis shlyuzi', () => {
  it('faqat sanab o‘tilgan bo‘limlar; kompaniya tomoni kompaniya_id talab qiladi', () => {
    expect(oqishYuki('profil', new URLSearchParams())).toMatchObject({ rpc: 't2_mutaxassis_profil_ol_v1' });
    expect(oqishYuki('kelgan', new URLSearchParams())).toBe('kompaniya_id kerak');
    expect(oqishYuki('mutaxassislar', new URLSearchParams('kompaniya_id=17&kasb=hacker'))).toBe('Kasb noto‘g‘ri');
    expect(oqishYuki('t2_boshqa_rpc', new URLSearchParams())).toBe('Bo‘lim ochiq emas');
  });
  it('taklif: rol boss/admin bo‘lmaydi; actor yukda yo‘q (faqat sessiyadan)', () => {
    for (const rol of ['boss', 'admin', 'superadmin', 'rahbar']) expect(yozishYuki('taklif_yubor', { kompaniya_id: 17, rol })).toBe('Rol noto‘g‘ri');
    const y = yozishYuki('taklif_yubor', { kompaniya_id: 17, rol: 'pto', xabar: ' salom ', p_actor_id: 1 }) as { rpc: string; yuk: Record<string, unknown> };
    expect(y).toMatchObject({ rpc: 't2_xizmat_taklif_yubor_v1', yuk: { p_kompaniya_id: 17, p_rol: 'pto', p_xabar: 'salom' } });
    expect(y.yuk.p_actor_id).toBeUndefined();
    expect(yozishYuki('taklif_javob', { kompaniya_id: 17, taklif_id: 3, qabul: 'ha' })).toMatch(/qabul kerak/);
  });
  it('profil: kasb majburiy, tajriba chegarada, xizmatlar tozalanadi va cheklanadi', () => {
    expect(yozishYuki('profil_saqla', { kasb: 'x' })).toBe('Kasbni tanlang');
    expect(yozishYuki('profil_saqla', { kasb: 'pto', tajriba_yil: 61 })).toBe('Tajriba 0–60 yil');
    const y = yozishYuki('profil_saqla', { kasb: 'pto', xizmatlar: ['  F2  tayyorlash ', '', ...Array.from({ length: 30 }, (_, i) => `x${i}`)] }) as { yuk: Record<string, unknown> };
    expect((y.yuk.p_xizmatlar as string[])[0]).toBe('F2 tayyorlash');
    expect((y.yuk.p_xizmatlar as string[]).length).toBe(20);
    expect(y.yuk.p_ochiq).toBe(false);
  });
  it('qisqa summa: mlrd / mln', () => {
    expect(qisqaSumma(71_403_566_184)).toMatch(/^71,4 mlrd$/);
    expect(qisqaSumma(423_602_004)).toMatch(/^423,6 mln$/);
    expect(qisqaSumma(null)).toBe('—');
  });
});
