import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sbT2AktYaratV2, sbT2DaraxtOl, sbT2F2ImportDraftRoyxat, sbT2F2ImportDraftSaqla,
  sbT2F2ImportJobHolat, sbT2F2ImportJobIlgarilash, sbT2F2ImportJobYarat,
  sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator,
} from '../../api/supabase';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { f2FaylOqiCore, type XlsxWorkbook, type F2ColumnConfig, type SheetGrid } from '../../lib/f2-import-parse';
import { type AktNode, type LrvNode, type F2MatchResult } from '../../lib/f2-match-engine';
import { f2AggregatsiyaQator, f2ExactPayloadQur, type F2ExactManbaTugun } from '../../test02/f2-exact-payload';
import { F2PreapprovalAudit } from '../../test02/F2PreapprovalAudit';
import { F2TwoPaneWorkbench } from './F2TwoPaneWorkbench';
import { f2ImportJobRecover } from '../../api/t2-f2-job-recovery';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';

/* T2-GAS-EXIT-001 SS5/SS6 + T2-PTO-CLOSURE-007-CODEX-F2-RESUMABLE-IMPORT:
 * eski qattiq devor (15MB / 20000 qator) endi durable job/draft modeli bilan
 * almashtirildi -- migratsiya (`t2_f2_import_job_v1`) cheklovi 100000 qatorgacha
 * ruxsat beradi, lekin bu yerda ancha kichikroq, HAQIQATAN sinovdan o'tgan
 * chegara tanlandi: f2-match-engine.perf.test.ts ~52 800 qatorni ~2s da
 * moslashtiradi (real production 6-daqiqalik GAS limitidan ~180x tezroq);
 * Codex'ning "tugadi" mezoni aynan ~30000 qatorlik sintetik faylni talab
 * qiladi. 60000/50MB -- shu ikkalasidan sezilarli yuqori, lekin brauzer
 * xotirasi cheksiz emasligini application MUHOKAMASIZ tan oladi. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 60000;
/** `t2_f2_import_draft_saqla_v1` o'zi bitta chaqiruvda 5000 tadan ko'pini rad etadi. */
const DRAFT_CHUNK = 5000;

function jobKey(objectId: string) { return 't2-f2-import-job:' + objectId; }

type Resumable = {
  jobId: number;
  matched: number;
  total: number | null;
  updatedAt: string;
  status: 'queued' | 'running' | 'paused' | 'review' | 'completed' | 'failed' | 'cancelled';
  versiya: number;
};

/** `hajm/narx/summa` durable draftda o'zi saqlangani uchun qayta tiklashda
 *  original faylga qaytish shart emas. Dastlabki sessiyada esa fayl avval
 *  canonical R2 registry'ga yoziladi; resume mavjud jobning saqlangan
 *  source_document_id bog'lanishiga tayanadi. */
function draftdanTiklash(qatorlar: { uid: string; hajm: number | null; narx: number | null; summa: number | null; lrv_row: number | null; kod: string | null; tur?: string | null }[]) {
  const source: F2ExactManbaTugun[] = [];
  const mapping = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const q of qatorlar) {
    if (q.hajm == null) continue; // hal_qilinmagan/otkazib_yuborildi -- moslashmagan, exactWrite baribir rad etadi
    source.push({ uid: q.uid, hajm: q.hajm, narx: q.narx, summa: q.summa, tur: q.tur ?? undefined });
    if (q.lrv_row != null) mapping.set(q.uid, q.lrv_row);
    labels.set(q.uid, (q.kod || q.uid) + ' (davom ettirilgan sessiya)');
  }
  return { source, mapping, labels };
}

// Bu adapter asl katakni tekshiradi. Matcher qaytargan narx/summa manba emas.
function son(value: unknown): number | undefined {
  if (value == null || String(value).trim() === '') return undefined;
  const text = String(value).replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

export function sourceLeaves(tree: AktNode[], grid: SheetGrid, cols: F2ColumnConfig): F2ExactManbaTugun[] {
  const out: F2ExactManbaTugun[] = [];
  const stack = [...tree];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.children?.length) { stack.push(...n.children); continue; }
    if (n.type === 'rz') continue;
    // UID faqat shu immutable fayl ichidagi manba manzili; canonical ID emas.
    const match = /^f2_(\d+)$/.exec(n.uid);
    if (!match) throw new Error('Manba qator manzili aniqlanmadi.');
    const raw = grid[Number(match[1])];
    if (!raw) throw new Error('Manba qator topilmadi.');
    const qty = son(raw[cols.obyom] == null || String(raw[cols.obyom]).trim() === '' ? raw[cols.norma] : raw[cols.obyom]);
    if (qty === undefined) throw new Error('Hujjat hajmi noaniq. Ustunlarni tekshiring.');
    out.push({ uid: n.uid, hajm: qty, narx: son(raw[cols.narx]), summa: son(raw[cols.sum]), tur: n.type });
  }
  return out;
}

/** t2_qator flat rows -> LrvNode tree, by canonical parent id (`ota_id`) --
 *  never by row number. Shared between a fresh match() and a resumed session. */
/**
 * F2 faylidan o'qilgan daraxtni ko'rsatadi (moslashtirishdan OLDIN).
 *
 * Faqat ko'rish uchun — hech narsa bog'lamaydi. Katta faylda butun
 * daraxtni chizib o'tirmaymiz: har bo'limda dastlabki qatorlar
 * ko'rsatiladi, qolgani soni bilan aytiladi.
 */
const DARAXT_KORSATISH_CHEGARASI = 400;
function F2FaylDaraxti({ nodes }: { nodes: AktNode[] }) {
  const budget = { left: DARAXT_KORSATISH_CHEGARASI, kesildi: false };
  const chiz = (list: AktNode[], depth: number): React.ReactNode[] => list.map((n, i) => {
    if (budget.left <= 0) { budget.kesildi = true; return null; }
    budget.left--;
    const bolalar = n.children && n.children.length ? chiz(n.children, depth + 1) : null;
    const belgi = n.type === 'rz' ? '📁' : (n.children && n.children.length ? '🔧' : '•');
    return (
      <div key={n.uid || `${depth}-${i}`}>
        <div style={{ marginLeft: depth * 14 }}
          className={'py-0.5 text-[12px] ' + (n.type === 'rz' ? 'font-semibold text-text' : n.children?.length ? 'font-medium text-text-dim' : 'text-text-mute')}>
          {belgi} {n.kod ? n.kod + ' ' : ''}{n.nom || '—'}{n.bir ? ` (${n.bir})` : ''}
          {n.children?.length ? <span className="ml-1.5 text-text-mute">— {n.children.length} ta</span> : null}
        </div>
        {bolalar}
      </div>
    );
  });
  const chizilgan = chiz(nodes, 0);
  return <>
    {chizilgan}
    {budget.kesildi && <p className="mt-1 text-[11px] text-text-mute">
      … {DARAXT_KORSATISH_CHEGARASI} qatordan ko‘pi ko‘rsatilmadi (bu faqat ko‘rish uchun; moslashtirish butun faylni oladi).
    </p>}
  </>;
}

export function smetaRootsFromRows(rows: T2Qator[]): LrvNode[] {
  const index = new Map<number, LrvNode>(rows.map(q => [q.id, { type: q.tur as LrvNode['type'], kod: q.kod || undefined, nom: q.nom || undefined, birlik: q.birlik || undefined, row: q.id, varaq: 'SB', children: [] }]));
  const roots: LrvNode[] = [];
  for (const q of rows) { const n = index.get(q.id)!; const parent = q.ota_id == null ? undefined : index.get(q.ota_id); if (parent) parent.children!.push(n); else roots.push(n); }
  return roots;
}

/**
 * T2-F2-IMPORT-NARXSIZ-BLOK-001 — bu funksiya avval HAR QANDAY narxi
 * nol/yo'q qator uchraganda BUTUN faylni rad etardi:
 *
 *   if (nodes.some(n => n.narx == null || n.narx <= 0 || ...)) throw ...
 *
 * Amalda bu F2 importini butunlay o'lik qilgan edi. Haqiqiy Amfiteatr
 * faylida 1054 qatordan 164 tasi aynan shunday: `000003` ЗАТРАТЫ ТРУДА
 * МАШИНИСТОВ (782/782 = 100% narxsiz -- mashinist soatlari mashina
 * narxi ichida, alohida puli yo'q), `009219` ВОДА, `035567` ОЧЕС
 * ЛЬНЯНОЙ. Ular SMETAning o'zida ham narxsiz -- ya'ni bu buzuq
 * ma'lumot emas, tuzilmaning normal qismi. Natijada 2 ta import
 * (06.09 va 08.09) "review" bosqichida qotib qolgan, `t2_akt_qator`
 * butun bazada 0 qator -- shuning uchun FAKT/F2 hamma joyda nol.
 *
 * Narxsiz qator uchun to'g'ri yo'l ALLAQACHON qurilgan va testlar bilan
 * qoplangan: `f2AggregatsiyaQator` narxni `undefined` qiladi,
 * `f2ExactPayloadQur` `priceIntentionallyAbsent: true` qo'yadi,
 * `t2_akt_yarat_v2` esa uni `provenance_status='price_intentionally_
 * absent'` bilan yozadi (hajm yoziladi, pul yozilmaydi). Ya'ni bu
 * to'siq o'zi chaqiradigan kontraktga zid edi.
 *
 * Haqiqiy himoyalar SAQLANADI: moslashmagan qator, bir qatorga ikki xil
 * narx, narxi bor-u summasi yo'q (NEEDS_REVIEW) va summasi bor-u narxi
 * yo'q (AMOUNT_WITHOUT_PRICE -- RPC uni null qilib pulni yo'qotardi).
 */
export function exactWrite(nodes: F2ExactManbaTugun[], mapping: Map<string, number>) {
  if (!nodes.length || nodes.some(n => !mapping.has(n.uid))) throw new Error('Barcha manba qatorlari moslashtirilishi kerak.');
  const rows = f2AggregatsiyaQator(nodes, uid => mapping.get(uid));
  if (rows.some(r => r.barchaNarxlar.length > 1)) throw new Error('Bir smeta qatoriga turli narxlar tushdi. Bog‘lanishni tekshiring.');
  const result = f2ExactPayloadQur(rows);
  if (!result.ok) {
    if (result.sabab === 'CONFLICTING_PRICES') {
      throw new Error(`${result.qatorIdlar.length} ta smeta qatoriga turli F2 narxlari tushdi. Bog‘lanish yoki hujjat davrlarini tekshiring.`);
    }
    throw new Error(result.sabab === 'AMOUNT_WITHOUT_PRICE'
      ? `${result.noaniqSoni} qatorda summa bor, lekin birlik narxi yo‘q — bunday qator yozilsa summa yo‘qoladi. Narxni to‘ldiring yoki manbani tekshiring.`
      : `${result.noaniqSoni} ta smeta qatorida narx bor, lekin F2 summasi yo‘q yoki bo‘laklarning faqat bir qismida bor — summa to‘qilmaydi. Yozish to‘xtatildi.`);
  }
  return result.qatorlar;
}

function NativeSession({ companyId }: { companyId: number }) {
  const workspace = usePTOWorkspace();
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState('');
  const [book, setBook] = useState<XlsxWorkbook | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [cols, setCols] = useState<F2ColumnConfig | null>(null);
  /** Ustunlar qanday aniqlandi va PTO qo'shgan qo'shimcha ustunlar (operatorga). */
  const [ustunIzoh, setUstunIzoh] = useState<{ dalil?: { ishonch: string; izoh: string }; qoshimcha?: Array<{ ustun: number; sarlavha: string }> } | null>(null);
  const [source, setSource] = useState<F2ExactManbaTugun[]>([]);
  const [mapping, setMapping] = useState(new Map<string, number>());
  const [labels, setLabels] = useState(new Map<string, string>());
  const [targets, setTargets] = useState(new Map<number, string>());
  const [sourceTree, setSourceTree] = useState<AktNode[] | null>(null);
  const [smetaRoots, setSmetaRoots] = useState<LrvNode[]>([]);
  const [smetaRawRows, setSmetaRawRows] = useState<T2Qator[]>([]);
  const [phase, setPhase] = useState('Faylni tanlang');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [done, setDone] = useState(false);
  const [resumable, setResumable] = useState<Resumable | null>(null);
  const [draftXato, setDraftXato] = useState('');
  const operation = useRef('');
  const generation = useRef(0);
  const writing = useRef(false);
  const jobId = useRef<number | null>(null);
  const jobVersiya = useRef(1);
  const rawFile = useRef<File | null>(null);
  const sourceDocId = useRef<number | undefined>(undefined);
  const sourceOperationId = useRef('');
  const lastAutoMatchKey = useRef('');
  const matchingRef = useRef(false);
  useEffect(() => {
    let active = true;
    const generationRef = generation;
    void sbT2ObyektlarOlKomp(companyId).then(r => {
      if (!active) return;
      if (!r.ok) { setError('Obyektlar o‘qilmadi.'); return; }
      setObjects((r.qatorlar || []) as T2Obyekt[]);
    }).catch(() => { if (active) setError('Obyektlar o‘qilmadi.'); });
    return () => { active = false; generationRef.current++; };
  }, [companyId]);
  /* Obyekt tanlanganda — o'sha obyekt uchun tugallanmagan job bormi tekshiramiz
   * (localStorage FAQAT job_id'ni eslab qoladi — haqiqat manbai Supabase'da). */
  useEffect(() => {
    setResumable(null);
    if (!objectId) return;
    let active = true;
    const raw = (() => { try { return localStorage.getItem(jobKey(objectId)); } catch { return null; } })();
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    void sbT2F2ImportJobHolat(id).then(r => {
      if (!active) return;
      const status = String(r.status || '') as Resumable['status'];
      if (!r.ok || !status || status === 'completed' || status === 'failed' || status === 'cancelled') {
        try { localStorage.removeItem(jobKey(objectId)); } catch { /* Faqat kesh. */ }
        return;
      }
      setResumable({ jobId: id, matched: r.matched_rows ?? 0, total: r.total_rows ?? null, updatedAt: r.updated_at || '', status, versiya: r.versiya || 1 });
    }).catch(() => { /* Tarmoq xatosi -- keyingi safar qayta urinamiz, hozircha yangi importga to'sqinlik qilmaymiz. */ });
    return () => { active = false; };
  }, [objectId]);
  useEffect(() => {
    if (workspace.scope.objectId != null && objects.some((row) => row.id === workspace.scope.objectId)) {
      setObjectId(String(workspace.scope.objectId));
    }
  }, [objects, workspace.scope.objectId]);
  function reset() {
    generation.current++;
    setSource([]); setMapping(new Map()); setReviewed(false); setDone(false); setError(''); setDraftXato('');
    setSourceTree(null); setSmetaRoots([]); setSmetaRawRows([]);
    operation.current = ''; jobId.current = null; jobVersiya.current = 1;
  }
  async function resume(r: Resumable) {
    reset(); setBusy(true); setPhase('Oldingi sessiya tiklanmoqda');
    try {
      const [job, draft, smeta] = await Promise.all([
        sbT2F2ImportJobHolat(r.jobId), sbT2F2ImportDraftRoyxat(r.jobId), sbT2DaraxtOl(Number(objectId)),
      ]);
      if (!job.ok || !draft.ok || !smeta.ok) throw new Error();
      const cursor = (job.cursor || {}) as { writeOperationId?: string; month?: string };
      const { source: tiklanganSource, mapping: tiklanganMapping, labels: tiklanganLabels } = draftdanTiklash(draft.qatorlar);
      const rows = (smeta.qatorlar || []) as T2Qator[];
      setTargets(new Map(rows.map(q => [q.id, `${q.kod || ''} ${q.nom || ''} (${q.birlik || '—'})`])));
      setSmetaRoots(smetaRootsFromRows(rows)); setSmetaRawRows(rows);
      setLabels(tiklanganLabels); setSource(tiklanganSource); setMapping(tiklanganMapping);
      operation.current = cursor.writeOperationId || yangiOperationId();
      setMonth(cursor.month || ''); jobId.current = r.jobId; jobVersiya.current = job.versiya || 1;
      setResumable(null); setPhase('Ko‘rib chiqish kerak (tiklangan)');
    } catch { setError('Oldingi sessiya tiklanmadi. Faylni qayta yuklashingiz mumkin.'); }
    finally { setBusy(false); }
  }
  async function recoverAndResume(r: Resumable) {
    if (!workspace.isProvider) {
      await resume(r);
      return;
    }
    setBusy(true); setError(''); setPhase('Stuck sessiya xavfsiz pauzaga olinmoqda');
    try {
      const recovered = await f2ImportJobRecover({ jobId: r.jobId, expectedVersiya: r.versiya, operationId: yangiOperationId() });
      if (!recovered.ok) throw new Error(recovered.error || recovered.code || 'Recovery bajarilmadi');
      await resume({ ...r, status: 'paused', versiya: recovered.versiya || r.versiya + 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stuck sessiya tiklanmadi.');
      setBusy(false);
    }
  }
  function chooseSheet(workbook: XlsxWorkbook, name: string) {
    lastAutoMatchKey.current = ''; reset(); setSheetName(name);
    const sheet = workbook.sheet(name);
    const preview = sheet && f2FaylOqiCore(sheet.rows);
    setCols(preview && 'cols' in preview ? preview.cols : null);
    setUstunIzoh(preview && 'cols' in preview ? { dalil: preview.ustunDalil, qoshimcha: preview.qoshimchaUstunlar } : null);
  }
  async function upload(file: File) {
    lastAutoMatchKey.current = ''; reset(); setBook(null); setCols(null); setBusy(true); setPhase('Fayl o‘qilmoqda');
    rawFile.current = file; sourceDocId.current = undefined; sourceOperationId.current = yangiOperationId();
    const token = generation.current;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error(`Fayl ${MAX_FILE_BYTES / 1024 / 1024} MB dan katta.`);
      const workbook = await readXlsxFonda(await file.arrayBuffer());
      if (generation.current !== token) return;
      setBook(workbook); chooseSheet(workbook, workbook.sheets[0]?.name || ''); setPhase('Varaq va ustunlarni tekshiring');
    } catch { if (generation.current === token) setError(`Fayl o‘qilmadi yoki ${MAX_FILE_BYTES / 1024 / 1024} MB chegarasidan oshdi. XLSX faylni tekshiring.`); }
    finally { setBusy(false); }
  }
  /** T2-PTO-DAILY-FINAL-CUTOVER-008 P0.2: F2 manba fayli canonical R2'ga
   *  importdan OLDIN yoziladi. R2 qabul qilmasa, qoralama/kanonik akt
   *  yaratilmaydi — binary manba bilan biznes yozuvi ajralib ketmasin. Bir
   *  fayl sessiyasidagi qayta urinish aynan bitta operation_id bilan ketadi. */
  async function sourceniR2gaYukla(file: File, objId: number): Promise<number> {
    if (sourceDocId.current != null) return sourceDocId.current;
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      // `t2_f2_import_job_yarat_v1` hujjatning loyiha_id'ini obyektnikiga aynan
      // solishtiradi (SOURCE_DOCUMENT_SCOPE_MISMATCH) -- shuning uchun bu yerda
      // ham AYNAN o'sha loyiha_id yuboriladi, aks holda job hujjatni rad etadi.
      const loyihaId = objects.find(o => o.id === objId)?.loyiha_id ?? null;
      const fd = new FormData();
      fd.append('fayl', file); fd.append('kompaniya_id', String(companyId));
      if (loyihaId != null) fd.append('loyiha_id', String(loyihaId));
      fd.append('obyekt_id', String(objId)); fd.append('turi', 'f2_akt');
      fd.append('operation_id', sourceOperationId.current || (sourceOperationId.current = yangiOperationId()));
      fd.append('sha256', sha256); fd.append('size', String(file.size));
      const r = await fetch('/api/hujjat-yukla', { method: 'POST', body: fd });
      const j: any = await r.json().catch(() => null);
      const documentId = j && j.ok ? Number(j.document_id) : NaN;
      if (!r.ok || !Number.isSafeInteger(documentId) || documentId <= 0) {
        throw new Error('F2 manba fayli kanonik R2 saqlashga qabul qilinmadi.');
      }
      sourceDocId.current = documentId;
      return documentId;
    } catch (e) {
      if (e instanceof Error && e.message === 'F2 manba fayli kanonik R2 saqlashga qabul qilinmadi.') throw e;
      throw new Error('F2 manba fayli kanonik R2 ga yuklanmadi. Import to‘xtatildi.');
    }
  }
  /** T2-PTO-OWNER-CRITICAL-CLOSURE: F2TwoPaneWorkbench's drag-drop
   *  Additional/Zamena creation calls this after a successful create so the
   *  right (Smeta) pane immediately shows the new row -- without it the
   *  user would have to re-run match() (losing review progress) to see
   *  what they just added. */
  async function refreshSmeta() {
    if (!objectId) return;
    const r = await sbT2DaraxtOl(Number(objectId));
    if (!r.ok) return;
    const rows = (r.qatorlar || []) as T2Qator[];
    setTargets(new Map(rows.map(q => [q.id, `${q.kod || ''} ${q.nom || ''} (${q.birlik || '—'})`])));
    setSmetaRoots(smetaRootsFromRows(rows)); setSmetaRawRows(rows);
  }
  async function match() {
    if (!book || !cols || !objectId || !month || matchingRef.current) return;
    matchingRef.current = true; reset(); const token = generation.current; setBusy(true); setPhase('Moslashtirilmoqda — ikki oynali panel tayyorlanmoqda');
    try {
      const sheet = book.sheet(sheetName)!;
      if (sheet.rows.length > MAX_ROWS) throw new Error(`Varaq ${MAX_ROWS} qatordan katta.`);
      const built = f2FaylOqiCore(sheet.rows, cols);
      if (!('tree' in built)) throw new Error('Ustunlarni tekshiring.');
      const leaves = sourceLeaves(built.tree, sheet.rows, cols);
      const r = await sbT2DaraxtOl(Number(objectId));
      if (!r.ok) throw new Error('Smeta o‘qilmadi.');
      const rows = (r.qatorlar || []) as T2Qator[];
      if (rows.length > MAX_ROWS) throw new Error(`Smeta ${MAX_ROWS} qatordan katta.`);
      const roots = smetaRootsFromRows(rows);
      const validIds = new Set(rows.map(q => q.id));
      if (!rawFile.current) throw new Error('F2 manba fayli topilmadi. XLSX faylni qayta tanlang.');
      await sourceniR2gaYukla(rawFile.current, Number(objectId));
      const response = await fetch('/api/f2-moslash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'moslash', aktTree: built.tree, lrvTree: roots }) });
      if (!response.ok) throw new Error('Moslashtirish bajarilmadi.');
      const result = await response.json() as F2MatchResult & { ok: boolean };
      if (!result.ok) throw new Error('Moslashtirish bajarilmadi.');
      if (generation.current !== token) return;
      const bindings = new Map<string, number>();
      for (const m of result.mosliklar) {
        if (!validIds.has(m.row) || bindings.has(m.uid)) throw new Error('Moslashtirish javobida noaniq bog‘lanish bor.');
        bindings.set(m.uid, m.row);
      }
      const names = new Map<string, string>();
      const stack = [...built.tree];
      while (stack.length) { const n = stack.pop()!; names.set(n.uid, `${n.kod || ''} ${n.nom || ''} (${n.bir || '—'})`); stack.push(...(n.children || [])); }
      setLabels(names); setTargets(new Map(rows.map(q => [q.id, `${q.kod || ''} ${q.nom || ''} (${q.birlik || '—'})`])));
      setSourceTree(built.tree); setSmetaRoots(roots); setSmetaRawRows(rows);
      setSource(leaves); setMapping(bindings); operation.current = yangiOperationId(); setPhase('Ko‘rib chiqish kerak');
      await qoralamaniSaqla(leaves, bindings, names);
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'O‘qish bajarilmadi.'); }
    finally { matchingRef.current = false; setBusy(false); }
  }
  const autoMatchKey = book && cols && objectId && month ? `${objectId}|${month}|${sheetName}|${Object.values(cols).join(',')}` : '';
  useEffect(() => {
    if (!autoMatchKey || !book || !cols || source.length || done || busy || resumable || matchingRef.current) return;
    if (lastAutoMatchKey.current === autoMatchKey) return;
    lastAutoMatchKey.current = autoMatchKey; void match();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMatchKey, book, cols, objectId, month, sheetName, source.length, done, busy, resumable]);
  /**
   * T2-GAS-EXIT-001 SS5/SS6: moslashtirish natijasi DARHOL Supabase'ga
   * yoziladi -- refresh/PC o'chishi/tarmoq uzilishi natijani yo'qotmasin.
   * ATAYLAB best-effort: bu qatlam ishlamasa ham ko'rib chiqish/yozish
   * (exactWrite/save) davom etishi kerak -- resumability yordamchi, EXACT
   * SOURCE yozish yo'lining o'zi emas (Codex handoff SS4 qat'iy chegara). */
  async function qoralamaniSaqla(leaves: F2ExactManbaTugun[], bindings: Map<string, number>, names: Map<string, string>) {
    try {
      const job = await sbT2F2ImportJobYarat({ obyektId: Number(objectId), operationId: yangiOperationId(), totalRows: leaves.length, sourceDocumentId: sourceDocId.current });
      if (!job.ok || job.job_id == null) throw new Error(job.error || job.code || 'job yaratilmadi');
      jobId.current = job.job_id; jobVersiya.current = 1;
      try { localStorage.setItem(jobKey(objectId), String(job.job_id)); } catch { /* Faqat kesh -- ishlamasa ham davom etamiz. */ }

      /* Har bo'lakdan keyin darhol checkpoint -- shu tufayli o'rtada
         uzilish (refresh/tarmoq/PC) OXIRGI bo'lakdan qayta boshlamaydi,
         `processed_rows`/`cursor.chunk` orqali qayerda to'xtaganini biladi.
         Birinchi chunk 'queued'->'running' o'tkazadi (ruxsat etilgan yo'l),
         keyingilari 'running'->'running' (o'z-o'ziga, ham ruxsat etilgan). */
      for (let i = 0; i < leaves.length; i += DRAFT_CHUNK) {
        const bolak = leaves.slice(i, i + DRAFT_CHUNK);
        const d = await sbT2F2ImportDraftSaqla({
          jobId: job.job_id,
          qatorlar: bolak.map(n => ({
            uid: n.uid,
            holat: bindings.has(n.uid) ? 'avto_moslashti' : 'hal_qilinmagan',
            lrvRow: bindings.get(n.uid), kod: (names.get(n.uid) || '').split(' ')[0] || undefined,
            hajm: n.hajm, narx: n.narx ?? undefined, summa: n.summa ?? undefined, tur: n.tur,
          })),
        });
        if (!d.ok) throw new Error(d.error || d.code || 'qoralama saqlanmadi');
        const bolakMos = bolak.filter(n => bindings.has(n.uid)).length;
        const prog = await sbT2F2ImportJobIlgarilash({
          jobId: job.job_id, expectedVersiya: jobVersiya.current,
          processedDelta: bolak.length, matchedDelta: bolakMos, unmatchedDelta: bolak.length - bolakMos,
          cursor: { phase: 'review', chunk: i + bolak.length, writeOperationId: operation.current, month },
          status: 'running',
        });
        if (!prog.ok) throw new Error(prog.error || prog.code || 'checkpoint yozilmadi');
        jobVersiya.current = prog.versiya!;
      }
    } catch (e) {
      /* Foydalanuvchi hozir ko'rib chiqishda davom etadi -- faqat
         "refresh qilsangiz yo'qolishi mumkin" deb ogohlantiramiz. */
      setDraftXato('Qoralama saqlanmadi (' + (e instanceof Error ? e.message : 'noma\'lum xato') + ') — hozircha davom etishingiz mumkin, lekin sahifa yopilsa oxirgi holat tiklanmasligi mumkin.');
    }
  }
  const payload = useMemo(() => { try { return { rows: exactWrite(source, mapping), error: '' }; } catch (e) { return { rows: [], error: e instanceof Error ? e.message : 'Tekshiruv kerak.' }; } }, [source, mapping]);

  /**
   * Tekshiruv xulosasi — operator xom qatorlarni birma-bir sanab
   * chiqmasligi uchun. Codex'ning `premium-pto-ui-ux-v1` shoxchasidagi
   * to'g'ri g'oyasi; u yerda o'z F2 ekraniga qilingan edi, bu yerda esa
   * egasi talab qilgan drag-drop 2 oynali workbench ustiga qo'yildi.
   *
   * «Arifmetik farq» — fayldagi hajm×narx ≠ fayldagi summa. Bu import
   * uchun to'siq emas, lekin manba hujjatda xato borligini bildiradi va
   * yozishdan OLDIN ko'rinishi kerak.
   */
  /**
   * Moslashtirishdan OLDIN ko'riladigan fayl tuzilishi.
   *
   * Egasi: "birinchi daraxtlar ochilib keyin moslashtirilishi kerak".
   * Avval fayl yuklangach darhol moslashtirishga o'tib ketilardi —
   * operator ustunlar to'g'ri o'qilganini, bo'lim/ish/resurs ierarxiyasi
   * haqiqatan qurilganini KO'RMASDAN "Moslashtirish"ni bosardi. Ustun
   * raqami bitta xato bo'lsa ham butun daraxt axlat chiqadi va buni
   * faqat natijadan keyin bilib olinardi. */
  const faylTuzilishi = useMemo(() => {
    if (!book || !cols || !sheetName) return null;
    const sheet = book.sheet(sheetName);
    if (!sheet) return null;
    try {
      const built = f2FaylOqiCore(sheet.rows, cols);
      if (!('tree' in built)) return null;
      let bolim = 0, ish = 0, resurs = 0;
      const yur = (list: AktNode[]) => {
        for (const n of list) {
          if (n.type === 'rz') bolim++;
          else if (n.children && n.children.length) ish++;
          else resurs++;
          if (n.children) yur(n.children);
        }
      };
      yur(built.tree);
      return { tree: built.tree, bolim, ish, resurs };
    } catch { return null; }
  }, [book, cols, sheetName]);

  const xulosa = useMemo(() => {
    let mos = 0, mosEmas = 0, arifmetik = 0, qiymatsiz = 0;
    for (const n of source) {
      if (mapping.has(n.uid)) mos++; else mosEmas++;
      // Narxsiz qator YOZILADI (hajm bilan, pulsiz) -- shuning uchun bu
      // "xato" emas, lekin operator sonini KO'RISHI kerak.
      if (n.narx == null || n.narx <= 0 || n.summa == null) qiymatsiz++;
      else if (Math.abs(n.hajm * n.narx - n.summa) > 0.005) arifmetik++;
    }
    return { jami: source.length, mos, mosEmas, arifmetik, qiymatsiz };
  }, [source, mapping]);
  async function save() {
    if (writing.current || done || !reviewed || payload.error || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    writing.current = true; setBusy(true); setPhase('Yozilmoqda'); setError('');
    try {
      const provenance = new Map<number, F2ExactManbaTugun[]>();
      for (const n of source) { const id = mapping.get(n.uid)!; const group = provenance.get(id) || []; group.push(n); provenance.set(id, group); }
      const r = await sbT2AktYaratV2({ obyektId: Number(objectId), oy: month + '-01', operationId: operation.current, qatorlar: payload.rows.map(q => ({ ...q, rawSnapshot: { sheetName, source: provenance.get(q.qatorId) } })) });
      if (!r.ok) { setError('Hujjat saqlanmadi. Tanlovni o‘zgartirmasdan qayta urinishingiz mumkin.'); return; }
      setDone(true); setPhase('Tayyor — F2 qoralamasi saqlandi');
      /* Job endi kerak emas -- best-effort yopamiz. EXACT SOURCE hujjat
         (`t2_akt`) allaqachon yozilgan, bu qadam faqat ledger tozaligi
         uchun; muvaffaqiyatsiz bo'lsa foydalanuvchiga ta'sir qilmaydi. */
      if (jobId.current != null) {
        try {
          await sbT2F2ImportJobIlgarilash({
            jobId: jobId.current, expectedVersiya: jobVersiya.current,
            processedDelta: 0, matchedDelta: 0, unmatchedDelta: 0, status: 'completed',
          });
        } catch { /* Ledger tozaligi -- yozuvning o'zi allaqachon muvaffaqiyatli. */ }
        try { localStorage.removeItem(jobKey(objectId)); } catch { /* Faqat kesh. */ }
      }
    } catch { setError('Yozish javobi olinmadi. Qayta urinish ayni operatsiyani tekshiradi.'); }
    finally { writing.current = false; setBusy(false); }
  }
  /* `max-w-5xl` (1024px) butun sahifani qisardi — 2 oynali moslashtirish
     workbench'i uchun bu juda tor, keng monitorda ham yarmi bo'sh turardi.
     Endi kenglik chegarasi yo'q, ichki panellar o'zi moslashadi. */
  return <section className="w-full space-y-4 p-3 sm:p-4">
    <h1 className="text-lg font-semibold sm:text-xl">F2 import — yangi rejim</h1>
    <p role="status" className="text-[13px] text-text-dim">{phase}</p>
    {resumable && !source.length && <p className="karta flex flex-wrap items-center gap-2 p-3 text-[13px]">
      <span>Tugallanmagan import bor ({resumable.matched}/{resumable.total ?? '?'} qator moslashtirilgan, holat: {resumable.status}, {resumable.updatedAt ? new Date(resumable.updatedAt).toLocaleString() : ''}).</span>
      <button onClick={() => void (resumable.status === 'running' || resumable.status === 'review' ? recoverAndResume(resumable) : resume(resumable))} disabled={busy} title={resumable.status === 'running' || resumable.status === 'review' ? 'Stuck job avval xavfsiz pauzaga olinadi' : undefined} className="tugma">Davom ettirish</button>
    </p>}
    {draftXato && <p role="alert" className="text-warn">{draftXato}</p>}
    {/* Bu forma avval umuman stilsiz edi (yalang'och <label>+<input>):
        tor ekranda yorliq va maydon bir qatorga tiqilib, o'qib bo'lmasdi.
        Endi loyihaning o'z `.karta`/`.input` tizimi va ekranga qarab
        1→2→4 ustunga bo'linadigan panjara. */}
    <fieldset disabled={busy || done} className="karta grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="block text-[12px] font-medium text-text">Obyekt
        <select aria-label="Obyekt" value={objectId} onChange={e => {
          lastAutoMatchKey.current = ''; reset(); setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); rawFile.current = null;
          sourceDocId.current = undefined; sourceOperationId.current = '';
        }} className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
          <option value="">Tanlang</option>{objects.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
        </select>
      </label>
      <label className="block text-[12px] font-medium text-text">F2 davri
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} disabled={source.length > 0}
          className="input mt-1.5 block h-9 w-full px-2 text-[13px]" />
      </label>
      <label className="block text-[12px] font-medium text-text">XLSX fayl
        <input type="file" accept=".xlsx,.xlsm,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          className="input mt-1.5 block h-9 w-full px-2 py-1.5 text-[12px] file:mr-2 file:rounded file:border-0 file:bg-surface file:px-2 file:py-1 file:text-[12px] file:text-text" />
      </label>
      {book && <label className="block text-[12px] font-medium text-text">Varaq
        <select value={sheetName} onChange={e => chooseSheet(book, e.target.value)}
          className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
          {book.sheets.map(s => <option key={s.name}>{s.name}</option>)}
        </select>
      </label>}
    </fieldset>
    {cols && <fieldset disabled={busy || done} className="karta p-3">
      <legend className="px-1 text-[12px] font-medium text-text-dim">Ustun raqamlari (1 dan boshlab) — fayl bilan solishtiring</legend>
      {ustunIzoh?.dalil && <p className={`text-[11px] ${ustunIzoh.dalil.ishonch === 'past' ? 'text-warn' : 'text-text-dim'}`}>{ustunIzoh.dalil.izoh}</p>}
      {!!ustunIzoh?.qoshimcha?.length && <p className="text-[11px] text-text-dim">Qo‘shimcha ustunlar (o‘qilmaydi): {ustunIzoh.qoshimcha.map((q) => `${q.ustun + 1}: ${q.sarlavha}`).join('; ')}</p>}
      <div className="mt-2 flex flex-wrap items-end gap-2 sm:gap-3">
        {(Object.keys(cols) as (keyof F2ColumnConfig)[]).map(k => (
          <label key={k} className="text-[12px] text-text-dim">{k}
            <input className="input mt-1 block h-8 w-16 px-1.5 text-center text-[13px]" type="number" min="1"
              value={cols[k] + 1} onChange={e => { lastAutoMatchKey.current = ''; reset(); setCols({ ...cols, [k]: Number(e.target.value) - 1 }); }} />
          </label>
        ))}
        <button onClick={() => { lastAutoMatchKey.current = ''; void match(); }} disabled={!objectId || !month || busy} className="tugma tugma-asosiy ml-auto">{source.length ? 'Qayta moslashtirish' : 'Moslashtirishni qayta ishga tushirish'}</button>
      </div>
    </fieldset>}
    {error && <p role="alert" className="text-danger">{error}</p>}

    {/* Fayl tuzilishi — moslashtirishdan OLDIN. Ustunlar noto'g'ri
        o'qilgan bo'lsa bu yerda darhol ko'rinadi (bo'lim/ish/resurs soni
        va daraxtning o'zi), natijani kutib o'tirmasdan. */}
    {faylTuzilishi && source.length === 0 && <section className="karta p-3" aria-label="Fayl tuzilishi">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="font-semibold text-text">Fayl tuzilishi</span>
        <span className="text-text-dim">Bo‘lim: <b className="text-text tabular-nums">{faylTuzilishi.bolim}</b></span>
        <span className="text-text-dim">Ish: <b className="text-text tabular-nums">{faylTuzilishi.ish}</b></span>
        <span className="text-text-dim">Resurs: <b className="text-text tabular-nums">{faylTuzilishi.resurs}</b></span>
        {faylTuzilishi.ish === 0 && faylTuzilishi.resurs === 0 && (
          <span className="text-danger">Daraxt bo‘sh chiqdi — ustun raqamlarini tekshiring.</span>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[12px] text-text-dim">Daraxtni ochib ko‘rish</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border/60 p-2">
          <F2FaylDaraxti nodes={faylTuzilishi.tree} />
        </div>
      </details>
    </section>}

    {source.length > 0 && <>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="F2 import tekshiruv xulosasi">
        {([
          ['Manba qatori', xulosa.jami, 'text-text'],
          ['Aniq mos', xulosa.mos, xulosa.mos ? 'text-ok' : 'text-text'],
          ['Moslashmagan', xulosa.mosEmas, xulosa.mosEmas ? 'text-danger' : 'text-text'],
          ['Arifmetik farq', xulosa.arifmetik, xulosa.arifmetik ? 'text-warn' : 'text-text'],
          ['Narxsiz — faqat hajm yoziladi', xulosa.qiymatsiz, xulosa.qiymatsiz ? 'text-warn' : 'text-text'],
        ] as const).map(([label, value, tone]) => (
          <div key={label} className="karta px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-mute">{label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
          </div>
        ))}
      </section>
      <F2TwoPaneWorkbench
        sourceTree={sourceTree} sourceFlat={source} labels={labels}
        smetaRoots={smetaRoots} targets={targets}
        mapping={mapping} onMappingChange={setMapping}
        disabled={busy || done}
        smetaRawRows={smetaRawRows} companyId={companyId} objectId={objectId ? Number(objectId) : undefined}
        onSmetaChanged={refreshSmeta}
      />
      <F2PreapprovalAudit aktBarglar={source} getSmetaId={uid => mapping.get(uid)} />
      {payload.error && <p role="alert">{payload.error}</p>}
      <label className="block"><input type="checkbox" checked={reviewed} disabled={busy || done} onChange={e => setReviewed(e.target.checked)} /> Varaq, davr va moslashtirish natijasini tekshirdim</label>
      <button className="karta p-3" disabled={busy || done || !reviewed || !!payload.error} onClick={() => void save()}>F2 qoralamasini saqlash</button>
    </>}
  </section>;
}

export default function F2ImportNative() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <NativeSession key={joriy.id} companyId={joriy.id} />;
}
