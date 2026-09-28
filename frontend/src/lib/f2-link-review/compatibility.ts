import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { Nomzod, Qavat } from '../f2-moslash-v3';

/**
 * Convert the existing matcher evidence score into a readable 0..100 index.
 * This is NOT a statistical probability and is never an auto-approval rule.
 * Volume and source order are intentionally excluded because they are weak tie-breakers.
 */
export function moslikIndeksiPercent(nomzod: Nomzod, source: F2Tugun): number | null {
  const layers = nomzod.qavatlar;
  // Raw matcher score without an evidence breakdown must never be displayed as certainty.
  if (!layers.length) return null;

  const byName = new Map(layers.map((layer) => [layer.nom, layer]));
  const dimensions: Array<{ key: Qavat['nom']; max: number; applicable: boolean }> = [
    { key: 'razdel', max: 25, applicable: source.yol.length > 0 },
    { key: 'shifr', max: 25, applicable: !!source.kod?.trim() },
    { key: 'nom', max: 20, applicable: !!source.nom.trim() },
    { key: 'resurslar', max: 25, applicable: source.bolalar.length > 0 },
  ];
  const applicable = dimensions.filter((dimension) => dimension.applicable && byName.has(dimension.key));
  const denominator = applicable.reduce((total, dimension) => total + dimension.max, 0);
  if (denominator === 0) return null;

  if ((byName.get('birlik')?.ball ?? 0) < 0) return 0;
  let points = applicable.reduce((total, dimension) => {
    const score = byName.get(dimension.key)?.ball ?? 0;
    return total + Math.max(0, Math.min(dimension.max, score));
  }, 0);
  if ((byName.get('marka')?.ball ?? 0) < 0) points -= Math.min(30, denominator * 0.3);
  return Math.max(0, Math.min(100, Math.round((points / denominator) * 100)));
}
