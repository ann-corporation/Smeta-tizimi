import { describe, expect, it } from 'vitest';
import { csv, faylDaraxti, faylYoli, papkaFayllari, papkaTop, xavfsizNom, zipYollari, LOYIHASIZ, OBYEKTSIZ, type Fayl } from './fayl-daraxt';

const F = (p: Partial<Fayl> & { id: number }): Fayl => ({
  nom: 'a.xlsx', tur: 'smeta', versiya: 1, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hajm: 100,
  sha256: null, sana: '2026-10-02T10:00:00Z', kim: 't2-web', loyiha_id: 7, loyiha: "Navoiy bog'", obyekt_id: 80, obyekt: 'Game Club', ...p,
});

describe('Fayl menejeri — papkalar', () => {
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
    const gc = papkaTop(d, "Navoiy bog'/Game Club")!;
    expect(gc.bolalar.map((b) => b.nom)).toEqual(['F2 aktlari', 'Smetalar']);
    const f2 = papkaTop(d, "Navoiy bog'/Game Club/F2 aktlari/2026-10")!;
    expect(f2.fayllar.map((f) => f.id)).toEqual([2, 1]); // yangisi tepada
    expect(papkaTop(d, "Navoiy bog'/Game Club/F2 aktlari")!.hajm).toBe(187_545 + 145_875);
    expect(papkaFayllari(gc)).toHaveLength(3);
    expect(faylYoli(fayllar[3])).toEqual([LOYIHASIZ, OBYEKTSIZ, 'Boshqa hujjatlar', '2026-10']);
  });

  it('yuklash konteksti papkadan: loyiha/obyekt/tur', () => {
    const d = faylDaraxti(fayllar);
    expect(papkaTop(d, "Navoiy bog'/Game Club/F2 aktlari")).toMatchObject({ loyiha_id: 7, obyekt_id: 80, tur: 'f2_akt' });
    expect(papkaTop(d, "Navoiy bog'")).toMatchObject({ loyiha_id: 7, obyekt_id: null, tur: null });
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
