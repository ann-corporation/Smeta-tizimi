import { describe, expect, it } from 'vitest';
import { oqishYuki, xatoJavobi, yozishYuki } from './tomon';

describe('tomon shlyuzi — murojaat', () => {
  it('yaratish: sarlavha, muhimlik, muddat va tur tekshiriladi', () => {
    const y = yozishYuki('murojaat_yarat', { kompaniya_id: 3, aloqa_id: 5, turi: 'remark', sarlavha: ' Beton sifati ', matn: 'B20 quyilgan', muhimlik: 'yuqori', muddat: '2026-10-20', obyekt_id: 7, joy: '2-qavat' }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 3, p_aloqa_id: 5, p_turi: 'remark', p_sarlavha: 'Beton sifati', p_muhimlik: 'yuqori', p_muddat: '2026-10-20', p_obyekt_id: 7, p_joy: '2-qavat' });
    expect(String(y.p_operation_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(yozishYuki('murojaat_yarat', { kompaniya_id: 3, aloqa_id: 5, turi: 'remark', sarlavha: 'ab' })).toMatch(/Sarlavha/);
    expect(yozishYuki('murojaat_yarat', { kompaniya_id: 3, aloqa_id: 5, turi: 'Remark;drop', sarlavha: 'Sarlavha' })).toMatch(/turi/);
    expect(yozishYuki('murojaat_yarat', { kompaniya_id: 3, aloqa_id: 5, turi: 'remark', sarlavha: 'Sarlavha', muhimlik: 'o‘ta' })).toMatch(/muhimlik/);
    expect(yozishYuki('murojaat_yarat', { kompaniya_id: 3, aloqa_id: 5, turi: 'remark', sarlavha: 'Sarlavha', muddat: '20.10.2026' })).toMatch(/muddat/);
    expect(yozishYuki('murojaat_yarat', { kompaniya_id: 3, aloqa_id: 5, turi: 'remark', sarlavha: 'Sarlavha' })).toMatchObject({ p_muhimlik: 'oddiy', p_muddat: null, p_obyekt_id: null });
  });

  it('javob: dalil ro‘yxati cheklangan, hamma element musbat son', () => {
    expect(yozishYuki('murojaat_javob', { kompaniya_id: 3, murojaat_id: 9, matn: 'Tuzatildi', document_ids: [4, '5'] })).toEqual({ p_kompaniya_id: 3, p_id: 9, p_matn: 'Tuzatildi', p_document_ids: [4, 5] });
    expect(yozishYuki('murojaat_javob', { kompaniya_id: 3, murojaat_id: 9, matn: 'x', document_ids: [4, -1] })).toMatch(/document_ids/);
    expect(yozishYuki('murojaat_javob', { kompaniya_id: 3, murojaat_id: 9, matn: 'x', document_ids: Array.from({ length: 21 }, (_, i) => i + 1) })).toMatch(/document_ids/);
    expect(yozishYuki('murojaat_javob', { kompaniya_id: 3, murojaat_id: 9, matn: 'Tuzatildi' })).toMatchObject({ p_document_ids: [] });
  });

  it('qaror, bekor, hujjat biriktirish; actor/kompaniya almashtirib bo‘lmaydi', () => {
    expect(yozishYuki('murojaat_qaror', { kompaniya_id: 3, murojaat_id: 9, qaror: 'qayta_ochish', izoh: 'B25 emas', p_actor_id: 1 })).toEqual({ p_kompaniya_id: 3, p_id: 9, p_qaror: 'qayta_ochish', p_izoh: 'B25 emas' });
    expect(yozishYuki('murojaat_qaror', { kompaniya_id: 3, murojaat_id: 9, qaror: 'qabul' })).toMatch(/qaror/);
    expect(yozishYuki('murojaat_bekor', { kompaniya_id: 3, murojaat_id: 9, sabab: 'kerak emas' })).toEqual({ p_kompaniya_id: 3, p_id: 9, p_sabab: 'kerak emas' });
    expect(yozishYuki('murojaat_hujjat', { kompaniya_id: 3, murojaat_id: 9, document_id: 12 })).toEqual({ p_kompaniya_id: 3, p_id: 9, p_document_id: 12 });
    expect(yozishYuki('murojaat_hujjat', { kompaniya_id: 3, murojaat_id: 9 })).toMatch(/document_id/);
  });

  it('o‘qish va xato xaritasi', () => {
    expect(oqishYuki('murojaatlar', new URLSearchParams('kompaniya_id=3&yonalish=menga&holat=ochiq'))).toEqual({ p_kompaniya_id: 3, p_yonalish: 'menga', p_holat: 'ochiq', p_aloqa_id: null, p_limit: 100 });
    expect(oqishYuki('murojaatlar', new URLSearchParams('kompaniya_id=3&yonalish=hammasi'))).toMatchObject({ p_yonalish: null });
    expect(oqishYuki('murojaat', new URLSearchParams('kompaniya_id=3&murojaat_id=8'))).toEqual({ p_kompaniya_id: 3, p_id: 8 });
    expect(oqishYuki('murojaat', new URLSearchParams('kompaniya_id=3'))).toMatch(/murojaat_id/);
    expect(oqishYuki('murojaat_turlari', new URLSearchParams('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(xatoJavobi(JSON.stringify({ code: '42501', message: 'DALIL_BEGONA: hujjat 4 sizning kompaniyangizniki emas' })).body).toMatchObject({ code: 'DALIL_BEGONA' });
  });
});
