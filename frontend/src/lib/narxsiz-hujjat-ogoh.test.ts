/**
 * Egasi qoidasi (2026-11-06): «tizim narxlanmagan narsalarni bildirishi kerak, xotyabi hujjatlarida».
 * Har eksportchi: narxsiz qator yo'q — «итог неполный» yo'q; bor — ogohlantirish bor, narx katagi BO'SH (0 emas).
 * Sintetik ma'lumot (repo ochiq).
 */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { ostatkaHujjatModeli, ostatkaHujjatXlsx } from './ostatka-export';
import { slichitelniyHujjatXlsx, slichitelniyModeli } from './slichitelniy-vedomost';
import { nakopitelniyVedomostHujjat } from './nakopitelniy-vedomost-export';
import { forma3Hujjat, type Forma3Manba } from './forma3-export';

const OGOH = 'итог неполный';
const sheet = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
/** `nom` matni turgan qatordagi `ustun` katagi XML (topilmasa — xato). */
function katak(xml: string, nom: string, ustun: string): string {
  const row = [...xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].find((m) => m[2].includes(`>${nom}</t>`));
  if (!row) throw new Error(`qator topilmadi: ${nom}`);
  const c = row[2].match(new RegExp(`<c r="${ustun}${row[1]}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`));
  if (!c) throw new Error(`katak topilmadi: ${ustun}${row[1]}`);
  return c[0];
}
/** Bo'sh katak: qiymat ham, formula ham yo'q. */
const bosh = (c: string) => /^<c [^>]*\/>$/.test(c);

function tq(id: number, ota_id: number | null, tur: string, hajm: number | null, extra: Partial<T2Qator> = {}): T2Qator {
  return {
    id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom: 'ПОЗИЦИЯ ' + id,
    birlik: 'м3', hajm, narx: 1000, summa: null, kat: tur === 'bl' || tur === 'rz' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...extra,
  };
}
function th(qator_id: number, fakt_hajm: number): T2QatorHolat {
  return {
    id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null,
    smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: null,
  };
}
const t2Rows = (narxsiz: boolean): T2Qator[] => [
  tq(1, null, 'rz', null, { nom: 'РАЗДЕЛ 1' }),
  tq(2, 1, 'bl', 10, { nom: 'ЗАСЫПКА' }),
  tq(3, 2, 'mat', 5, { nom: 'ПЕСОК', narx: 12_000 }),
  tq(4, 2, 'mat', 4, { nom: 'ЩЕБЕНЬ', narx: narxsiz ? null : 9_000 }),
  // Mashinist mehnati — narxi mashina ichida: narxsiz deb sanalmaydi.
  tq(5, 2, 'rs', 3, { nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', kat: 'МАШ', narx: null }),
];
const t2Holat = [th(2, 4), th(3, 2), th(4, 1), th(5, 1)];

describe('Остаток работ — narxsiz qatorlar', () => {
  it('N = 0 (faqat mashinist narxsiz) — ogohlantirish yo‘q', () => {
    expect(sheet(ostatkaHujjatXlsx(ostatkaHujjatModeli(t2Rows(false), t2Holat), { obyektNomi: 'Объект', sana: '2026-09-25' }).bytes)).not.toContain(OGOH);
  });
  it('N > 0 — «Внимание: 1 строка без цены — итог неполный», narx katagi bo‘sh', () => {
    const xml = sheet(ostatkaHujjatXlsx(ostatkaHujjatModeli(t2Rows(true), t2Holat), { obyektNomi: 'Объект', sana: '2026-09-25' }).bytes);
    expect(xml).toContain('Внимание: 1 строка без цены — итог неполный');
    expect(bosh(katak(xml, 'ЩЕБЕНЬ', 'H'))).toBe(true);
  });
});

describe('Сличительная ведомость — narxsiz qatorlar', () => {
  it('N = 0 — ogohlantirish yo‘q', () => {
    expect(sheet(slichitelniyHujjatXlsx(slichitelniyModeli(t2Rows(false), t2Holat), { obyektNomi: 'Объект', sana: '2026-09-25' }).bytes)).not.toContain(OGOH);
  });
  it('N > 0 — ogohlantirish bor, narx katagi bo‘sh', () => {
    const xml = sheet(slichitelniyHujjatXlsx(slichitelniyModeli(t2Rows(true), t2Holat), { obyektNomi: 'Объект', sana: '2026-09-25' }).bytes);
    expect(xml).toContain('Внимание: 1 строка без цены — итог неполный');
    expect(bosh(katak(xml, 'ЩЕБЕНЬ', 'F'))).toBe(true);
  });
});

let seq = 0;
function nq(p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur'] }): NakopitelniyQator {
  seq++;
  return {
    qator_id: seq, tartib: seq, kod: null, nom: null, birlik: null, kat: null, qoshimcha: false, zamena: false,
    smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
    jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
    jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
  };
}
const nakRows = (narxsiz: boolean): NakopitelniyQator[] => {
  seq = 0;
  return [
    nq({ tur: 'rz', nom: 'РАЗДЕЛ 1' }),
    nq({ tur: 'bl', kod: 'Е01', nom: 'ЗАСЫПКА', birlik: 'м3', smeta_hajm: 10, smeta_summa: 96_000 }),
    nq({ tur: 'mat', kat: 'МАТ', kod: 'С1', nom: 'ПЕСОК', birlik: 'м3', smeta_hajm: 5, smeta_narx: 12_000, smeta_summa: 60_000 }),
    narxsiz
      ? nq({ tur: 'mat', kat: 'МАТ', kod: 'С2', nom: 'ЩЕБЕНЬ', birlik: 'м3', smeta_hajm: 4, smeta_narx: null, smeta_summa: null })
      : nq({ tur: 'mat', kat: 'МАТ', kod: 'С2', nom: 'ЩЕБЕНЬ', birlik: 'м3', smeta_hajm: 4, smeta_narx: 9_000, smeta_summa: 36_000 }),
  ];
};

describe('Накопительная ведомость — narxsiz qatorlar', () => {
  it('N = 0 — ogohlantirish yo‘q', () => {
    expect(sheet(nakopitelniyVedomostHujjat(nakRows(false), { obyektNom: 'Объект', davr: '2026-09-01' }).bytes)).not.toContain(OGOH);
  });
  it('N > 0 — ogohlantirish bor, narx katagi bo‘sh', () => {
    const xml = sheet(nakopitelniyVedomostHujjat(nakRows(true), { obyektNom: 'Объект', davr: '2026-09-01' }).bytes);
    expect(xml).toContain('Внимание: 1 строка без цены — итог неполный');
    expect(bosh(katak(xml, 'ЩЕБЕНЬ', 'F'))).toBe(true);
  });
});

const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 2, ТРАНСПОРТ_КАБЕЛЬ: 3, ПРОЧИЕ_ПОДРЯДЧИК: 10, ТРАНСПОРТ_ОБОРУД: 4, ЗАГОТ_СКЛАД_ОБОРУД: 1.5, СТРАХОВАНИЕ: 1, РИСК: 0, НДС: 12 };
// Forma-3 da qatorlar — ish turlari: narxsiz resurs ish ichida (ish summasi ma'lum qismdan), resurssiz ish — o'z qatori.
const f3Manba = (narxsiz: boolean): Forma3Manba => ({
  nakopitelniy: [{ obyekt_id: 1, obyektNom: 'Объект', qatorlar: [...nakRows(false),
    nq({ tur: 'bl', kod: 'Е02', nom: 'УКЛАДКА', birlik: 'м2', smeta_hajm: 2, smeta_narx: narxsiz ? null : 2_500, smeta_summa: narxsiz ? null : 5_000 })] }],
  f2Oylik: [],
});

describe('Форма № 3 — narxsiz qatorlar', () => {
  it('N = 0 — ogohlantirish yo‘q', () => {
    expect(sheet(forma3Hujjat(f3Manba(false), { obyektNom: 'Объект', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK }).bytes)).not.toContain(OGOH);
  });
  it('N > 0 — ogohlantirish bor, smeta qiymati katagi bo‘sh (0 emas)', () => {
    const xml = sheet(forma3Hujjat(f3Manba(true), { obyektNom: 'Объект', davr: '2026-09', asosiyObyektId: 1, nakrutka: NK }).bytes);
    expect(xml).toContain('Внимание: 1 строка без цены — итог неполный');
    expect(bosh(katak(xml, 'Е02 УКЛАДКА', 'F'))).toBe(true);
  });
});
