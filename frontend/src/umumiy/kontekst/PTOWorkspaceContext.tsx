import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useKompaniya } from './KompaniyaKontekst';
import { sbT2ObyektlarOlKomp, sbT2AktReestrOl, type T2AktReestr, type T2Obyekt } from '../../api/supabase';
import { sbT2LoyihalarOl, type Loyiha } from '../../api/t2-loyiha';
import { hujjatRoyxatOl, type DocRegistry } from '../../api/t2-hujjat-canonical';
import type { CenterDocument } from '../../components/document-center';

/**
 * PTO uchun yagona tenant scope.
 *
 * Company konteksti yetarli emas: bir kompaniyada bir nechta loyiha, obyekt,
 * davr va hujjat revision'lari bo'lishi mumkin. Shu provider barcha PTO
 * route'larida bir xil scope'ni beradi va scope URL'da saqlangani uchun deep
 * link/refresh paytida ham qayta tiklanadi.
 */
export type PtoScope = {
  projectId: number | null;
  objectId: number | null;
  periodId: string | null;
  sourceDocumentId: string | null;
  revisionId: string | null;
};

export type PtoPeriod = {
  id: string;
  label: string;
  aktId: number;
  objectId: number;
  status: string | null;
  sourceDocumentId: string | null;
  createdAt: string | null;
};

export type PtoRevision = {
  id: string;
  documentId: string;
  sequence: number;
  label: string;
};

type LoadingState = {
  hierarchy: boolean;
  periods: boolean;
  documents: boolean;
};

type PtoWorkspaceValue = {
  isProvider: boolean;
  companyId: number | null;
  scope: PtoScope;
  projects: Loyiha[];
  objects: T2Obyekt[];
  periods: PtoPeriod[];
  sourceDocuments: CenterDocument[];
  revisions: PtoRevision[];
  loading: LoadingState;
  error: string | null;
  setProjectId: (id: number | null) => void;
  setObjectId: (id: number | null) => void;
  setPeriodId: (id: string | null) => void;
  setSourceDocumentId: (id: string | null) => void;
  setRevisionId: (id: string | null) => void;
  clearScope: () => void;
  refresh: () => void;
};

const SCOPE_PARAMS = {
  projectId: ['loyiha', 'loyiha_id'],
  objectId: ['obyekt', 'obyekt_id'],
  periodId: ['davr', 'oy', 'period'],
  sourceDocumentId: ['hujjat', 'source_document', 'source_document_id'],
  revisionId: ['revision', 'rev'],
} as const;

const EMPTY_SCOPE: PtoScope = {
  projectId: null,
  objectId: null,
  periodId: null,
  sourceDocumentId: null,
  revisionId: null,
};

const PTO_ROUTE_PREFIXES = [
  '/admin/holat',
  '/admin/f2',
  '/admin/f2-tayyorlash',
  '/admin/f2-tarix',
  '/admin/fakt',
  '/admin/hujjat-nazorat',
  '/admin/nakopitelniy',
  '/admin/narxlar',
  '/admin/smeta-narxlash',
  '/admin/documents',
  '/admin/hujjatlar',
  '/admin/smeta',
];

export function isPtoRoute(pathname: string): boolean {
  return PTO_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export function parsePtoPositiveId(value: string | null): number | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function firstParam(params: URLSearchParams, names: readonly string[]): string | null {
  for (const name of names) {
    const value = params.get(name);
    if (value != null && value !== '') return value;
  }
  return null;
}

export function readPtoScope(params: URLSearchParams): PtoScope {
  return {
    projectId: parsePtoPositiveId(firstParam(params, SCOPE_PARAMS.projectId)),
    objectId: parsePtoPositiveId(firstParam(params, SCOPE_PARAMS.objectId)),
    periodId: firstParam(params, SCOPE_PARAMS.periodId),
    sourceDocumentId: firstParam(params, SCOPE_PARAMS.sourceDocumentId),
    revisionId: firstParam(params, SCOPE_PARAMS.revisionId),
  };
}

export function periodKey(oy: string | null | undefined): string | null {
  if (oy == null || oy.trim() === '') return null;
  const value = oy.trim();
  // Keep unknown/non-standard values visible rather than coercing them to a
  // fabricated month or zero. Standard date/month values get a stable key.
  const match = /^(\d{4}-\d{2})(?:-\d{2})?/.exec(value);
  return match ? match[1] : value;
}

export function periodsFromAktRows(rows: T2AktReestr[], objectId: number): PtoPeriod[] {
  const unique = new Map<string, PtoPeriod>();
  for (const row of rows) {
    if (row.obyekt_id !== objectId) continue;
    const id = periodKey(row.oy);
    if (!id || unique.has(id)) continue;
    unique.set(id, {
      id,
      label: id,
      aktId: row.id,
      objectId: row.obyekt_id,
      status: row.holat ?? null,
      sourceDocumentId: row.fayl_id ?? null,
      createdAt: row.yaratildi ?? null,
    });
  }
  return [...unique.values()].sort((a, b) => b.id.localeCompare(a.id));
}

export function revisionsFromDocuments(documents: CenterDocument[]): PtoRevision[] {
  return documents
    .map((document) => ({
      id: `${document.id}:r${document.revision}`,
      documentId: document.id,
      sequence: document.revision,
      label: `r${document.revision} · ${document.filename}`,
    }))
    .sort((a, b) => b.sequence - a.sequence || a.documentId.localeCompare(b.documentId));
}

const PTO_FALLBACK: PtoWorkspaceValue = {
  isProvider: false,
  companyId: null,
  scope: EMPTY_SCOPE,
  projects: [],
  objects: [],
  periods: [],
  sourceDocuments: [],
  revisions: [],
  loading: { hierarchy: false, periods: false, documents: false },
  error: null,
  setProjectId: () => undefined,
  setObjectId: () => undefined,
  setPeriodId: () => undefined,
  setSourceDocumentId: () => undefined,
  setRevisionId: () => undefined,
  clearScope: () => undefined,
  refresh: () => undefined,
};

const PtoWorkspaceContext = createContext<PtoWorkspaceValue>(PTO_FALLBACK);

function withoutScopeAliases(params: URLSearchParams) {
  Object.values(SCOPE_PARAMS).flat().forEach((name) => params.delete(name));
}

function scopeWithOnlyProject(scope: PtoScope, projectId: number | null): PtoScope {
  return { ...scope, projectId, objectId: null, periodId: null, sourceDocumentId: null, revisionId: null };
}

export function PTOWorkspaceProvider({ children }: { children: ReactNode }) {
  const kompaniya = useKompaniya();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = kompaniya.globalRejim ? null : kompaniya.joriyId;
  const [scope, setScope] = useState<PtoScope>(() => readPtoScope(searchParams));
  const [projects, setProjects] = useState<Loyiha[]>([]);
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [periods, setPeriods] = useState<PtoPeriod[]>([]);
  const [sourceDocuments, setSourceDocuments] = useState<CenterDocument[]>([]);
  const [loading, setLoading] = useState<LoadingState>({ hierarchy: false, periods: false, documents: false });
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  /** Iyerarxiya qaysi kompaniya uchun HAQIQATAN yuklangan — undan oldin URL dagi obyekt tekshirilmaydi
   *  (egasi 2026-09-29: ?obyekt=78 bo'sh ro'yxatda 'topilmadi' deb o'chib ketardi). */
  const [yuklanganKompaniya, setYuklanganKompaniya] = useState<number | null>(null);
  const readyCompany = useRef<number | null>(null);

  const writeScope = useCallback((next: PtoScope) => {
    setScope(next);
    const params = new URLSearchParams(searchParams);
    withoutScopeAliases(params);
    if (next.projectId != null) params.set('loyiha', String(next.projectId));
    if (next.objectId != null) params.set('obyekt', String(next.objectId));
    if (next.periodId != null) params.set('davr', next.periodId);
    if (next.sourceDocumentId != null) params.set('hujjat', next.sourceDocumentId);
    if (next.revisionId != null) params.set('revision', next.revisionId);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // Route navigation without scope params should not silently discard the
  // current tenant/project/object selection. Direct links with params remain
  // authoritative and replace the in-memory selection.
  useEffect(() => {
    const parsed = readPtoScope(searchParams);
    const hasScopeParam = Object.values(SCOPE_PARAMS).some((names) => names.some((name) => searchParams.has(name)));
    if (hasScopeParam) setScope(parsed);
  }, [location.pathname, location.search, searchParams]);

  // Company switch is a hard security boundary. Do not allow any downstream
  // identifier from the previous tenant to survive it.
  useEffect(() => {
    if (kompaniya.yuklanmoqda) return;
    if (readyCompany.current !== null && readyCompany.current !== companyId) {
      writeScope(EMPTY_SCOPE);
      setProjects([]);
      setObjects([]);
      setPeriods([]);
      setSourceDocuments([]);
      setError(null);
    }
    readyCompany.current = companyId;
  }, [companyId, kompaniya.yuklanmoqda, writeScope]);

  useEffect(() => {
    if (companyId == null) {
      setProjects([]);
      setObjects([]);
      setLoading((old) => ({ ...old, hierarchy: false }));
      return;
    }
    let alive = true;
    setLoading((old) => ({ ...old, hierarchy: true }));
    Promise.all([sbT2LoyihalarOl(companyId), sbT2ObyektlarOlKomp(companyId)])
      .then(([projectResult, objectResult]) => {
        if (!alive) return;
        if (!projectResult.ok || !objectResult.ok) {
          setError(projectResult.error || objectResult.error || 'PTO iyerarxiyasini yuklab bo‘lmadi.');
          setProjects([]);
          setObjects([]);
          return;
        }
        setProjects((projectResult.qatorlar ?? []).filter((row) => row.kompaniya_id === companyId));
        setObjects((objectResult.qatorlar ?? []).filter((row) => row.kompaniya_id === companyId));
        setYuklanganKompaniya(companyId);
      })
      .catch(() => {
        if (alive) setError('PTO iyerarxiyasini yuklab bo‘lmadi.');
      })
      .finally(() => { if (alive) setLoading((old) => ({ ...old, hierarchy: false })); });
    return () => { alive = false; };
  }, [companyId, refreshToken]);

  // URL IDs are accepted only after server lists prove they belong to the
  // active company/project. An invalid deep link is cleared, never guessed.
  useEffect(() => {
    if (companyId == null || loading.hierarchy || yuklanganKompaniya !== companyId) return;
    const project = scope.projectId == null ? null : projects.find((row) => row.id === scope.projectId && row.kompaniya_id === companyId);
    const object = scope.objectId == null ? null : objects.find((row) => row.id === scope.objectId && row.kompaniya_id === companyId);
    const projectId = project?.id ?? null;
    const objectId = object && (projectId == null || object.loyiha_id === projectId) ? object.id : null;
    const next: PtoScope = {
      ...scope,
      projectId,
      objectId,
      periodId: objectId === scope.objectId ? scope.periodId : null,
      sourceDocumentId: objectId === scope.objectId ? scope.sourceDocumentId : null,
      revisionId: objectId === scope.objectId ? scope.revisionId : null,
    };
    if (JSON.stringify(next) !== JSON.stringify(scope)) writeScope(next);
  }, [companyId, loading.hierarchy, objects, projects, scope, writeScope, yuklanganKompaniya]);

  useEffect(() => {
    if (companyId == null || scope.objectId == null) {
      setPeriods([]);
      setSourceDocuments([]);
      setLoading((old) => ({ ...old, periods: false, documents: false }));
      return;
    }
    let alive = true;
    const objectId = scope.objectId;
    setLoading((old) => ({ ...old, periods: true, documents: true }));
    Promise.all([
      sbT2AktReestrOl(objectId),
      hujjatRoyxatOl({ kompaniyaId: companyId, loyihaId: scope.projectId, obyektId: objectId, limit: 500 }),
    ])
      .then(([periodResult, documentResult]: [{ ok: boolean; qatorlar?: T2AktReestr[]; error?: string }, DocRegistry]) => {
        if (!alive) return;
        if (!periodResult.ok) {
          setPeriods([]);
          setError(periodResult.error || 'PTO davrlarini yuklab bo‘lmadi.');
        } else {
          setPeriods(periodsFromAktRows(periodResult.qatorlar ?? [], objectId));
        }
        setSourceDocuments(documentResult.documents ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setPeriods([]);
        setSourceDocuments([]);
        setError('PTO davr yoki source document ma’lumotini yuklab bo‘lmadi.');
      })
      .finally(() => {
        if (!alive) return;
        setLoading((old) => ({ ...old, periods: false, documents: false }));
      });
    return () => { alive = false; };
  }, [companyId, refreshToken, scope.objectId, scope.projectId]);

  const revisions = useMemo(() => revisionsFromDocuments(sourceDocuments), [sourceDocuments]);

  useEffect(() => {
    if (loading.periods || loading.documents) return;
    const periodId = scope.periodId && periods.some((row) => row.id === scope.periodId) ? scope.periodId : null;
    const sourceDocumentId = scope.sourceDocumentId && sourceDocuments.some((row) => row.id === scope.sourceDocumentId)
      ? scope.sourceDocumentId
      : null;
    const revisionId = scope.revisionId && sourceDocumentId && revisions.some((row) => row.id === scope.revisionId && row.documentId === sourceDocumentId)
      ? scope.revisionId
      : null;
    /* Owner (2026-09-10): "tepadagi davr balo battarlar nima uchun kerak
       bilmadimu". Tanlov haqiqatan ham bo'lmaganda -- ya'ni nomzod BITTA
       bo'lganda -- foydalanuvchini qo'lda tanlashga majburlashning ma'nosi
       yo'q: u faqat eksportni bloklaydi. Bir nechta nomzod bo'lsa tanlov
       baribir foydalanuvchida qoladi, hech narsa taxmin qilinmaydi. */
    const yagonaHujjat = sourceDocumentId ?? (sourceDocuments.length === 1 ? sourceDocuments[0].id : null);
    const hujjatRevisions = yagonaHujjat == null ? [] : revisions.filter((row) => row.documentId === yagonaHujjat);
    const yagonaRevision = revisionId
      ?? (yagonaHujjat != null && hujjatRevisions.length === 1 ? hujjatRevisions[0].id : null);
    const next = { ...scope, periodId, sourceDocumentId: yagonaHujjat, revisionId: yagonaRevision };
    if (JSON.stringify(next) !== JSON.stringify(scope)) writeScope(next);
  }, [loading.documents, loading.periods, periods, revisions, scope, sourceDocuments, writeScope]);

  const setProjectId = useCallback((id: number | null) => {
    if (id != null && !projects.some((row) => row.id === id && row.kompaniya_id === companyId)) return;
    writeScope(scopeWithOnlyProject(scope, id));
  }, [companyId, projects, scope, writeScope]);

  const setObjectId = useCallback((id: number | null) => {
    if (id == null) {
      writeScope({ ...scope, objectId: null, periodId: null, sourceDocumentId: null, revisionId: null });
      return;
    }
    const object = objects.find((row) => row.id === id && row.kompaniya_id === companyId);
    if (!object || (scope.projectId != null && object.loyiha_id !== scope.projectId)) return;
    writeScope({ ...scope, objectId: id, periodId: null, sourceDocumentId: null, revisionId: null });
  }, [companyId, objects, scope, writeScope]);

  const setPeriodId = useCallback((id: string | null) => {
    if (id != null && !periods.some((row) => row.id === id)) return;
    writeScope({ ...scope, periodId: id });
  }, [periods, scope, writeScope]);

  const setSourceDocumentId = useCallback((id: string | null) => {
    if (id != null && !sourceDocuments.some((row) => row.id === id)) return;
    const revisionId = id == null || !revisions.some((row) => row.documentId === id && row.id === scope.revisionId) ? null : scope.revisionId;
    writeScope({ ...scope, sourceDocumentId: id, revisionId });
  }, [revisions, scope, sourceDocuments, writeScope]);

  const setRevisionId = useCallback((id: string | null) => {
    if (id != null && !revisions.some((row) => row.id === id)) return;
    writeScope({ ...scope, revisionId: id });
  }, [revisions, scope, writeScope]);

  const clearScope = useCallback(() => writeScope(EMPTY_SCOPE), [writeScope]);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const value = useMemo<PtoWorkspaceValue>(() => ({
    isProvider: true,
    companyId,
    scope,
    projects,
    objects,
    periods,
    sourceDocuments,
    revisions,
    loading,
    error,
    setProjectId,
    setObjectId,
    setPeriodId,
    setSourceDocumentId,
    setRevisionId,
    clearScope,
    refresh,
  }), [companyId, scope, projects, objects, periods, sourceDocuments, revisions, loading, error, setProjectId, setObjectId, setPeriodId, setSourceDocumentId, setRevisionId, clearScope, refresh]);

  return <PtoWorkspaceContext.Provider value={value}>{children}</PtoWorkspaceContext.Provider>;
}

export function usePTOWorkspace(): PtoWorkspaceValue {
  return useContext(PtoWorkspaceContext);
}

/** AdminShell uchun umumiy, deep-link bilan birga ishlaydigan scope bar. */
export function PTOWorkspaceBar() {
  const workspace = usePTOWorkspace();
  const location = useLocation();
  if (!workspace.companyId || !isPtoRoute(location.pathname)) return null;

  const objects = workspace.scope.projectId == null
    ? workspace.objects
    : workspace.objects.filter((row) => row.loyiha_id === workspace.scope.projectId);
  const revisions = workspace.scope.sourceDocumentId == null
    ? workspace.revisions
    : workspace.revisions.filter((row) => row.documentId === workspace.scope.sourceDocumentId);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-testid="pto-workspace-bar">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-dim">PTO scope</span>
      <label className="sr-only" htmlFor="pto-project-select">Loyiha</label>
      <select id="pto-project-select" aria-label="PTO loyiha" value={workspace.scope.projectId ?? ''} onChange={(event) => workspace.setProjectId(event.target.value ? Number(event.target.value) : null)} className="min-w-[150px] rounded-md border border-border bg-black/20 px-2 py-1.5 text-xs text-text">
        <option value="">Loyiha tanlang</option>
        {workspace.projects.map((row) => <option key={row.id} value={row.id}>{row.nom}</option>)}
      </select>
      <label className="sr-only" htmlFor="pto-object-select">Obyekt</label>
      <select id="pto-object-select" aria-label="PTO obyekt" value={workspace.scope.objectId ?? ''} onChange={(event) => workspace.setObjectId(event.target.value ? Number(event.target.value) : null)} disabled={!objects.length} className="min-w-[150px] rounded-md border border-border bg-black/20 px-2 py-1.5 text-xs text-text disabled:cursor-not-allowed disabled:opacity-50">
        <option value="">Obyekt tanlang</option>
        {objects.map((row) => <option key={row.id} value={row.id}>{row.nom}</option>)}
      </select>
      <label className="sr-only" htmlFor="pto-period-select">Davr</label>
      <select id="pto-period-select" aria-label="PTO davr" value={workspace.scope.periodId ?? ''} onChange={(event) => workspace.setPeriodId(event.target.value || null)} disabled={!workspace.periods.length} className="min-w-[106px] rounded-md border border-border bg-black/20 px-2 py-1.5 text-xs text-text disabled:cursor-not-allowed disabled:opacity-50">
        <option value="">Davr tanlang</option>
        {workspace.periods.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select>
      <label className="sr-only" htmlFor="pto-document-select">Source document</label>
      <select id="pto-document-select" aria-label="PTO source document" value={workspace.scope.sourceDocumentId ?? ''} onChange={(event) => workspace.setSourceDocumentId(event.target.value || null)} disabled={!workspace.sourceDocuments.length} className="min-w-[170px] max-w-[240px] rounded-md border border-border bg-black/20 px-2 py-1.5 text-xs text-text disabled:cursor-not-allowed disabled:opacity-50">
        <option value="">Source hujjat tanlang</option>
        {workspace.sourceDocuments.map((row) => <option key={row.id} value={row.id}>{row.filename} · r{row.revision}</option>)}
      </select>
      <label className="sr-only" htmlFor="pto-revision-select">Revision</label>
      <select id="pto-revision-select" aria-label="PTO revision" value={workspace.scope.revisionId ?? ''} onChange={(event) => workspace.setRevisionId(event.target.value || null)} disabled={!revisions.length} className="min-w-[118px] rounded-md border border-border bg-black/20 px-2 py-1.5 text-xs text-text disabled:cursor-not-allowed disabled:opacity-50">
        <option value="">Revision tanlang</option>
        {revisions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select>
      {workspace.loading.hierarchy || workspace.loading.periods || workspace.loading.documents ? <span className="text-[11px] text-text-dim" role="status">Yuklanmoqda…</span> : null}
      {workspace.error ? <span className="max-w-[260px] truncate text-[11px] text-warn" role="alert" title={workspace.error}>{workspace.error}</span> : null}
    </div>
  );
}
