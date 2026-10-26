import { describe, expect, it } from 'vitest';
import { haqiqiyOzgarish, jurnalsiz, muhrBelgisi, muhrJuftlar, muhrQiymatMatn, muhrXaritasi, muhrXulosa, type QatorMuhrFarq } from './farq';

const f = (o: Partial<QatorMuhrFarq>): QatorMuhrFarq => ({
  qator_id: 1, obyekt_id: 152, tur: 'bl', kod: 'E1', nom: 'ИШ', ota_id: null, holat: 'ozgargan', maydonlar: [], avval: {}, endi: {},
  faqat_narx_qoyildi: false, aslda_yoq: false, ekspertizagacha: false, tekshirilmagan: [], muhr_manba: 'import', asos_vaqt: null,
  jurnal_soni: 1, oxirgi_tahrir: null, oxirgi_kim: null, oxirgi_manba: null, ...o,
});

describe('qator muhri farqi', () => {
  it('Stella misoli: rs → bl, % → сум — avval/endi va belgi', () => {
    const x = f({ qator_id: 951034, maydonlar: ['tur', 'birlik', 'kat', 'hajm', 'narx'],
      avval: { tur: 'rs', birlik: '%', kat: 'МАТ', hajm: 30, narx: 81082237.5 }, endi: { tur: 'bl', birlik: 'сум', kat: null, hajm: 1, narx: 2432467125 } });
    expect(muhrBelgisi(x)).toMatchObject({ soz: 'O‘zgargan', ton: 'warn' });
    expect(haqiqiyOzgarish(x)).toBe(true);
    const j = muhrJuftlar(x);
    expect(j.map((p) => p.maydon)).toEqual(['tur', 'birlik', 'kat', 'hajm', 'narx']);
    expect(j.find((p) => p.maydon === 'kat')).toEqual({ maydon: 'kat', avval: 'МАТ', endi: null });
    expect(j.find((p) => p.maydon === 'hajm')?.avval).toBe('30');
  });

  it('NULL ≠ 0: bo‘sh qiymat null, nol — «0»', () => {
    expect(muhrQiymatMatn('hajm', null)).toBeNull();
    expect(muhrQiymatMatn('hajm', 0)).toBe('0');
    expect(muhrQiymatMatn('narx', '')).toBeNull();
    expect(muhrQiymatMatn('ota_id', 42)).toBe('#42');
    expect(muhrQiymatMatn('nom', 'ИШ А,')).toBe('ИШ А,');
  });

  it('narx qo‘yildi — yumshoq belgi, haqiqiy o‘zgarish emas', () => {
    const x = f({ maydonlar: ['narx'], faqat_narx_qoyildi: true, avval: { narx: null }, endi: { narx: 1500 } });
    expect(muhrBelgisi(x)).toMatchObject({ soz: 'Narx qo‘yildi', ton: 'info' });
    expect(haqiqiyOzgarish(x)).toBe(false);
  });

  it('xulosa: holatlar, jurnalsiz va ekspertizagacha alohida', () => {
    const r = [
      f({ qator_id: 1 }),
      f({ qator_id: 2, jurnal_soni: 0, ekspertizagacha: true }),
      f({ qator_id: 3, faqat_narx_qoyildi: true }),
      f({ qator_id: 4, holat: 'qoshilgan', aslda_yoq: true }),
      f({ qator_id: 5, holat: 'ochirilgan' }),
      f({ qator_id: 6, holat: 'muhrsiz', jurnal_soni: 0, ekspertizagacha: null }),
    ];
    expect(muhrXulosa(r)).toEqual({ ozgargan: 2, narxQoyildi: 1, qoshilgan: 1, ochirilgan: 1, muhrsiz: 1, jurnalsiz: 1, ekspertizagacha: 1, jami: 6 });
    expect(jurnalsiz(r[1])).toBe(true);
    expect(jurnalsiz(r[5])).toBe(false);
    const m = muhrXaritasi(r);
    expect(m.has(5)).toBe(false); // o'chirilgan daraxtda yo'q
    expect([...m.keys()]).toEqual([1, 2, 3, 4, 6]);
    expect(muhrBelgisi(r[4]).ton).toBe('danger');
    expect(muhrBelgisi(r[3]).soz).toBe('Qo‘shilgan');
  });
});
