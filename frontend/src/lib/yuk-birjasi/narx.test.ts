import { describe, expect, it } from 'vitest';
import { parametrlarServerdan, shoshilinchlik, SUKUT_PARAMETR, tavsiyaNarx, tavsiyadanFarqFoiz, type NarxParametr } from './narx';

const P: NarxParametr = { ...SUKUT_PARAMETR, stavkaTkm: 1500, minTarif: 2_000_000 };

describe('tavsiyaNarx', () => {
  it('Toshkent→Navoiy: 420 km × 20 t × 1500 × 1,7 × 1,1', () => {
    const n = tavsiyaNarx({ masofaKm: 420, tonna: 20, yukTuri: 'sochma', qaytish: 'bir_tomon', shoshilinch: 'ertaga', parametr: P });
    expect(n.tarkib.tonnaKm).toBe(8400);
    expect(n.tarkib.asos).toBe(12_600_000);
    expect(n.tarkib.koeffitsiyent).toBe(1.87);
    expect(n.qqsSiz).toBe(23_562_000);
    expect(n.qqsSum).toBe(2_827_440);
    expect(n.qqsBilan).toBe(26_389_440);
    expect(n.pastki).toBe(20_027_700);
    expect(n.yuqori).toBe(27_096_300);
    expect(n.tkmNarx).toBe(2805.0);
    expect(n.minQollandi).toBe(false);
    expect(n.yetishmaydi).toEqual([]);
  });
  it('yuk turi koeffitsiyenti: xavfli ×1,6', () => {
    const a = tavsiyaNarx({ masofaKm: 100, tonna: 10, yukTuri: 'sochma', qaytish: 'qaytishda_yuk', parametr: P });
    const b = tavsiyaNarx({ masofaKm: 100, tonna: 10, yukTuri: 'xavfli', qaytish: 'qaytishda_yuk', parametr: P });
    expect(a.qqsSiz).toBe(2_000_000); // 1 500 000 < minimal tarif
    expect(b.qqsSiz).toBe(2_400_000);
    expect(a.minQollandi).toBe(true);
  });
  it('minimal tarif qo‘llanadi va belgilanadi', () => {
    const n = tavsiyaNarx({ masofaKm: 10, tonna: 1, parametr: P });
    expect(n.minQollandi).toBe(true);
    expect(n.qqsSiz).toBe(2_000_000);
  });
  it('stavka kiritilmagan — null (0 emas) va sabab ko‘rsatiladi', () => {
    const n = tavsiyaNarx({ masofaKm: 420, tonna: 20, parametr: SUKUT_PARAMETR });
    expect(n.qqsSiz).toBeNull();
    expect(n.qqsBilan).toBeNull();
    expect(n.yetishmaydi).toEqual(['stavka']);
  });
  it('masofa yoki tonna yo‘q — null', () => {
    expect(tavsiyaNarx({ masofaKm: null, tonna: 5, parametr: P }).yetishmaydi).toEqual(['masofa']);
    expect(tavsiyaNarx({ masofaKm: 5, tonna: 0, parametr: P }).qqsSiz).toBeNull();
  });
  it('QQS to‘lovchi bo‘lmagan (0 %) — QQS bilan = QQS siz', () => {
    const n = tavsiyaNarx({ masofaKm: 100, tonna: 20, qaytish: 'qaytishda_yuk', parametr: { ...P, qqsFoiz: 0 } });
    expect(n.qqsBilan).toBe(n.qqsSiz);
    expect(n.qqsSum).toBe(0);
  });
});

describe('parametrlarServerdan', () => {
  it('stavka/min null qoladi, noto‘g‘ri koeffitsiyent sukutga tushadi', () => {
    const p = parametrlarServerdan({ stavka_tkm: null, k_yuk: { xavfli: 2, sochma: -1, x: 'a' }, diapazon_foiz: 10, qqs_foiz: 12 });
    expect(p.stavkaTkm).toBeNull();
    expect(p.minTarif).toBeNull();
    expect(p.kYuk.xavfli).toBe(2);
    expect(p.kYuk.sochma).toBe(1);
    expect(p.diapazonFoiz).toBe(10);
  });
  it('null kirish — butunlay sukut', () => {
    expect(parametrlarServerdan(null)).toEqual(SUKUT_PARAMETR);
  });
});

describe('shoshilinchlik va farq', () => {
  it('sanalar', () => {
    expect(shoshilinchlik('2026-11-04', '2026-11-04')).toBe('bugun');
    expect(shoshilinchlik('2026-11-05', '2026-11-04')).toBe('ertaga');
    expect(shoshilinchlik('2026-11-09', '2026-11-04')).toBe('oddiy');
    expect(shoshilinchlik(null, '2026-11-04')).toBe('oddiy');
  });
  it('kelishilgan narx farqi', () => {
    expect(tavsiyadanFarqFoiz(900, 1000)).toBe(-10);
    expect(tavsiyadanFarqFoiz(900, null)).toBeNull();
  });
});