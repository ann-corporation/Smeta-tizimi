import { describe, expect, it } from 'vitest';
import { QORALAMA_MUDDAT_MS, qoralamaV1Kochir,qoralamaHammasiniOchir, qoralamaKaliti, qoralamaOchir, qoralamaOqi, qoralamaQur, qoralamaTikla, qoralamaYoz, type Xotira } from './fakt-jurnal-qoralama';

/** Sintetik xotira (localStorage o'rniga). */
function xotira(): Xotira & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

describe('fakt jurnali qoralamasi (hodisa 2026-11-09)', () => {
  const faktlar = new Map([[10, 4], [11, 0], [12, 7.5]]);

  it('kalit versiyali va kompaniya+obyekt bo‘yicha', () => {
    expect(qoralamaKaliti(3, 99, 7)).toBe('t2.fakt.jurnal.qoralama:v2:3:7:99');
  });

  it('foydalanuvchi bo‘yicha ajratilgan: B hisob A ning saqlanmagan qoralamasini ko‘rmaydi', () => {
    const x = xotira();
    qoralamaYoz(x, 1, 2, 10, qoralamaQur({ 10: { rejim: '+', qiymat: '2' } }, faktlar, 1000));
    expect(qoralamaOqi(x, 1, 2, 10, 2000)?.yozuvlar).toHaveLength(1);
    expect(qoralamaOqi(x, 1, 2, 11, 2000)).toBeNull();
    qoralamaOchir(x, 1, 2, 11); // B ning tozalashi A ga tegmaydi
    expect(qoralamaOqi(x, 1, 2, 10, 2000)).not.toBeNull();
  });

  const V1 = 't2.fakt.jurnal.qoralama:v1:1:2';
  const v1Matn = JSON.stringify({ v: 1, ts: 1000, yozuvlar: [{ id: 10, rejim: '+', qiymat: '2', asos: 4 }] });
  const xotiraKalitli = (m: Map<string, string>): Xotira => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } });

  it('v1 → v2: v2 yo‘q bo‘lsa mazmun joriy foydalanuvchiga ko‘chadi va v1 o‘chadi (bir martalik)', () => {
    const m = new Map<string, string>([[V1, v1Matn], ['boshqa.kalit', 'x']]);
    const x = xotiraKalitli(m);
    expect(qoralamaV1Kochir(x, 1, 2, 5)).toBe(true);
    expect(m.has(V1)).toBe(false);
    expect(qoralamaOqi(x, 1, 2, 5, 2000)?.yozuvlar).toEqual([{ id: 10, rejim: '+', qiymat: '2', asos: 4 }]);
    expect(qoralamaV1Kochir(x, 1, 2, 6)).toBe(false); // ikkinchi foydalanuvchiga hech narsa qolmadi
    expect(qoralamaOqi(x, 1, 2, 6, 2000)).toBeNull();
  });

  it('v2 allaqachon bor bo‘lsa v1 ga tegilmaydi; chiqishda hammasi tozalanadi', () => {
    const v2 = 't2.fakt.jurnal.qoralama:v2:1:5:2';
    const m = new Map<string, string>([[V1, v1Matn], [v2, '{}'], ['boshqa.kalit', 'x']]);
    const x = xotiraKalitli(m);
    expect(qoralamaV1Kochir(x, 1, 2, 5)).toBe(false);
    expect(m.get(V1)).toBe(v1Matn);
    expect(m.get(v2)).toBe('{}');
    expect(qoralamaHammasiniOchir(x)).toBe(2);
    expect([...m.keys()]).toEqual(['boshqa.kalit']);
  });

  it('saqlash → o‘qish → tiklash: bo‘sh qiymatlar tashlanadi, asos server faktidan', () => {
    const x = xotira();
    const q = qoralamaQur({ 10: { rejim: '+', qiymat: '2' }, 11: { rejim: '=', qiymat: '50%' }, 12: { rejim: '+', qiymat: '  ' } }, faktlar, 1000, '2026-11-09');
    expect(q?.yozuvlar).toEqual([{ id: 10, rejim: '+', qiymat: '2', asos: 4 }, { id: 11, rejim: '=', qiymat: '50%', asos: 0 }]);
    expect(qoralamaYoz(x, 1, 2, 9, q)).toBe(true);
    const o = qoralamaOqi(x, 1, 2, 9, 2000);
    expect(o).toEqual(q);
    const r = qoralamaTikla(o!, faktlar);
    expect(r.kiritmalar).toEqual({ 10: { rejim: '+', qiymat: '2' }, 11: { rejim: '=', qiymat: '50%' } });
    expect(r.ziddiyatlar).toEqual([]);
    expect(r.sana).toBe('2026-11-09');
    // Boshqa obyekt qoralamasi aralashmaydi.
    expect(qoralamaOqi(x, 1, 3, 9, 2000)).toBeNull();
  });

  it('kiritma yo‘q — qoralama yo‘q; tozalash kalitni o‘chiradi', () => {
    const x = xotira();
    expect(qoralamaQur({}, faktlar, 1)).toBeNull();
    qoralamaYoz(x, 1, 2, 9, qoralamaQur({ 10: { rejim: '+', qiymat: '1' } }, faktlar, 1));
    expect(x.m.size).toBe(1);
    qoralamaOchir(x, 1, 2, 9);
    expect(x.m.size).toBe(0);
  });

  it('ziddiyat: qator yo‘q yoki server fakti o‘zgargan — jim qo‘llanmaydi', () => {
    const q = qoralamaQur({ 10: { rejim: '+', qiymat: '2' }, 12: { rejim: '+', qiymat: '1' } }, faktlar, 1)!;
    q.yozuvlar.push({ id: 99, rejim: '=', qiymat: '5', asos: 0 });
    const hozir = new Map([[10, 4], [12, 9]]); // 12-qator fakti boshqa joyda 7.5 → 9; 99-qator o'chirilgan
    const r = qoralamaTikla(q, hozir);
    expect(r.kiritmalar).toEqual({ 10: { rejim: '+', qiymat: '2' } });
    expect(r.ziddiyatlar).toEqual([
      { yozuv: { id: 12, rejim: '+', qiymat: '1', asos: 7.5 }, sabab: 'ozgargan', joriy: 9 },
      { yozuv: { id: 99, rejim: '=', qiymat: '5', asos: 0 }, sabab: 'yoq' },
    ]);
  });

  it('hal qilinmagan ziddiyatlar keyingi yozuvda saqlanib qoladi (joriy kiritma ustun)', () => {
    const q = qoralamaQur({ 10: { rejim: '+', qiymat: '3' } }, faktlar, 1, undefined, [{ id: 10, rejim: '+', qiymat: '1', asos: 2 }, { id: 12, rejim: '+', qiymat: '1', asos: 7 }]);
    expect(q?.yozuvlar).toEqual([{ id: 10, rejim: '+', qiymat: '3', asos: 4 }, { id: 12, rejim: '+', qiymat: '1', asos: 7 }]);
  });

  it('buzilgan JSON, boshqa versiya, yaroqsiz yozuv va muddati o‘tgan qoralama tiklanmaydi', () => {
    const x = xotira();
    const k = qoralamaKaliti(1, 2, 9);
    x.setItem(k, '{buzuq'); expect(qoralamaOqi(x, 1, 2, 9)).toBeNull();
    x.setItem(k, JSON.stringify({ v: 2, ts: 1, yozuvlar: [{ id: 1, rejim: '+', qiymat: '1', asos: 0 }] })); expect(qoralamaOqi(x, 1, 2, 9, 2)).toBeNull();
    x.setItem(k, JSON.stringify({ v: 1, ts: 1, yozuvlar: [{ id: 'x', rejim: '+', qiymat: '1', asos: 0 }, { id: 5, rejim: '*', qiymat: '1', asos: 0 }] })); expect(qoralamaOqi(x, 1, 2, 9, 2)).toBeNull();
    x.setItem(k, JSON.stringify({ v: 1, ts: 1, yozuvlar: [{ id: 5, rejim: '+', qiymat: '1', asos: 0 }] }));
    expect(qoralamaOqi(x, 1, 2, 9, 1 + QORALAMA_MUDDAT_MS + 1)).toBeNull();
    expect(x.m.has(k)).toBe(false);
  });

  it('xotira yopiq/to‘lgan bo‘lsa yiqilmaydi', () => {
    const yomon: Xotira = { getItem: () => { throw new Error('yopiq'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => { throw new Error('yopiq'); } };
    expect(qoralamaYoz(yomon, 1, 2, 9, qoralamaQur({ 10: { rejim: '+', qiymat: '1' } }, faktlar, 1))).toBe(false);
    expect(qoralamaOqi(yomon, 1, 2, 9)).toBeNull();
    expect(qoralamaYoz(null, 1, 2, 9, null)).toBe(false);
  });

  it('qoralamada pul ma’lumoti yo‘q — faqat qator id, rejim, qiymat, asos fakt', () => {
    const q = qoralamaQur({ 10: { rejim: '+', qiymat: '2' } }, faktlar, 1)!;
    expect(Object.keys(q.yozuvlar[0]).sort()).toEqual(['asos', 'id', 'qiymat', 'rejim']);
  });
});
