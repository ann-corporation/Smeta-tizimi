import { describe, expect, it } from 'vitest';
import { csv, faylDaraxti, faylYoli, papkaFayllari, papkaTop, xavfsizNom, zipYollari, LOYIHASIZ, OBYEKTSIZ, type Fayl } from './fayl-daraxt';

const F = (p: Partial<Fayl> & { id: number }): Fayl => ({
  nom: 'a.xlsx', tur: 'smeta', versiya: 1, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hajm: 100,
  sha256: null, sana: '2026-10-02T10:00:00Z', kim: 't2-web', loyiha_id: 7, loyiha: "Navoiy bog'", obyekt_id: 80, obyekt: 'Game Club', ...p,
});

describe('Fayl menejeri — papkalar', () => {
  it('same display names retain separate canonical project and object upload contexts', () => {
    const root = faylDaraxti([F({ id: 1, loyiha_id: 7 }), F({ id: 2, loyiha_id: 8 }), F({ id: 3, loyiha_id: 7, obyekt_id: 81 })]);
    expect(root.bolalar).toHaveLength(2);
    expect(papkaTop(root, 'loyiha:7')?.bolalar).toHaveLength(2);
    expect(papkaTop(root, 'loyiha:8/obyekt:80')?.loyiha_id).toBe(8);
    expect(papkaTop(root, 'loyiha:7/obyekt:81')?.obyekt_id).toBe(81);
  });
  it('ZIP generated fallback cannot overwrite a real file with that same name', () => {
    const paths = zipYollari([F({ id: 1, nom: 'a.xlsx' }), F({ id: 2, nom: 'a (v1, #3).xlsx' }), F({ id: 3, nom: 'a.xlsx' })]);
    expect(new Set([...paths.values()].map((path) => path.toLowerCase())).size).toBe(3);
    expect(paths.get(3)).toContain('(v1, #3, 2).xlsx');
  });
  const fayllar = [
    F({ id: 1, nom: 'GAME_CLUB_LRV_PLUS2.xlsx', tur: 'f2_akt', sana: '2026-10-02T13:06:00Z', hajm: 187_545 }),
    F({ id: 2, nom: 'GAME_CLUB_LRV_PLUS_(2).xlsx', tur: 'f2_akt', sana: '2026-10-02T13:32:00Z', hajm: 145_875, versiya: 2 }),
    F({ id: 3, nom: 'smeta.xlsx', tur: 'smeta', sana: '2026-09-15T08:00:00Z' }),
    F({ id: 4, nom: 'umumiy.pdf', tur: 'hujjat', loyiha_id: null, loyiha: null, obyekt_id: null, obyekt: null }),
  ];

  it('Loyiha → Obyekt → Tur → Oy; soni va hajm har darajada', () => {
    const d = faylDaraxti(fayllar);
    expect(d.soni).toBe(4);
    expect(d.bolalar.map((b) => b.nom)).toEqual(["Navoiy bog'", LOYIHASIZ]); // biriktirilmagan — oxirida
    const gc = papkaTop(d, "loyiha:7/obyekt:80")!;
    expect(gc.bolalar.map((b) => b.nom)).toEqual(['F2 aktlari (import manbasi)', 'Smetalar']);
    const f2 = papkaTop(d, "loyiha:7/obyekt:80/tur:f2_akt/oy:2026-10")!;
    expect(f2.fayllar.map((f) => f.id)).toEqual([2, 1]); // yangisi tepada
    expect(papkaTop(d, "loyiha:7/obyekt:80/tur:f2_akt")!.hajm).toBe(187_545 + 145_875);
    // Arxivlangan rasmiy hujjat — hisobot oyi papkasida (yuklangan kuni emas).
    expect(faylYoli(F({ id: 9, tur: 'f3', davr: '2026-07', sana: '2026-10-02T10:00:00Z' }))).toEqual(["Navoiy bog'", 'Game Club', 'F3 spravkalar', '2026-07']);
    expect(papkaFayllari(gc)).toHaveLength(3);
    expect(faylYoli(fayllar[3])).toEqual([LOYIHASIZ, OBYEKTSIZ, 'Boshqa hujjatlar', '2026-10']);
  });

  it('yuklash konteksti papkadan: loyiha/obyekt/tur', () => {
    const d = faylDaraxti(fayllar);
    expect(papkaTop(d, "loyiha:7/obyekt:80/tur:f2_akt")).toMatchObject({ loyiha_id: 7, obyekt_id: 80, tur: 'f2_akt' });
    expect(papkaTop(d, "loyiha:7")).toMatchObject({ loyiha_id: 7, obyekt_id: null, tur: null });
  });

  it('ZIP yo‘llari: papkalar saqlanadi, bir xil nom yo‘qolmaydi, taqiqlangan belgilar tozalanadi', () => {
    const y = zipYollari([F({ id: 10, nom: 'a.xlsx' }), F({ id: 11, nom: 'a.xlsx', versiya: 2 }), F({ id: 12, nom: 'x:/y?.xlsx', obyekt: 'A/B' })]);
    expect(y.get(10)).toBe("fayllar/Navoiy bog'/Game Club/Smetalar/2026-10/a.xlsx");
    expect(y.get(11)).toBe("fayllar/Navoiy bog'/Game Club/Smetalar/2026-10/a (v2, #11).xlsx");
    expect(y.get(12)).toBe("fayllar/Navoiy bog'/A_B/Smetalar/2026-10/x_y_.xlsx");
    expect(xavfsizNom('  .. ')).toBe('_');
  });

  it('CSV: ; ajratuvchi, BOM, bo‘sh qiymat — bo‘sh (0 emas), qo‘shtirnoq ekranlanadi', () => {
    expect(csv([{ a: 1, b: null }, { a: 'x;"y"', c: 0 }])).toBe('\ufeffa;b;c\r\n1;;\r\n"x;""y""";;0');
  });
});
