/**
 * Parity tests for the ported F2 matching engine.
 *
 * Every case here is a direct port of `f2MoslashSelfTest()` in
 * `Smeta tizimi/35_F2Moslash.js` (same inputs, same expected outputs). This
 * file exists specifically to prove the TypeScript port did not become a
 * "second, weaker matcher" — see `ops/handoff/T2_GAS_EXIT_001.md` §"Port the
 * mature F2 engine — do not rewrite it weaker".
 *
 * If you change a rule here, the corresponding self-test in
 * `35_F2Moslash.js` must change too (and vice versa) — the two must never
 * silently diverge.
 */
import { describe, expect, test } from 'vitest';
import { aynanMi, f2MatchEngine, kodKanon, normBir, normKod, normRz, rzKodlar } from './engine';
import type { AktNode, LrvNode } from './types';

describe('normalizers (parity with f2MoslashSelfTest normalizer block)', () => {
  test('kanon Е1101-002-09', () => {
    expect(kodKanon('Е1101-002-09 ДОП. 3')).toBe('Е11-1-2-9');
  });
  test('kanon E1-2-3-13', () => {
    expect(kodKanon('E1-2-3-13 ШHК.ДОП.6')).toBe('Е1-2-3-13');
  });
  test('kanon yakka guruh', () => {
    expect(kodKanon('000162')).toBe('162');
  });
  test('normKod bosh nol', () => {
    expect(normKod('000001')).toBe('1');
  });
  test('normKod lotin E', () => {
    expect(normKod('E1-1-195')).toBe('Е1-1-195');
  });
  test('normBir m3', () => {
    expect(normBir('М³')).toBe('М3');
  });
  test('normBir sinonimlar: komplekt va hajm birligidagi izoh so‘zi', () => {
    for (const b of ['К-Т', 'КОМП-Т', 'КОМПЛ', 'КОМПЛЕКТ', 'компл.']) expect(normBir(b)).toBe('КОМПЛ');
    expect(normBir('100 КОМПЛ')).toBe('100КОМПЛ');
    for (const b of ['ПМ', 'п.м', 'пог.м', 'М', 'м', 'метр']) expect(normBir(b)).toBe('М');
    expect(normBir('100 П.М')).toBe('100М');
    expect(normBir('М2')).toBe('М2');
    expect(normBir('100 М3 БЕТОНА')).toBe(normBir('100М3'));
    expect(normBir('100 М2 ПОВЕРХНОСТИ')).toBe('100М2');
    expect(normBir('МАШ.-Ч')).toBe('МАШЧ');
    expect(normBir('М')).not.toBe(normBir('МАШ-Ч'));
  });
  test('normRz qavs', () => {
    expect(normRz('РАЗДЕЛ: ФУНДАМЕНТЫ (ЛИСТ КР-5)')).toBe('ФУНДАМЕНТЫ');
  });
  test('rzKodlar oraliq', () => {
    expect(rzKodlar('КОЛОННЫ (ЛИСТ КР-28-30)').sort().join(',')).toBe('КР28,КР29,КР30');
  });
  test('aynan kodsiz', () => {
    expect(aynanMi('', 'БЕТОН', 'М3', 'Е1-1', 'БЕТОН', 'М3')).toBe(true);
  });
  test('aynan kod farqli', () => {
    expect(aynanMi('А1', 'БЕТОН', 'М3', 'Б2', 'БЕТОН', 'М3')).toBe(false);
  });
});

/* ---- engine behavior fixtures (same shape as f2MoslashSelfTest's rz/lrv/akt helpers) ---- */

function rzFixture(nom: string, kids: (AktNode | LrvNode)[]): LrvNode {
  return { type: 'rz', nom, lokalka: 'L1', children: kids } as unknown as LrvNode;
}
function lrvFixture(o: { nom: string; kod?: string; bir?: string; narx?: number; row: number; t?: LrvNode['type']; kids?: LrvNode[] }): LrvNode {
  return {
    type: o.t || 'mat', nom: o.nom, kod: o.kod || '', birlik: o.bir || '',
    // `narx` isn't part of LrvNode's declared shape (only mosliklar/F2Match
    // carry price) but the source fixture attaches it for the "equivalent
    // candidates" test, read back via `(c as any).narx` inside `ekvivmi`.
    // Kept for exact parity with the GAS self-test fixture.
    ...(o.narx !== undefined ? { narx: o.narx } : {}),
    varaq: 'V1', row: o.row, children: o.kids || [],
  } as unknown as LrvNode;
}
function aktFixture(o: { uid: string; nom: string; kod?: string; bir?: string; hajm?: number; narx?: number; summa?: number; t?: AktNode['type']; kids?: AktNode[] }): AktNode {
  return {
    type: o.t || 'mat', uid: o.uid, nom: o.nom, kod: o.kod || '', bir: o.bir || '',
    hajm: o.hajm ?? 1, narx: o.narx || 0, summa: o.summa || 0, children: o.kids || [],
  };
}
/** Returns the matched LRV row for `uid`, or 0 if it did not bind — mirrors `mosMi()` in the GAS self-test. */
function matchedRow(aktTree: AktNode[], lrvTree: LrvNode[], uid: string): number {
  const r = f2MatchEngine(aktTree, lrvTree, { lokalka: 'L1' });
  const hit = r.mosliklar.find((m) => m.uid === uid);
  return hit ? hit.row : 0;
}

describe('engine behavior (parity with f2MoslashSelfTest engine block)', () => {
  test('aniq moslik — exact match must bind', () => {
    const akt: AktNode[] = [rzFixture('ФУНДАМЕНТЫ', [
      aktFixture({ uid: 'a1', nom: 'ЦЕМЕНТ М400', kod: 'С124', bir: 'Т' }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('ФУНДАМЕНТЫ', [
      lrvFixture({ nom: 'ЦЕМЕНТ М400', kod: 'С124', bir: 'Т', row: 10 }),
    ])];
    expect(matchedRow(akt, lrv, 'a1')).toBe(10);
  });

  test('birlik qalqoni Т↔КГ — must NOT bind (1000x error risk)', () => {
    const akt: AktNode[] = [rzFixture('ФУНДАМЕНТЫ', [
      aktFixture({ uid: 'a2', nom: 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', kod: 'С101', bir: 'Т' }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('ФУНДАМЕНТЫ', [
      lrvFixture({ nom: 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', kod: 'С101', bir: 'КГ', row: 11 }),
    ])];
    expect(matchedRow(akt, lrv, 'a2')).toBe(0);
  });

  test('grade-farq ПК↔ПБ — different product, must NOT bind', () => {
    const akt: AktNode[] = [rzFixture('ПЕРЕКРЫТИЯ', [
      aktFixture({ uid: 'a3', nom: 'ПЛИТА ПБ 59-12', bir: 'ШТ' }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('ПЕРЕКРЫТИЯ', [
      lrvFixture({ nom: 'ПЛИТА ПК 59-12', bir: 'ШТ', row: 12 }),
    ])];
    expect(matchedRow(akt, lrv, 'a3')).toBe(0);
  });

  test('ikki xil nomzod — ambiguous candidates must NOT bind', () => {
    const akt: AktNode[] = [rzFixture('ЗЕМРАБОТЫ', [
      aktFixture({ uid: 'a4', nom: 'ГРУНТ', kod: 'К1', bir: 'М3' }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('ЗЕМРАБОТЫ', [
      lrvFixture({ nom: 'ГРУНТ', kod: 'К1', bir: 'М3', narx: 100, row: 13 }),
      lrvFixture({ nom: 'ГРУНТ', kod: 'К1', bir: 'М3', narx: 250, row: 14 }),
    ])];
    expect(matchedRow(akt, lrv, 'a4')).toBe(0);
  });

  test('ekvivalent nomzodlar (kod+nom+birlik+narx all equal) — first free one binds', () => {
    const akt: AktNode[] = [rzFixture('ЗЕМРАБОТЫ', [
      aktFixture({ uid: 'a5', nom: 'ГРУНТ', kod: 'К1', bir: 'М3' }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('ЗЕМРАБОТЫ', [
      lrvFixture({ nom: 'ГРУНТ', kod: 'К1', bir: 'М3', narx: 100, row: 15 }),
      lrvFixture({ nom: 'ГРУНТ', kod: 'К1', bir: 'М3', narx: 100, row: 16 }),
    ])];
    expect(matchedRow(akt, lrv, 'a5')).toBe(15);
  });

  test('kod-kanon Е1101-002-09 ↔ E11-1-2-9 — same расценка, two spellings', () => {
    const akt: AktNode[] = [rzFixture('КОЛОННЫ', [
      aktFixture({ uid: 'a6', t: 'bl', nom: 'МОНТАЖ КОЛОНН', kod: 'Е1101-002-09 ДОП. 3', bir: 'ШТ' }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('КОЛОННЫ', [
      lrvFixture({ t: 'bl', nom: 'УСТАНОВКА КОЛОНН', kod: 'E11-1-2-9', bir: 'ШТ', row: 17 }),
    ])];
    expect(matchedRow(akt, lrv, 'a6')).toBe(17);
  });

  test('yetim resurs qutqarildi — unmatched parent must not drop its child', () => {
    const akt: AktNode[] = [rzFixture('КР-5', [
      aktFixture({
        uid: 'b1', t: 'bl', nom: 'НОМАЪЛУМ ИШ', kod: 'ZZZ99', bir: 'М3',
        kids: [aktFixture({ uid: 'r1', t: 'rs', nom: 'ЦЕМЕНТ М500', kod: 'С777', bir: 'Т' })],
      }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('КР-5', [
      lrvFixture({ nom: 'ЦЕМЕНТ М500', kod: 'С777', bir: 'Т', row: 18 }),
    ])];
    expect(matchedRow(akt, lrv, 'r1')).toBe(18);
  });

  test('chizma-varaq КР-5 scope — links by drawing-sheet code even when section names differ', () => {
    const akt: AktNode[] = [rzFixture('РАЗДЕЛ: ФУНДАМЕНТЫ (ЛИСТ КР-5)', [
      aktFixture({ uid: 'c1', nom: 'АРМАТУРА А500', kod: 'А5', bir: 'Т' }),
    ]) as unknown as AktNode];
    const lrv: LrvNode[] = [rzFixture('ФУНДАМЕНТ ЛЕНТОЧНЫЙ ФЛ-2 (КР-5)', [
      lrvFixture({ nom: 'АРМАТУРА А500', kod: 'А5', bir: 'Т', row: 19 }),
    ])];
    expect(matchedRow(akt, lrv, 'c1')).toBe(19);
  });
});
