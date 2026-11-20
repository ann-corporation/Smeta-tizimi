import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { f2Hujjat } from './f2-hujjat';
import { NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';
import { readXlsx } from './f2-import-parse/xlsxReader';
import type { F2Bolim, F2Qator, F2Resurs } from './f2-tayyor';
import { TKM_PREFIKS, tashishIshimi, tkmNomi, tkmQatorlar, transportSpravka, transportSpravkaQatorlari, transportTartib } from './f2-transport';

describe('f2-transport: sof yordamchilar', () => {
  it('tkmQatorlar: faqat bog\'langan qatorlar (transport qatori → material)', () => {
    const m = tkmQatorlar([{ id: 1 }, { id: 2, transport_usul: 'tkm' }, { id: 3, transport_manba_qator_id: 2 }]);
    expect([...m.entries()]).toEqual([[3, 2]]);
    expect(tkmQatorlar(undefined).size).toBe(0);
  });

  it('tkmNomi: prefiks bir marta', () => {
    expect(tkmNomi('АСФАЛЬТ')).toBe(`${TKM_PREFIKS}АСФАЛЬТ`);
    expect(tkmNomi(tkmNomi('АСФАЛЬТ'))).toBe(`${TKM_PREFIKS}АСФАЛЬТ`);
  });

  it('transportTartib: t·km qatori materialining to\'g\'ridan-to\'g\'ri tagiga; qolgan tartib saqlanadi', () => {
    const l = [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }];
    expect(transportTartib(l, new Map([[13, 10]])).map((x) => x.id)).toEqual([10, 13, 11, 12]);
    // material ro'yxatda yo'q — joyida qoladi
    expect(transportTartib(l, new Map([[13, 99]])).map((x) => x.id)).toEqual([10, 11, 12, 13]);
    // transportsiz — aynan o'sha ro'yxat
    const bosh = new Map<number, number>();
    expect(transportTartib(l, bosh)).toBe(l);
  });

  it('tashishIshimi: Е310 / С310 / Е311 (kirill va lotin), boshqa shifr emas', () => {
    for (const k of ['Е310-0101', 'С310-1005', 'E311-0001', 'C310-2', ' Е310 ']) expect(tashishIshimi(k)).toBe(true);
    for (const k of ['Е3101-1', 'Е312-1', 'С201-1', '', null, undefined]) expect(tashishIshimi(k as string | null | undefined)).toBe(false);
  });

  it('transportSpravka: t·km jami, % transport va Е310/311 ishlar alohida; null — noma\'lum', () => {
    const rows = [
      { id: 1, tur: 'bl', kod: 'Е310-0101' }, { id: 2, ota_id: 1, tur: 'rs', kod: '1' },
      { id: 3, tur: 'bl', kod: 'Е201-1' },
      { id: 4, tur: 'mat', kod: 'М-1' }, { id: 5, tur: 'rs', kod: 'Т', transport_manba_qator_id: 4 },
    ];
    const s = transportSpravka({
      tkm: tkmQatorlar(rows),
      rows,
      qatorlar: [{ id: 2, tur: 'rs', summa: 100 }, { id: 3, tur: 'bl', summa: 7 }, { id: 4, tur: 'mat', summa: 1000 }, { id: 5, tur: 'rs', summa: 40 }],
      foizTransport: 55,
    });
    expect(s).toEqual({ tkmJami: 40, foizJami: 55, tashishJami: 100 });
    const q = transportSpravkaQatorlari({ ...s, foizJami: null });
    expect(q).toHaveLength(4);
    expect(q[0]).toBe('СПРАВОЧНО: транспорт');
    expect(q[2]).toContain('не определено');
  });
});

/** Sintetik hujjat: bitta bo'lim — mustaqil material, mustaqil ish-qatori va t·km qatori. */
function hujjat(tkmBor: boolean) {
  const res = (id: number, kat: string, nom: string): F2Resurs => ({ id, tur: 'mat', kat, kod: String(id), nom, birlik: 'Т', norma: null, mumkin: 10, avto: false, taklifNarx: 100, taklifManba: 'smeta' });
  // Tartib ataylab teskari: t·km qatori (13) materialdan (11) keyinroqda, orada boshqa material (12).
  const bolim: F2Bolim = { id: 10, nom: 'ДОРОГА', daraja: 0, ishlar: [], alohida: [res(11, 'МАТ', 'АСФАЛЬТ'), res(12, 'МАТ', 'ЩЕБЕНЬ'), res(13, 'МАШ', 'ПЕРЕВОЗКА АСФАЛЬТА')] };
  const q = (id: number, kat: string, nom: string, summa: number): F2Qator => ({ id, ishId: null, tur: 'mat', kat, nom, birlik: 'Т', hajm: 1, narx: summa, summa, manba: 'smeta', narxsiz: false });
  const qatorlar = [q(11, 'МАТ', 'АСФАЛЬТ', 1000), q(12, 'МАТ', 'ЩЕБЕНЬ', 500), q(13, 'МАШ', 'ПЕРЕВОЗКА АСФАЛЬТА', 40)];
  const rows = [
    { id: 11, obyekt_id: 1, tur: 'mat', kat: 'МАТ', transport_usul: tkmBor ? 'tkm' : null },
    { id: 12, obyekt_id: 1, tur: 'mat', kat: 'МАТ' },
    { id: 13, obyekt_id: 1, tur: 'mat', kat: 'МАШ', transport_manba_qator_id: tkmBor ? 11 : null },
  ] as unknown as T2Qator[];
  return f2Hujjat([bolim], qatorlar, { obyektNom: 'T', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12, rows });
}

describe('f2Hujjat: t·km transport ko\'rinishi', () => {
  it('t·km qatori materialining tagida «↳ ТРАНСПОРТ Т·КМ: » prefiksi bilan; podvaldan keyin СПРАВОЧНО (3 qator)', async () => {
    const r = hujjat(true);
    const g = (await readXlsx(r.bytes)).sheet('Ф-2')!.rows;
    const nomlar = g.map((x) => String(x[2] ?? ''));
    const i = nomlar.indexOf('АСФАЛЬТ');
    expect(i).toBeGreaterThan(-1);
    expect(nomlar[i + 1]).toBe(`${TKM_PREFIKS}ПЕРЕВОЗКА АСФАЛЬТА`);
    expect(nomlar[i + 2]).toBe('ЩЕБЕНЬ');
    const barcha = g.flat().map((x) => String(x ?? ''));
    expect(barcha.some((s) => s.startsWith('СПРАВОЧНО: транспорт'))).toBe(true);
    expect(barcha.filter((s) => /^Транспорт т·км|^Транспорт процентом|^Работы Е310\/Е311/.test(s))).toHaveLength(3);
    // jami summalar o'zgarmaydi (справка faqat matn): ИТОГО ПРЯМЫЕ ЗАТРАТЫ = 1000 + 500 + 40
    expect(r.jami).toBe(1540);
  });

  it('REGRESSIYA: t·km qatori yo\'q — prefiks va справка yo\'q, jami bir xil', async () => {
    const r = hujjat(false);
    const barcha = (await readXlsx(r.bytes)).sheet('Ф-2')!.rows.flat().map((x) => String(x ?? ''));
    expect(barcha.some((s) => s.includes(TKM_PREFIKS) || s.includes('СПРАВОЧНО'))).toBe(false);
    expect(r.jami).toBe(1540);
  });
});
