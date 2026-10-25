import { beforeEach, describe, expect, it } from 'vitest';
import { javobTasnifi, urinishAktlari, urinishHolati, urinishOchir, urinishOchiqmi, urinishOl, urinishReceipt, urinishSaqla, urinishYarat } from './fakt-qamrov-urinish';

const paket = [[{ qator_id: 1, hajm: 10 }, { qator_id: 2, hajm: 5 }], [{ qator_id: 3, hajm: 1 }]];
let n = 0;
const yangiId = () => `op-${++n}`;
const yarat = () => urinishYarat({ kompaniyaId: 1, obyektId: 8, sana: '2026-10-25', sarlavha: 'Ko‘l', foiz: 100 }, paket, yangiId, () => 'T');

describe('qamrov urinishi (JQA-04 / JQA-08)', () => {
  beforeEach(() => { n = 0; urinishOchir(1, 8); });

  it('snapshot muzlatiladi: bo‘laklar, UUID, izoh — keyin o‘zgarmaydi', () => {
    const u = yarat();
    expect(u.bolaklar.map((b) => b.operationId)).toEqual(['op-1', 'op-2']);
    expect(u.bolaklar[0].izoh).toBe('Qamrov 100%: Ko‘l (1/2)');
    expect(u.bolaklar[0].qatorlar).toEqual(paket[0]);
    expect(Object.isFrozen(u) && Object.isFrozen(u.bolaklar[0])).toBe(true);
    expect(urinishHolati(u)).toBe('kutmoqda');
    expect(urinishOchiqmi(u)).toBe(true);
  });

  it('javob tasnifi: throw/transport → unknown; ok → confirmed; server code yoki boshqa rad → failed', () => {
    expect(javobTasnifi({ tashlandi: true })).toBe('unknown');
    expect(javobTasnifi(null)).toBe('unknown');
    expect(javobTasnifi({ ok: false, error: 'Server 90 soniyada javob bermadi — amal serverda bajarilgan bo‘lishi mumkin.' })).toBe('unknown');
    expect(javobTasnifi({ ok: false, error: 'Internet aloqasi uzildi — o‘zgarish serverga yetmadi.' })).toBe('unknown');
    expect(javobTasnifi({ ok: false, error: 'HTTP 502: yozish so\'rovi rad etildi' })).toBe('unknown');
    expect(javobTasnifi({ ok: true, akt_id: 5, takror: true })).toBe('confirmed');
    expect(javobTasnifi({ ok: false, code: 'FAKT_LINE_INVALID' })).toBe('failed');
    expect(javobTasnifi({ ok: false, error: 'qatorlar bo\'sh' })).toBe('failed');
  });

  it('receipt: bo‘lak holati va akt_id; body o‘zgarmaydi; holat — unknown ustun, hammasi confirmed → toliq', () => {
    let u = yarat();
    u = urinishReceipt(u, 0, { ok: true, akt_id: 11 });
    u = urinishReceipt(u, 1, { tashlandi: true });
    expect(u.bolaklar.map((b) => [b.holat, b.aktId])).toEqual([['confirmed', 11], ['unknown', null]]);
    expect(u.bolaklar[1].qatorlar).toEqual(paket[1]);
    expect(urinishHolati(u)).toBe('nomalum');
    u = urinishReceipt(u, 1, { ok: false, code: 'X' });
    expect(urinishHolati(u)).toBe('xato');
    u = urinishReceipt(u, 1, { ok: true, akt_id: 12, takror: true });
    expect(urinishHolati(u)).toBe('toliq');
    expect(urinishOchiqmi(u)).toBe(false);
    expect(urinishAktlari(u)).toEqual([11, 12]);
  });

  it('reestr: komponent yopilib qayta ochilsa ham, localStorage orqali sahifa yangilansa ham o‘sha urinish', () => {
    const u = urinishReceipt(yarat(), 0, { tashlandi: true });
    urinishSaqla(u);
    expect(urinishOl(1, 8)?.bolaklar[0].operationId).toBe('op-1');
    expect(JSON.parse(localStorage.getItem('t2.fakt.qamrov.urinish:1:8') ?? 'null')?.foiz).toBe(100);
    expect(urinishOl(2, 8)).toBeNull(); // boshqa kompaniya/obyekt — ta’sir qilmaydi
    urinishOchir(1, 8);
    expect(urinishOl(1, 8)).toBeNull();
    expect(localStorage.getItem('t2.fakt.qamrov.urinish:1:8')).toBeNull();
  });
});
