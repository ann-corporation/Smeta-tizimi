import { describe, expect, it } from 'vitest';
import { eslatmaQatorga, eslatmaYigish, type EslatmaYozuv } from './eslatma';

// Faqat sintetik ma'lumot. Yozuvlar yangisidan eskisiga (server `order=id.desc`).
const Y = (id: number, nomi: string, birligi: string, sana: string, operatsiya: 'prixod' | 'rasxod', kim: string | null = null, narx: number | null = null): EslatmaYozuv =>
  ({ id, nomi, birligi, sana, operatsiya, postavshik: operatsiya === 'prixod' ? kim : null, qabul_qiluvchi: operatsiya === 'rasxod' ? kim : null, narx });
const YOZUV: EslatmaYozuv[] = [
  Y(9, 'Цемент ПЦ-450', 'кг', '2026-11-10', 'prixod', 'Sintetik A', 1200),
  Y(8, 'Sement PTs-450', 'kg', '2026-11-08', 'rasxod', 'Sintetik brigada'),
  Y(7, 'Цемент ПЦ-450', 'кг', '2026-11-01', 'prixod', 'Sintetik B'),
  Y(6, 'Труба ПЭ 25', 'м', '2026-10-20', 'prixod', 'Sintetik C'),
  Y(5, 'Труба ПЭ 25', 'м', '2026-10-21', 'prixod', 'Sintetik C'),
  Y(4, 'Арматура 12', 'тн', '2026-09-01', 'prixod'),
];

describe('eslatmaYigish (omborchi eslab qolgan nomlar)', () => {
  it('bo\'sh so\'rov: eng yaqin yozilgani birinchi, so\'ng ko\'pi', () => {
    expect(eslatmaYigish(YOZUV, '').map((e) => e.nomi)).toEqual(['Цемент ПЦ-450', 'Труба ПЭ 25', 'Арматура 12']);
  });
  it('bir xil nomning lotin/kirill yozilishi BITTA taklifga (variant tasdig\'isiz) va soni yig\'iladi', () => {
    const e = eslatmaYigish(YOZUV, 'sement');
    expect(e.length).toBe(1);
    expect(e[0]).toMatchObject({ nomi: 'Цемент ПЦ-450', birligi: 'кг', soni: 3 });
  });
  it('qisman yozilgan so\'z va boshqa alifbo: «sem» → Цемент, «тру» → Труба, «truba» → Труба', () => {
    expect(eslatmaYigish(YOZUV, 'sem')[0]?.nomi).toBe('Цемент ПЦ-450');
    expect(eslatmaYigish(YOZUV, 'тру')[0]?.nomi).toBe('Труба ПЭ 25');
    expect(eslatmaYigish(YOZUV, 'truba')[0]?.nomi).toBe('Труба ПЭ 25');
    expect(eslatmaYigish(YOZUV, 'qum')).toEqual([]);
  });
  it('oxirgi yetkazuvchi/qabul qiluvchi/narx — eng yangi yozuvdan (kirim va chiqim alohida)', () => {
    const e = eslatmaYigish(YOZUV, 'цемент')[0];
    expect(e).toMatchObject({ postavshik: 'Sintetik A', qabul_qiluvchi: 'Sintetik brigada', narx: 1200, oxirgi_sana: '2026-11-10' });
  });
  it('birligi boshqacha bo\'lsa alohida taklif; yangi nom (yozuvda yo\'q) bo\'sh natija — ro\'yxatdan tanlash majburiy emas', () => {
    const k = eslatmaYigish([...YOZUV, Y(10, 'Цемент ПЦ-450', 'тн', '2026-11-11', 'prixod')], 'цемент');
    expect(k.map((e) => e.birligi)).toEqual(['тн', 'кг']);
    expect(eslatmaYigish(YOZUV, 'Butunlay yangi material')).toEqual([]);
  });
  it('nomi/birligi bo\'sh yozuvlar tashlanadi; limit chegaralanadi', () => {
    const k = eslatmaYigish([Y(1, '', 'шт', '2026-01-01', 'prixod'), Y(2, 'Тест', '', '2026-01-01', 'prixod'), ...YOZUV], '', 2);
    expect(k.length).toBe(2);
  });
  it('eslatmaQatorga: nom/birlik doim; kontragent faqat bo\'sh bo\'lsa to\'ldiriladi (kirim — yetkazuvchi, chiqim — qabul qiluvchi)', () => {
    const e = eslatmaYigish(YOZUV, 'цемент')[0];
    expect(eslatmaQatorga(e, 'prixod', '')).toEqual({ nomi: 'Цемент ПЦ-450', birligi: 'кг', kontragent: 'Sintetik A' });
    expect(eslatmaQatorga(e, 'chiqim', '')).toMatchObject({ kontragent: 'Sintetik brigada' });
    expect(eslatmaQatorga(e, 'prixod', 'Qo\'lda yozilgan')).toMatchObject({ kontragent: 'Qo\'lda yozilgan' });
  });
});
