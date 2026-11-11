import { describe, expect, it } from 'vitest';
import { debitorJami, debitorOgoh, debitorQatorlar, type DebitorQator } from './debitor';

const q = (o: Partial<DebitorQator>): DebitorQator => ({
  shartnoma_id: 1, raqam: 'A-1', nom: null, yonalish: 'debitor', kontragent: 'Buyurtmachi', shartnoma_summa: 1000, f3_sotuv: 0,
  tolangan: 0, f2_nakrutkasiz: null, qarz: 0, oxirgi_tolov_sana: null, obyektlar: [], ...o,
});

describe('debitor qarzi', () => {
  it('faqat debitor qatorlari olinadi', () => {
    expect(debitorQatorlar([q({}), q({ shartnoma_id: 2, yonalish: 'kreditor' })])).toHaveLength(1);
  });
  it('NULL jamiga kirmaydi va 0 bo‘lib ketmaydi', () => {
    const j = debitorJami([q({ qarz: null, f2_nakrutkasiz: null }), q({ shartnoma_id: 2, qarz: 300, f2_nakrutkasiz: 500 })]);
    expect(j.qarz).toBe(300); expect(j.qarzNomalum).toBe(1); expect(j.f2).toBe(500);
    expect(debitorJami([q({ qarz: null })]).qarz).toBeNull();
    expect(debitorJami([]).qarz).toBeNull();
  });
  it('F2 bor, F3 yo‘q — ogohlantirish', () => {
    expect(debitorOgoh(q({ f2_nakrutkasiz: 500, f3_sotuv: 0 }))).toContain('f3_yoq');
    expect(debitorOgoh(q({ f2_nakrutkasiz: null, f3_sotuv: 0 }))).not.toContain('f3_yoq');
  });
  it('avans va to‘lov yo‘q signallari', () => {
    expect(debitorOgoh(q({ qarz: -50, f3_sotuv: 100, tolangan: 150 }))).toEqual(['avans']);
    expect(debitorOgoh(q({ qarz: 100, f3_sotuv: 100, tolangan: 0 }))).toEqual(['tolov_yoq']);
  });
});