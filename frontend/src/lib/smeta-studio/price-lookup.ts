/**
 * Catalogue pricing for studio resources: find the platform price-catalogue rows (R2) for a
 * resource and turn an operator's choice into a SET_PRICE command whose evidence names the exact
 * source (catalogue, period, region, manufacturer, VAT). Nothing is applied silently: offers are
 * proposals, the operator picks; bulk apply only uses EXACT name+unit matches and one candidate.
 */
import type { KatalogQatori } from '../narx-katalog/price-remote';
import type { DocCalc } from './calc';
import type { StudioCommand } from './commands';
import type { EstimateDoc } from './model';

export type PriceSource = {
  qidir(matn: string, hudud?: string | null, limit?: number): KatalogQatori[];
  aniqMoslik(nom: string | null, birlik: string | null): KatalogQatori[];
};
export type PriceOffer = { row: KatalogQatori; exact: boolean };

/** Human-readable provenance, stored as the price evidence. */
export function catalogEvidence(k: KatalogQatori): string {
  const davr = k.yil ? `${k.yil} y.${k.kvartal ? ` ${k.kvartal}-kv.` : ''}` : null;
  return ['Platforma narx katalogi', k.manba_nom, davr, k.hudud, k.ishlab_chiqaruvchi, k.nds_holati ?? k.nds_izoh,
    k.kod ? `kod ${k.kod}` : null, `${k.nom}${k.birlik ? `, ${k.birlik}` : ''}`].filter(Boolean).join(' · ');
}

/** Exact name+unit matches first (same region first), then word search on the name. */
export function findOffers(src: PriceSource, name: string | null, unit: string | null, region?: string | null, limit = 30): PriceOffer[] {
  const out: PriceOffer[] = [], seen = new Set<number>();
  const exact = src.aniqMoslik(name, unit).filter(k => k.nds_holati !== 'nds_bilan').sort((a, b) => Number(b.hudud_kalit === region) - Number(a.hudud_kalit === region));
  for (const row of exact) { seen.add(row.id); out.push({ row, exact: true }); }
  if (name && name.trim().length >= 2) {
    for (const row of src.qidir(name, null, limit * 2)) {
      if (out.length >= limit) break;
      if (!seen.has(row.id) && row.narx != null && row.nds_holati !== 'nds_bilan') { seen.add(row.id); out.push({ row, exact: false }); }
    }
  }
  return out.slice(0, limit);
}

export function priceCommand(occurrenceId: string, recipeId: string, k: KatalogQatori): StudioCommand {
  if (k.narx == null) throw new Error('PRICE_INVALID');
  // Owner rule (2026-10-06): estimates are always priced WITHOUT VAT.
  if (k.nds_holati === 'nds_bilan') throw new Error('PRICE_VAT_INCLUDED');
  return { type: 'SET_PRICE', occurrenceId, recipeId,
    price: { value: String(k.narx), basis: 'CATALOG_CANDIDATE', evidence: catalogEvidence(k), sourcePriceId: `narx-katalog:${k.id}` } };
}

export type BulkProposal = {
  occurrenceId: string; recipeId: string; resourceName: string; unit: string | null;
  offers: KatalogQatori[]; chosen: KatalogQatori | null; reason: 'ONE_EXACT' | 'SEVERAL_EXACT' | 'NONE';
};

/**
 * For every resource line without a price: exact catalogue matches. A single match (or a single
 * match in the object's region) is pre-chosen; several are left for the operator; none → listed.
 */
export function bulkProposals(doc: EstimateDoc, calc: DocCalc, src: PriceSource,
  unitText: (code: string | null) => string | null, region?: string | null): BulkProposal[] {
  const out: BulkProposal[] = [];
  for (const o of Object.values(doc.occurrences)) {
    for (const l of calc.occurrences[o.id]?.lines ?? []) {
      if (l.price != null || !l.resource) continue;
      const unit = unitText(l.resource.unitCode);
      const offers = src.aniqMoslik(l.resource.name, unit).filter(k => k.nds_holati !== 'nds_bilan');
      const regional = region ? offers.filter(k => k.hudud_kalit === region) : [];
      const pick = offers.length === 1 ? offers[0] : regional.length === 1 ? regional[0] : null;
      out.push({ occurrenceId: o.id, recipeId: l.recipeId, resourceName: l.resource.name ?? '', unit, offers,
        chosen: pick, reason: offers.length === 0 ? 'NONE' : pick ? 'ONE_EXACT' : 'SEVERAL_EXACT' });
    }
  }
  return out;
}

/** One undoable step for all chosen proposals. */
export function bulkCommand(proposals: BulkProposal[]): StudioCommand | null {
  const commands = proposals.filter(p => p.chosen).map(p => priceCommand(p.occurrenceId, p.recipeId, p.chosen!));
  return commands.length ? { type: 'BATCH', label: 'Katalogdan narx', commands } : null;
}
