/**
 * 1-raund (PTO PRO V1 direktivasi): UNKNOWN ≠ 0 regression tests.
 * Live evidence 2026-10-08: 264 approved F2 lines with `price_intentionally_absent` (certified_amount NULL) were shown
 * as f2_summa = 0 by the read model, and LRV recomputed them as smeta price × quantity. These tests pin every
 * frontend consumer: an unknown certified amount stays unknown in rows, groups, totals and Excel formulas.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { resursVedomostHujjat, resursVedomostKategoriyalarga, resursVedomostQur } from './resurs-vedomost';
import { slichitelniyModeli } from './slichitelniy-vedomost';
import { lrvHujjat } from './lrv-hujjat';
import { nakopitelniyJamilar } from './nakopitelniy-vedomost-export';

const holat = (p: Partial<T2QatorHolat>): T2QatorHolat => ({
  id: 1, qator_id: 1, obyekt_id: 1, tur: 'rs', kod: null, nom: 'Test', birlik: 'шт', kat: 'МАТ',
  smeta_hajm: 10, smeta_summa: 1000, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 10, qoldiq_summa: 1000, ...p,
} as T2QatorHolat);
const qator = (id: number, ota_id: number | null, tur: string, p: Partial<T2Qator> = {}): T2Qator => ({
  id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'K' + id, nom: 'Poz ' + id, birlik: 'м3',
  hajm: 10, narx: 100, summa: 1000, kat: 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null,
  xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...p,
});

describe('UNKNOWN ≠ 0 — resource statement', () => {
  const rows = [
    holat({ qator_id: 1, nom: 'Бетон', f2_hajm: 4, f2_summa: null, qoldiq_summa: null }),
    holat({ qator_id: 2, nom: 'Бетон', f2_hajm: 2, f2_summa: 200, qoldiq_summa: 800 }),
    holat({ qator_id: 3, nom: 'Песок', f2_hajm: 1, f2_summa: 50, qoldiq_summa: 950 }),
  ];
  it('row and category totals stay unknown; the known resource is unaffected', () => {
    const v = resursVedomostQur(rows);
    expect(v.find(r => r.nom === 'Бетон')).toMatchObject({ f2Hajm: 6, f2Summa: null, qoldiqSumma: null });
    expect(v.find(r => r.nom === 'Песок')).toMatchObject({ f2Summa: 50, qoldiqSumma: 950 });
    expect(resursVedomostKategoriyalarga(rows)[0]).toMatchObject({ jamiF2Summa: null, jamiQoldiqSumma: null });
  });
  it('Excel: the unknown cell is empty and group/total formulas return "" instead of a partial sum', () => {
    const { bytes } = resursVedomostHujjat(rows, { obyektNomi: 'X', sana: '2026-10-08' });
    const ws = XLSX.read(bytes).Sheets['Ресурсная ведомость'];
    const formulas = Object.values(ws).filter((c): c is XLSX.CellObject => !!c && typeof c === 'object' && 'f' in c).map(c => String(c.f));
    expect(formulas.some(f => /^IF\(COUNTIF\(H\d+:H\d+,""\)>0,"",SUM\(H\d+:H\d+\)\)$/.test(f))).toBe(true);
    expect(formulas.some(f => /^IF\(OR\(H\d+=""/.test(f))).toBe(true);
  });
});

describe('UNKNOWN ≠ 0 — reconciliation statement (Сличительная)', () => {
  it('an unknown certified amount is not 0 and makes parent totals unknown', () => {
    const q = [qator(1, null, 'rz', { hajm: null, summa: null, narx: null }), qator(2, 1, 'bl', { narx: null, summa: null }), qator(3, 2, 'rs')];
    const m = slichitelniyModeli(q, [holat({ qator_id: 3, fakt_hajm: 4, f2_hajm: 4, f2_summa: null })]);
    expect(m.jami.f2).toBeNull();
    expect(m.qatorlar.map(r => [r.tur, r.f2Summa])).toEqual(m.qatorlar.map(r => [r.tur, null]));
  });
});

describe('UNKNOWN ≠ 0 — LRV never recomputes a certified amount as price × quantity', () => {
  it('F2 amount column is empty for the unknown line and the totals are not filled', () => {
    const q = [qator(1, null, 'rz', { hajm: null, summa: null, narx: null, nom: 'Раздел' }), qator(2, 1, 'bl', { narx: null, summa: null }), qator(3, 2, 'mat', { narx: 100, hajm: 10 })];
    const h = [{ ...holat({ qator_id: 3, fakt_hajm: 4, f2_hajm: 4, f2_summa: null }), id: 3 }];
    const r = lrvHujjat(q, h, { obyektNom: 'X' });
    const ws = XLSX.read(r.bytes).Sheets['LRV'];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const leaf = rows.find(x => x[1] === 'K3')!;
    expect(leaf[12]).toBe(4);              // M: принято по Ф-2, количество
    expect(leaf[13] ?? '').toBe('');       // N: сумма — unknown, NOT 4 × 100 = 400
  });
});

describe('UNKNOWN ≠ 0 — Nakopitelniy totals', () => {
  const nq = (p: Partial<NakopitelniyQator>) => ({ qator_id: 1, tur: 'rs', smeta_summa: 1000, oldingi_summa: 100, joriy_summa: 50, ...p }) as NakopitelniyQator;
  it('one unknown approved amount makes оldingi/jami/qoldiq unknown; known ones still add up', () => {
    expect(nakopitelniyJamilar([nq({}), nq({ oldingi_summa: 200, joriy_summa: 0 })])).toEqual({ smeta: 2000, oldingi: 300, joriy: 50, jami: 350, qoldiq: 1650 });
    expect(nakopitelniyJamilar([nq({}), nq({ oldingi_summa: null })])).toMatchObject({ oldingi: null, jami: null, qoldiq: null, joriy: 100 });
  });
});
