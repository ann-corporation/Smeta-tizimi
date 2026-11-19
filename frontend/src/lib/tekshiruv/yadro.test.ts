import { describe, expect, it } from 'vitest';
import { bolimlarga, taklifBelgilari, takliflarQatorBoyicha, tekshiruvHavolasi, tekshiruvTalabi, tekshiruvYoli, type PanelQator, type PanelTaklif } from './yadro';

describe('tekshiruvTalabi', () => {
  it('to\'g\'ri talab tozalanadi (vergul, bo\'sh joy, bo\'sh qiymat -> null)', () => {
    expect(tekshiruvTalabi({ qator_id: 5, bayroq: 'hajm_notogri', izoh: '  mos emas ', taklif_hajm: '3,5', rang: 'sariq' })).toEqual({ qator_id: 5, bayroq: 'hajm_notogri', izoh: 'mos emas', taklif_hajm: 3.5, rang: 'sariq', hujjat_turi: null, qosh: false });
    expect(tekshiruvTalabi({ qator_id: 5, bayroq: '', izoh: '', taklif_hajm: '', rang: null })).toMatchObject({ bayroq: null, izoh: null, taklif_hajm: null, rang: null });
  });
  it('noto\'g\'ri talab rad etiladi', () => {
    for (const x of [{ qator_id: 0 }, { qator_id: 'a' }, { qator_id: 1, bayroq: 'x' }, { qator_id: 1, rang: 'x' }, { qator_id: 1, taklif_hajm: -1 }, { qator_id: 1, taklif_hajm: 1e13 }, { qator_id: 1, izoh: 5 }, { qator_id: 1, bayroq: 'hujjat_kerak' }, { qator_id: 1, izoh: 'x'.repeat(1001) }]) {
      expect(tekshiruvTalabi(x as Record<string, unknown>)).toBeNull();
    }
  });
  it('hujjat_kerak hujjat turi bilan; qosh faqat true bo\'lsa', () => {
    expect(tekshiruvTalabi({ qator_id: 1, bayroq: 'hujjat_kerak', hujjat_turi: 'Laboratoriya xulosasi', qosh: true })).toMatchObject({ hujjat_turi: 'Laboratoriya xulosasi', qosh: true });
    expect(tekshiruvTalabi({ qator_id: 1, izoh: 'x', qosh: 'ha' })?.qosh).toBe(false);
  });
});

describe('havola va tartib', () => {
  it('havola: nashr tokeni -> /tekshiruv/<token>[?k=kod]', () => {
    const T = 'N'.repeat(22);
    expect(tekshiruvYoli(T)).toBe('/tekshiruv/' + T);
    expect(tekshiruvHavolasi('https://qur.uz/', T, 'a b')).toBe('https://qur.uz/tekshiruv/' + T + '?k=a%20b');
  });
  const q = (id: number, bolim: string | null): PanelQator => ({ akt_qator_id: id, qator_id: id, kod: null, nom: 'n' + id, birlik: 'm2', tur: 'bl', ota_id: null, bolim, hajm: id });
  it('bolimlarga: smeta tartibi (birinchi uchragan bo\'lim birinchi), qator tartibi saqlanadi', () => {
    const g = bolimlarga([q(1, 'A'), q(2, 'A'), q(3, 'B'), q(4, null), q(5, 'B')]);
    expect(g.map((x) => [x.bolim, x.qatorlar.map((r) => r.qator_id)])).toEqual([['A', [1, 2]], ['B', [3, 5]], ['', [4]]]);
  });
  it('takliflar qator bo\'yicha; belgilar', () => {
    const t = (id: number, qator: number): PanelTaklif => ({ id, tekshiruv_id: 1, qator_id: qator, bayroq: 'qabul', izoh: null, taklif_hajm: 2, rang: null, hujjat_turi: null, qosh: false, qaror: 'kutilmoqda', qaror_sabab: null });
    const m = takliflarQatorBoyicha([t(1, 10), t(2, 10), t(3, 11)]);
    expect(m.get(10)).toHaveLength(2); expect(m.get(11)).toHaveLength(1);
    expect(taklifBelgilari({ bayroq: 'qabul', izoh: 'x', taklif_hajm: 1, qosh: true })).toEqual(['qabul', 'hajm', 'izoh', 'qosh']);
  });
});
