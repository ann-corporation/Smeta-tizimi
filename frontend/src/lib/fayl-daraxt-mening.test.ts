import { describe, expect, it } from 'vitest';
import { faylDaraxti, menPapkaFayllari, menPapkaSoni, papkaAvlodlari, papkaBolalari, papkaTanlovlari, papkaYoli, savatFayllari, tizimFayllari, type Fayl, type FaylPapka } from './fayl-daraxt';

const f = (id: number, x: Partial<Fayl> = {}): Fayl => ({ id, nom: `f${id}.xlsx`, tur: 'smeta', versiya: 1, mime: 'x', hajm: 10, sha256: null, sana: '2026-10-0' + (id % 9 + 1),
  kim: null, loyiha_id: 1, loyiha: 'L', obyekt_id: 2, obyekt: 'O', ...x });
const P: FaylPapka[] = [{ id: 1, ota_id: null, nom: 'Shartnomalar' }, { id: 2, ota_id: 1, nom: '2026' }, { id: 3, ota_id: 2, nom: 'Oktabr' }, { id: 4, ota_id: null, nom: 'Aktlar' }];

describe('Fayl menejeri — o‘z papkalari va savat (egasi: Drive kabi)', () => {
  const fayllar = [f(1), f(2, { papka_id: 2 }), f(3, { papka_id: 3 }), f(4, { savatda: '2026-10-21T10:00:00Z' }), f(5, { papka_id: 2, savatda: '2026-10-21T11:00:00Z' })];
  it('tizim daraxtida faqat ko‘chirilmagan va savatda bo‘lmagan fayllar', () => {
    expect(tizimFayllari(fayllar).map((x) => x.id)).toEqual([1]);
    expect(faylDaraxti(tizimFayllari(fayllar)).soni).toBe(1);
  });
  it('savat — yangisi tepada; o‘z papkasi fayllari savatdagilarsiz', () => {
    expect(savatFayllari(fayllar).map((x) => x.id)).toEqual([5, 4]);
    expect(menPapkaFayllari(fayllar, 2).map((x) => x.id)).toEqual([2]);
  });
  it('papka soni avlodlari bilan, savatdagilarsiz', () => {
    expect(menPapkaSoni(P, fayllar, 1)).toBe(2);
    expect(menPapkaSoni(P, fayllar, 3)).toBe(1);
    expect(menPapkaSoni(P, fayllar, 4)).toBe(0);
  });
  it('yo‘l, bolalar va avlodlar', () => {
    expect(papkaYoli(P, 3).map((p) => p.nom)).toEqual(['Shartnomalar', '2026', 'Oktabr']);
    expect(papkaYoli(P, null)).toEqual([]);
    expect(papkaBolalari(P, null).map((p) => p.nom)).toEqual(['Aktlar', 'Shartnomalar']);
    expect([...papkaAvlodlari(P, 1)].sort()).toEqual([1, 2, 3]);
  });
  it('ko‘chirish tanlovida papkaning o‘zi va avlodlari yo‘q (aylanma bo‘lmaydi)', () => {
    expect(papkaTanlovlari(P, 2).map((o) => o.yol)).toEqual(['Aktlar', 'Shartnomalar']);
    expect(papkaTanlovlari(P).map((o) => o.yol)).toContain('Shartnomalar / 2026 / Oktabr');
  });
  it('buzilgan (aylanma) ma’lumotda ham yo‘l cheksiz aylanmaydi', () => {
    const buzuq: FaylPapka[] = [{ id: 1, ota_id: 2, nom: 'A' }, { id: 2, ota_id: 1, nom: 'B' }];
    expect(papkaYoli(buzuq, 1).length).toBe(2);
  });
});
