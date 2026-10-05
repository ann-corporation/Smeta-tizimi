/**
 * Chat/voice → the SAME command layer as the manual editor.
 *
 *   transcript → ConversationFact[] (parser/LLM proposal, evidence-gated by reviewConversationEstimate)
 *   → deterministic catalogue candidates (search, never invented)
 *   → operator picks a work per fact + confirms PER_ITEM/TOTAL scope
 *   → StudioCommand[] (ADD_SECTION / ADD_OCCURRENCE) applied to the draft → user saves.
 *
 * Intents are separate: CREATE_ESTIMATE builds draft commands; REGISTER_FACT never does
 * (Fakt needs its own confirmation + command). "qilindi" in the text is not a Fakt write.
 */
import { reviewConversationEstimate, type ConfirmedQuantityScope, type ConversationFact } from '../catalog-extraction/conversation-estimate';
import type { NormWork } from '../catalog-extraction/norm-catalog';
import type { NormDetailSource } from '../catalog-extraction/norm-remote';
import type { UnitEntry } from '../catalog-extraction/norm-shards';
import { snapshotWork, suggestedBasis } from './catalog-bridge';
import type { StudioCommand } from './commands';

export type ConversationIntent = 'CREATE_ESTIMATE' | 'REGISTER_FACT';
export type CatalogSearch = { search(query: string, page: number): { rows: NormWork[]; total: number } };

/** Deterministic candidates: catalogue search by the fact's own words; nothing is chosen. */
export function candidateWorks(catalog: CatalogSearch, fact: ConversationFact, limit = 10) {
  const words = [fact.description, fact.materialQuote ?? ''].join(' ').split(/\s+/).filter(w => w.length >= 3);
  const seen = new Map<string, NormWork>();
  // Most specific first: all words, then progressively fewer leading words.
  for (let n = words.length; n >= 1 && seen.size < limit; n--) {
    for (const w of catalog.search(words.slice(0, n).join(' '), 0).rows) { if (seen.size >= limit) break; if (!seen.has(w.id)) seen.set(w.id, w); }
  }
  return { candidates: [...seen.values()], needsReview: true as const };
}

export type FactSelection = { factId: string; workId: string; tableLabel: string | null };
export type BuildResult =
  | { ok: true; commands: StudioCommand[]; sectionId: string }
  | { ok: false; code: 'FACT_INTENT_NOT_ESTIMATE' | 'REVIEW_BLOCKED' | 'SELECTION_MISSING'; details: string[] };

export function buildEstimateCommands(input: {
  intent: ConversationIntent; sourceText: string; facts: ConversationFact[]; scope: ConfirmedQuantityScope | null;
  selections: FactSelection[]; sectionName: string; catalogRevision: string;
  catalog: NormDetailSource; unitOf: (code: string | null) => UnitEntry | null; newId: () => string;
}): BuildResult {
  if (input.intent !== 'CREATE_ESTIMATE') return { ok: false, code: 'FACT_INTENT_NOT_ESTIMATE', details: ['REGISTER_FACT alohida tasdiq va Fakt buyrug‘i talab qiladi'] };
  const review = reviewConversationEstimate(input.sourceText, input.facts, input.scope);
  const blocked = review.lines.filter(l => l.issues.length || l.totalQuantity == null).map(l => `${l.fact.factId}: ${l.issues.join(',') || 'QUANTITY_UNKNOWN'}`);
  if (blocked.length) return { ok: false, code: 'REVIEW_BLOCKED', details: blocked };
  const missing = review.lines.filter(l => !input.selections.some(s => s.factId === l.fact.factId)).map(l => l.fact.factId);
  if (missing.length) return { ok: false, code: 'SELECTION_MISSING', details: missing };
  const sectionId = input.newId();
  const commands: StudioCommand[] = [{ type: 'ADD_SECTION', sectionId, parentId: null, name: input.sectionName }];
  for (const line of review.lines) {
    const sel = input.selections.find(s => s.factId === line.fact.factId)!;
    const snap = snapshotWork(input.catalog, sel.workId, input.catalogRevision, sel.tableLabel);
    commands.push({ type: 'ADD_OCCURRENCE', occurrenceId: input.newId(), sectionId, source: snap.source, recipe: snap.recipe,
      quantity: line.totalQuantity, basis: suggestedBasis(snap.source.unitCode, input.unitOf(snap.source.unitCode)) });
  }
  return { ok: true, commands, sectionId };
}
