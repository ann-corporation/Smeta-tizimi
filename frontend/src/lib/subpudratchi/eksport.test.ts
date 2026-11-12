import { describe, expect, it } from 'vitest';
import { subAktHujjat } from './eksport';

const kirish = (qatorlar: Parameters<typeof subAktHujjat>[0]['qatorlar'], qqs: number | null = 12) =>
  ({ subNom: 'Sub', gcNom: 'GC', obyektNom: 'Obyekt', oy: '2026-11-01', raqam: 'A-1', qqsFoiz: qqs, qatorlar });

describe('subAktHujjat', () => {
  it('xlsx baytlari va fayl nomi', () => {
    const r = subAktHujjat(kirish([{ kod: 'K', nom: 'Ish', birlik: 'm2', hajm: 40, narx: 800 }]));
    expect(r.bytes.length).toBeGreaterThan(500);
    expect(r.faylNomi).toMatch(/\.xlsx$/);
    expect(String.fromCharCode(r.bytes[0], r.bytes[1])).toBe('PK');
  });
  it('narxsiz qator bo‘lsa ham hujjat yasaladi (jami bo‘sh - 0 emas)', () => {
    expect(subAktHujjat(kirish([{ kod: null, nom: 'Ish', birlik: null, hajm: 1, narx: null }])).bytes.length).toBeGreaterThan(500);
    expect(subAktHujjat(kirish([], null)).bytes.length).toBeGreaterThan(500);
  });
});
