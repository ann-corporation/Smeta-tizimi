import { expect, it } from 'vitest';
import { sverkaJadvalOqi } from '../../src/lib/sverka-1c/tahlil';
import { fifoTaklif, taqsimotTekshir } from '../../src/lib/sverka-1c/taqsimot';
const blank = (value: number | null) => sverkaJadvalOqi([
 ['Акт сверки'], ['Показатели', null, 'ООО СИНТЕТИКА'],
 ['Дата', 'Документ', 'Дебет', 'Кредит'],
 ['Сальдо начальное на 01.01.2026 г.', null, value, value],
 ['дог. №7 от 01.02.2025 г., сумма договора 100 сум.', null, value, value],
 ['Сальдо конечное на г.', null, value, value],
 ['Обороты за период', null, 0, 0],
 ['Сальдо конечное на 01.10.2026 г.', null, value, value],
])!;
it('explicit zero balance remains known zero', () => {
 const f = blank(0); expect(f.bloklar).toHaveLength(1);
 expect(f.bloklar[0].yakuniy).toBe(0); expect(f.bloklar[0].ichkiMos).toBe(true);
});
it('ordinary contract blank balance must remain unknown, not proven zero', () => {
 const f = blank(null); expect(f.bloklar).toHaveLength(1);
 expect(f.yakuniy).toBeNull(); expect(f.bloklar[0].yakuniy).toBeNull();
 expect(f.bloklar[0].ichkiMos).toBeNull();
});
it('FIFO and validator preserve one-tiyin allocation differences', () => {
 const a = fifoTaklif([{id:1,sana:'2026-10-01',summa:101,saqlangan:[]}],
 [{obyektId:1,sana:'2026-09-01',summa:1},{obyektId:2,sana:'2026-09-02',summa:100}]).get(1)!;
 expect(a).toEqual([{obyektId:1,summa:1},{obyektId:2,summa:100}]);
 expect(taqsimotTekshir(101,a)).toEqual({ok:true});
 expect(taqsimotTekshir(102,a)).toMatchObject({ok:false,sabab:'JAMI',farq:1});
});