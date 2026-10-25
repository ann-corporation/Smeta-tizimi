import { describe, expect, it } from 'vitest';
import { bloklarmi, dublikatTekshiruv, pereraschetBelgisi, summaYaqin, type DAkt } from './tekshiruv';

const akt = (id: number, raqam: string | null, oy: string, jami: number | null, holat = 'tasdiqlangan'): DAkt => ({ id, raqam, oy: `${oy}-01`, holat, hujjat_jami: jami });
const kirish = (o: Partial<Parameters<typeof dublikatTekshiruv>[0]> = {}) => ({ aktlar: [], oy: '2026-10', raqam: '', jami: null, ozAktId: null, manbaAktIdlar: [], ...o });
const kodlar = (o: Partial<Parameters<typeof dublikatTekshiruv>[0]>) => dublikatTekshiruv(kirish(o)).map((m) => `${m.daraja}:${m.kod}`);

describe('dublikatTekshiruv', () => {
  it('bo‘sh holat: masala yo‘q', () => expect(kodlar({})).toEqual([]));
  it('(i) manba fayl+varaq boshqa aktga yozilgan — BLOK; o‘zi yoki bekor akt emas', () => {
    const aktlar = [akt(1, '5', '2026-09', 100), akt(2, '6', '2026-09', 100, 'bekor')];
    expect(kodlar({ aktlar, manbaAktIdlar: [1] })).toContain('blok:manba');
    expect(kodlar({ aktlar, manbaAktIdlar: [1], ozAktId: 1 })).not.toContain('blok:manba');
    expect(kodlar({ aktlar, manbaAktIdlar: [2] })).not.toContain('blok:manba');
  });
  it('(ii) shu oy+raqam — BLOK; boshqa oy, bir xil raqam — BLOK; harf/bo‘shliq farqi hisobga olinmaydi', () => {
    const aktlar = [akt(1, ' F2-7 ', '2026-10', null), akt(2, '49', '2026-06', null)];
    expect(kodlar({ aktlar, raqam: 'f2-7' })).toContain('blok:oy_raqam');
    expect(kodlar({ aktlar, raqam: '49' })).toEqual(['blok:raqam']);
    expect(kodlar({ aktlar, raqam: '50' })).toEqual([]);
    expect(kodlar({ aktlar, raqam: '' })).toEqual([]);
    expect(bloklarmi(dublikatTekshiruv(kirish({ aktlar, raqam: '49' })))).toBe(true);
  });
  it('(ii) tahrirlanayotgan qoralamaning o‘zi va bekor akt bloklamaydi', () => {
    const aktlar = [akt(1, '49', '2026-10', null, 'qoralama'), akt(2, '50', '2026-10', null, 'bekor')];
    expect(kodlar({ aktlar, raqam: '49', ozAktId: 1 })).toEqual([]);
    expect(kodlar({ aktlar, raqam: '50' })).toEqual([]);
  });
  it('(iii) summasi ±0,5% teng F2 — faqat OGOHLANTIRISH (Turk oshxonasi 227 280 682)', () => {
    const aktlar = [akt(1, null, '2026-06', 227_280_682)];
    expect(kodlar({ aktlar, jami: 227_280_682 })).toEqual(['ogoh:summa']);
    expect(kodlar({ aktlar, jami: 228_000_000 })).toEqual(['ogoh:summa']);
    expect(kodlar({ aktlar, jami: 240_000_000 })).toEqual([]);
    expect(kodlar({ aktlar, jami: null })).toEqual([]);
    expect(bloklarmi(dublikatTekshiruv(kirish({ aktlar, jami: 227_280_682 })))).toBe(false);
  });
  it('(iv) pereraschet belgisi OGOHLANTIRISH beradi', () => {
    expect(kodlar({ pereraschet: true })).toEqual(['ogoh:pereraschet']);
  });
  it('summaYaqin: nol va noma’lum teng emas', () => {
    expect(summaYaqin(0, 0)).toBe(false);
    expect(summaYaqin(null, 5)).toBe(false);
    expect(summaYaqin(1000, 1005)).toBe(true);
    expect(summaYaqin(1000, 1006)).toBe(false);
  });
});

describe('pereraschetBelgisi', () => {
  const smeta = [
    { id: 1, ota_id: null, tur: 'rz', nom: 'Qurilish (ekspertizagacha)' },
    { id: 2, ota_id: 1, tur: 'bl', nom: 'Beton' },
    { id: 3, ota_id: null, tur: 'rz', nom: 'Qurilish (ekspertizadan keyin)' },
    { id: 4, ota_id: 3, tur: 'bl', nom: 'Beton' },
  ];
  it('eski bo‘lim + yangi bo‘lim bor — ha', () => expect(pereraschetBelgisi(smeta, [2])).toBe(true));
  it('yangi bo‘lim qatori — yo‘q', () => expect(pereraschetBelgisi(smeta, [4])).toBe(false));
  it('yangi bo‘lim yo‘q — yo‘q', () => expect(pereraschetBelgisi(smeta.slice(0, 2), [2])).toBe(false));
  it('bo‘sh kirish', () => { expect(pereraschetBelgisi([], [1])).toBe(false); expect(pereraschetBelgisi(smeta, [])).toBe(false); });
});