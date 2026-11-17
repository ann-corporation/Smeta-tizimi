import { describe, expect, it } from 'vitest';
import { kontragentTaklif, materialTaklif, median, type TaklifYozuv } from './taklif';

// Faqat sintetik ma'lumot.
const B = '2026-11-18';
let id = 0;
const K = (sana: string, nomi: string, birligi: string, obyomi: number, postavshik: string | null, narx: number | null = null): TaklifYozuv =>
  ({ id: ++id, sana, nomi, birligi, obyomi, postavshik, operatsiya: 'prixod', narx });
const C = (sana: string, nomi: string, birligi: string, obyomi: number, qabul: string | null): TaklifYozuv =>
  ({ id: ++id, sana, nomi, birligi, obyomi, qabul_qiluvchi: qabul, operatsiya: 'rasxod' });

function tarix(): TaklifYozuv[] {
  id = 0;
  return [
    K('2026-11-15', 'Цемент ПЦ-400', 'кг', 1000, 'Альфа-снаб', 1100),
    K('2026-11-01', 'Цемент ПЦ-400', 'кг', 2000, 'Альфа-снаб', 1000),
    K('2026-10-15', 'Sement PTs-400', 'kg', 3000, 'Бета', 900),   // lotin yozilish — o'sha material
    K('2026-10-01', 'Цемент ПЦ-400', 'кг', 1000, 'Альфа-снаб', 1000),
    K('2026-11-10', 'Труба ПЭ 25', 'м', 100, 'Бета'),
    K('2026-08-01', 'Арматура 12', 'тн', 2, 'Гамма', 9_000_000),
    C('2026-11-12', 'Цемент ПЦ-400', 'кг', 300, 'Бригада Орол'),
  ];
}

describe('materialTaklif (kirim)', () => {
  it('«sem» -> cement: birlik, odatiy miqdor (median), oxirgi/o\'rtacha narx QQS siz va bilan, eng ko\'p yetkazuvchi', () => {
    const t = materialTaklif(tarix(), 'sem', 'prixod', { bugun: B });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ nomi: 'Цемент ПЦ-400', birligi: 'кг', soni: 4, oxirgi_sana: '2026-11-15', miqdor_oxirgi: 1000, miqdor_median: 1500, narx_oxirgi: 1100, kontragent: 'Альфа-снаб', kontragent_oxirgi: 'Альфа-снаб' });
    expect(t[0].narx_ortacha).toBe(1000); // (1100+1000+900+1000)/4 = 1000
    expect(t[0].narx_oxirgi_qqs).toBe(1232); // 1100 * 1.12
    expect(t[0].narx_ortacha_qqs).toBe(1120);
    expect(t[0].kontragentlar[0]).toEqual({ nomi: 'Альфа-снаб', soni: 3 });
  });
  it('chiqim yozuvlari kirim takliflariga aralashmaydi; chiqimda qabul qiluvchi', () => {
    expect(materialTaklif(tarix(), '', 'prixod', { bugun: B }).every((t) => t.kontragent !== 'Бригада Орол')).toBe(true);
    const c = materialTaklif(tarix(), 'цем', 'chiqim', { bugun: B });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ soni: 1, kontragent: 'Бригада Орол', miqdor_median: 300, narx_oxirgi: null });
  });
  it('bo\'sh so\'rov: ko\'p ishlatilgan va yaqin materiallar oldinda, eski kam ishlatilgan oxirida', () => {
    const t = materialTaklif(tarix(), '', 'prixod', { bugun: B });
    expect(t.map((x) => x.nomi)).toEqual(['Цемент ПЦ-400', 'Труба ПЭ 25', 'Арматура 12']);
  });
  it('yetkazuvchi tanlangan: faqat uning materiallari va uning tarixidan narx/miqdor (yetkazuvchi -> materiallari)', () => {
    const t = materialTaklif(tarix(), '', 'prixod', { bugun: B, kontragent: 'бета' });
    expect(t.map((x) => x.nomi).sort()).toEqual(['Sement PTs-400', 'Труба ПЭ 25'].sort());
    expect(t.find((x) => x.nomi.startsWith('Sement'))).toMatchObject({ miqdor_median: 3000, narx_oxirgi: 900 });
  });
  it('narx tarixda yo\'q bo\'lsa null (0 emas)', () => {
    const t = materialTaklif(tarix(), 'труба', 'prixod', { bugun: B })[0];
    expect(t).toMatchObject({ narx_oxirgi: null, narx_ortacha: null, narx_oxirgi_qqs: null, miqdor_median: 100 });
  });
  it('limit va topilmasa bo\'sh', () => {
    expect(materialTaklif(tarix(), '', 'prixod', { bugun: B, limit: 2 })).toHaveLength(2);
    expect(materialTaklif(tarix(), 'yoqmaydigan', 'prixod', { bugun: B })).toEqual([]);
  });
  it('so\'rov boshiga mos nom (prefix) o\'rtadagi moslikdan oldin turadi', () => {
    id = 0;
    const y = [K('2026-11-17', 'Анкер для цемента', 'шт', 10, null), K('2026-10-01', 'Цемент М500', 'кг', 10, null)];
    expect(materialTaklif(y, 'цемент', 'prixod', { bugun: B })[0].nomi).toBe('Цемент М500');
  });
});

describe('kontragentTaklif (yetkazuvchi -> odatiy materiallari)', () => {
  it('yetkazuvchi tanlansa uning odatiy materiallari (soni, median, oxirgi narx)', () => {
    const k = kontragentTaklif(tarix(), 'альфа', 'prixod');
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ nomi: 'Альфа-снаб', soni: 3, oxirgi_sana: '2026-11-15' });
    expect(k[0].materiallar[0]).toMatchObject({ nomi: 'Цемент ПЦ-400', soni: 3, miqdor_median: 1000, narx_oxirgi: 1100 });
  });
  it('bo\'sh so\'rov: eng faol yetkazuvchilar oldinda; lotin so\'rov kirill nomga', () => {
    const k = kontragentTaklif(tarix(), '', 'prixod');
    expect(k.map((x) => x.nomi)).toEqual(['Альфа-снаб', 'Бета', 'Гамма']);
    expect(kontragentTaklif(tarix(), 'alfa', 'prixod')[0].nomi).toBe('Альфа-снаб');
  });
  it('chiqimda qabul qiluvchilar', () => {
    expect(kontragentTaklif(tarix(), 'бригада', 'chiqim')[0]).toMatchObject({ nomi: 'Бригада Орол', soni: 1 });
  });
});

describe('median', () => {
  it('toq/juft/bo\'sh', () => {
    expect(median([3, 1, 2])).toBe(2); expect(median([1, 2, 3, 4])).toBe(2.5); expect(median([])).toBeNull();
  });
});
