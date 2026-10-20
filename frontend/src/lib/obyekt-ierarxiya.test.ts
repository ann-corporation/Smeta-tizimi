import { describe, expect, it } from 'vitest';
import { guruhYorligi, obyektGuruhla } from './obyekt-ierarxiya';

const m = {
  loyihalar: [{ id: 1, nom: 'NEW TIMES' }, { id: 2, nom: 'PARK' }],
  shartnomalar: [{ id: 10, nom: 'Bosh pudrat', raqam: '13', loyiha_id: 1 }, { id: 11, nom: 'Obodonlashtirish', raqam: '18', loyiha_id: 2 }],
  boglar: [{ obyekt_id: 100, shartnoma_id: 10 }, { obyekt_id: 101, shartnoma_id: 10 }, { obyekt_id: 102, shartnoma_id: 11 }],
};
describe('Obyekt tanlash — Loyiha › Shartnoma › Obyekt', () => {
  it('obyektlar loyiha va shartnoma bo‘yicha guruhlanadi; shartnomasiz va loyihasizlar oxirida', () => {
    const g = obyektGuruhla([
      { id: 101, nom: 'Stella', loyiha_id: 1 }, { id: 100, nom: 'Amfiteatr', loyiha_id: 1 },
      { id: 102, nom: 'Suniy ko‘l', loyiha_id: 2 }, { id: 103, nom: 'Ombor', loyiha_id: 1 }, { id: 104, nom: 'Test', loyiha_id: null },
    ], m);
    expect(g.map(guruhYorligi)).toEqual([
      'NEW TIMES › Shartnoma №13 Bosh pudrat', 'NEW TIMES › Shartnomasiz', 'PARK › Shartnoma №18 Obodonlashtirish', 'Loyihasiz › Shartnomasiz',
    ]);
    expect(g[0].obyektlar.map((o) => o.nom)).toEqual(['Amfiteatr', 'Stella']);
  });
  it('ierarxiya o‘qilmasa — bitta oddiy guruh (tanlov bloklanmaydi)', () => {
    const g = obyektGuruhla([{ id: 1, nom: 'A' }], null);
    expect(g).toHaveLength(1); expect(g[0].shartnoma).toBeNull();
  });
});
