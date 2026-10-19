/** Договорная классификация независима от ресурсной категории и кода ШНК.
 * Денежные итоги — только по стоимостным листьям канонического дерева.
 * Неизвестное основание не превращается в строительство по умолчанию. */
export const SCOPE_KINDS = ['construction', 'equipment', 'supervision', 'artwork', 'design', 'service', 'other'] as const;
export type ScopeKind = typeof SCOPE_KINDS[number];
export const SCOPE_NAMES: Record<ScopeKind, string> = {
  construction: 'Qurilish ishlari', equipment: 'Uskuna va jihozlar', supervision: 'Shef-montaj va sozlash',
  artwork: 'Badiiy ishlar va haykal', design: 'Loyiha va mualliflik ishlari', service: 'Xizmatlar', other: 'Boshqa shartnoma ishlari',
};
export type ScopeBasis = {
  qator_id: number; kind: ScopeKind; contract_id: number; reference: string;
  valuation: 'unit' | 'milestone' | 'amount';
  /** null = ещё не выяснено; никакого автоматического НДС/накруток. */
  vat: 'included' | 'excluded' | 'exempt' | null;
  markup: 'included' | 'excluded' | null;
};
export type ScopeLine = { id: number; ota_id: number | null; tur: string | null; nom: string; summa: string | number | null; versiya?: number };

// Целые тиыны: не теряем копейки при больших договорных суммах.
export function moneyMinor(value: string | number): bigint {
  if (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) throw new Error('MONEY_INVALID');
  const s = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) throw new Error('MONEY_INVALID');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  return (BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'))) * (s.startsWith('-') ? -1n : 1n);
}
export function moneyText(value: bigint): string {
  const v = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${v / 100n}.${String(v % 100n).padStart(2, '0')}`;
}
export type ScopeTotal = { kind: ScopeKind | 'unclassified'; known: string; total: string | null; unknown: number; rows: number };
export type ScopeBreakdown = {
  groups: ScopeTotal[]; known: string; total: string | null; unknown: number;
  /** Ошибки структуры блокируют окончательный итог, но не маскируются нулём. */
  issues: Array<{ id: number; code: 'DUPLICATE_ID' | 'PARENT_MISSING' | 'CYCLE' | 'MONEY_INVALID' | 'VALUE_PARENT_WITH_CHILDREN' }>;
  owners: Map<number, ScopeBasis | null>;
};

export function scopeBreakdown(lines: readonly ScopeLine[], bases: readonly ScopeBasis[]): ScopeBreakdown {
  const byId = new Map<number, ScopeLine>();
  const issues: ScopeBreakdown['issues'] = [];
  for (const q of lines) {
    if (byId.has(q.id)) issues.push({ id: q.id, code: 'DUPLICATE_ID' });
    byId.set(q.id, q);
  }
  const basis = new Map(bases.map(b => [b.qator_id, b]));
  const children = new Set(lines.filter(q => q.ota_id != null).map(q => q.ota_id));
  const owners = new Map<number, ScopeBasis | null>();
  const groups = new Map<ScopeKind | 'unclassified', { sum: bigint; unknown: number; rows: number }>();
  let known = 0n, unknown = 0;
  for (const q of byId.values()) {
    let cur: ScopeLine | undefined = q;
    const seen = new Set<number>();
    let owner: ScopeBasis | null = null;
    // Проверяем ВСЮ цепочку, даже когда классификация найдена на самом листе.
    while (cur) {
      if (seen.has(cur.id)) { issues.push({ id: q.id, code: 'CYCLE' }); break; }
      seen.add(cur.id);
      owner ??= basis.get(cur.id) ?? null;
      if (cur.ota_id == null) break;
      const parent = byId.get(cur.ota_id);
      if (!parent) { issues.push({ id: q.id, code: 'PARENT_MISSING' }); break; }
      cur = parent;
    }
    owners.set(q.id, owner);
    if (q.tur === 'rz' || children.has(q.id)) {
      if (q.tur !== 'rz' && children.has(q.id) && basis.get(q.id)?.valuation !== undefined && q.summa != null) {
        // Родительская сумма и ресурсы могут быть одной ценой или разными поставками.
        // Не объявляем их двумя независимыми стоимостями без явного разделения.
        if (basis.get(q.id)?.kind !== 'construction') issues.push({ id: q.id, code: 'VALUE_PARENT_WITH_CHILDREN' });
      }
      continue;
    }
    const kind = owner?.kind ?? 'unclassified';
    const g = groups.get(kind) ?? { sum: 0n, unknown: 0, rows: 0 };
    g.rows++;
    if (q.summa == null) { g.unknown++; unknown++; }
    else {
      try { const n = moneyMinor(q.summa); g.sum += n; known += n; }
      catch { g.unknown++; unknown++; issues.push({ id: q.id, code: 'MONEY_INVALID' }); }
    }
    groups.set(kind, g);
  }
  return {
    groups: [...groups].map(([kind, g]) => ({ kind, known: moneyText(g.sum), total: g.unknown ? null : moneyText(g.sum), unknown: g.unknown, rows: g.rows })),
    known: moneyText(known), total: unknown || issues.length ? null : moneyText(known), unknown, issues, owners,
  };
}

export type QuantityCertificate = { id: number; quantity: string; amount: string | null; status: 'draft' | 'approved' | 'cancelled'; month: string };
/** Только утверждённые снимки стоимости. Старые акты не переоцениваются по новой цене. */
export function scopeCertificates(certificates: readonly QuantityCertificate[], month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('MONTH_INVALID');
  const ids = new Set<number>();
  let previous = 0n, current = 0n, unknown = 0;
  for (const c of certificates) {
    if (ids.has(c.id)) throw new Error('DUPLICATE_CERTIFICATE');
    ids.add(c.id);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.month)) throw new Error('MONTH_INVALID');
    if (c.status !== 'approved' || c.month > month) continue;
    if (c.amount == null) { unknown++; continue; }
    if (c.month === month) current += moneyMinor(c.amount); else previous += moneyMinor(c.amount);
  }
  return { previous: moneyText(previous), current: moneyText(current), known: moneyText(previous + current), total: unknown ? null : moneyText(previous + current), unknown };
}

/** Сверка только одинаковых валют и налоговых баз; остаток не создаёт выдуманную работу. */
export function reconcileScope(contract: string | null, breakdown: ScopeBreakdown, sameBasis: boolean) {
  if (contract == null || breakdown.total == null || !sameBasis) return { difference: null, balanced: null };
  const difference = moneyMinor(contract) - moneyMinor(breakdown.total);
  return { difference: moneyText(difference), balanced: difference === 0n };
}
