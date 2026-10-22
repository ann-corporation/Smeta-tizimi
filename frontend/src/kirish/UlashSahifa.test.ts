import { describe, expect, it } from 'vitest';
import { qabulQilaOladigan } from './UlashSahifa';
import { ulashHavolasi } from '../api/t2-tomon';
import type { IshJoyiKarta } from '../api/t2-ish-joyi';

const j = (kompaniya_id: number, turi: 'shaxsiy' | 'tashkilot', rol: string): IshJoyiKarta =>
  ({ kompaniya_id, nom: 'K' + kompaniya_id, turi, rol, obyektlar: 0, azolar: 1, f2_tasdiq: 0, f2_qoralama: 0, kutmoqda: 0, oxirgi_faollik: null });

/* T5 (egasi 2026-10-22): obyektni havola bilan ulashish. */
describe('ulashish havolasi', () => {
  it('faqat boshqaruvchi bo‘lgan ish joylari, shaxsiy birinchi', () => {
    const r = qabulQilaOladigan([j(1, 'tashkilot', 'boss'), j(2, 'tashkilot', 'pto'), j(3, 'shaxsiy', 'boss'), j(4, 'tashkilot', 'kuzatuvchi')]);
    expect(r.map((x) => x.kompaniya_id)).toEqual([3, 1]);
  });
  it('havola /ulash/<kod> ko‘rinishida', () => {
    expect(ulashHavolasi('ABCD-EFGH-JKMN', 'https://smeta-tizimi.pages.dev')).toBe('https://smeta-tizimi.pages.dev/ulash/ABCD-EFGH-JKMN');
  });
});
