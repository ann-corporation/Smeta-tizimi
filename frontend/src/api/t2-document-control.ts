/**
 * t2-document-control.ts — canonical SMETA/F2/NAKOPITELNIY document-control client.
 * Reads /api/hujjat-nazorat -> Supabase (t2_workbench_v1, t2_nakopitelniy_v1,
 * t2_obyekt_yakunlash_v1, t2_smeta_ozgarish_*_v1, t2_forma3_*_v1). No Drive/Sheets/GAS.
 *
 * The SQL read model is generic; this module normalizes it to the pure-engine
 * contract in src/lib/construction-document-control (Codex-owned types) — mapping
 * requirement/document types and dropping SQL nulls from optional CertifiedLine
 * fields so "price unknown" stays unknown rather than collapsing to 0.
 */
import { useQuery } from '@tanstack/react-query';
import {
  calculateProgressValuation,
  type ConstructionDocumentControlReadModel,
  type DocumentType,
  type ProgressValuationPage,
} from '../lib/construction-document-control';
import type {
  ChangeControlCommandPort,
  ConstructionDocumentControlPort,
  ProgressValuationReadPort,
  ProjectCloseoutPort,
} from '../lib/construction-document-control/ports';

export type DocControlError = Error & { code?: string };
const toErr = (j: any, status: number): DocControlError => {
  const e = new Error((j && (j.xato || j.code)) || 'HTTP ' + status) as DocControlError;
  e.code = (j && j.code) || 'HTTP_' + status;
  return e;
};

async function get(params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  const r = await fetch('/api/hujjat-nazorat?' + q.toString());
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return j;
}
async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/hujjat-nazorat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return j;
}

// ── type normalization: SQL read-model vocabulary -> pure-engine contract ──
const DOC_TYPE: Record<string, DocumentType> = {
  contract: 'contract', f2: 'f2', fakt: 'act', act: 'act', aosr: 'aosr',
  invoice: 'invoice', handover: 'handover', change_evidence: 'change_evidence',
  nakopitelniy: 'cumulative_statement', cumulative_statement: 'cumulative_statement',
  forma3: 'payment_certification', payment_certification: 'payment_certification',
};
const mapDocType = (t: string): DocumentType => DOC_TYPE[t] ?? 'act';
const mapRule = (r: string | null | undefined) =>
  r === 'forma3_unresolved' || r === 'payment_rule_unresolved' ? 'payment_rule_unresolved'
    : r === 'verified' ? 'verified' : undefined;

const dropNulls = <T extends Record<string, any>>(o: T): T => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out as T;
};
const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Raw t2_workbench_v1 jsonb -> ConstructionDocumentControlReadModel. */
export function normalizeWorkbench(raw: any): ConstructionDocumentControlReadModel {
  const v = raw.valuation ?? {};
  return {
    projectId: String(raw.projectId ?? ''),
    objectId: String(raw.objectId ?? ''),
    projectName: raw.projectName ?? '',
    objectName: raw.objectName ?? '',
    contractId: raw.contractId != null ? String(raw.contractId) : undefined,
    currentPeriodId: raw.currentPeriodId ?? undefined,
    valuation: {
      projectId: String(v.projectId ?? raw.projectId ?? ''),
      objectId: String(v.objectId ?? raw.objectId ?? ''),
      estimateRevisionId: String(v.estimateRevisionId ?? 'rev-0'),
      currency: v.currency ?? 'UZS',
      throughPeriod: Number(v.throughPeriod ?? 0),
      lines: (v.lines ?? []).map((l: any) => ({
        lineId: String(l.lineId), sectionId: String(l.sectionId ?? 'root'),
        description: l.description ?? '', unit: l.unit ?? '',
        baselineQuantity: nullableNumber(l.baselineQuantity),
        baselineReferencePrice: nullableNumber(l.baselineReferencePrice),
      })),
      changes: (v.changes ?? []).map((c: any) => ({
        changeId: String(c.changeId), kind: c.kind, status: c.status,
        lineId: String(c.lineId ?? 'na'), revisionId: String(c.revisionId ?? 'rev-pending'),
        effectivePeriodIndex: Number(c.effectivePeriodIndex ?? 0),
        quantityDelta: Number(c.quantityDelta ?? 0),
        reason: c.reason ?? '', evidenceIds: c.evidenceIds ?? [],
        actorId: c.actorId != null ? String(c.actorId) : undefined,
      })),
      periods: (v.periods ?? []).map((p: any) => ({
        periodId: String(p.periodId), label: p.label ?? String(p.periodId),
        revisionId: String(p.revisionId ?? 'rev-0'), frozen: true as const,
        documentIds: p.documentIds ?? [],
        lines: (p.lines ?? []).map((x: any) => dropNulls({
          lineId: String(x.lineId), quantity: Number(x.quantity ?? 0),
          certifiedAmount: x.certifiedAmount, f2ValuationPrice: x.f2ValuationPrice, actualProcurementPrice: x.actualProcurementPrice,
          referencePriceSourceId: x.referencePriceSourceId, actualPriceSourceId: x.actualPriceSourceId,
        })),
      })),
    },
    requirements: (raw.requirements ?? []).map((t: any) => ({
      requirementId: String(t.requirementId), type: mapDocType(t.type), label: t.label ?? t.type,
      required: !!t.required, requiresApproved: !!t.requiresApproved, rule: mapRule(t.evidenceRule ?? t.rule),
    })),
    documents: (raw.documents ?? []).map((d: any) => dropNulls({
      documentId: String(d.documentId), objectId: String(d.objectId ?? raw.objectId),
      type: mapDocType(d.type), status: d.status,
      periodId: d.periodId, revisionId: d.revisionId, evidenceIds: d.evidenceIds,
    })),
    revisions: (raw.revisions ?? []).map((r: any) => ({
      revisionId: String(r.revisionId), kind: r.kind, status: r.status,
      actorId: r.actorId != null ? String(r.actorId) : undefined, occurredAt: r.occurredAt,
      reason: r.reason ?? '', evidenceIds: r.evidenceIds ?? [], immutable: r.immutable !== false,
    })),
  };
}

export async function hujjatNazoratModelOl(input: { obyektId: number; davr?: string | null; limit?: number }): Promise<ConstructionDocumentControlReadModel> {
  const raw = await get({ amal: 'workbench', obyekt_id: input.obyektId, davr: input.davr, limit: input.limit });
  return normalizeWorkbench(raw);
}

/** Deterministic page: calculation source and workspace source are the same result. */
export function progressValuationPage(
  model: ConstructionDocumentControlReadModel,
  q: { offset?: number; limit?: number; search?: string; sectionId?: string } = {},
): ProgressValuationPage {
  // An object without an approved F2 period is a valid empty state.  The SQL
  // contract keeps throughPeriod at 0 for JSON shape stability, but there is
  // no period for the pure engine to evaluate yet.
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.max(1, q.limit ?? 200);
  if (model.valuation.periods.length === 0) {
    return { rows: [], totalCount: 0, query: { offset, limit, search: q.search, sectionId: q.sectionId } };
  }
  const rows = calculateProgressValuation(model.valuation).rows;
  let filtered = rows;
  if (q.search) { const s = q.search.toLowerCase(); filtered = filtered.filter(r => r.description.toLowerCase().includes(s)); }
  if (q.sectionId) filtered = filtered.filter(r => r.sectionId === q.sectionId);
  return { rows: filtered.slice(offset, offset + limit), totalCount: filtered.length, query: { offset, limit, search: q.search, sectionId: q.sectionId } };
}

export function useHujjatNazoratModel(obyektId: number | null | undefined, davr?: string | null) {
  return useQuery({
    queryKey: ['hujjatNazorat', obyektId, davr ?? null],
    queryFn: () => hujjatNazoratModelOl({ obyektId: obyektId!, davr }),
    enabled: !!obyektId,
    staleTime: 30_000,
    retry: (n, e: any) => e?.code !== 'AUTH_REQUIRED' && e?.code !== 'HTTP_403' && n < 2,
  });
}

// ── raw read models (list views / drill-down) ──
export const nakopitelniyOl = (obyektId: number, davr?: string | null) => get({ amal: 'nakopitelniy', obyekt_id: obyektId, davr });
export const closeoutOl = (obyektId: number) => get({ amal: 'closeout', obyekt_id: obyektId });
export const ozgarishRoyxatOl = (obyektId: number, limit = 200) => get({ amal: 'ozgarish-royxat', obyekt_id: obyektId, limit });
export const forma3RoyxatOl = (p: { obyektId?: number; loyihaId?: number }) => get({ amal: 'forma3-royxat', obyekt_id: p.obyektId, loyiha_id: p.loyihaId });

// ── canonical port bindings (used by the generic workbench) ──
export const constructionDocumentControlPort: ConstructionDocumentControlPort = {
  read: ({ objectId, periodId }) => hujjatNazoratModelOl({ obyektId: Number(objectId), davr: periodId ?? null }),
};
export const progressValuationReadPort: ProgressValuationReadPort = {
  page: async ({ objectId, periodId, offset, limit, search, sectionId }) =>
    progressValuationPage(await hujjatNazoratModelOl({ obyektId: Number(objectId), davr: periodId ?? null }),
      { offset, limit, search, sectionId }),
};
export const projectCloseoutPort: ProjectCloseoutPort = {
  read: async ({ objectId }) => {
    const m = await hujjatNazoratModelOl({ obyektId: Number(objectId) });
    return { requirements: m.requirements, documents: m.documents };
  },
};
export const changeControlCommandPort: ChangeControlCommandPort = {
  create: async ({ objectId, operationId, change }) => {
    const j = await post({
      amal: 'ozgarish-yarat', obyekt_id: Number(objectId), operation_id: operationId,
      tur: change.kind, kind: change.kind, sabab: change.reason,
      effective_oy: null, evidence_izoh: change.reason,
      qatorlar: [{ qator_id: change.lineId, amal: 'hajm', yangi_hajm: change.quantityDelta }],
    });
    return { changeId: String(j.ozgarish_id), version: 1 };
  },
  decide: async ({ changeId, operationId, expectedVersion, decision, reason }) => {
    const j = decision === 'approved'
      ? await post({ amal: 'ozgarish-tasdiqlash', ozgarish_id: Number(changeId), operation_id: operationId, kutilgan_versiya: expectedVersion })
      : await post({ amal: 'ozgarish-qaytar', ozgarish_id: Number(changeId), operation_id: operationId, sabab: reason });
    return { version: Number(j.versiya ?? j.revision_seq ?? expectedVersion + 1) };
  },
};

export const forma3Yarat = (p: { obyektId: number; loyihaId?: number | null; aktIds: number[]; davrBoshi: string; davrOxiri: string; raqam?: string; operationId?: string }) =>
  post({ amal: 'forma3-yarat', obyekt_id: p.obyektId, loyiha_id: p.loyihaId ?? null, akt_ids: p.aktIds, davr_boshi: p.davrBoshi, davr_oxiri: p.davrOxiri, raqam: p.raqam, operation_id: p.operationId });
export const forma3QoidaBelgila = (p: { forma3Id: number; qoidaManba: string; operationId?: string }) =>
  post({ amal: 'forma3-qoida', forma3_id: p.forma3Id, qoida_manba: p.qoidaManba, operation_id: p.operationId });

// ── Ostatka istisnolari (egasi 2026-09-25: "smetada qilinmagan ishlar yoki
// bekor qilingan ishlar bo'lishi mumkin — bunga ham yechim bo'lishi kerak").
// Yangi jadval yo'q: kanonik o'zgartirish nazorati (t2_smeta_ozgarish,
// tur='olib_tashlash') — qoralama → tasdiq, audit, revision. Tasdiqlanganda
// t2_qator.hajm yangi hajmga tushadi (to'liq: 0, qolgan qismi: fakt).
export type OstatkaIstisnoQator = { qatorId: number; yangiHajm: number };
export async function ostatkaIstisnoYarat(p: {
  obyektId: number; qatorlar: OstatkaIstisnoQator[]; sabab: string; asos?: string | null; raqam?: string | null; operationId: string;
}): Promise<{ ozgarishId: number }> {
  const toliq = p.qatorlar.every((q) => q.yangiHajm === 0);
  const j = await post({
    amal: 'ozgarish-yarat', obyekt_id: p.obyektId, operation_id: p.operationId,
    tur: 'olib_tashlash', kind: toliq ? 'removed_work' : 'quantity_decrease',
    sabab: p.sabab, raqam: p.raqam || null, evidence_izoh: p.asos || null,
    qatorlar: p.qatorlar.map((q) => (q.yangiHajm === 0
      ? { qator_id: q.qatorId, amal: 'olib_tashlash', yangi_hajm: 0 }
      : { qator_id: q.qatorId, amal: 'hajm', yangi_hajm: q.yangiHajm })),
  });
  return { ozgarishId: Number(j.ozgarish_id) };
}
export const ozgarishTasdiqla = (p: { ozgarishId: number; versiya: number; operationId: string }) =>
  post({ amal: 'ozgarish-tasdiqlash', ozgarish_id: p.ozgarishId, kutilgan_versiya: p.versiya, operation_id: p.operationId });
export const ozgarishQaytar = (p: { ozgarishId: number; sabab: string; operationId: string }) =>
  post({ amal: 'ozgarish-qaytar', ozgarish_id: p.ozgarishId, sabab: p.sabab, operation_id: p.operationId });
