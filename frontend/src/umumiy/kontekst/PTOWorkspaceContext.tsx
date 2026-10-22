import { ObyektOptionlari } from '../ui/ObyektOptionlari';
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
  /** Query string for another route: current scope with the given object (and that object's project). */
  scopeSearch: (objectId: number | null) => string;
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
  scopeSearch: () => '',
};

const PtoWorkspaceContext = createContext<PtoWorkspaceValue>(PTO_FALLBACK);

function withoutScopeAliases(params: URLSearchParams) {
  Object.values(SCOPE_PARAMS).flat().forEach((name) => params.delete(name));
}

/** True when the URL carries any PTO scope parameter (canonical or legacy alias). */
export function hasScopeParams(params: URLSearchParams): boolean {
  return Object.values(SCOPE_PARAMS).some((names) => names.some((name) => params.has(name)));
}

/** Canonical URL for a scope; every non-scope parameter (panel, tab, …) is preserved. */
export function scopeToParams(base: URLSearchParams, next: PtoScope): URLSearchParams {
  const params = new URLSearchParams(base);
  withoutScopeAliases(params);
  if (next.projectId != null) params.set('loyiha', String(next.projectId));
  if (next.objectId != null) params.set('obyekt', String(next.objectId));
  if (next.periodId != null) params.set('davr', next.periodId);
  if (next.sourceDocumentId != null) params.set('hujjat', next.sourceDocumentId);
  if (next.revisionId != null) params.set('revision', next.revisionId);
  return params;
}

const sameScope = (a: PtoScope, b: PtoScope) => a.projectId === b.projectId && a.objectId === b.objectId
  && a.periodId === b.periodId && a.sourceDocumentId === b.sourceDocumentId && a.revisionId === b.revisionId;

/** Changing the object resets everything that belongs to the previous object. */
function withObject(cur: PtoScope, objectId: number | null, projectId: number | null): PtoScope {
  return cur.objectId === objectId ? { ...cur, projectId, objectId }
    : { projectId, objectId, periodId: null, sourceDocumentId: null, revisionId: null };
}

/**
 * Project/object ids are accepted only if the server lists of the ACTIVE company contain them. A valid object
 * decides its project (an object is more specific than a project filter), an unknown id is cleared, never guessed.
 */
export function validateHierarchy(cur: PtoScope, companyId: number, projects: readonly Loyiha[], objects: readonly T2Obyekt[]): PtoScope {
  const object = cur.objectId == null ? null : objects.find((row) => row.id === cur.objectId && row.kompaniya_id === companyId) ?? null;
  if (object) return withObject(cur, object.id, object.loyiha_id ?? null);
  const project = cur.projectId == null ? null : projects.find((row) => row.id === cur.projectId && row.kompaniya_id === companyId) ?? null;
  return withObject(cur, null, project?.id ?? null);
}

/** Lists that were loaded FOR one object. They never validate another object's scope. */
export type PtoObjectDetail = { objectId: number; periods: PtoPeriod[]; documents: CenterDocument[]; revisions: PtoRevision[] };

/**
 * Period / source document / revision must exist in the object's own lists. With exactly one source document
 * (and one revision of it) the choice is not a choice, so it is filled in; with several, the user decides.
 */
export function validateDetail(cur: PtoScope, d: PtoObjectDetail): PtoScope {
  if (cur.objectId !== d.objectId) return cur;
  const periodId = cur.periodId && d.periods.some((row) => row.id === cur.periodId) ? cur.periodId : null;
  const chosenDoc = cur.sourceDocumentId && d.documents.some((row) => row.id === cur.sourceDocumentId) ? cur.sourceDocumentId : null;
  const sourceDocumentId = chosenDoc ?? (d.documents.length === 1 ? d.documents[0].id : null);
  const docRevisions = sourceDocumentId == null ? [] : d.revisions.filter((row) => row.documentId === sourceDocumentId);
  const chosenRev = cur.revisionId && docRevisions.some((row) => row.id === cur.revisionId) ? cur.revisionId : null;
  const revisionId = chosenRev ?? (docRevisions.length === 1 ? docRevisions[0].id : null);
  return { ...cur, periodId, sourceDocumentId, revisionId };
}

/**
 * ONE source of truth: the URL. There is no second copy of the scope in React state, so a page, the scope bar
 * and the validation rules can never overwrite each other with a stale value. Every change is computed against
 * the LATEST parameters (including a write made earlier in the same tick) and written with replace.
 * Opening a PTO route without scope parameters restores the last scope of this tab.
 */
export function PTOWorkspaceProvider({ children }: { children: ReactNode }) {
  const kompaniya = useKompaniya();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = kompaniya.globalRejim ? null : kompaniya.joriyId;

  const latest = useRef(searchParams);
  const rendered = useRef(searchParams);
  if (rendered.current !== searchParams) { rendered.current = searchParams; latest.current = searchParams; }
  const remembered = useRef<PtoScope>(EMPTY_SCOPE);
  const urlScope = useMemo(() => readPtoScope(searchParams), [searchParams]);
  const urlHasScope = hasScopeParams(searchParams);
  if (urlHasScope) remembered.current = urlScope;
  const scope = urlHasScope ? urlScope : remembered.current;

  const [projects, setProjects] = useState<Loyiha[]>([]);
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [detail, setDetail] = useState<PtoObjectDetail | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ hierarchy: false, periods: false, documents: false });
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  /** Company whose project/object lists are really loaded — before that a URL object is not judged
   *  (owner 2026-09-29: ?obyekt=78 used to vanish against an empty list). */
  const [loadedCompany, setLoadedCompany] = useState<number | null>(null);
  const loadedCompanyRef = useRef<number | null>(null);
  loadedCompanyRef.current = loadedCompany;
  const readyCompany = useRef<number | null>(null);

  const updateScope = useCallback((fn: (cur: PtoScope) => PtoScope, force = false) => {
    const base = latest.current;
    const cur = hasScopeParams(base) ? readPtoScope(base) : remembered.current;
    const next = fn(cur);
    if (!force && sameScope(next, cur) && (hasScopeParams(base) || sameScope(next, EMPTY_SCOPE))) return;
    const params = scopeToParams(base, next);
    latest.current = params;
    remembered.current = next;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  // A PTO route opened without scope parameters continues the tab's last scope (written back into the URL).
  useEffect(() => {
    if (!isPtoRoute(location.pathname) || hasScopeParams(latest.current) || sameScope(remembered.current, EMPTY_SCOPE)) return;
    updateScope((cur) => cur, true);
  }, [location.pathname, location.search, updateScope]);

  // Company switch is a hard security boundary: no identifier of the previous tenant survives it.
  useEffect(() => {
    if (kompaniya.yuklanmoqda) return;
    if (readyCompany.current !== null && readyCompany.current !== companyId) {
      updateScope(() => EMPTY_SCOPE, true);
      setProjects([]); setObjects([]); setDetail(null); setError(null); setLoadedCompany(null);
    }
    readyCompany.current = companyId;
  }, [companyId, kompaniya.yuklanmoqda, updateScope]);

  useEffect(() => {
    if (companyId == null) {
      setProjects([]); setObjects([]);
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
          setProjects([]); setObjects([]);
          return;
        }
        setError(null);
        setProjects((projectResult.qatorlar ?? []).filter((row) => row.kompaniya_id === companyId));
        setObjects((objectResult.qatorlar ?? []).filter((row) => row.kompaniya_id === companyId));
        setLoadedCompany(companyId);
      })
      .catch(() => { if (alive) setError('PTO iyerarxiyasini yuklab bo‘lmadi.'); })
      .finally(() => { if (alive) setLoading((old) => ({ ...old, hierarchy: false })); });
    return () => { alive = false; };
  }, [companyId, refreshToken]);

  useEffect(() => {
    if (companyId == null || loading.hierarchy || loadedCompany !== companyId) return;
    updateScope((cur) => validateHierarchy(cur, companyId, projects, objects));
  }, [companyId, loading.hierarchy, loadedCompany, objects, projects, scope.objectId, scope.projectId, updateScope]);

  // Periods and source documents are loaded per object and tagged with it.
  useEffect(() => {
    if (companyId == null || scope.objectId == null) {
      setDetail(null);
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
        if (!periodResult.ok) setError(periodResult.error || 'PTO davrlarini yuklab bo‘lmadi.');
        const documents = documentResult.documents ?? [];
        setDetail({ objectId, periods: periodResult.ok ? periodsFromAktRows(periodResult.qatorlar ?? [], objectId) : [], documents, revisions: revisionsFromDocuments(documents) });
      })
      .catch(() => {
        if (!alive) return;
        setDetail({ objectId, periods: [], documents: [], revisions: [] });
        setError('PTO davr yoki source document ma’lumotini yuklab bo‘lmadi.');
      })
      .finally(() => { if (alive) setLoading((old) => ({ ...old, periods: false, documents: false })); });
    return () => { alive = false; };
  }, [companyId, refreshToken, scope.objectId, scope.projectId]);

  // Only the CURRENT object's lists validate period/document/revision.
  const current = detail && detail.objectId === scope.objectId ? detail : null;
  useEffect(() => {
    if (!current) return;
    updateScope((cur) => validateDetail(cur, current));
  }, [current, scope.periodId, scope.sourceDocumentId, scope.revisionId, updateScope]);

  const periods = useMemo(() => current?.periods ?? [], [current]);
  const sourceDocuments = useMemo(() => current?.documents ?? [], [current]);
  const revisions = useMemo(() => current?.revisions ?? [], [current]);

  const setProjectId = useCallback((id: number | null) => {
    if (id != null && !projects.some((row) => row.id === id && row.kompaniya_id === companyId)) return;
    updateScope((cur) => {
      // An object of the chosen project stays selected; any other object is dropped with its details.
      const object = cur.objectId == null ? null : objects.find((row) => row.id === cur.objectId);
      return object && (id == null || object.loyiha_id === id) ? { ...cur, projectId: id } : withObject(cur, null, id);
    });
  }, [companyId, objects, projects, updateScope]);

  /** Choosing an object also selects ITS project — a project filter never silently rejects the choice. */
  const setObjectId = useCallback((id: number | null) => {
    updateScope((cur) => {
      if (id == null) return withObject(cur, null, cur.projectId);
      const object = objects.find((row) => row.id === id && row.kompaniya_id === companyId);
      if (object) return withObject(cur, id, object.loyiha_id ?? null);
      // Lists not loaded yet: keep the id; validation decides once the company's lists arrive.
      return loadedCompanyRef.current === companyId ? cur : withObject(cur, id, cur.projectId);
    });
  }, [companyId, objects, updateScope]);

  const setPeriodId = useCallback((id: string | null) => {
    if (id != null && !periods.some((row) => row.id === id)) return;
    updateScope((cur) => ({ ...cur, periodId: id }));
  }, [periods, updateScope]);

  const setSourceDocumentId = useCallback((id: string | null) => {
    if (id != null && !sourceDocuments.some((row) => row.id === id)) return;
    updateScope((cur) => ({ ...cur, sourceDocumentId: id,
      revisionId: id != null && revisions.some((row) => row.documentId === id && row.id === cur.revisionId) ? cur.revisionId : null }));
  }, [revisions, sourceDocuments, updateScope]);

  const setRevisionId = useCallback((id: string | null) => {
    if (id != null && !revisions.some((row) => row.id === id)) return;
    updateScope((cur) => ({ ...cur, revisionId: id }));
  }, [revisions, updateScope]);

  const clearScope = useCallback(() => updateScope(() => EMPTY_SCOPE, true), [updateScope]);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);
  /** Query string for navigating to another route with the current scope and a different object. */
  const scopeSearch = useCallback((objectId: number | null) => {
    const base = latest.current;
    const cur = hasScopeParams(base) ? readPtoScope(base) : remembered.current;
    const object = objectId == null ? null : objects.find((row) => row.id === objectId);
    const params = scopeToParams(new URLSearchParams(), withObject(cur, objectId, object ? object.loyiha_id ?? null : cur.projectId));
    const s = params.toString();
    return s ? `?${s}` : '';
  }, [objects]);

  const value = useMemo<PtoWorkspaceValue>(() => ({
    isProvider: true, companyId, scope, projects, objects, periods, sourceDocuments, revisions, loading, error,
    setProjectId, setObjectId, setPeriodId, setSourceDocumentId, setRevisionId, clearScope, refresh, scopeSearch,
  }), [companyId, scope, projects, objects, periods, sourceDocuments, revisions, loading, error, setProjectId, setObjectId, setPeriodId, setSourceDocumentId, setRevisionId, clearScope, refresh, scopeSearch]);

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
        <ObyektOptionlari obyektlar={objects} kompaniyaId={workspace.companyId} />
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
