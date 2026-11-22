import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { birlikOl, hisobotMd, keysniBaholash, kodKalit, sodaKatalog, yigish } from './baholash';
import { evalIshga } from './mahalliy';

const FIXTURE = path.join(__dirname, 'fixture');

describe('eval yordamchilari', () => {
  it('kodKalit: harf old qo\'shimchasi va koeffitsient qirqiladi', () => {
    expect(kodKalit('Е06-01-001-22')).toBe('06-01-001-22');
    expect(kodKalit('ГЭСН06-01-001-22*1,15')).toBe('06-01-001-22');
    expect(kodKalit('E99-01-001-1')).toBe('99-01-001-1');
    expect(kodKalit('615-1')).toBe('615-1');
    expect(kodKalit('Материал X')).toBeNull();
    expect(kodKalit(null)).toBeNull();
  });
  it('birlikOl: "100 м3" -> м3, tanilmasa null', () => {
    expect(birlikOl('100 М3')).toBe('м3');
    expect(birlikOl('1000 шт')).toBe('шт');
    expect(birlikOl('м2')).toBe('м2');
    expect(birlikOl('ЧЕЛ-Ч')).toBeNull();
  });
  it('jami farqi: hosil summa vs kutilgan (hisob-yadro yigindi2), +-15%', () => {
    const k = sodaKatalog([{ id: 'a', code: 'E99-01-001-1', name: 'Разработка грунта в траншеях' }]);
    const keys = { nom: 'x', matn: '', kutilgan: [{ shifr: 'E99-01-001-1', nom: 'Разработка грунта в траншеях', birlik: 'м3', summa: 1000 }, { shifr: null, nom: 'qator', birlik: null, summa: 1000 }],
      hosil: [{ kod: 'E99-01-001-1', summa: 1700 }] };
    const r = keysniBaholash(keys, k);
    expect(r.jamiFarqFoiz).toBe(-15);
    expect(r.top1).toBe(1); expect(r.kodsiz).toBe(1);
    const y = yigish([r]);
    expect(y.otdi.jami).toBe(true); // |-15| <= 15
  });
  it('hosilsiz keys: recall/jami n/a, chegara null', () => {
    const k = sodaKatalog([{ id: 'a', code: 'E99-01-001-1', name: 'Разработка грунта' }]);
    const y = yigish([keysniBaholash({ nom: 'x', matn: '', kutilgan: [{ shifr: 'E99-01-001-1', nom: 'Разработка грунта', birlik: 'м3', summa: null }] }, k)]);
    expect(y.otdi.recall).toBeNull(); expect(y.otdi.jami).toBeNull(); expect(y.otdi.top3).toBe(true);
    expect(hisobotMd([], y, { sana: '2026-01-01', katalog: 'k' })).toContain('n/a');
  });
});

describe('eval runner (sintetik fixture, repodan tashqariga yozadi)', () => {
  it('fixture: smetaAnatomiya -> kutilgan ishlar -> baholash -> hisobot tashqi papkaga', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ustasi-eval-'));
    try {
      const r = await evalIshga({ papka: FIXTURE, chiqish: out, sana: '2026-01-01' });
      expect(r.natijalar).toHaveLength(1);
      const k = r.natijalar[0];
      expect(k.jami).toBe(6);              // 6 ta kutilgan ish
      expect(k.katalogdaYoq).toBe(1);      // o'ylab topilgan kod katalogda yo'q -> maxrajdan chiqarilgan
      expect(k.baholangan).toBe(5);
      expect(k.top3).toBe(1);
      expect(k.recall).toBe(0.5);          // hosil.json: 3 ta kod / 6 ta kutilgan
      expect(r.yigindi.otdi.top3).toBe(true);
      expect(fs.readdirSync(out).sort()).toEqual(['hisobot_2026-01-01.json', 'hisobot_2026-01-01.md']);
      expect(fs.readFileSync(path.join(out, 'hisobot_2026-01-01.md'), 'utf8')).toContain('top-3');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  });
  it('katalogsiz ishga tushmaydi (tarmoq/DB ishlatilmaydi, aniq xato)', async () => {
    const bosh = fs.mkdtempSync(path.join(os.tmpdir(), 'ustasi-eval-bosh-'));
    try {
      const old = process.env.NORM_LIBRARY_FIXTURE_ROOT; delete process.env.NORM_LIBRARY_FIXTURE_ROOT;
      await expect(evalIshga({ papka: bosh })).rejects.toThrow('KATALOG_YOQ');
      if (old) process.env.NORM_LIBRARY_FIXTURE_ROOT = old;
    } finally { fs.rmSync(bosh, { recursive: true, force: true }); }
  });
});
