/**
 * Egasi qoidasi (2026-11-06): «tizim narxlanmagan narsalarni bildirishi kerak, xotyabi hujjatlarida».
 * LRV / LRV_PLUS / Ресурсная ведомость / RES (ABC): narxsiz qator yo'q — ogohlantirish yo'q; bor — «итог неполный»,
 * narx katagi bo'sh (0 emas). Sintetik ma'lumot (repo public).
 */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { lrvHujjat } from './lrv-hujjat';
import { lrvPlusFaylBaytlari } from './lrv-plus-export';
import { resursVedomostHujjat } from './resurs-vedomost';
import { abcHujjat } from './smeta-studio/abc-hujjat';
import { emptyDoc, type RecipeSnapshot, type UnitBasis, type WorkSource } from './smeta-studio/model';
import { applyCommand, type StudioCommand } from './smeta-studio/commands';
import { calcDoc } from './smeta-studio/calc';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';
import type { T2Qator, T2QatorHolat } from '../api/supabase';

const OGOH = 'итог неполный';
const varaqlar = (bytes: Uint8Array): string[] => {
  const z = unzipSync(bytes);
  return Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort().map((k) => strFromU8(z[k]));
};

function qator(p: Partial<T2Qator> & { id: number; tartib: number; tur: string }): T2Qator {
  return {
    id: p.id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: p.ota_id ?? null, daraja: p.daraja ?? 0, tartib: p.tartib,
    tur: p.tur, kod: p.kod ?? null, nom: p.nom ?? null, birlik: p.birlik ?? null, hajm: p.hajm ?? null, narx: p.narx ?? null, summa: p.summa ?? null,
    kat: p.kat ?? null, narx_usul: null, qoshimcha: null, zamena: null, d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null,
    manba_id: null, versiya: 1, raqam: null, norma: p.norma ?? null,
  };
}
const daraxt = (betonNarx: number | null) => [
  qator({ id: 1, tartib: 1, tur: 'rz', daraja: 0, nom: 'РАЗДЕЛ А' }),
  qator({ id: 2, tartib: 2, tur: 'bl', daraja: 1, ota_id: 1, kod: 'Е01-01', nom: 'РАБОТА А', birlik: 'м3', hajm: 100 }),
  qator({ id: 3, tartib: 3, tur: 'rs', daraja: 2, ota_id: 2, kod: '1-100', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел.-ч', hajm: 10, narx: 1000, norma: 0.1, kat: 'ЧЕЛ' }),
  qator({ id: 4, tartib: 4, tur: 'rs', daraja: 2, ota_id: 2, kod: '1-101', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'чел.-ч', hajm: 2, narx: null, norma: 0.02, kat: 'МАШ' }),
  qator({ id: 5, tartib: 5, tur: 'mat', daraja: 1, ota_id: 1, kod: 'С401', nom: 'МАТЕРИАЛ Б', birlik: 'м3', hajm: 10, narx: betonNarx, kat: 'МАТ' }),
];

describe('LRV (lrvHujjat)', () => {
  it('narxsiz yo‘q (mashinist sanalmaydi) — ogohlantirish yo‘q', () => {
    const r = lrvHujjat(daraxt(500), [], { obyektNom: 'Obyekt X', davr: '2026-11-01' });
    for (const x of varaqlar(r.bytes)) expect(x).not.toContain(OGOH);
  });
  it('narxsiz material — LRV va ведомость ресурсов da «1 строка без цены», narx/summa 0 emas', () => {
    const r = lrvHujjat(daraxt(null), [], { obyektNom: 'Obyekt X', davr: '2026-11-01' });
    const [lrv, ved] = varaqlar(r.bytes);
    expect(lrv).toContain('Внимание: 1 строка без цены — итог неполный');
    expect(ved).toContain('Внимание: 1 строка без цены — итог неполный');
    // МАТЕРИАЛ Б qatori: narx (G) va summa (H) bo'sh.
    const row = lrv.match(/<row r="(\d+)"[^>]*>(?:(?!<\/row>).)*МАТЕРИАЛ Б(?:(?!<\/row>).)*<\/row>/)![0];
    const r0 = row.match(/<row r="(\d+)"/)![1];
    expect(row).toContain(`<c r="G${r0}" s="`);
    expect(row).not.toMatch(new RegExp(`<c r="[GH]${r0}"[^>]*><v>`));
  });
});

describe('LRV_PLUS (lrvPlusFaylBaytlari)', () => {
  const holat: T2QatorHolat[] = [];
  it('narxsiz yo‘q — ogohlantirish yo‘q', async () => {
    const bytes = await lrvPlusFaylBaytlari(daraxt(500), 'Obyekt X', holat, { rejim: 'toliq', nakrutka: NAKRUTKA_STANDART });
    for (const x of varaqlar(bytes)) expect(x).not.toContain(OGOH);
  });
  it('narxsiz material — «Внимание: 1 строка без цены — итог неполный»', async () => {
    const bytes = await lrvPlusFaylBaytlari(daraxt(null), 'Obyekt X', holat, { rejim: 'toliq', nakrutka: NAKRUTKA_STANDART });
    const wb = XLSX.read(bytes);
    const matn = wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: false, defval: '' }).flat());
    expect(matn).toContain('Внимание: 1 строка без цены — итог неполный');
  });
});

describe('Ресурсная ведомость (resursVedomostHujjat)', () => {
  const h = (qator_id: number, nom: string, ss: number | null): T2QatorHolat => ({
    id: qator_id, qator_id, obyekt_id: 1, tur: 'mat', kod: `К-${qator_id}`, nom, birlik: 'м3', kat: 'МАТ', smeta_hajm: 5, smeta_summa: ss as number,
    fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 5, qoldiq_summa: ss,
  });
  it('narxsiz yo‘q — ogohlantirish va belgi yo‘q', () => {
    const [x] = varaqlar(resursVedomostHujjat([h(1, 'ПЕСОК', 100)], { obyektNomi: 'X', sana: '2026-11-06' }).bytes);
    expect(x).not.toContain(OGOH);
    expect(x).not.toContain('цена не определена');
  });
  it('smeta summasi noma’lum resurs — 0 emas, «цена не определена» + ogohlantirish', () => {
    const [x] = varaqlar(resursVedomostHujjat([h(1, 'ПЕСОК', 100), h(2, 'ЩЕБЕНЬ', null)], { obyektNomi: 'X', sana: '2026-11-06' }).bytes);
    expect(x).toContain('Внимание: 1 строка без цены — итог неполный');
    const row = x.match(/<row [^>]*>(?:(?!<\/row>).)*ЩЕБЕНЬ(?:(?!<\/row>).)*<\/row>/)![0];
    expect(row).toContain('цена не определена');
    expect(row).not.toMatch(/<c r="F\d+"[^>]*><v>0<\/v>/);
  });
});

describe('ABC RES (abcHujjat)', () => {
  const res = (id: string, code: string, name: string, type: string, unitCode: string) => ({ id, code, resourceIdCode: code, name, unitCode, type });
  const recipe: RecipeSnapshot[] = [
    { recipeId: 'r1', status: 'EXACT', resource: res('1', 'С001-1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'R', '001'), norm: '5', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
    { recipeId: 'r2', status: 'EXACT', resource: res('2', 'С111-1', 'МАТЕРИАЛ В', 'M', '003'), norm: '2', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  ];
  const unitText = (c: string | null) => ({ '001': 'ЧЕЛ-Ч', '003': 'м3', '015': '100 М3' } as Record<string, string>)[c ?? ''] ?? null;
  const source: WorkSource = { catalogRevision: 'rev', workId: 'w', code: 'E1-1', name: 'РАБОТА', unitCode: '015', tableLabel: null };
  const basis: UnitBasis = { scale: '100', unitLabel: 'м3', evidence: 'x', origin: 'OBSERVED' };
  const price = (recipeId: string, value: string): StudioCommand => ({ type: 'SET_PRICE', occurrenceId: 'o1', recipeId, price: { value, basis: 'CONTRACT_DRAFT', evidence: 'x', sourcePriceId: null } });
  const doc = (hammasi: boolean) => ([
    { type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'РАЗДЕЛ' },
    { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 's', source, recipe, quantity: '200', basis },
    price('r1', '1000'), ...(hammasi ? [price('r2', '500')] : []),
  ] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));
  const resVaraq = (hammasi: boolean) => {
    const d = doc(hammasi);
    const wb = XLSX.read(abcHujjat(d, calcDoc(d), unitText).bytes);
    return XLSX.utils.sheet_to_json<string[]>(wb.Sheets.RES, { header: 1, raw: false, defval: '' });
  };
  it('hammasi narxli — ogohlantirish yo‘q', () => {
    expect(resVaraq(true).flat().some((m) => String(m).includes(OGOH))).toBe(false);
  });
  it('narxsiz material — narx bo‘sh, summa «цена не определена», «итог неполный»', () => {
    const rows = resVaraq(false);
    expect(rows.flat()).toContain('Внимание: 1 строка без цены — итог неполный');
    const m = rows.find((r) => r[3] === 'МАТЕРИАЛ В')!;
    expect(m[6]).toBe('');
    expect(m[7]).toBe('цена не определена');
  });
});
