import type { Occurrence, WorkCoefficient } from './model';

const scopeLabel = (scope: WorkCoefficient['scope']) => ({ ALL: 'К', ЧЕЛ: 'Кзтр', МАШ: 'Кэм', 'ЧЕЛ+МАШ': 'Кзтр/Кэм', МАТ: 'Кмр' })[scope];
/** Public estimate notation; source code and internal provenance remain immutable. Legacy drafts recover the recorded rule code. */
export function coefficientCode(c: WorkCoefficient): string | null {
  return c.code ?? (c.origin !== 'OPERATOR' ? c.evidence.match(/^([^\s·:]+)\s*·/)?.[1] ?? null : null);
}
export function coefficientNotation(coefficients: readonly WorkCoefficient[] = []): string[] {
  const groups = new Map<string, string[]>();
  const bases = new Map<string, string>();
  for (const c of coefficients) {
    if (!c.accepted) continue;
    const code = coefficientCode(c) ?? '';
    if (c.basis) bases.set(code, c.basis);
    const factors = groups.get(code) ?? [];
    factors.push(`${scopeLabel(c.scope)}=${c.value.replace('.', ',')}`);
    groups.set(code, factors);
  }
  return [...groups].map(([code, factors]) => `${code ? code + ' ' : ''}${factors.join('; ')}${bases.has(code) ? ' · ' + bases.get(code) : ''}`);
}
export function coefficientWorkCode(work: Pick<Occurrence, 'source' | 'coefficients'>): string {
  return [work.source.code, ...coefficientNotation(work.coefficients)].join('\n');
}
