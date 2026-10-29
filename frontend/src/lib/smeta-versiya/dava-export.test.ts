import { expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { davaXlsx, type DavaEksportQator } from './dava-export';
import { pozitsiyaPul, qatorPul } from './hisob';

// Только синтетические позиции; читаем сформированный XLSX, а не размер файла.
function qator(kod: string, hajm: number, narx: number | null): DavaEksportQator {
  const pul = pozitsiyaPul({ kod, nom: kod, birlik: 'м3', hajm, resurslar: [] },
    new Map(narx == null ? [] : [[kod, { narx, kat: 'МАТ' }]]));
  const p = qatorPul({ holat: 'ochirilgan', qaror: 'qurilgan', eskiHajm: hajm,
    joriyHajm: null, qurilganHajm: null, birlikFarq: false }, pul, null);
  return { lsKod: '01', lsNom: 'СИНТЕТИКА', kod, nom: kod, birlik: 'м3', eskiHajm: hajm,
    joriyHajm: null, qurilganHajm: hajm, davaHajm: p.davaHajm, dava: p.dava,
    holat: 'ochirilgan', izoh: null };
}

function varaq(qs: DavaEksportQator[], ustamali: number | null = null) {
  const { bytes } = davaXlsx(qs, { obyektNomi: 'СИНТЕТИКА', versiyaNomi: 'Тест',
    versiyaSanasi: null, sana: '2026-10-27', ndsFoiz: 12, ustamali });
  return XLSX.read(bytes, { type: 'array', cellFormula: true }).Sheets['Претензия'];
}

function qatorTop(s: XLSX.WorkSheet, ustun: string, matn: string): number {
  const topildi = Object.keys(s).find(k => new RegExp(`^${ustun}\\d+$`).test(k) && String(s[k]?.v).toUpperCase() === matn.toUpperCase());
  expect(topildi, matn).toBeDefined();
  return Number(topildi!.slice(ustun.length));
}

it('signed source → calculation → XLSX retains quantity, amount, formula and signed VAT', () => {
  const s = varaq([qator('MINUS', -2, 10), qator('PLUS', 1, 10)]);
  const n = qatorTop(s, 'B', 'MINUS');
  expect(s[`H${n}`].v).toBe(-2);
  expect(s[`I${n}`].v).toBe(10);
  expect(s[`J${n}`]).toMatchObject({ v: -20, f: `ROUND(H${n}*I${n},2)` });
  const total = qatorTop(s, 'C', 'ИТОГО прямые затраты (без НДС)');
  expect(s[`J${total}`].v).toBe(-10);
  expect(s[`J${total}`].f).toMatch(/^SUM\(/);
  const nds = qatorTop(s, 'C', 'НДС 12%');
  expect(s[`J${nds}`]).toMatchObject({ v: -1.2, f: `ROUND(J${total}*12/100,2)` });
  const final = qatorTop(s, 'C', 'ВСЕГО К ПРЕДЪЯВЛЕНИЮ С НДС');
  expect(s[`J${final}`]).toMatchObject({ v: -11.2, f: `J${total}+J${nds}` });
});

it('negative quantity and price produce a positive amount; unknown price remains in clarification', () => {
  const s = varaq([qator('DOUBLE-MINUS', -2, -10), qator('UNKNOWN', -3, null), qator('ZERO', 0, 10)], 25);
  const n = qatorTop(s, 'B', 'DOUBLE-MINUS');
  expect(s[`J${n}`].v).toBe(20);
  expect(s[`I${n}`].v).toBe(-10);
  const total = qatorTop(s, 'C', 'ИТОГО прямые затраты (без НДС)');
  expect(s[`J${total}`].v).toBe(20);
  expect(Object.keys(s).some(k => /^B\d+$/.test(k) && s[k]?.v === 'UNKNOWN')).toBe(false);
  expect(Object.values(s).some(c => typeof c?.v === 'string' && c.v.includes('UNKNOWN'))).toBe(true);
  const markup = qatorTop(s, 'C', 'ИТОГО с начислениями по объекту (накладные, транспорт, прочие — без НДС)');
  expect(s[`J${markup}`].v).toBe(25);
  const nds = qatorTop(s, 'C', 'НДС 12%');
  expect(s[`J${nds}`]).toMatchObject({ v: 3, f: `ROUND(J${markup}*12/100,2)` });
  expect(Object.values(s).filter(c => c?.v === 'НДС 12%')).toHaveLength(1);
});
