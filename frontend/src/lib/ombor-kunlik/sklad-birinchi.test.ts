import { describe, expect, it } from 'vitest';
import { SKLAD_HAMMASI, aniqSklad, berdimBoshObyekti, boshSkladTanlovi, chiqimObyektiBor, obyektFiltri, obyektlarBoyicha } from './sklad-birinchi';

const S = [{ id: 9 }, { id: 18 }];
describe('sklad-birinchi', () => {
  it('ko\'p omborda «Barcha omborlar», birinchi ombor/obyekt jimgina tanlanmaydi', () => {
    expect(boshSkladTanlovi(S)).toBe(SKLAD_HAMMASI);
    expect(aniqSklad(S, SKLAD_HAMMASI)).toBeNull();
  });
  it('bitta ombor bo\'lsa o\'sha; saqlangan tanlov bor bo\'lsa saqlanadi, yo\'q bo\'lsa hamma', () => {
    expect(boshSkladTanlovi([{ id: 18 }])).toBe(18);
    expect(boshSkladTanlovi(S, 18)).toBe(18);
    expect(boshSkladTanlovi(S, 77)).toBe(SKLAD_HAMMASI);
    expect(aniqSklad(S, 18)?.id).toBe(18);
  });
  it('obyekt filtri faqat obyekt qoldiqlarida: null — hammasi', () => {
    const q = [{ obyekt_id: 1, qoldiq: 2 }, { obyekt_id: 2, qoldiq: 3 }, { obyekt_id: 2, qoldiq: 1 }];
    expect(obyektFiltri(q, null)).toHaveLength(3);
    expect(obyektFiltri(q, 2)).toHaveLength(2);
    expect(obyektFiltri(q, 10)).toHaveLength(0);
  });
  it('obyektlar bo\'yicha sarf: nomi yo\'q obyekt tashlanmaydi', () => {
    const r = obyektlarBoyicha([{ obyekt_id: 2, qoldiq: 1 }, { obyekt_id: 2, qoldiq: 1 }, { obyekt_id: 5, qoldiq: 1 }], new Map([[2, '10 kV liniya']]));
    expect(r).toEqual([{ obyekt_id: 2, nom: '10 kV liniya', pozitsiya: 2 }, { obyekt_id: 5, nom: '#5', pozitsiya: 1 }]);
  });
  it('chiqimda obyekt majburiy, oldindan tanlanmaydi', () => {
    expect(berdimBoshObyekti()).toBeNull();
    expect(chiqimObyektiBor(null)).toBe(false);
    expect(chiqimObyektiBor(0)).toBe(false);
    expect(chiqimObyektiBor(166)).toBe(true);
  });
});
