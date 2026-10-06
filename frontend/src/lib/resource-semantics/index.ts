import { resourceUnitText } from '../smeta-studio/resource-units';

export type ResourceKind = 'LABOUR' | 'MACHINE' | 'MATERIAL' | 'EQUIPMENT' | 'UNRESOLVED';
export type ResourceFacts = {
  kind: ResourceKind; unit: string | null;
  costCategory: 'ЧЕЛ' | 'МАШ' | 'МАТ' | 'ОБ' | null;
  pricingSource: 'LABOUR_HOUR' | 'MACHINE_HOUR' | 'MATERIAL_CATALOG' | null;
  warnings: string[];
};
export type ResourceInput = { name: string | null; unitCode: string | null; type: string | null };
const unitKey = (v: string) => v.toLowerCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
const machineryName = /ЭКСКАВАТОР|БУЛЬДОЗЕР|АВТОГРЕЙДЕР|КРАН[ЫА]?\s|АВТОПОГРУЗЧИК|САМОСВАЛ/;

/** KodI observation outranks the broad source Tip=R, which also contains machines. */
export function resourceFacts(resource: ResourceInput | null,
  resolveUnit: (code: string | null) => string | null = resourceUnitText): ResourceFacts {
  const unresolved = (unit: string | null, warning: string): ResourceFacts => ({
    kind: 'UNRESOLVED', unit, costCategory: null, pricingSource: null, warnings: [warning],
  });
  if (!resource) return unresolved(null, 'RESOURCE_UNRESOLVED');
  const unit = resolveUnit(resource.unitCode);
  const key = unit == null ? null : unitKey(unit);
  const name = (resource.name ?? '').toUpperCase();
  if (key === 'чел-ч') return { kind: 'LABOUR', unit: 'чел-ч',
    // Keep existing cost grouping of operator labour; the price unit remains human-hours.
    costCategory: /ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ/.test(name) ? 'МАШ' : 'ЧЕЛ',
    pricingSource: 'LABOUR_HOUR', warnings: [] };
  if (key === 'маш-ч') return { kind: 'MACHINE', unit: 'маш-ч', costCategory: 'МАШ',
    pricingSource: 'MACHINE_HOUR', warnings: [] };
  if (!unit) return unresolved(null, 'RESOURCE_UNIT_UNRESOLVED');
  if (resource.type === 'X' || machineryName.test(name)) return unresolved(unit, 'MACHINE_UNIT_CONFLICT');
  if (/^ЗАТРАТЫ\s+ТРУДА/.test(name)) return unresolved(unit, 'LABOUR_UNIT_CONFLICT');
  if (resource.type === 'M' || resource.type === 'М' || resource.type === 'R')
    return { kind: 'MATERIAL', unit, costCategory: 'МАТ', pricingSource: 'MATERIAL_CATALOG', warnings: [] };
  return unresolved(unit, 'RESOURCE_CATEGORY_UNRESOLVED');
}

/** Display normative scale WITHOUT changing physical input quantity or resource consumption. */
export function normativeWorkUnit(basis: { scale: string | null; unitLabel: string | null }): string | null {
  if (!basis.unitLabel || !basis.scale || !/^\d+(?:\.\d+)?$/.test(basis.scale) || Number(basis.scale) <= 0) return null;
  return Number(basis.scale) === 1 ? basis.unitLabel : `${basis.scale} ${basis.unitLabel}`;
}
