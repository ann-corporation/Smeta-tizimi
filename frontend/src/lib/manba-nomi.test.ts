import { describe, expect, it } from 'vitest';
import { manbaKorinishi, tashqiNomBormi, tashqiNomlarniAlmashtir } from './manba-nomi';

/* Egasi 2026-10-22: foydalanuvchiga tashqi dastur nomi (ABC, TNQ, Construct, PTO-UZ) ko'rinmaydi — faqat «Smeta tizimi». */
const TAQIQ = /ABC|АВС|\bTN\b|TNQ|ТНҚ|Construct|PTO-UZ|Fo2Studio|00-ppr/;

describe('manba nomi — o‘z brendimiz', () => {
  it('katalog / normativ manba nomi o‘z nomimiz bilan', () => {
    expect(manbaKorinishi('ABC Base 2017')).toBe('Smeta tizimi katalogi 2017');
    expect(manbaKorinishi('ABC Base 2017 — 00-ppr, ШНҚ 4.02.15-04')).toBe('Smeta tizimi · ШНҚ 4.02.15-04 asosida');
    expect(manbaKorinishi('Construct')).toBe('Smeta tizimi katalogi 2026');
    expect(manbaKorinishi('TNQ')).toBe('Smeta tizimi katalogi 2026');
    expect(manbaKorinishi('PTO-UZ 08.10')).toBe('Smeta tizimi katalogi 2026');
    expect(manbaKorinishi(null)).toBe('Smeta tizimi katalogi');
  });
  it('tashqi nomsiz matn (kompaniya КП fayli, ШНҚ) tegilmaydi; ТН (tonna) — birlik, nom emas', () => {
    expect(manbaKorinishi('Ташкентстрой КП 15.10.2026')).toBe('Ташкентстрой КП 15.10.2026');
    expect(manbaKorinishi('ШНҚ 3.02.01')).toBe('ШНҚ 3.02.01');
    expect(tashqiNomBormi('Арматура, ТН')).toBe(false);
  });
  it('uzun dalil matnida faqat tashqi nom almashadi', () => {
    const m = tashqiNomlarniAlmashtir('Platforma narx katalogi · ABC Base 2017 · 2026 y. 1-kv. · Toshkent · NDS siz');
    expect(m).not.toMatch(TAQIQ);
    expect(m).toContain('Smeta tizimi');
    expect(m).toContain('Toshkent · NDS siz');
    expect(tashqiNomlarniAlmashtir('K-12 · 00-ppr: Construct bo‘yicha')).not.toMatch(TAQIQ);
    // Kirill yozuvi matn o'rtasida ham (JS \b kirillda ishlamaydi).
    expect(tashqiNomlarniAlmashtir('Normativ: ТНҚ va АВС 4 dasturi')).toBe('Normativ: Smeta tizimi va Smeta tizimi dasturi');
    expect(tashqiNomBormi('ТНҚ')).toBe(true);
    expect(tashqiNomBormi('ТНҚА')).toBe(false);
  });
});
