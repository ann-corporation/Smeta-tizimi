import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { pozitsiyaPul, qatorPul } from '../../src/lib/smeta-versiya/hisob';
import { versiyaMoslash } from '../../src/lib/smeta-versiya/moslash';
import type { JPozitsiya, VPozitsiya } from '../../src/lib/smeta-versiya/turlar';

const pozEski = (i: number): VPozitsiya => ({
  tartib: i,
  lsKod: 'LS-01', lsNom: 'Synthetic section', razdel: 'Synthetic division', blok: 'Synthetic block',
  raqam: String(i + 1), kod: `OLD-${String(i).padStart(5, '0')}`,
  nom: `Synthetic old work ${String(i).padStart(5, '0')}`, birlik: 'м3', hajm: 10,
  resurslar: [],
});
const pozJoriy = (p: VPozitsiya, qatorId: number): JPozitsiya => ({
  qatorId,
  lsKod: p.lsKod, lsNom: p.lsNom, razdel: p.razdel, blok: p.blok,
  kod: p.kod, nom: p.nom, birlik: p.birlik, hajm: 8,
  tur: 'bl', qoshimcha: false, resurslar: [],
});

it('signed negative volume keeps its known claim money (expected dava = -20)', () => {
  const directOld = pozitsiyaPul({
    kod: 'NEG-2', nom: 'Synthetic signed line', birlik: 'м3', hajm: -2, resurslar: [],
  }, new Map([['NEG-2', { narx: 10, kat: 'МАТ' }]]));
  expect(directOld).toMatchObject({ summa: -20, narxsiz: 0 });

  const row = qatorPul({
    holat: 'ochirilgan', qaror: 'qurilgan', eskiHajm: -2, qurilganHajm: null,
    joriyHajm: null, birlikFarq: false,
  }, directOld, null);
  expect(row.davaHajm).toBe(-2);
  // Regression oracle: known signed amount must not become unknown/null.
  expect(row.dava).toBe(-20);
});

it('matches 25,000 exact unique positions bijectively when current order is reversed', () => {
  const count = 25_000;
  const old = Array.from({ length: count }, (_, i) => pozEski(i));
  const current = old.slice().reverse().map((p, i) => pozJoriy(p, i + 1));

  const started = performance.now();
  const pairs = versiyaMoslash(old, current);
  const elapsedMs = performance.now() - started;
  console.log(`[PTO-157] exact reversed: ${pairs.length}/${count} pairs, ${elapsedMs.toFixed(1)} ms`);

  expect(pairs).toHaveLength(count);
  expect(pairs.every((p) => p.eski != null && p.joriy != null)).toBe(true);
  expect(new Set(pairs.map((p) => p.eski)).size).toBe(count);
  expect(new Set(pairs.map((p) => p.joriy)).size).toBe(count);
  expect(pairs.every((p) => old[p.eski!].kod === current[p.joriy!].kod)).toBe(true);
  expect(pairs.every((p) => p.holat === 'kamaygan')).toBe(true);
});

it('keeps a bounded 100-by-100 unmatched same-section set semantically unmatched', () => {
  const count = 100;
  const old = Array.from({ length: count }, (_, i) => ({
    ...pozEski(i), kod: `OLD-${String(i).padStart(3, '0')}`,
    nom: `AAAAA removed ${String(i).padStart(3, '0')}`,
  }));
  const current = Array.from({ length: count }, (_, i) => ({
    ...pozJoriy(pozEski(i), i + 1), kod: `NEW-${String(i).padStart(3, '0')}`,
    nom: `ZZZZZ added ${String(i).padStart(3, '0')}`,
  }));

  const started = performance.now();
  const pairs = versiyaMoslash(old, current);
  const elapsedMs = performance.now() - started;
  console.log(`[PTO-157] bounded unmatched: ${pairs.length} rows from ${count}+${count} inputs, ${elapsedMs.toFixed(1)} ms`);

  expect(pairs).toHaveLength(count * 2);
  expect(pairs.filter((p) => p.holat === 'ochirilgan' && p.eski != null && p.joriy == null)).toHaveLength(count);
  expect(pairs.filter((p) => p.holat === 'yangi' && p.eski == null && p.joriy != null)).toHaveLength(count);
});
