import { describe, expect, it } from 'vitest';
import { csv, eskiVersiyalar, faylDaraxti, faylYoli, papkaFayllari, papkaTop, tizimFayllari, xavfsizNom, zipYollari, SHARTNOMASIZ, OBYEKTSIZ, type Fayl } from './fayl-daraxt';

const F = (p: Partial<Fayl> & { id: number }): Fayl => ({
  nom: 'a.xlsx', tur: 'smeta', versiya: 1, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hajm: 100,
  sha256: null, sana: '2026-10-02T10:00:00Z', kim: 't2-web', loyiha_id: 7, loyiha: "Navoiy bog'", obyekt_id: 80, obyekt: 'Game Club',
  shartnoma_id: 5, shartnoma: '15-A', ...p,
});

describe('Fayl menejeri — papkalar (Disk A: Shartnoma → Obyekt → Tur → Oy)', () => {
  it('bir xil ko‘rinadigan nomlar: shartnoma va obyekt yuklash konteksti alohida saqlanadi', () => {
    const root = faylDaraxti([F({ id: 1, shartnoma_id: 5 }), F({ id: 2, shartnoma_id: 6, shartnoma: '15-A' }), F({ id: 3, shartnoma_id: 5, obyekt_id: 81 })]);
    expect(root.bolalar).toHaveLength(2);
    expect(papkaTop(root, 'shartnoma:5')?.bolalar).toHaveLength(2);
    expect(papkaTop(root, 'shartnoma:6/obyekt:80')?.loyiha_id).toBe(7);
    expect(papkaTop(root, 'shartnoma:5/obyekt:81')?.obyekt_id).toBe(81);
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
    F({ id: 4, nom: 'umumiy.pdf', tur: 'hujjat', loyiha_id: null, loyiha: null, obyekt_id: null, obyekt: null, shartnoma_id: null, shartnoma: null }),
  ];

  it('Shartnoma → Obyekt → Tur → Oy; soni va hajm har darajada', () => {
    const d = faylDaraxti(fayllar);
    expect(d.soni).toBe(4);
    expect(d.bolalar.map((b) => b.nom)).toEqual(['Shartnoma №15-A', SHARTNOMASIZ]); // biriktirilmagan — oxirida
    const gc = papkaTop(d, 'shartnoma:5/obyekt:80')!;
    expect(gc.bolalar.map((b) => b.nom)).toEqual(['F2 aktlari (import manbasi)', 'Smetalar']);
    const f2 = papkaTop(d, 'shartnoma:5/obyekt:80/tur:f2_akt/oy:2026-10')!;
    expect(f2.fayllar.map((f) => f.id)).toEqual([2, 1]); // yangisi tepada
    expect(papkaTop(d, 'shartnoma:5/obyekt:80/tur:f2_akt')!.hajm).toBe(187_545 + 145_875);
    // Arxivlangan rasmiy hujjat — hisobot oyi papkasida (yuklangan kuni emas).
    expect(faylYoli(F({ id: 9, tur: 'f3', davr: '2026-07', sana: '2026-10-02T10:00:00Z' }))).toEqual(['Shartnoma №15-A', 'Game Club', 'F3 spravkalar', '2026-07']);
    expect(papkaFayllari(gc)).toHaveLength(3);
    expect(faylYoli(fayllar[3])).toEqual([SHARTNOMASIZ, OBYEKTSIZ, 'Boshqa hujjatlar', '2026-10']);
  });

  it('yuklash konteksti papkadan: loyiha/obyekt/tur', () => {
    const d = faylDaraxti(fayllar);
    expect(papkaTop(d, 'shartnoma:5/obyekt:80/tur:f2_akt')).toMatchObject({ loyiha_id: 7, obyekt_id: 80, tur: 'f2_akt' });
    expect(papkaTop(d, 'shartnoma:5')).toMatchObject({ loyiha_id: 7, obyekt_id: null, tur: null });
  });

  it('ZIP yo‘llari: papkalar saqlanadi, bir xil nom yo‘qolmaydi, taqiqlangan belgilar tozalanadi', () => {
    const y = zipYollari([F({ id: 10, nom: 'a.xlsx' }), F({ id: 11, nom: 'a.xlsx', versiya: 2 }), F({ id: 12, nom: 'x:/y?.xlsx', obyekt: 'A/B' })]);
    expect(y.get(10)).toBe('fayllar/Shartnoma №15-A/Game Club/Smetalar/2026-10/a.xlsx');
    expect(y.get(11)).toBe('fayllar/Shartnoma №15-A/Game Club/Smetalar/2026-10/a (v2, #11).xlsx');
    expect(y.get(12)).toBe('fayllar/Shartnoma №15-A/A_B/Smetalar/2026-10/x_y_.xlsx');
    expect(xavfsizNom('  .. ')).toBe('_');
  });

  it('bir hujjat = bitta fayl: daraxtda faqat oxirgi versiya, eskilari eskiVersiyalar orqali (yangisi tepada); kalitsiz fayl o‘zgarmaydi', () => {
    const k = { hujjat_kalit: 'f2:41', obyekt_id: 80, tur: 'f2_hujjat', versiyalar: 3 };
    const zanjir = [F({ id: 20, ...k, versiya: 1, oxirgi: false }), F({ id: 21, ...k, versiya: 2, oxirgi: false }), F({ id: 22, ...k, versiya: 3, oxirgi: true }),
      F({ id: 23, hujjat_kalit: 'f2:42', versiya: 1, versiyalar: 1, oxirgi: true }), F({ id: 24, nom: 'qolda.pdf' })];
    expect(tizimFayllari(zanjir).map((f) => f.id).sort()).toEqual([22, 23, 24]);
    expect(eskiVersiyalar(zanjir, zanjir[2]).map((f) => f.id)).toEqual([21, 20]);
    expect(eskiVersiyalar(zanjir, zanjir[3])).toEqual([]);
    expect(eskiVersiyalar(zanjir, zanjir[4])).toEqual([]);
    expect(faylDaraxti(tizimFayllari(zanjir)).soni).toBe(3);
  });

  it('CSV: ; ajratuvchi, BOM, bo‘sh qiymat — bo‘sh (0 emas), qo‘shtirnoq ekranlanadi', () => {
    expect(csv([{ a: 1, b: null }, { a: 'x;"y"', c: 0 }])).toBe('\ufeffa;b;c\r\n1;;\r\n"x;""y""";;0');
  });
});
