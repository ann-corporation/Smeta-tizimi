/**
 * Labour (чел-ч) and machine-hour (маш-ч) pricing from the separate hour catalogue (Codex, R2 rev
 * 16ee27da8700cc28). The material price catalogue never prices these (owner 2026-10-06).
 *
 *  • Labour: construction-worker reference rate for the object's region and the chosen period. Machine
 *    operators' labour is NOT priced with the worker rate (forbidden assumption) — it stays for review.
 *    The catalogue base rate excludes social insurance; it is not added twice.
 *  • Machine: exact machine name + маш-ч only (5 t ≠ 10 t); one MAX offer per machine, VAT excluded.
 * Proposals become ordinary SET_PRICE commands with full provenance — never a silent mutation.
 */
import { labourPrice, machinePrice, type HourCatalog } from '../hour-price-catalog';
import { resourceFacts } from '../resource-semantics';
import type { StudioCommand } from './commands';
import type { DocCalc } from './calc';
import type { EstimateDoc } from './model';

/** Price-catalogue region key → hour-catalogue region name. */
export const HOUR_REGION: Readonly<Record<string, string>> = {
  andijon: 'Андижанская область', buxoro: 'Бухарская область', toshkent_sh: 'Город Ташкент', jizzax: 'Джизакская область',
  qashqadaryo: 'Кашкадарьинская область', navoiy: 'Навоийская область', namangan: 'Наманганская область',
  qoraqalpogiston: 'Республики Каракалпакистан', samarqand: 'Самаркандская область', surxondaryo: 'Сурхандарьинская область',
  sirdaryo: 'Сырдарьинская область', toshkent_vil: 'Ташкентская область', fargona: 'Ферганская область', xorazm: 'Хорезмская область',
};

export type HourPeriod = { year: number; quarter: number };
/** Periods that actually have labour rates, newest first (empty quarters are not offered). */
export function labourPeriods(c: HourCatalog): HourPeriod[] {
  const seen = new Map<string, HourPeriod>();
  for (const l of c.labour) seen.set(`${l.year}-${l.quarter}`, { year: l.year, quarter: l.quarter });
  return [...seen.values()].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
}

export type HourResult = { commands: StudioCommand[]; labour: number; machines: number; operatorsLeft: number; notFound: number };

export function hourPrices(doc: EstimateDoc, calc: DocCalc, c: HourCatalog, unitText: (code: string | null) => string | null,
  regionKey: string | null, period: HourPeriod | null): HourResult {
  const out: HourResult = { commands: [], labour: 0, machines: 0, operatorsLeft: 0, notFound: 0 };
  const region = regionKey ? HOUR_REGION[regionKey] ?? null : null;
  for (const o of Object.values(doc.occurrences)) for (const l of calc.occurrences[o.id]?.lines ?? []) {
    if (l.price != null || !l.resource) continue;
    const f = resourceFacts(l.resource, unitText);
    if (f.pricingSource === 'LABOUR_HOUR') {
      if (/ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ/i.test(l.resource.name ?? '')) { out.operatorsLeft++; continue; }
      const r = region && period ? labourPrice(c, { region, ...period, unit: 'чел-ч', scope: 'CONSTRUCTION_WORKER_REFERENCE' }) : null;
      if (!r) { out.notFound++; continue; }
      out.labour++;
      out.commands.push({ type: 'SET_PRICE', occurrenceId: o.id, recipeId: l.recipeId, price: { value: r.price, basis: 'CATALOG_CANDIDATE',
        evidence: `Chel.-soat stavkasi · ${r.region} · ${r.year} y. ${r.quarter}-kv. · ${r.sheet} ${r.baseCell} · ijtimoiy sug‘urtasiz · NDS siz`,
        sourcePriceId: `hour-labour:${r.id}` } });
    } else if (f.pricingSource === 'MACHINE_HOUR') {
      const m = machinePrice(c, l.resource.name ?? '', 'маш-ч');
      if (!m) { out.notFound++; continue; }
      out.machines++;
      out.commands.push({ type: 'SET_PRICE', occurrenceId: o.id, recipeId: l.recipeId, price: { value: m.price, basis: 'CATALOG_CANDIDATE',
        evidence: `Mash.-soat katalogi · ${m.name} · ${m.sourceDate} · sah. ${m.page} · eng yuqori narx (MAX) · NDS siz`,
        sourcePriceId: `hour-machine:${m.machineKey}` } });
    }
  }
  return out;
}
