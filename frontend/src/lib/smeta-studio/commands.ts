/**
 * Pure command reducer. The manual editor, undo/redo and the chat assistant all mutate the
 * draft only through `applyCommand`; invalid commands throw a stable error code and leave
 * the previous document untouched.
 */
import { normDec, type EstimateContext, type EstimateDoc, type Occurrence, type PriceChoice, type RecipeSnapshot,
  type Section, type Substitution, type UnitBasis, type WorkSource } from './model';

export type StudioCommand =
  | { type: 'SET_CONTEXT'; context: Partial<EstimateContext>; currency?: string }
  | { type: 'ADD_SECTION'; sectionId: string; parentId: string | null; name: string }
  | { type: 'RENAME_SECTION'; sectionId: string; name: string }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'ADD_OCCURRENCE'; occurrenceId: string; sectionId: string; source: WorkSource; recipe: RecipeSnapshot[]; quantity: string | null; basis: UnitBasis }
  | { type: 'SET_QUANTITY'; occurrenceId: string; quantity: string | null }
  | { type: 'SET_BASIS'; occurrenceId: string; basis: UnitBasis }
  | { type: 'MOVE_OCCURRENCE'; occurrenceId: string; sectionId: string; index?: number }
  | { type: 'REMOVE_OCCURRENCE'; occurrenceId: string }
  | { type: 'SET_PRICE'; occurrenceId: string; recipeId: string; price: PriceChoice | null }
  | { type: 'SUBSTITUTE_RESOURCE'; occurrenceId: string; recipeId: string; substitution: Substitution | null };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const fail = (code: string): never => { throw new Error(code); };
const name = (v: string, code: string) => { const s = String(v ?? '').trim(); if (!s || s.length > 300) fail(code); return s; };
const clone = <T,>(v: T): T => structuredClone(v);

function basisOf(b: UnitBasis): UnitBasis {
  const scale = b.scale == null ? null : normDec(b.scale, 'BASIS_INVALID');
  if (scale === '0') fail('BASIS_INVALID');
  if (scale != null && !(b.evidence ?? '').trim()) fail('BASIS_EVIDENCE_REQUIRED');
  if (b.origin != null && b.origin !== 'OBSERVED' && b.origin !== 'OPERATOR') fail('BASIS_INVALID');
  return { scale, unitLabel: b.unitLabel?.trim() || null, evidence: b.evidence?.trim() || null, origin: scale == null ? null : b.origin ?? 'OPERATOR' };
}
function occ(doc: EstimateDoc, id: string): Occurrence { return doc.occurrences[id] ?? fail('OCCURRENCE_NOT_FOUND'); }
function sec(doc: EstimateDoc, id: string): Section { return doc.sections[id] ?? fail('SECTION_NOT_FOUND'); }
function recipeOf(o: Occurrence, recipeId: string) { return o.recipe.find(r => r.recipeId === recipeId) ?? fail('RECIPE_NOT_FOUND'); }

export function applyCommand(input: EstimateDoc, cmd: StudioCommand): EstimateDoc {
  const doc = clone(input);
  switch (cmd.type) {
    case 'SET_CONTEXT': {
      const c = cmd.context;
      for (const k of ['companyId', 'projectId', 'objectId'] as const) if (k in c && c[k] != null && !(Number.isSafeInteger(c[k]) && c[k]! > 0)) fail('CONTEXT_INVALID');
      doc.context = { ...doc.context, ...c, objectLabel: (c.objectLabel ?? doc.context.objectLabel).trim(), title: (c.title ?? doc.context.title).trim() };
      if (cmd.currency != null) { if (!/^[A-Z]{3}$/.test(cmd.currency)) fail('CURRENCY_INVALID'); doc.currency = cmd.currency; }
      break;
    }
    case 'ADD_SECTION': {
      if (!ID.test(cmd.sectionId) || doc.sections[cmd.sectionId]) fail('SECTION_ID_INVALID');
      if (cmd.parentId != null) { const p = sec(doc, cmd.parentId); if (p.parentId != null) fail('SECTION_DEPTH_LIMIT'); p.children.push(cmd.sectionId); }
      else doc.rootOrder.push(cmd.sectionId);
      doc.sections[cmd.sectionId] = { id: cmd.sectionId, name: name(cmd.name, 'SECTION_NAME_REQUIRED'), parentId: cmd.parentId, children: [], items: [] };
      break;
    }
    case 'RENAME_SECTION': sec(doc, cmd.sectionId).name = name(cmd.name, 'SECTION_NAME_REQUIRED'); break;
    case 'REMOVE_SECTION': {
      const s = sec(doc, cmd.sectionId);
      if (s.items.length || s.children.length) fail('SECTION_NOT_EMPTY');
      if (s.parentId) { const p = sec(doc, s.parentId); p.children = p.children.filter(x => x !== s.id); }
      else doc.rootOrder = doc.rootOrder.filter(x => x !== s.id);
      delete doc.sections[s.id];
      break;
    }
    case 'ADD_OCCURRENCE': {
      if (!ID.test(cmd.occurrenceId) || doc.occurrences[cmd.occurrenceId]) fail('OCCURRENCE_ID_INVALID');
      const s = sec(doc, cmd.sectionId);
      if (!cmd.source?.workId || !cmd.source.code || !cmd.source.catalogRevision) fail('SOURCE_REQUIRED');
      if (!Array.isArray(cmd.recipe) || cmd.recipe.length > 1000) fail('RECIPE_LIMIT_REVIEW_REQUIRED');
      const seen = new Set<string>();
      for (const r of cmd.recipe) { if (seen.has(r.recipeId)) fail('RECIPE_DUPLICATE'); seen.add(r.recipeId); }
      s.items.push(cmd.occurrenceId);
      doc.occurrences[cmd.occurrenceId] = { id: cmd.occurrenceId, sectionId: s.id, source: clone(cmd.source),
        quantity: cmd.quantity == null || cmd.quantity === '' ? null : normDec(cmd.quantity, 'QUANTITY_INVALID'),
        basis: basisOf(cmd.basis), recipe: clone(cmd.recipe), overrides: {} };
      break;
    }
    case 'SET_QUANTITY': occ(doc, cmd.occurrenceId).quantity = cmd.quantity == null || cmd.quantity === '' ? null : normDec(cmd.quantity, 'QUANTITY_INVALID'); break;
    case 'SET_BASIS': occ(doc, cmd.occurrenceId).basis = basisOf(cmd.basis); break;
    case 'MOVE_OCCURRENCE': {
      const o = occ(doc, cmd.occurrenceId), from = sec(doc, o.sectionId), to = sec(doc, cmd.sectionId);
      from.items = from.items.filter(x => x !== o.id);
      const at = cmd.index == null ? to.items.length : cmd.index;
      if (!Number.isInteger(at) || at < 0 || at > to.items.length) fail('INDEX_INVALID');
      to.items.splice(at, 0, o.id); o.sectionId = to.id;
      break;
    }
    case 'REMOVE_OCCURRENCE': {
      const o = occ(doc, cmd.occurrenceId), s = sec(doc, o.sectionId);
      s.items = s.items.filter(x => x !== o.id); delete doc.occurrences[o.id];
      break;
    }
    case 'SET_PRICE': {
      const o = occ(doc, cmd.occurrenceId); recipeOf(o, cmd.recipeId);
      const ov = o.overrides[cmd.recipeId] ?? {};
      if (cmd.price == null) ov.price = null;
      else {
        if (!['CATALOG_CANDIDATE', 'CONTRACT_DRAFT', 'PROCUREMENT_ACTUAL', 'OPERATOR_MANUAL'].includes(cmd.price.basis)) fail('PRICE_BASIS_INVALID');
        ov.price = { value: normDec(cmd.price.value, 'PRICE_INVALID'), basis: cmd.price.basis,
          evidence: name(cmd.price.evidence, 'PRICE_EVIDENCE_REQUIRED'), sourcePriceId: cmd.price.sourcePriceId ?? null };
      }
      o.overrides[cmd.recipeId] = ov;
      break;
    }
    case 'SUBSTITUTE_RESOURCE': {
      const o = occ(doc, cmd.occurrenceId); recipeOf(o, cmd.recipeId);
      const ov = o.overrides[cmd.recipeId] ?? {};
      if (cmd.substitution == null) ov.substitution = null;
      else {
        const s = cmd.substitution;
        if (!s.resource?.id) fail('SUBSTITUTE_RESOURCE_REQUIRED');
        const conversion = normDec(s.conversion, 'CONVERSION_INVALID');
        if (conversion === '0') fail('CONVERSION_INVALID');
        if (conversion !== '1' && !(s.conversionEvidence ?? '').trim()) fail('CONVERSION_EVIDENCE_REQUIRED');
        ov.substitution = { resource: clone(s.resource), reason: name(s.reason, 'SUBSTITUTION_REASON_REQUIRED'), conversion,
          conversionEvidence: s.conversionEvidence?.trim() || null,
          normOverride: s.normOverride ? { value: normDec(s.normOverride.value, 'NORM_INVALID'), evidence: name(s.normOverride.evidence, 'NORM_EVIDENCE_REQUIRED') } : null };
        // A price chosen for the original resource does not carry over to a different resource.
        ov.price = null;
      }
      o.overrides[cmd.recipeId] = ov;
      break;
    }
    default: fail('COMMAND_INVALID');
  }
  doc.edits = input.edits + 1;
  return doc;
}

/** Undo/redo history over immutable documents; failed commands do not enter history. */
export type History = { past: EstimateDoc[]; present: EstimateDoc; future: EstimateDoc[] };
const LIMIT = 100;
export const historyOf = (doc: EstimateDoc): History => ({ past: [], present: doc, future: [] });
export function dispatch(h: History, cmd: StudioCommand): History {
  const next = applyCommand(h.present, cmd);
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
