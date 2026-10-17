/**
 * Pure command reducer. The manual editor, undo/redo and the chat assistant all mutate the
 * draft only through `applyCommand`; invalid commands throw a stable error code and leave
 * the previous document untouched.
 */
import { normDec, type EstimateContext, type EstimateDoc, type EstimateRates, type Occurrence, type PriceChoice, type PriceJustification, type RecipeSnapshot,
  type Section, type Substitution, type UnitBasis, type WorkCoefficient, type WorkSource } from './model';

const DOC_TYPES = ['CATALOG', 'EXCHANGE', 'PRICE_LIST', 'COMMERCIAL_OFFER', 'COMPANY_ESTIMATE', 'LABOUR_HOUR', 'MACHINE_HOUR', 'MANUAL', 'INTERNET'];
const matn = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
/** A justification is optional for old drafts, but when present it must name its document type and document. */
export function justificationOf(j: PriceJustification | null | undefined): PriceJustification | null {
  if (j == null) return null;
  if (!DOC_TYPES.includes(j.docType)) throw new Error('PRICE_JUSTIFICATION_INVALID');
  const document = matn(j.document, 400);
  if (!document) throw new Error('PRICE_JUSTIFICATION_INVALID');
  const c = j.conversion;
  const conversion = c ? { formula: matn(c.formula, 120) ?? '', factor: normDec(String(c.factor), 'PRICE_JUSTIFICATION_INVALID'), note: matn(c.note, 300) ?? '' } : null;
  if (conversion && (!conversion.formula || conversion.factor === '0')) throw new Error('PRICE_JUSTIFICATION_INVALID');
  const dec = (v: unknown) => normDec(String(v), 'PRICE_JUSTIFICATION_INVALID');
  const a = j.average;
  const offers = a ? (Array.isArray(a.offers) ? a.offers : []).slice(0, 30).map(x => ({ supplier: matn(x?.supplier, 120) ?? '—', code: matn(x?.code, 40), price: dec(x?.price) })) : [];
  // An average must list at least two offers it was computed from.
  if (a && (offers.length < 2 || a.count !== offers.length)) throw new Error('PRICE_JUSTIFICATION_INVALID');
  // Web sources: https links only; an INTERNET price must name at least one page.
  const sources = (Array.isArray(j.sources) ? j.sources : []).slice(0, 10).map(x => {
    const url = matn(x?.url, 600);
    if (!url || !/^https:\/\/[^\s]+$/i.test(url)) throw new Error('PRICE_JUSTIFICATION_INVALID');
    return { url, name: matn(x?.name, 160) ?? '—', price: dec(x?.price), unit: matn(x?.unit, 30), vat: typeof x?.vat === 'boolean' ? x.vat : null };
  });
  if (j.docType === 'INTERNET' && !sources.length) throw new Error('PRICE_JUSTIFICATION_INVALID');
  return { docType: j.docType, document, sourceName: matn(j.sourceName, 400), sourceUnit: matn(j.sourceUnit, 30),
    sourcePrice: j.sourcePrice == null ? null : normDec(String(j.sourcePrice), 'PRICE_JUSTIFICATION_INVALID'), conversion, reason: matn(j.reason, 400),
    ...(a ? { average: { count: offers.length, min: dec(a.min), max: dec(a.max), offers } } : {}), ...(sources.length ? { sources } : {}) };
}

export type StudioCommand =
  | { type: 'SET_CONTEXT'; context: Partial<EstimateContext>; currency?: string }
  | { type: 'ADD_SECTION'; sectionId: string; parentId: string | null; name: string }
  | { type: 'RENAME_SECTION'; sectionId: string; name: string }
  | { type: 'MOVE_SECTION'; sectionId: string; parentId: string | null; index?: number }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'ADD_OCCURRENCE'; occurrenceId: string; sectionId: string; source: WorkSource; recipe: RecipeSnapshot[]; quantity: string | null; basis: UnitBasis; material?: string | null; minus?: boolean }
  | { type: 'SET_MATERIAL'; occurrenceId: string; material: string | null }
  /** Markup category of one resource line (null = automatic). */
  | { type: 'SET_RESOURCE_KAT'; occurrenceId: string; recipeId: string; kat: string | null }
  /** «добавлять» (plus, default) or «исключать» (minus) position. */
  | { type: 'SET_SIGN'; occurrenceId: string; minus: boolean }
  | { type: 'SET_QUANTITY'; occurrenceId: string; quantity: string | null }
  | { type: 'SET_BASIS'; occurrenceId: string; basis: UnitBasis }
  | { type: 'MOVE_OCCURRENCE'; occurrenceId: string; sectionId: string; index?: number }
  | { type: 'REMOVE_OCCURRENCE'; occurrenceId: string }
  | { type: 'SET_PRICE'; occurrenceId: string; recipeId: string; price: PriceChoice | null }
  | { type: 'SUBSTITUTE_RESOURCE'; occurrenceId: string; recipeId: string; substitution: Substitution | null }
  | { type: 'SET_COEFFICIENTS'; occurrenceId: string; coefficients: WorkCoefficient[] }
  | { type: 'SET_RATES'; rates: EstimateRates | null }
  /** Several commands as ONE undo step (e.g. bulk catalogue pricing); all-or-nothing, no nesting. */
  | { type: 'BATCH'; label: string; commands: StudioCommand[] };

/** Object → razdel → podrazdel → … : real estimates nest deeper than two levels, but not unboundedly. */
export const MAX_SECTION_DEPTH = 12;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const fail = (code: string): never => { throw new Error(code); };
const name = (v: string, code: string) => { const s = String(v ?? '').trim(); if (!s || s.length > 300) fail(code); return s; };
const clone = <T,>(v: T): T => structuredClone(v);

import { NAKRUTKA_KATLAR } from '../nakrutka-podval';
import { podvalTekshir } from '../nakrutka-konstruktor';
const materialOf = (v: string | null | undefined) => { const s = String(v ?? '').trim(); return s ? s.slice(0, 300) : null; };
const COEF_SCOPES = ['ALL', 'ЧЕЛ', 'МАШ', 'ЧЕЛ+МАШ', 'МАТ'];
/** A coefficient needs a positive value (≤ 10), a known scope, a name and its normative basis. */
function coefficientOf(c: WorkCoefficient): WorkCoefficient {
  if (!ID.test(String(c?.id ?? ''))) fail('COEFFICIENT_INVALID');
  const value = normDec(c.value, 'COEFFICIENT_INVALID');
  if (c.origin !== 'NORM' && c.origin !== 'AI' && c.origin !== 'OPERATOR') fail('COEFFICIENT_INVALID');
  // Zero only from the normative reference (Кмр = 0: materials are not counted, e.g. dismantling).
  // ≤ 100: a size-change position multiplies by the difference (15 mm on a «per 1 mm» norm = 15).
  if ((value === '0' && !(c.origin === 'NORM' && c.scope === 'МАТ')) || Number(value) > 100) fail('COEFFICIENT_INVALID');
  if (!COEF_SCOPES.includes(c.scope)) fail('COEFFICIENT_INVALID');
  return { id: c.id, name: name(c.name, 'COEFFICIENT_NAME_REQUIRED'), value, scope: c.scope,
    evidence: name(c.evidence, 'COEFFICIENT_EVIDENCE_REQUIRED'), origin: c.origin, accepted: c.accepted === true };
}
/** Rates are percents 0..100 under known cascade codes; the source (company settings, operator) is mandatory. */
function ratesOf(r: EstimateRates | null): EstimateRates | null {
  if (r == null) return null;
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.values ?? {})) {
    if (!/^[A-ZА-ЯЁ_/]{2,40}$/.test(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) fail('RATE_INVALID');
    values[k] = v;
  }
  // A custom structure is kept only when it is valid (every row has a known base, no cycles, a final total).
  const podval = r.podval ? (podvalTekshir(r.podval).length ? fail('PODVAL_INVALID') : clone(r.podval)) : null;
  return { values, source: name(r.source, 'RATE_SOURCE_REQUIRED'), ...(podval ? { podval } : {}) };
}

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
      const mat = materialOf(cmd.material);
      if (mat) o.material = mat;
      if (cmd.minus) o.ishora = -1;
      w.sec(cmd.sectionId).items.push(cmd.occurrenceId);
      w.putOcc(o);
      break;
    }
    case 'SET_SIGN': {
      const o = w.occ(cmd.occurrenceId);
      if (cmd.minus) o.ishora = -1; else delete o.ishora;
      break;
    }
    case 'SET_RESOURCE_KAT': {
      const o = w.occ(cmd.occurrenceId);
      if (!o.recipe.some(r => r.recipeId === cmd.recipeId)) fail('RECIPE_NOT_FOUND');
      if (cmd.kat != null && !(NAKRUTKA_KATLAR as readonly string[]).includes(cmd.kat)) fail('KAT_INVALID');
      const ov = { ...(o.overrides[cmd.recipeId] ?? {}) };
      if (cmd.kat == null) delete ov.kat; else ov.kat = cmd.kat;
      o.overrides = { ...o.overrides, [cmd.recipeId]: ov };
      break;
    }
    case 'SET_MATERIAL': {
      const o = w.occ(cmd.occurrenceId);
      const mat = materialOf(cmd.material);
      if (mat) o.material = mat; else delete o.material;
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
      if (!prev.recipe.some(r => r.recipeId === cmd.recipeId)) fail('RECIPE_NOT_FOUND');
      const ov = { ...(prev.overrides[cmd.recipeId] ?? {}) };
      if (cmd.price == null) ov.price = null;
      else {
        if (!['CATALOG_CANDIDATE', 'CONTRACT_DRAFT', 'PROCUREMENT_ACTUAL', 'OPERATOR_MANUAL'].includes(cmd.price.basis)) fail('PRICE_BASIS_INVALID');
        ov.price = { value: normDec(cmd.price.value, 'PRICE_INVALID'), basis: cmd.price.basis,
          evidence: name(cmd.price.evidence, 'PRICE_EVIDENCE_REQUIRED'), sourcePriceId: cmd.price.sourcePriceId ?? null,
          ...(cmd.price.justification ? { justification: justificationOf(cmd.price.justification) } : {}) };
      }
      w.occ(cmd.occurrenceId).overrides[cmd.recipeId] = ov;
      break;
    }
    case 'SUBSTITUTE_RESOURCE': {
      const prev = w.readOcc(cmd.occurrenceId);
      if (!prev.recipe.some(r => r.recipeId === cmd.recipeId)) fail('RECIPE_NOT_FOUND');
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
    case 'SET_COEFFICIENTS': {
      if (!Array.isArray(cmd.coefficients) || cmd.coefficients.length > 20) fail('COEFFICIENT_INVALID');
      const list = cmd.coefficients.map(coefficientOf);
      if (new Set(list.map(c => c.id)).size !== list.length) fail('COEFFICIENT_INVALID');
      w.occ(cmd.occurrenceId).coefficients = list;
      break;
    }
    case 'SET_RATES': { doc.rates = ratesOf(cmd.rates); break; }
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
