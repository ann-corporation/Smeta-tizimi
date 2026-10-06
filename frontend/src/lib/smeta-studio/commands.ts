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
  | { type: 'MOVE_SECTION'; sectionId: string; parentId: string | null; index?: number }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'ADD_OCCURRENCE'; occurrenceId: string; sectionId: string; source: WorkSource; recipe: RecipeSnapshot[]; quantity: string | null; basis: UnitBasis }
  | { type: 'SET_QUANTITY'; occurrenceId: string; quantity: string | null }
  | { type: 'SET_BASIS'; occurrenceId: string; basis: UnitBasis }
  | { type: 'MOVE_OCCURRENCE'; occurrenceId: string; sectionId: string; index?: number }
  | { type: 'REMOVE_OCCURRENCE'; occurrenceId: string }
  | { type: 'SET_PRICE'; occurrenceId: string; recipeId: string; price: PriceChoice | null }
  | { type: 'SUBSTITUTE_RESOURCE'; occurrenceId: string; recipeId: string; substitution: Substitution | null }
  /** Several commands as ONE undo step (e.g. bulk catalogue pricing); all-or-nothing, no nesting. */
  | { type: 'BATCH'; label: string; commands: StudioCommand[] };

/** Object → razdel → podrazdel → … : real estimates nest deeper than two levels, but not unboundedly. */
export const MAX_SECTION_DEPTH = 12;

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

/**
 * Copy-on-write draft: only the touched sections/occurrences (and the maps holding them) are
 * copied. Untouched entities are shared with the previous document, so applying a command and
 * keeping undo history costs O(changed), not O(document) — 30k-row drafts stay responsive.
 * The input document is never mutated; a failing command simply discards the partial copy.
 */
function writer(input: EstimateDoc) {
  const doc: EstimateDoc = { ...input };
  let secMap = false, occMap = false, root = false;
  const wSec = new Set<string>(), wOcc = new Set<string>();
  const readSec = (id: string): Section => doc.sections[id] ?? fail('SECTION_NOT_FOUND');
  const readOcc = (id: string): Occurrence => doc.occurrences[id] ?? fail('OCCURRENCE_NOT_FOUND');
  return {
    doc, readSec, readOcc,
    sec(id: string): Section {
      const s = readSec(id);
      if (wSec.has(id)) return s;
      if (!secMap) { doc.sections = { ...doc.sections }; secMap = true; }
      const c = { ...s, children: [...s.children], items: [...s.items] };
      doc.sections[id] = c; wSec.add(id);
      return c;
    },
    occ(id: string): Occurrence {
      const o = readOcc(id);
      if (wOcc.has(id)) return o;
      if (!occMap) { doc.occurrences = { ...doc.occurrences }; occMap = true; }
      const c = { ...o, overrides: { ...o.overrides } };
      doc.occurrences[id] = c; wOcc.add(id);
      return c;
    },
    rootOrder(): string[] { if (!root) { doc.rootOrder = [...doc.rootOrder]; root = true; } return doc.rootOrder; },
    putSec(s: Section) { if (!secMap) { doc.sections = { ...doc.sections }; secMap = true; } doc.sections[s.id] = s; wSec.add(s.id); },
    dropSec(id: string) { if (!secMap) { doc.sections = { ...doc.sections }; secMap = true; } delete doc.sections[id]; },
    putOcc(o: Occurrence) { if (!occMap) { doc.occurrences = { ...doc.occurrences }; occMap = true; } doc.occurrences[o.id] = o; wOcc.add(o.id); },
    dropOcc(id: string) { if (!occMap) { doc.occurrences = { ...doc.occurrences }; occMap = true; } delete doc.occurrences[id]; },
  };
}

/** 1 for a root section. Bounded walk: a corrupted parent chain fails instead of looping. */
function depthOf(doc: EstimateDoc, id: string | null): number {
  let d = 0;
  for (let cur = id; cur != null; cur = doc.sections[cur]?.parentId ?? null) {
    if (!doc.sections[cur] || ++d > MAX_SECTION_DEPTH + 1) fail('SECTION_TREE_INVALID');
  }
  return d;
}
/** Height of a subtree in levels (a leaf section = 1). Iterative; no recursion limit. */
function heightOf(doc: EstimateDoc, id: string): number {
  let h = 0;
  const stack: Array<[string, number]> = [[id, 1]];
  while (stack.length) {
    const [cur, lvl] = stack.pop()!;
    if (lvl > MAX_SECTION_DEPTH + 1) fail('SECTION_TREE_INVALID');
    h = Math.max(h, lvl);
    for (const c of doc.sections[cur]?.children ?? []) stack.push([c, lvl + 1]);
  }
  return h;
}
const insertAt = (arr: string[], id: string, index: number | undefined) => {
  const at = index == null ? arr.length : index;
  if (!Number.isInteger(at) || at < 0 || at > arr.length) fail('INDEX_INVALID');
  arr.splice(at, 0, id);
};

export function applyCommand(input: EstimateDoc, cmd: StudioCommand): EstimateDoc {
  if (cmd.type === 'BATCH') {
    if (!Array.isArray(cmd.commands) || !cmd.commands.length || cmd.commands.length > 50000) fail('BATCH_INVALID');
    let d = input;
    for (const c of cmd.commands) { if (c.type === 'BATCH') fail('BATCH_INVALID'); d = applyCommand(d, c); }
    return { ...d, edits: input.edits + 1 };
  }
  const w = writer(input), doc = w.doc;
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
      const nm = name(cmd.name, 'SECTION_NAME_REQUIRED');
      if (cmd.parentId != null) {
        if (depthOf(doc, cmd.parentId) >= MAX_SECTION_DEPTH) fail('SECTION_DEPTH_LIMIT');
        w.sec(cmd.parentId).children.push(cmd.sectionId);
      } else w.rootOrder().push(cmd.sectionId);
      w.putSec({ id: cmd.sectionId, name: nm, parentId: cmd.parentId, children: [], items: [] });
      break;
    }
    case 'RENAME_SECTION': { const nm = name(cmd.name, 'SECTION_NAME_REQUIRED'); w.sec(cmd.sectionId).name = nm; break; }
    case 'MOVE_SECTION': {
      const s = w.readSec(cmd.sectionId);
      if (cmd.parentId != null) {
        w.readSec(cmd.parentId);
        // A section cannot become its own descendant.
        for (let cur: string | null = cmd.parentId; cur != null; cur = doc.sections[cur]?.parentId ?? null) if (cur === s.id) fail('SECTION_CYCLE');
        if (depthOf(doc, cmd.parentId) + heightOf(doc, s.id) > MAX_SECTION_DEPTH) fail('SECTION_DEPTH_LIMIT');
      }
      if (s.parentId != null) { const p = w.sec(s.parentId); p.children = p.children.filter(x => x !== s.id); }
      else doc.rootOrder = w.rootOrder().filter(x => x !== s.id);
      if (cmd.parentId != null) insertAt(w.sec(cmd.parentId).children, s.id, cmd.index);
      else insertAt(w.rootOrder(), s.id, cmd.index);
      w.sec(s.id).parentId = cmd.parentId;
      break;
    }
    case 'REMOVE_SECTION': {
      const s = w.readSec(cmd.sectionId);
      if (s.items.length || s.children.length) fail('SECTION_NOT_EMPTY');
      if (s.parentId) { const p = w.sec(s.parentId); p.children = p.children.filter(x => x !== s.id); }
      else doc.rootOrder = w.rootOrder().filter(x => x !== s.id);
      w.dropSec(s.id);
      break;
    }
    case 'ADD_OCCURRENCE': {
      if (!ID.test(cmd.occurrenceId) || doc.occurrences[cmd.occurrenceId]) fail('OCCURRENCE_ID_INVALID');
      w.readSec(cmd.sectionId);
      if (!cmd.source?.workId || !cmd.source.code || !cmd.source.catalogRevision) fail('SOURCE_REQUIRED');
      if (!Array.isArray(cmd.recipe) || cmd.recipe.length > 1000) fail('RECIPE_LIMIT_REVIEW_REQUIRED');
      const seen = new Set<string>();
      for (const r of cmd.recipe) { if (seen.has(r.recipeId)) fail('RECIPE_DUPLICATE'); seen.add(r.recipeId); }
      const o: Occurrence = { id: cmd.occurrenceId, sectionId: cmd.sectionId, source: clone(cmd.source),
        quantity: cmd.quantity == null || cmd.quantity === '' ? null : normDec(cmd.quantity, 'QUANTITY_INVALID'),
        basis: basisOf(cmd.basis), recipe: clone(cmd.recipe), overrides: {} };
      w.sec(cmd.sectionId).items.push(cmd.occurrenceId);
      w.putOcc(o);
      break;
    }
    case 'SET_QUANTITY': {
      const q = cmd.quantity == null || cmd.quantity === '' ? null : normDec(cmd.quantity, 'QUANTITY_INVALID');
      w.occ(cmd.occurrenceId).quantity = q;
      break;
    }
    case 'SET_BASIS': { const b = basisOf(cmd.basis); w.occ(cmd.occurrenceId).basis = b; break; }
    case 'MOVE_OCCURRENCE': {
      const o = w.readOcc(cmd.occurrenceId); w.readSec(cmd.sectionId);
      const from = w.sec(o.sectionId);
      from.items = from.items.filter(x => x !== o.id);
      insertAt(w.sec(cmd.sectionId).items, o.id, cmd.index);
      w.occ(o.id).sectionId = cmd.sectionId;
      break;
    }
    case 'REMOVE_OCCURRENCE': {
      const o = w.readOcc(cmd.occurrenceId), s = w.sec(o.sectionId);
      s.items = s.items.filter(x => x !== o.id); w.dropOcc(o.id);
      break;
    }
    case 'SET_PRICE': {
      const prev = w.readOcc(cmd.occurrenceId);
      prev.recipe.find(r => r.recipeId === cmd.recipeId) ?? fail('RECIPE_NOT_FOUND');
      const ov = { ...(prev.overrides[cmd.recipeId] ?? {}) };
      if (cmd.price == null) ov.price = null;
      else {
        if (!['CATALOG_CANDIDATE', 'CONTRACT_DRAFT', 'PROCUREMENT_ACTUAL', 'OPERATOR_MANUAL'].includes(cmd.price.basis)) fail('PRICE_BASIS_INVALID');
        ov.price = { value: normDec(cmd.price.value, 'PRICE_INVALID'), basis: cmd.price.basis,
          evidence: name(cmd.price.evidence, 'PRICE_EVIDENCE_REQUIRED'), sourcePriceId: cmd.price.sourcePriceId ?? null };
      }
      w.occ(cmd.occurrenceId).overrides[cmd.recipeId] = ov;
      break;
    }
    case 'SUBSTITUTE_RESOURCE': {
      const prev = w.readOcc(cmd.occurrenceId);
      prev.recipe.find(r => r.recipeId === cmd.recipeId) ?? fail('RECIPE_NOT_FOUND');
      const ov = { ...(prev.overrides[cmd.recipeId] ?? {}) };
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
      w.occ(cmd.occurrenceId).overrides[cmd.recipeId] = ov;
      break;
    }
    default: fail('COMMAND_INVALID');
  }
  doc.edits = input.edits + 1;
  return doc;
}

/** Undo/redo history over immutable documents; failed commands do not enter history. */
export type History = { past: EstimateDoc[]; present: EstimateDoc; future: EstimateDoc[] };
/** Documents share untouched sections/occurrences (copy-on-write); only the id maps are re-spread per step. */
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
