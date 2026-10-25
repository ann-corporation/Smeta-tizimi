import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur, type F2Holat } from './f2-tayyor';
import { readXlsx } from './f2-import-parse/xlsxReader';
import { f2FaylOqiCore, f2UstunAniqla } from './f2-import-parse';
import { kalitdanBog } from './f2-kalit-bogla';
import { lrvKalitOqi } from './lrv-qayta-import';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const CHEL = 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ';
const rows = [
  q({ id: 1, tur: 'rz', nom: '1уч-к.xlsx — 4230_БВ' }),
  q({ id: 2, tur: 'rz', ota_id: 1, nom: 'РАЗДЕЛ 1.ЗЕМЛЯНЫЕ' }),
  q({ id: 3, tur: 'rz', ota_id: 2, nom: '2.ЗЕМЛЯНЫЕ РАБОТЫ .' }),
  q({ id: 4, tur: 'bl', ota_id: 3, kod: 'Е1', nom: 'Выемка', hajm: 10 }),
  q({ id: 5, tur: 'rs', ota_id: 4, kod: '1', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ-Ч', norma: 2, narx: 1000 }),
  q({ id: 6, tur: 'rs', ota_id: 4, kod: '3', kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'ЧЕЛ-Ч', norma: 1, narx: null }),
  q({ id: 7, tur: 'bl', ota_id: 2, kod: 'Е2', nom: 'Планировка', hajm: 4 }),
  q({ id: 8, tur: 'rs', ota_id: 7, kod: '1', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ.-Ч', norma: 3, narx: 1000 }),
  q({ id: 9, tur: 'rz', nom: '2уч-к.xlsx — 4240_БВ' }),
  q({ id: 10, tur: 'rz', ota_id: 9, nom: '2.ЗЕМЛЯНЫЕ РАБОТЫ .' }),
  q({ id: 11, tur: 'bl', ota_id: 10, kod: 'Е1', nom: 'Выемка', hajm: 5 }),
  q({ id: 12, tur: 'rs', ota_id: 11, kod: '1', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ-Ч', norma: 2, narx: 1200 }),
  q({ id: 14, tur: 'mat', ota_id: 10, kod: 'ЦЕНА', kat: 'МАТ', nom: 'Цемент', birlik: 'т', hajm: 3, narx: 800000 }),
];
const holat: F2Holat[] = [4, 5, 6, 7, 8, 11, 12, 14].map((id) => ({ qator_id: id, f2_mumkin_hajm: 100 }));

describe('Ierarxiyali F2 Excel -> F2 import (texnadzor round-trip)', () => {
  it('КАЛИТ 100% bog‘lanadi; sarlavha/ИТОГО qatorlari qator bo‘lib o‘qilmaydi; jami import jamiga teng', async () => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma(); k.hajm[4] = '10'; k.hajm[7] = '4'; k.hajm[11] = '5'; k.hajm[14] = '3';
    const qs = f2Qatorlar(b, k);
    const r = f2Hujjat(b, qs, { obyektNom: 'Yo‘l 2,5 km', davr: '2026-10', raqam: '1', rows });
    const grid = (await readXlsx(r.bytes)).sheet('Ф-2')!.rows;
    const cols = f2UstunAniqla(grid);
    const res = f2FaylOqiCore(grid, cols);
    if (!('tree' in res)) throw new Error('daraxt yo‘q');

    // Daraxtdagi barcha tugunlar (rekursiv).
    type N = { type: string; kod?: string | null; nom: string; hajm?: number | null; summa?: number | null; children?: N[] };
    const yoz = (n: N[], d = 0): string[] => n.flatMap((x) => [`${'  '.repeat(d)}${x.type}|${x.kod ?? ''}|${x.nom}`, ...yoz(x.children ?? [], d + 1)]);
    const hamma: N[] = []; const yur = (n: N[]) => { for (const x of n) { hamma.push(x); yur(x.children ?? []); } };
    yur(res.tree as unknown as N[]);
    const tavsif = yoz(res.tree as unknown as N[]).join('\n');

    // (2) «ИТОГО …» va uchastka/razdel sarlavhalari ish/resurs/material emas: bl/rs/mat faqat haqiqiy qatorlar.
    expect(hamma.filter((x) => /^ИТОГО/i.test(x.nom)), tavsif).toEqual([]);
    const ishRes = hamma.filter((x) => x.type !== 'rz');
    expect(ishRes.map((x) => x.type).sort(), tavsif).toEqual(qs.map((x) => x.tur).sort());
    expect(hamma.filter((x) => x.type === 'bl').map((x) => x.kod), tavsif).toEqual(['Е2', 'Е1', 'Е1']);

    // (1) КАЛИТ: har ish/resurs qatori t2_qator ga aniq bog'lanadi; sarlavha/ИТОГО qatorlarida kalit yo'q.
    const tugunlar = grid.flatMap((row, i) => lrvKalitOqi(row[10]) ? [{ uid: 'r' + i, kod: row[1] == null || row[1] === '' ? null : String(row[1]), nom: String(row[2] ?? ''), birlik: row[3] == null ? null : String(row[3]), manzil: { qator: i + 1 } }] : []);
    expect(tugunlar).toHaveLength(qs.length);
    const kanonik = rows.map((x) => ({ id: x.id, kod: x.kod, nom: x.nom, birlik: x.birlik }));
    const bog = kalitdanBog(grid, tugunlar, kanonik);
    expect(bog.size).toBe(qs.length);
    expect(new Set([...bog.values()].map((v) => v.qatorId))).toEqual(new Set(qs.map((x) => x.id)));

    // (3) Hujjat jami = import o'qigan jami (barg qatorlar summasi).
    const barglar = hamma.filter((x) => x.type === 'rs' || x.type === 'mat');
    const jami = Math.round(barglar.reduce((s, x) => s + (x.summa ?? 0), 0) * 100) / 100;
    expect(jami).toBe(r.jami);
    expect(r.jami).toBeCloseTo(10 * 2 * 1000 + 4 * 3 * 1000 + 5 * 2 * 1200 + 3 * 800000, 2);
  });
});
