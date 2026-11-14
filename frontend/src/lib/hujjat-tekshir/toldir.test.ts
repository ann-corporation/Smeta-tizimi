import { describe, expect, it } from 'vitest';
import { keshsizFormulalarniToldir } from './toldir';

/** Ekspertiza (БРВ × koeff) tuzilmasi, sintetik: formulalar bor, kesh yo‘q. */
function brvVaraq() {
  const rows: (string | number | null)[][] = [
    ['№', 'Nom', 'Birlik', 'Soni', 'BRV', 'Koeff', 'Ed', 'Jami'],
    ['1', 'ISH A', 'SUM', 2, 1000, 40, null, null],
    ['2', 'ISH B', 'SUM', 3, 1000, 6, null, null],
    ['', 'ITOGO', '', null, null, null, null, null],
    ['', 'STRAX 12%', '', null, null, 0.12, null, null],
    ['', 'VSEGO', '', null, null, null, null, null],
  ];
  const f: Array<Array<string | null>> = rows.map(() => []);
  f[1][6] = 'E2*F2'; f[1][7] = 'G2*D2';
  f[2][6] = 'E3*F3'; f[2][7] = 'G3*D3';
  f[3][7] = 'SUM(H2:H3)';
  f[4][7] = 'H4*F5';
  f[5][7] = 'H4+H5';
  return { nom: 'TVORCH', rows, formulalar: f };
}

describe('keshsiz formulalarni to‘ldirish', () => {
  it('БРВ × koeff × soni, SUM, foiz va jami — bog‘liq formulalar ketma-ketligidan qat’i nazar hisoblanadi', () => {
    const v = brvVaraq();
    const n = keshsizFormulalarniToldir([v]);
    expect(n).toMatchObject({ jami: 7, hisoblandi: 7, hisoblanmadi: 0 });
    expect(v.rows[1][7]).toBe(80000);   // 1000*40*2
    expect(v.rows[2][7]).toBe(18000);   // 1000*6*3
    expect(v.rows[3][7]).toBe(98000);
    expect(v.rows[4][7]).toBeCloseTo(11760, 6);
    expect(v.rows[5][7]).toBeCloseTo(109760, 6);
  });

  it('keshli katak o‘zgarmaydi; boshqa varaqqa havola ishlaydi', () => {
    const a = { nom: 'A', rows: [[5, 7]] as (number | null)[][], formulalar: [[null, 'B!A1*2']] as Array<Array<string | null>> };
    const b = { nom: 'B', rows: [[null]] as (number | null)[][], formulalar: [['SUM(1,2,3)']] as Array<Array<string | null>> };
    a.rows[0][1] = null;
    const n = keshsizFormulalarniToldir([a, b]);
    expect(n.hisoblandi).toBe(2);
    expect(a.rows[0][1]).toBe(12);
    const c = { nom: 'C', rows: [[10, 99]] as (number | null)[][], formulalar: [[null, 'A1*2']] as Array<Array<string | null>> };
    expect(keshsizFormulalarniToldir([c]).jami).toBe(0);
    expect(c.rows[0][1]).toBe(99);
  });

  it('hisoblab bo‘lmaydigan formula (noma’lum funksiya, aylanma) — taxmin yo‘q, hisoblanmadi deb sanaladi', () => {
    const v = { nom: 'X', rows: [[null, null, null]] as (number | null)[][], formulalar: [['VLOOKUP(1,A1:B2,2)', 'C1+1', 'B1+1']] as Array<Array<string | null>> };
    const n = keshsizFormulalarniToldir([v]);
    expect(n.jami).toBe(3);
    expect(n.hisoblanmadi).toBe(3);
    expect(n.hisoblandi).toBe(0);
    expect(v.rows[0][0]).toBeNull();
    expect(n.sabablar.length).toBeGreaterThan(0);
  });

  it('formulasiz varaq — hech narsa qilmaydi', () => {
    expect(keshsizFormulalarniToldir([{ nom: 'Y', rows: [[1]] }])).toEqual({ jami: 0, hisoblandi: 0, hisoblanmadi: 0, sabablar: [] });
  });
});
