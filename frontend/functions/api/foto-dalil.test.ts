import { describe, expect, it } from 'vitest';
import { oqishYuki, yozishYuki } from './foto-dalil';
import { nomzodlarniTozala, taklifQur } from './foto-ai';

describe('foto-dalil shlyuzi', () => {
  it('oqishYuki: kompaniya va obyekt majburiy, manba_turi tekshiriladi', () => {
    expect(typeof oqishYuki(new URLSearchParams('obyekt_id=5'))).toBe('string');
    expect(typeof oqishYuki(new URLSearchParams('kompaniya_id=1&obyekt_id=5&manba_turi=Bad Tur'))).toBe('string');
    const y = oqishYuki(new URLSearchParams('kompaniya_id=1&obyekt_id=5&manba_turi=aosr&manba_id=9&dan=2026-11-01&gacha=bad')) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 1, p_obyekt_id: 5, p_manba_turi: 'aosr', p_manba_id: 9, p_dan: '2026-11-01', p_gacha: null, p_limit: 120 });
  });
  it('yozishYuki bogla: umumiy manbada manba_id null; boshqasida majburiy; koordinata chegarasi', () => {
    const a = yozishYuki('bogla', { kompaniya_id: 1, obyekt_id: 2, document_id: 3, lat: 41.3, lng: 999 });
    expect(a).toMatchObject({ nom: 't2_foto_dalil_bogla_v1', yuk: { p_manba_turi: 'umumiy', p_manba_id: null, p_lat: 41.3, p_lng: null } });
    expect(typeof yozishYuki('bogla', { kompaniya_id: 1, obyekt_id: 2, document_id: 3, manba_turi: 'qator' })).toBe('string');
    expect(typeof yozishYuki('bogla', { kompaniya_id: 1, obyekt_id: 2, document_id: 3, manba_turi: 'DROP TABLE' })).toBe('string');
  });
  it('yozishYuki yangila/ochir/noma’lum', () => {
    expect(yozishYuki('yangila', { kompaniya_id: 1, id: 4, izoh: 'x', manba_ozgar: true, manba_turi: 'fakt', manba_id: 8 })).toMatchObject({ nom: 't2_foto_dalil_yangila_v1', yuk: { p_manba_ozgar: true, p_manba_id: 8 } });
    expect(yozishYuki('yangila', { kompaniya_id: 1, id: 4 })).toMatchObject({ yuk: { p_izoh: null, p_manba_ozgar: false } });
    expect(yozishYuki('ochir', { kompaniya_id: 1, id: 4 })).toMatchObject({ nom: 't2_foto_dalil_ochir_v1' });
    expect(yozishYuki('drop', { kompaniya_id: 1 })).toBe('Amal ochiq emas');
  });
});

describe('foto-ai', () => {
  it('nomzodlarniTozala: yaroqsizlar tashlanadi, 40 ta cheklov', () => {
    const l = Array.from({ length: 60 }, (_, i) => ({ tur: 'qator', id: i + 1, nom: ' ish  ' + i }));
    expect(nomzodlarniTozala([{ tur: 'X', id: 1, nom: 'a' }, { tur: 'qator', id: -2, nom: 'b' }, ...l])).toHaveLength(38);
  });
  it('taklifQur: faqat ro‘yxatdagi variant; -1 yoki chegaradan tashqari — null; ishonch 0..1', () => {
    const n = [{ tur: 'qator', id: 11, nom: 'Beton' }, { tur: 'aosr', id: 12, nom: 'АОСР 1' }];
    expect(taklifQur({ izoh: ' beton quyilmoqda ', tanlov: 1, ishonch: 3 }, n)).toEqual({ izoh: 'beton quyilmoqda', taklif: { manba_turi: 'aosr', manba_id: 12, nom: 'АОСР 1', ishonch: 1 } });
    expect(taklifQur({ izoh: 'x', tanlov: -1, ishonch: 0.5 }, n).taklif).toBeNull();
    expect(taklifQur({ izoh: 'x', tanlov: 9, ishonch: 0.5 }, n).taklif).toBeNull();
    expect(taklifQur(null, n)).toEqual({ izoh: '', taklif: null });
  });
});
