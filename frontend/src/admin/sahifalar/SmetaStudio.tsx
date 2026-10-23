/**
 * Smeta studiyasi — ikki yoki uch panelli professional smeta ish joyi.
 * Chap: platforma normativ katalogi (nomli daraxt, qidiruv, ish va resurslar).
 * Markaz: smeta jadvali. O'ng: tanlangan ish, koeffitsient, resurs, AI va kalkulyator.
 * Barcha o'zgarish yagona buyruq qatlami (lib/smeta-studio/commands) orqali; chat ham shuni ishlatadi.
 * Hozircha qoralama: brauzerda tiklanadi, canonical saqlash alohida server buyrug'i bilan.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { t } from '../../i18n/til';
import { RemoteNormCatalog, type NormDetail, type RemoteTreeNode } from '../../lib/catalog-extraction/norm-remote';
import { NormLibraryCatalog, type StudioNormCatalog } from '../../lib/catalog-extraction/norm-library';
import type { NormWork } from '../../lib/catalog-extraction/norm-catalog';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { dispatch, historyOf, redo, undo, type History, type StudioCommand } from '../../lib/smeta-studio/commands';
import { calcDoc } from '../../lib/smeta-studio/calc';
import { snapshotWork, catalogueBasis } from '../../lib/smeta-studio/catalog-bridge';
import { loadLastDraft, saveDraft } from '../../lib/smeta-studio/draft-store';
import { WorkspaceReview } from '../../components/smeta-studio-workspace/WorkspaceReview';
import { WorkSheet } from '../../components/smeta-studio-workspace/WorkSheet';
import { QuantityWorkbench } from '../../components/smeta-studio-workspace/QuantityWorkbench';
import { StudioInspector, type InspectorTab } from '../../components/smeta-studio-workspace/StudioInspector';
import { StudioCommandMenu, type DeskAction } from '../../components/smeta-studio-workspace/StudioCommandMenu';
import { StudioSections } from '../../components/smeta-studio-workspace/StudioSections';
import '../../components/smeta-studio-workspace/studio-desk.css';
import { CloudDrafts } from '../../components/smeta-studio-workspace/CloudDrafts';
import { DocumentCenter } from '../../components/smeta-studio-workspace/DocumentCenter';
import { ObjectBinding } from '../../components/smeta-studio-workspace/ObjectBinding';
import { listLibraryDrafts, readLibraryDraft, writeLibraryDraft, type DraftSummary, type DraftAction } from '../../lib/smeta-studio/draft-library';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { saveToServer } from '../../lib/smeta-studio/server-save';
import { SmetaDocumentPanel } from '../../components/smeta-studio-pro/SmetaDocumentPanel';
import { studioPanelLabels } from '../../components/smeta-studio-pro/studioPanelLabels';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { narxKatalogi, type PriceCatalog } from '../../lib/narx-katalog/price-remote';
import { indeksniTayyorla } from '../../lib/smeta-studio/resource-match';
import { HUDUD_KALIT, lsGet, lsSet, unitTextOf } from './studio-sozlama';
import { KoeffitsientlarPaneli, NarxlashBosqichi, ResBosqichi } from './StudioBosqichlar';
import { MateriallarPaneli } from './StudioMateriallar';
import { SmetaAiChat } from './SmetaAiChat';
import { ishIndeksi } from '../../lib/smeta-ai/worker';
import { useStudioKontekst } from '../../lib/jarvis/useStudioKontekst';

const BOSQICH_KALIT = 'smeta-studio:bosqich';
const ACTIVE_DRAFT_KEY = 'smeta-studio:active-draft-v2';
type Bosqich = 'lrv' | 'narx' | 'res';

const uid = () => crypto.randomUUID();

const XATOLAR: Record<string, string> = {
  QUANTITY_INVALID: 'Hajm noto‘g‘ri: musbat son kiriting (masalan 4 yoki 4,5).',
  BASIS_INVALID: 'Normaning hisob asosi noto‘g‘ri.',
  BASIS_EVIDENCE_REQUIRED: 'Hisob asosi uchun dalil (hujjat/band) kiriting.',
  PRICE_INVALID: 'Narx noto‘g‘ri: musbat son kiriting.',
  PRICE_EVIDENCE_REQUIRED: 'Narx manbasini (hujjat, sana) kiriting.',
  SECTION_NAME_REQUIRED: 'Bo‘lim nomini kiriting.',
  SECTION_NOT_EMPTY: 'Bo‘limda ish yoki podrazdel bor — avval ularni ko‘chiring yoki o‘chiring.',
  SECTION_DEPTH_LIMIT: 'Bo‘limlar 12 darajadan chuqur bo‘lmaydi.',
  SECTION_CYCLE: 'Bo‘limni o‘z ichidagi podrazdelga ko‘chirib bo‘lmaydi.',
  WORK_AMBIGUOUS: 'Bir shifrga ikki ish yozuvi mos keladi — bu ish hisobga qo‘shilmaydi.',
  RECIPE_LIMIT_REVIEW_REQUIRED: 'Ishda 1000 dan ortiq resurs — alohida ko‘rib chiqish kerak.',
  CONVERSION_EVIDENCE_REQUIRED: 'Birlik o‘tkazish koeffitsienti uchun dalil kiriting.',
  SUBSTITUTION_REASON_REQUIRED: 'Almashtirish sababini kiriting.',
  TARGET_REQUIRED: 'O‘ng tomonda ish qo‘shiladigan bo‘limni tanlang yoki yarating.',
};
const xatoMatni = (e: unknown) => { const c = e instanceof Error ? e.message : String(e); return t(XATOLAR[c] ?? 'Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.'); };
export default function SmetaStudio() {
  const [katalog, setKatalog] = useState<StudioNormCatalog | null>(null);
  const [catalogSource, setCatalogSource] = useState<'legacy' | 'library'>(() => lsGet('studio:catalog-source') === 'legacy' ? 'legacy' : 'library');
  const catalogSession = useRef(0);
  const aiSession = catalogSession.current;
  const [katalogHolat, setKatalogHolat] = useState<'yuklanmoqda' | 'tayyor' | 'yoq' | 'xato'>('yuklanmoqda');
  const [hist, setHist] = useState<History>(() => historyOf(emptyDoc(uid())));
  const [tiklandi, setTiklandi] = useState(false);
  const [xato, setXato] = useState('');
  const [lastAction,setLastAction]=useState('');
  const [nishon, setNishon] = useState<string | null>(null);
  const restored = useRef(false);
  const [yuklandi, setYuklandi] = useState(false);
  const { joriyId } = useKompaniya();
  const currentCompany=useRef(joriyId); currentCompany.current=joriyId;
  const [serverVersiya, setServerVersiya] = useState(0);
  const [panels,setPanels]=useState<2|3>(()=>lsGet('studio:panels')==='2' ? 2 : 3);
  const [commandOpen,setCommandOpen]=useState(false);
  const [leftWidth,setLeftWidth]=useState(()=>Math.max(210,Math.min(340,Number(lsGet('studio:left-width')) || 250))),[rightWidth,setRightWidth]=useState(()=>Math.max(310,Math.min(470,Number(lsGet('studio:right-width')) || 350)));
  useEffect(()=>{lsSet('studio:panels',String(panels));lsSet('studio:left-width',String(leftWidth));lsSet('studio:right-width',String(rightWidth));},[panels,leftWidth,rightWidth]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){e.preventDefault();setCommandOpen(v=>!v);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const [inspectorTab,setInspectorTab]=useState<InspectorTab>('work');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [workspaceView,setWorkspaceView]=useState<'overview'|'editor'|'calculator'>('editor');
  const [worksheet,setWorksheet]=useState(true);
  const [cloudOpen,setCloudOpen]=useState(false);
  const [autoSave,setAutoSave]=useState<{company:number;draft:string}|null>(null);
  const serverBusy=useRef(false);
  const lastServerSave=useRef<{company:number;draft:string;snapshot:EstimateDoc}|null>(null);
  const [focusWorkId, setFocusWorkId] = useState<string | null>(null);
  const [revealToken,setRevealToken]=useState(0);
  const draftActionLock=useRef(false);
  const [draftBusy,setDraftBusy]=useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [localStatus, setLocalStatus] = useState<'saving' | 'saved' | 'error' | 'conflict' | ''>('');
  const localVersions = useRef(new Map<string, number>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const currentDraft = useRef<{id:string;edits:number;snapshot:EstimateDoc|null}>({ id: '', edits: 0, snapshot:null });
  const [saqlash, setSaqlash] = useState<{ holat: 'tayyor' | 'saqlanmoqda' | 'saqlandi' | 'xato'; matn: string; edits: number | null }>({ holat: 'tayyor', matn: '', edits: null });
  const pendingOp = useRef<{ id: string; edits: number; draftId: string; snapshot:EstimateDoc } | null>(null);
  const doc = hist.present;
  const saveAction=useRef(serverga);saveAction.current=serverga;
  currentDraft.current = { id: doc.draftId, edits: doc.edits, snapshot:doc };
  const hisob = useMemo(() => calcDoc(doc), [doc]);
  const [narxKat, setNarxKat] = useState<PriceCatalog | null>(null);
  // The AI estimator is the default entry: describe the work in words; the catalogue stays one click away.
  const [hudud, setHududState] = useState<string>(() => lsGet(HUDUD_KALIT) ?? '');
  const setHudud = (v: string) => { setHududState(v); lsSet(HUDUD_KALIT, v); };
  const unitText = useMemo(() => unitTextOf(katalog), [katalog]);
  useStudioKontekst(doc, hisob, unitText, joriyId ?? null);
  // Owner workflow (2026-10-13): build the LRV first, then go to pricing (rates + sourced prices), then the RES.
  const [bosqich, setBosqichState] = useState<Bosqich>('lrv');
  const [openedViews,setOpenedViews]=useState<Bosqich[]>([]);
  const setBosqich = (b: Bosqich) => { setWorkspaceView('editor'); setOpenedViews(old=>old.includes(b) ? old : [...old,b]); setReviewOpen(false); setBosqichState(b); lsSet(BOSQICH_KALIT, b); };
  const ishlarSoni = Object.keys(doc.occurrences).length;
  const hajmsiz = Object.values(doc.occurrences).filter(o => o.quantity == null).length;
  // Warm the price matcher index in the background while the user works on the LRV — pricing then starts at once.
  useEffect(() => { let alive = true; narxKatalogi().then(c => { if (alive) setNarxKat(c); void indeksniTayyorla(c.matchView()); }).catch(() => {}); return () => { alive = false; }; }, []);
  // One local draft per browser: a second open studio tab would overwrite it (seen in a real run) — say so plainly.
  const [boshqaTab, setBoshqaTab] = useState(false);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('smeta-studio-tab');
    const men = Math.random().toString(36).slice(2);
    ch.onmessage = (e: MessageEvent<{ tur: string; kim: string }>) => {
      if (!e.data || e.data.kim === men) return;
      setBoshqaTab(true);
      if (e.data.tur === 'salom') ch.postMessage({ tur: 'shu-yerda', kim: men });
    };
    ch.postMessage({ tur: 'salom', kim: men });
    return () => ch.close();
  }, []);

  function activeDraft(companyId:number | null,draftId:string) {
    try { sessionStorage.setItem(ACTIVE_DRAFT_KEY,JSON.stringify({companyId,draftId})); } catch { /* library remains recoverable if session storage is unavailable */ }
  }
  async function restoreForTab() {
    try {
      const pointer=JSON.parse(sessionStorage.getItem(ACTIVE_DRAFT_KEY) ?? 'null');
      if (pointer && typeof pointer.draftId==='string' && (pointer.companyId===null || Number.isSafeInteger(pointer.companyId))) {
        const saved=await readLibraryDraft(pointer.companyId,pointer.draftId);
        if (saved) return {doc:saved.doc,serverVersion:saved.serverVersion};
      }
    } catch { /* fall back to the legacy recovery pointer */ }
    return loadLastDraft();
  }
  useEffect(() => {
    let alive = true;
    setKatalog(null);
    setKatalogHolat('yuklanmoqda');
    (catalogSource === 'legacy' ? RemoteNormCatalog.open() : NormLibraryCatalog.open()).then(c => { if (alive) { setKatalog(c); setKatalogHolat('tayyor'); } })
      .catch(e => { if (alive) setKatalogHolat(e instanceof Error && e.message === 'NORM_CATALOG_NOT_FOUND' ? 'yoq' : 'xato'); });
    return () => { alive = false; };
  }, [catalogSource]);
  useEffect(() => {
    let alive = true;
    restoreForTab().then(async d => {
      if (!alive || restored.current) return;
      restored.current = true;
      // An empty draft is restored too: its id keys the AI conversation, which must survive a reload before the first work.
      if (d) {
        const scope = d.doc.context.companyId ?? joriyId ?? null;
        try { const saved=await readLibraryDraft(scope,d.doc.draftId); localVersions.current.set(`${scope}:${d.doc.draftId}`,saved?.revision ?? 0); if (saved) d={doc:saved.doc,serverVersion:saved.serverVersion}; } catch { /* legacy recovery remains available */ }
        if (!alive) return;
        const bor = !!(d.doc.rootOrder.length || Object.keys(d.doc.occurrences).length);
        const restoredDoc=d.doc;
        setHist(historyOf(restoredDoc)); setTiklandi(bor); setServerVersiya(d.serverVersion);
        setNishon(restoredDoc.rootOrder.find(id => restoredDoc.sections[id]) ?? null);
      }
      setYuklandi(true);
    });
    return () => { alive = false; };
  }, []);
  // Saved as soon as the stored draft is read — a brand-new draft too (its id keys the AI conversation across reloads).
  useEffect(() => {
    if (!yuklandi) return;
    setLocalStatus('saving');
    const timer = setTimeout(() => { void persistDraft(doc, serverVersiya); }, 600);
    return () => clearTimeout(timer);
  }, [doc, serverVersiya, yuklandi]);
  useEffect(()=>{
    if(!autoSave || autoSave.company!==joriyId || autoSave.draft!==doc.draftId || (!doc.rootOrder.length && serverVersiya===0) || (doc.context.companyId!=null && doc.context.companyId!==joriyId))return;
    const saved=lastServerSave.current;
    if(saved?.company===joriyId && saved.draft===doc.draftId && saved.snapshot===doc)return;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const flush=()=>{
      if(stopped)return;
      // Keep the queued edit until the in-flight request settles; do not drop it
      // merely because its debounce expired while a request was pending.
      if(serverBusy.current){timer=setTimeout(flush,250);return;}
      void saveAction.current();
    };
    timer=setTimeout(flush,4000);
    return()=>{stopped=true;clearTimeout(timer);};
  },[autoSave,doc,joriyId,serverVersiya]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); setHist(h => e.shiftKey ? redo(h) : undo(h)); }
      if (e.key.toLowerCase() === 'y') { e.preventDefault(); setHist(h => redo(h)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function run(cmd: StudioCommand): boolean {
    try { setHist(h => dispatch(h, cmd)); setXato(''); return true; }
    catch (e) { setXato(xatoMatni(e)); return false; }
  }
  /** Validate synchronously against the current document so errors surface immediately. */
  function amal(cmd: StudioCommand): boolean {
    try { dispatch(hist, cmd); } catch (e) { setXato(xatoMatni(e)); return false; }
    const ok=run(cmd);
    if(ok) {
      const titles:Partial<Record<StudioCommand['type'],string>>={SET_QUANTITY:'Hajm yangilandi',ADD_OCCURRENCE:'Ish qo‘shildi',REMOVE_OCCURRENCE:'Ish olib tashlandi',ADD_SECTION:'Bo‘lim yaratildi',SET_PRICE:'Narx yangilandi',BATCH:'Guruh amali bajarildi',SET_CONTEXT:'Smeta ma’lumoti yangilandi'};
      setLastAction(t(titles[cmd.type] ?? 'O‘zgarish qo‘llandi'));
    }
    return ok;
  }
  function persistDraft(snapshot: EstimateDoc, version: number): Promise<boolean> {
    const companyId=snapshot.context.companyId ?? joriyId ?? null;
    const versionKey=`${companyId}:${snapshot.draftId}`;
    const result=saveQueue.current.then(async()=>{
      if (currentDraft.current.id===snapshot.draftId) setLocalStatus('saving');
      if (!localVersions.current.has(versionKey)) {
        const old=await readLibraryDraft(companyId,snapshot.draftId);
        if (old && JSON.stringify(old.doc)!==JSON.stringify(snapshot)) throw new Error('LOCAL_VERSION_CONFLICT');
        localVersions.current.set(versionKey,old?.revision ?? 0);
      }
      const saved=await writeLibraryDraft(companyId,snapshot,version,localVersions.current.get(versionKey)!);
      localVersions.current.set(versionKey,saved.revision);
      const isCurrent=currentDraft.current.id===snapshot.draftId;
      if (isCurrent) activeDraft(companyId,snapshot.draftId);
      const last=isCurrent ? await saveDraft(snapshot,version) : true;
      if (currentDraft.current.id===snapshot.draftId && currentDraft.current.snapshot===snapshot) setLocalStatus(saved.indexed!==false && last ? 'saved' : 'error');
      return saved.indexed!==false && last;
    }).catch(e=>{
      if (currentDraft.current.id===snapshot.draftId) setLocalStatus(e instanceof Error && e.message==='LOCAL_VERSION_CONFLICT' ? 'conflict' : 'error');
      return false;
    });
    saveQueue.current=result.then(()=>undefined);
    return result;
  }
  async function draftAction(action: DraftAction) {
    if (draftActionLock.current || saqlash.holat==='saqlanmoqda') return;
    draftActionLock.current=true;setDraftBusy(true);
    try { await action(); } finally { draftActionLock.current=false;setDraftBusy(false); }
  }
  function yangiQoralama() { return draftAction(async()=>{
    if (!await persistDraft(doc,serverVersiya)) return;
    const fresh=emptyDoc(uid()); fresh.context.companyId=joriyId ?? null;
    if (!await persistDraft(fresh,0)) {setLocalStatus('error');return;}
    activeDraft(fresh.context.companyId,fresh.draftId);
    setHist(historyOf(fresh)); setNishon(null); setTiklandi(false); setServerVersiya(0); pendingOp.current=null;
    setFocusWorkId(null); setLibraryOpen(false); setOpenedViews(['lrv']); setBosqich('lrv'); setLocalStatus('');
    setSaqlash({holat:'tayyor',matn:'',edits:null});
  }); }
  function kutubxona() { return draftAction(async()=>{
    await persistDraft(doc,serverVersiya);
    try { setDrafts(await listLibraryDrafts(joriyId ?? null)); setLibraryOpen(true); }
    catch { setLocalStatus('error'); }
  }); }
  function qoralamaOch(id: string) { return draftAction(async()=>{
    if (!await persistDraft(doc,serverVersiya)) return;
    try {
      const saved=await readLibraryDraft(joriyId ?? null,id);
      if (!saved) { setLocalStatus('error'); return; }
      localVersions.current.set(`${saved.companyId}:${id}`,saved.revision);
      activeDraft(saved.companyId,id);
      setHist(historyOf(saved.doc)); setServerVersiya(saved.serverVersion); pendingOp.current=null;
      setNishon(saved.doc.rootOrder.find(id=>saved.doc.sections[id]) ?? null); setFocusWorkId(null); setLibraryOpen(false); setTiklandi(true); setOpenedViews(['lrv']); setBosqich('lrv');
      setSaqlash({holat:'tayyor',matn:'',edits:null}); setLocalStatus('saved');
    } catch { setLocalStatus('error'); }
  }); }
  function qoralamaNusxa() { return draftAction(async()=>{
    const snapshot={...doc,draftId:uid()};
    if (!await persistDraft(snapshot,0)) {setLocalStatus('error');return;}
    activeDraft(snapshot.context.companyId ?? joriyId ?? null,snapshot.draftId);
    setHist(historyOf(snapshot)); setServerVersiya(0); pendingOp.current=null; setLocalStatus('saved');
  }); }
  async function serverga() {
    if(serverBusy.current)return;
    if (joriyId == null) { setSaqlash({ holat: 'xato', matn: t('Avval yuqorida kompaniyani tanlang.'), edits: null }); return; }
    if(doc.context.companyId!=null && doc.context.companyId!==joriyId){setSaqlash({holat:'xato',matn:t('Bu qoralama boshqa kompaniyaga bog‘langan. Avval o‘sha kompaniyani tanlang.'),edits:null});return;}
    serverBusy.current=true;
    // Same logical save (same draft + same edit state) keeps its operation_id across retries.
    if (!pendingOp.current || pendingOp.current.snapshot !== doc || pendingOp.current.draftId !== doc.draftId) pendingOp.current = { id: uid(), edits: doc.edits, draftId: doc.draftId, snapshot:doc };
    setSaqlash({ holat: 'saqlanmoqda', matn: t('Saqlanmoqda...'), edits: null });
    const r = await saveToServer({ kompaniyaId: joriyId, obyektId: doc.context.objectId, doc, expectedVersion: serverVersiya, operationId: pendingOp.current.id });
    serverBusy.current=false;
    if (currentDraft.current.id!==doc.draftId || currentCompany.current!==joriyId) { setSaqlash({holat:'xato',matn:t('Saqlash davomida kompaniya yoki qoralama almashdi. Joriy versiya o‘zgartirilmadi.'),edits:null}); return; }
    if (r.ok) { pendingOp.current = null; lastServerSave.current={company:joriyId,draft:doc.draftId,snapshot:doc}; setServerVersiya(r.versiya); setSaqlash({ holat: 'saqlandi', matn: t('Serverga saqlandi (versiya {v}).', { v: r.versiya }), edits: doc.edits }); return; }
    if (r.code !== 'NETWORK') pendingOp.current = null;
    if(r.code==='VERSION_CONFLICT')setAutoSave(null);
    const matn = r.code === 'VERSION_CONFLICT' ? t('Bu qoralamani boshqa oyna yoki foydalanuvchi o‘zgartirgan (server versiyasi {v}). Ustidan yozilmadi.', { v: 'versiya' in r ? r.versiya ?? '—' : '—' })
      : r.code === 'NETWORK' ? t('Tarmoq xatosi — qayta bosing, saqlash takrorlanmaydi.')
      : r.code === 'FORBIDDEN' ? t('Bu kompaniyaga yozish huquqi yo‘q.')
      : r.code === 'AUTH_REQUIRED' ? t('Sessiya tugagan — qayta kiring.')
      : t('Server saqlash hali faollashtirilmagan yoki xato berdi. Qoralama brauzerda saqlanib turibdi.');
    setSaqlash({ holat: 'xato', matn, edits: null });
  }

  function openWork(id:string) {setFocusWorkId(id);setRevealToken(v=>v+1);}
  const selectedWorkId=focusWorkId && doc.occurrences[focusWorkId] ? focusWorkId : Object.values(doc.occurrences)[0]?.id ?? null;
  function deskAction(action:DeskAction) {
    if(action==='save'){void serverga();return;}
    if(action==='catalog'){setPanels(3);setBosqich('lrv');return;}
    if(action==='review'){setReviewOpen(true);setWorkspaceView('editor');return;}
    setInspectorTab(action);
  }
  async function openCloud(docFromServer:EstimateDoc,version:number) {
    const requestedCompany=joriyId;
    const sameDraft=()=>currentDraft.current.id===doc.draftId && currentDraft.current.snapshot===doc;
    if(requestedCompany==null || currentCompany.current!==requestedCompany || !sameDraft()) return;
    await draftAction(async()=>{
      if(!await persistDraft(doc,serverVersiya)) return;
      if(currentCompany.current!==requestedCompany || !sameDraft()) return;
      const local=await readLibraryDraft(requestedCompany,docFromServer.draftId);
      if(local && JSON.stringify(local.doc)!==JSON.stringify(docFromServer)) {
        const backup={...local.doc,draftId:uid()};
        if(!await persistDraft(backup,0)) return;
      }
      if(currentCompany.current!==requestedCompany || !sameDraft())return;
      localVersions.current.set(`${requestedCompany}:${docFromServer.draftId}`,local?.revision ?? 0);
      const restoredDoc={...docFromServer,context:{...docFromServer.context,companyId:requestedCompany}};
      if(!await persistDraft(restoredDoc,version))return;
      if(currentCompany.current!==requestedCompany || !sameDraft())return;
      activeDraft(requestedCompany,restoredDoc.draftId);
      lastServerSave.current={company:requestedCompany,draft:restoredDoc.draftId,snapshot:restoredDoc};
      setHist(historyOf(restoredDoc));setServerVersiya(version);pendingOp.current=null;setNishon(restoredDoc.rootOrder[0] ?? null);setFocusWorkId(null);setCloudOpen(false);setWorkspaceView('editor');setSaqlash({holat:'tayyor',matn:'',edits:null});
    });
  }
  return <div className="studio-desk">
    <KoeffitsientlarPaneli doc={doc} command={amal} kompaniyaId={joriyId ?? null} agentOnly/>
    <header className="studio-desk-header">
      <div className="studio-brand"><span className="studio-brand-icon" aria-hidden="true">S</span><div><h1>{t('Smeta Studio')}</h1><small>{t('LOYIHADAN ANIQ HISOBGACHA')}</small></div></div>
      <div><strong>{doc.context.title || t('Yangi smeta')}</strong><span className="ml-2 text-[10px] text-text-dim">{t('Qoralama')}</span></div>
      <div className="studio-desk-actions">
        <button className="studio-action" aria-label={t('Bekor qilish')} disabled={!hist.past.length} onClick={()=>setHist(undo)} title={t('Ctrl+Z')}>↶ {t('Bekor qilish')}</button>
        <button className="studio-action" aria-label={t('Qaytarish')} disabled={!hist.future.length} onClick={()=>setHist(redo)} title={t('Ctrl+Y')}>↷ {t('Qaytarish')}</button>
        <button className="studio-action" onClick={()=>setInspectorTab('ai')}>{t('Smetachi AI')}</button>
        <details className="studio-popover"><summary className="studio-action">{t('Fayl')} ▾</summary><div>
          <button className="studio-action" disabled={draftBusy || saqlash.holat==='saqlanmoqda'} onClick={()=>void yangiQoralama()}>{t('Yangi qoralama')}</button>
          <button className="studio-action" disabled={draftBusy} onClick={()=>void kutubxona()}>{t('Saqlangan qoralamalar')}</button>
          <button className="studio-action" onClick={()=>setCloudOpen(v=>!v)}>{t('Serverdagi smetalar')}</button>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!joriyId || (doc.context.companyId!=null && doc.context.companyId!==joriyId)} checked={autoSave?.draft===doc.draftId && autoSave.company===joriyId} onChange={e=>setAutoSave(e.target.checked && joriyId ? {company:joriyId,draft:doc.draftId} : null)}/>{t('Serverga avtomatik saqlash')}</label>
        </div></details>
        <button className="studio-action studio-primary" disabled={draftBusy || saqlash.holat==='saqlanmoqda' || (!doc.rootOrder.length && serverVersiya===0)} onClick={()=>void serverga()}>{saqlash.holat==='saqlanmoqda' ? t('Saqlanmoqda…') : t('Serverga saqlash')}</button>
      </div>
    </header>
    {saqlash.matn && <p role={saqlash.holat === 'xato' ? 'alert' : 'status'} className={`text-sm ${saqlash.holat === 'xato' ? 'text-danger' : 'text-accent'}`}>{saqlash.matn}{saqlash.holat === 'saqlandi' && lastServerSave.current?.snapshot !== doc ? ' ' + t('Keyin o‘zgarishlar bor — qayta saqlang.') : ''}</p>}
    {tiklandi && <p role="status" className="sr-only">{t('Oxirgi qoralama tiklandi.')}</p>}
    {boshqaTab && <p role="alert" className="text-sm text-warn">{t('Smeta studiyasi boshqa tabda ham ochilgan. Bir qoralama bo‘yicha konflikt chiqsa, o‘zgarishlarni nusxa sifatida saqlang.')}</p>}
    {xato && <p role="alert" className="text-sm text-danger">{xato}</p>}

    {(localStatus==='error' || localStatus==='conflict') && <p role="alert" className="text-sm text-danger">{localStatus==='conflict' ? t('Qoralama boshqa tabda o‘zgargan. Ustidan yozilmadi; o‘zgarishlarni nusxa sifatida saqlang.') : t('Qoralama qurilmada saqlanmadi. Hozirgi oynani yopmang; qayta urinib ko‘ring.')}</p>}
    {localStatus==='error' && <button type="button" className="tugma h-8 px-2" disabled={draftBusy} onClick={()=>void persistDraft(doc,serverVersiya)}>{t('Qayta urinish')}</button>}
    {localStatus==='conflict' && <button type="button" className="tugma h-8 px-2" onClick={()=>void qoralamaNusxa()}>{t('Qoralamani nusxa sifatida saqlash')}</button>}

    {cloudOpen && <CloudDrafts key={joriyId} company={joriyId ?? null} onOpen={openCloud} onClose={()=>setCloudOpen(false)}/>}
    {libraryOpen && <section className="karta space-y-2 p-3" aria-label={t('Saqlangan qoralamalar')}>
      <div className="flex items-center justify-between"><h2 className="font-semibold">{t('Saqlangan qoralamalar')}</h2><button type="button" onClick={()=>setLibraryOpen(false)}>{t('Yopish')}</button></div>
      <p className="text-xs text-text-dim">{t('Bu qurilmadagi nusxalar. Serverga saqlash alohida bajariladi.')}</p>
      <ul className="max-h-64 overflow-auto">{drafts.map(d=><li key={d.draftId} className="border-b border-border py-2 text-sm"><button type="button" className="text-left underline" disabled={draftBusy || saqlash.holat==='saqlanmoqda'} onClick={()=>void qoralamaOch(d.draftId)}>{d.title || d.objectLabel || t('Nomsiz smeta')}</button><span className="ml-2 text-xs text-text-dim">{t('{n} ta ish',{n:d.works})} · {new Date(d.savedAt).toLocaleString()}</span></li>)}</ul>
    </section>}

    <div className="studio-commandbar">
      <div className="studio-mode-buttons" aria-label={t('Panel tartibi')}><button aria-pressed={panels===2} onClick={()=>setPanels(2)}>{t('2 panel')}</button><button aria-pressed={panels===3} onClick={()=>setPanels(3)}>{t('3 panel')}</button></div>
      <button className="studio-quick-open" onClick={()=>setCommandOpen(true)}><span aria-hidden="true">⌕</span>{t('Amal yoki ishni topish…')}<kbd>{t('Ctrl K')}</kbd></button>
      <div className="studio-resize"><label>{t('Katalog')} <input aria-label={t('Katalog paneli kengligi')} type="range" min="210" max="340" value={leftWidth} onChange={e=>setLeftWidth(Number(e.target.value))}/></label><label>{t('Nazoratchi')} <input aria-label={t('Nazorat paneli kengligi')} type="range" min="310" max="470" value={rightWidth} onChange={e=>setRightWidth(Number(e.target.value))}/></label></div>
    </div>
    <div className="studio-columns" data-panels={panels} style={{'--studio-left':`${leftWidth}px`,'--studio-right':`${rightWidth}px`} as CSSProperties}>
      <section hidden={panels===2} aria-label={t('Normativ katalog')} className="studio-library studio-pane">
        <div className="studio-pane-title"><span className="studio-step">01</span><strong>{t('Katalog va bo‘limlar')}</strong><span className="text-[10px] text-text-dim">{(katalog?.manifest.counts.basis ?? katalog?.manifest.counts.works)?.toLocaleString('ru') ?? '…'}</span></div>
        <label className="px-2 text-sm">{t('Kutubxona manbasi')}
          <select className="block w-full min-w-0 p-2 border border-border rounded bg-bg text-sm" aria-label={t('Kutubxona manbasi')} value={catalogSource} onChange={e => {
            lsSet('studio:catalog-source', e.target.value);
            catalogSession.current++;
            setKatalog(null); setKatalogHolat('yuklanmoqda');
            setCatalogSource(e.target.value as 'legacy' | 'library');
          }}>
            <option value="legacy">{t('Amaldagi kutubxona')}</option>
            <option value="library">{t('Nomlangan kutubxona · 2.8.1')}</option>
          </select>
        </label>
        <StudioSections doc={doc} target={nishon} onTarget={setNishon} command={amal}/>
        <div className="studio-pane-scroll">
          <details className="studio-context"><summary>{t('Smeta va obyekt sozlamalari')}</summary><ObjectBinding doc={doc} company={joriyId ?? null} command={amal}/></details>
        {katalogHolat === 'yuklanmoqda' && <p className="text-text-dim">{t('Normativ katalog yuklanmoqda...')}</p>}
        {katalogHolat === 'yoq' && <p className="text-warn">{t('Platforma normativ katalogi hali yuklanmagan.')}</p>}
        {katalogHolat === 'xato' && <p className="text-danger">{t('Katalog ochilmadi. Sahifani yangilab qayta urinib ko‘ring.')}</p>}
        {katalog && <KatalogPanel key={`${catalogSource}:${katalog.manifest.revision}`} katalog={katalog} commandError={xato} nishon={nishon ? doc.sections[nishon]?.name ?? null : null}
          onAdd={(work, detail, quantity) => {
            try {
              if (!detail.recipeCount) throw new Error('Resurs retsepti yo‘q — ishni smetaga qo‘shib bo‘lmaydi.');
              const tableLabel = katalog.tableLabel(work.id);
              const snap = snapshotWork(katalog, detail.work.id, katalog.manifest.revision, tableLabel);
              const target=nishon && doc.sections[nishon] ? nishon : doc.rootOrder.find(id=>doc.sections[id]) ?? null;
              const sectionId=target ?? uid();
              const add:StudioCommand={ type: 'ADD_OCCURRENCE', occurrenceId: uid(), sectionId, source: snap.source, recipe: snap.recipe,
                quantity: quantity.trim() || null, basis: catalogueBasis(katalog, work.unitCode) };
              const ok=amal(target ? add : {type:'BATCH',label:t('Birinchi ishni qo‘shish'),commands:[{type:'ADD_SECTION',sectionId,parentId:null,name:t('Asosiy ishlar')},add]});
              if(ok) {setNishon(sectionId);setBosqich('lrv');}
              return ok;
            } catch (e) { setXato(xatoMatni(e)); return false; }
          }} />}

        </div>
      </section>
      <main className="studio-workarea studio-pane" aria-label={t('Smeta jadvali')}>
        <div className="studio-pane-title"><span className="studio-step">02</span><strong>{t('Smeta')}</strong><nav aria-label={t('Smeta ish joyi')} className="studio-center-tabs">
          {([['lrv','Ishlar'],['narx','Narxlar'],['review','Tekshiruv'],['res','Hujjatlar']] as const).map(([key,label])=><button key={key} aria-current={(key==='review' ? reviewOpen : !reviewOpen && bosqich===key) ? 'page' : undefined} onClick={()=>{setWorkspaceView('editor');if(key==='review')setReviewOpen(true);else setBosqich(key);}}>{t(label)}</button>)}
        </nav></div>
        <div className="studio-center-content">
        {workspaceView==='editor' && reviewOpen && <WorkspaceReview doc={doc} calculation={hisob} onPrices={()=>setBosqich('narx')} onWork={openWork} />}
        {openedViews.includes('narx') && <div hidden={workspaceView!=='editor' || reviewOpen || bosqich!=='narx'}><NarxlashBosqichi key={`${joriyId}:${doc.draftId}`}  doc={doc} hisob={hisob} command={amal} kompaniyaId={joriyId ?? null} hudud={hudud} setHudud={setHudud} unitText={unitText} onNext={() => setBosqich('res')} /></div>}
        {openedViews.includes('res') && <div hidden={workspaceView!=='editor' || reviewOpen || bosqich!=='res'}><DocumentCenter doc={doc} calculation={hisob} onReview={()=>{setWorkspaceView('editor');setReviewOpen(true);}}><ResBosqichi key={`${joriyId}:${doc.draftId}`} doc={doc} hisob={hisob} unitText={unitText} katalog={katalog} kompaniyaId={joriyId ?? null} onBack={() => setBosqich('narx')} /></DocumentCenter></div>}

          <div hidden={workspaceView!=='editor' || reviewOpen || bosqich!=='lrv'}>
            <div className="flex gap-2 border-b border-border px-3 py-2"><button className={`tugma ${worksheet ? 'tugma-asosiy' : ''}`} onClick={()=>setWorksheet(true)}>{t('Jadval')}</button><button className={`tugma ${!worksheet ? 'tugma-asosiy' : ''}`} onClick={()=>setWorksheet(false)}>{t('Tarkib va bo‘limlar')}</button><button className="tugma ml-auto" onClick={()=>{setPanels(3);setBosqich('lrv');}}>{t('+ Ish qo‘shish')}</button></div>
            {worksheet && <WorkSheet docked activeWorkId={selectedWorkId} revealToken={revealToken} doc={doc} calculation={hisob} command={amal} onWork={openWork} renderDetails={()=>null}/>}
        <div hidden={worksheet}>
        <SmetaDocumentPanel focusWorkId={focusWorkId} renderWorkDetails={id=><KoeffitsientlarPaneli doc={doc} command={amal} kompaniyaId={joriyId ?? null} workId={id} />} doc={doc} total={hisob.total} calculation={hisob} targetSectionId={nishon}
          setTargetSection={setNishon} command={amal} labels={studioPanelLabels()}
          pricing={{ source: narxKat, unitText, region: hudud || null }} />
        </div>

            <details className="px-3 py-2 text-xs"><summary>{t('Loyiha materiallari')}</summary><MateriallarPaneli doc={doc} command={amal}/></details>
          </div>
        </div>
      </main>
      <StudioInspector doc={doc} calculation={hisob} workId={selectedWorkId} onWork={openWork} command={amal} pricing={{source:narxKat,unitText,region:hudud || null}} tab={inspectorTab} onTab={setInspectorTab}
        coefficients={selectedWorkId ? <KoeffitsientlarPaneli key={`${joriyId}:${doc.draftId}:${selectedWorkId}`} doc={doc} command={amal} kompaniyaId={joriyId ?? null} workId={selectedWorkId}/> : null}
        ai={<SmetaAiChat key={`${catalogSource}:${katalog?.manifest.revision ?? "loading"}`} selectedWorkId={selectedWorkId} doc={doc} katalog={katalog} kompaniyaId={joriyId ?? null} command={c => aiSession === catalogSession.current && !!katalog ? amal(c) : false} newId={uid} onBosqich={b => { if (aiSession === catalogSession.current) setBosqich(b); }}/>}
        calculator={<QuantityWorkbench key={doc.draftId} doc={doc} command={amal} onWork={openWork}/>}/>
    </div>
    {commandOpen && <StudioCommandMenu doc={doc} onAction={deskAction} onClose={()=>setCommandOpen(false)} onWork={id=>{openWork(id);setBosqich('lrv');setWorksheet(true);}}/>}
    <footer className="studio-footer"><span className="studio-live-dot"/><span role="status">{localStatus==='saved' ? t('Shu qurilmada saqlandi') : localStatus==='saving' ? t('Qurilmada saqlanmoqda...') : t('Qoralama')}</span><span role="status" className="text-accent">{lastAction}</span><span><strong>{ishlarSoni}</strong> {t('ish')} · <strong>{hajmsiz}</strong> {t('hajmsiz')}</span><span>{t('Ochiq masalalar')}: <strong>{hisob.total.unresolved}</strong></span><span className="studio-total">{t(hisob.total.amount==null ? 'Ma’lum qism' : 'Jami')}<strong>{Number(hisob.total.amount ?? hisob.total.knownAmount).toLocaleString('ru-RU',{maximumFractionDigits:2})} {doc.currency}</strong></span></footer>
  </div>;
}

/* ─────────────── Chap panel: katalog ─────────────── */
function KatalogPanel({ katalog, nishon, onAdd, commandError }: { katalog: StudioNormCatalog; nishon: string | null; commandError: string;
  onAdd: (work: NormWork, detail: NormDetail, quantity: string) => boolean }) {
  const [tugun, setTugun] = useState(-1), [tugunSahifa, setTugunSahifa] = useState(0);
  const [soz, setSoz] = useState(''), [qidiruv, setQidiruv] = useState(''), [sahifa, setSahifa] = useState(0);
  const [tanlangan, setTanlangan] = useState<NormWork | null>(null), [detail, setDetail] = useState<NormDetail | null>(null);
  const [yuklash, setYuklash] = useState(false), [resSahifa, setResSahifa] = useState(0), [hajm, setHajm] = useState('');
  const [xato, setXato] = useState('');
  const [addResult, setAddResult] = useState<'success' | 'failed' | null>(null);
  const [addedSection, setAddedSection] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setQidiruv(soz); setSahifa(0); }, 200); return () => clearTimeout(timer); }, [soz]);
  const selectionRequest = useRef(0);
  useEffect(() => () => { selectionRequest.current++; }, []);
  const bolalar = useMemo(() => katalog.childNodes(tugun, tugunSahifa), [katalog, tugun, tugunSahifa]);
  const yolak = useMemo(() => tugun >= 0 ? katalog.breadcrumb(tugun) : [], [katalog, tugun]);
  const jadvalmi = tugun >= 0 && katalog.node(tugun).isTable;
  const ishlar = useMemo(() => {
    if (!(qidiruv.trim() || jadvalmi)) return null;
    const r = katalog.search(qidiruv, sahifa, tugun);
    if (r.total || !qidiruv.trim() || tugun >= 0) return { ...r, mano: false };
    // No literal match: closest works by meaning (estimate wording differs from normative wording).
    const x = ishIndeksi(katalog);
    const rows = x ? x.idx.qidir([qidiruv], 75).map(h => x.works[h.id]) : [];
    return { rows: rows.slice(sahifa * 25, (sahifa + 1) * 25), total: rows.length, mano: true };
  }, [katalog, qidiruv, sahifa, tugun, jadvalmi]);
  const nom = (n: RemoteTreeNode) => n.name || t('Ish turlari');
  const ochish = (i: number) => { setTugun(i); setTugunSahifa(0); setSahifa(0); };
  async function tanla(w: NormWork) {
    const request = ++selectionRequest.current;
    setTanlangan(w); setDetail(null); setResSahifa(0); setHajm(''); setXato(''); setAddResult(null); setYuklash(true);
    try { await katalog.load(w.id); if (request === selectionRequest.current) setDetail(katalog.detail(w.id, 0)); }
    catch { if (request === selectionRequest.current) setXato(t('Ish resurslari yuklanmadi. Qayta urinib ko‘ring.')); }
    finally { if (request === selectionRequest.current) setYuklash(false); }
  }
  const unit = tanlangan ? katalog.unit(tanlangan.unitCode) : null;
  const sourceMeasure = 'sourceBasis' in katalog;
  const basis = detail ? catalogueBasis(katalog, detail.work.unitCode) : null;
  const measureLabel = unit?.text ?? (sourceMeasure ? detail?.work.unitCode : null);
  return <div className="space-y-2">
    {tugun >= 0 && katalog.breadcrumb(tugun).some(n => n.labelOrigin === 'EDITORIAL') && <p role="status" className="text-sm text-text-dim">{t('Bo‘lim nomlari ishlar mazmuni asosida tuzilgan.')}</p>}
    <nav aria-label={t('Katalog ierarxiyasi')} className="flex flex-wrap gap-1 text-sm">
      <button className="underline" onClick={() => ochish(-1)}>{t('Katalog')}</button>
      {yolak.map(n => <span key={n.index}>/ <button className="underline" onClick={() => ochish(n.index)}>{nom(n)}</button></span>)}
    </nav>
    <input className="w-full p-2 border border-border rounded bg-bg" aria-label={t('Normativ ish qidirish')}
      placeholder={tugun >= 0 ? t('Shu bo‘lim ichida qidirish: shifr yoki nom') : t('Ish shifri yoki nomi (lotin/kirill)')} value={soz} onChange={e => setSoz(e.target.value)} />
    {!ishlar && <div className="border border-border rounded">
      {bolalar.nodes.map(n => <button key={n.index} className="flex w-full items-center gap-2 text-left px-2 py-1.5 border-b border-border hover:bg-surface-2" onClick={() => ochish(n.index)}>
        <span className="flex-1 min-w-0 truncate">{nom(n)}</span>
        {n.labelOrigin === 'EDITORIAL' && <span className="text-xs text-text-mute">{t('Tahririy nom')}</span>}
        <span className="text-xs text-text-mute tabular-nums">{n.workCount.toLocaleString('ru')}</span>
      </button>)}
      {bolalar.total > 25 && <div className="flex gap-2 items-center p-1 text-sm">
        <button disabled={!tugunSahifa} onClick={() => setTugunSahifa(p => p - 1)}>{t('Oldingi')}</button>
        <span>{tugunSahifa + 1} / {Math.ceil(bolalar.total / 25)}</span>
        <button disabled={(tugunSahifa + 1) * 25 >= bolalar.total} onClick={() => setTugunSahifa(p => p + 1)}>{t('Keyingi')}</button>
      </div>}
    </div>}
    {ishlar && <div className="border border-border rounded">
      <p className="text-xs text-text-mute px-2 py-1">{ishlar.mano ? t('Aynan mos yozuv yo‘q — ma’no bo‘yicha eng yaqin ishlar') : <>{t('Topildi')}: {ishlar.total.toLocaleString('ru')}</>}</p>
      {ishlar.rows.map(w => <button key={w.id} className={`block w-full text-left px-2 py-1.5 border-b border-border hover:bg-surface-2 ${tanlangan?.id === w.id ? 'bg-surface-2' : ''}`} onClick={() => void tanla(w)}>
        <span className="font-mono text-xs text-accent">{w.code}</span> <span>{w.name ?? t('Nom noma’lum')}</span>
      </button>)}
      {ishlar.total > 25 && <div className="flex gap-2 items-center p-1 text-sm">
        <button disabled={!sahifa} onClick={() => setSahifa(p => p - 1)}>{t('Oldingi')}</button>
        <span>{sahifa + 1} / {Math.ceil(ishlar.total / 25)}</span>
        <button disabled={(sahifa + 1) * 25 >= ishlar.total} onClick={() => setSahifa(p => p + 1)}>{t('Keyingi')}</button>
      </div>}
    </div>}
    {yuklash && <p className="text-text-dim text-sm">{t('Resurslar yuklanmoqda...')}</p>}
    {xato && <p role="alert" className="text-danger text-sm">{xato}</p>}
    {tanlangan && detail && <div className="border border-accent rounded p-2 space-y-2">
      <h3 className="font-semibold"><span className="font-mono text-accent">{detail.work.code}</span> · {detail.work.name}</h3>
      <p className="text-sm">{t('O‘lchov birligi')}: {measureLabel ? <b>{measureLabel}</b> : <span className="text-warn">{t('manbada aniqlanmagan — qo‘shgandan keyin asosni kiriting')}</span>}
        {unit && <span className="text-xs text-text-mute"> · {t('real smetalarda {n} marta kuzatilgan', { n: unit.observations })}</span>}</p>
      {sourceMeasure && basis?.scale && basis.unitLabel && <p className="text-sm">{t('Norma masshtabi')}: <b>{basis.scale} {basis.unitLabel}</b></p>}
      {detail.recipeCount === 0 && <p role="status" className="text-sm text-warn">{t('Resurs retsepti yo‘q — ishni smetaga qo‘shib bo‘lmaydi.')}</p>}
      {detail.workCodeAmbiguous && <p className="text-danger text-sm">{t('Bir shifrga ikki ish yozuvi mos keladi — bu ish hisobga qo‘shilmaydi.')}</p>}
      <table className="w-full text-xs"><thead><tr className="text-text-mute"><th className="text-left">{t('Resurs')}</th><th className="text-right">{t('Norma')}</th><th className="text-left">{t('Holat')}</th></tr></thead>
        <tbody>{detail.recipes.map(r => <tr key={r.id} className="border-t border-border">
          <td>{r.resourceStatus === 'EXACT' ? r.candidates[0]?.name : <span className="text-warn">{r.resourceCode ?? r.resourceIdCode} — {t('{n} nomzod', { n: r.candidateCount })}</span>}</td>
          <td className="text-right tabular-nums">{r.norm ?? t('Noma’lum')}</td>
          <td>{r.resourceStatus === 'EXACT' ? '✓' : r.resourceStatus === 'AMBIGUOUS' ? t('noaniq') : t('topilmadi')}</td>
        </tr>)}</tbody></table>
      {detail.recipeCount > 25 && <div className="flex gap-2 text-xs">
        <button disabled={!resSahifa} onClick={() => { setResSahifa(p => p - 1); setDetail(katalog.detail(detail.work.id, resSahifa - 1)); }}>{t('Oldingi')}</button>
        <span>{resSahifa + 1} / {Math.ceil(detail.recipeCount / 25)}</span>
        <button disabled={(resSahifa + 1) * 25 >= detail.recipeCount} onClick={() => { setResSahifa(p => p + 1); setDetail(katalog.detail(detail.work.id, resSahifa + 1)); }}>{t('Keyingi')}</button>
      </div>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">{t('Hajm')}{basis?.unitLabel ? ` (${basis.unitLabel})` : ''}
          <input className="block w-32 p-1 border border-border rounded bg-bg" inputMode="decimal" value={hajm} onChange={e => { setHajm(e.target.value); setAddResult(null); }} placeholder="4,5" /></label>
        <button className="px-3 py-1.5 rounded bg-accent text-white disabled:opacity-40" disabled={detail.workCodeAmbiguous || detail.recipeCount === 0}
          onClick={() => {
            const ok = onAdd(tanlangan, detail, hajm);
            setAddResult(ok ? 'success' : 'failed');
            if (ok) { setAddedSection(nishon ?? ''); setHajm(''); }
          }}>{t('Smetaga qo‘shish')} →</button>
        <span className="text-xs text-text-mute">{nishon ? t('Bo‘lim: {n}', { n: nishon }) : t('Ish uchun bo‘lim avtomatik yaratiladi')}</span>
      </div>
      {addResult === 'success' && <p role="status" className="text-sm text-accent">{t('Ish «{nom}» «{bolim}» bo‘limiga qo‘shildi.', { nom: detail.work.name ?? detail.work.code, bolim: addedSection })}</p>}
      {addResult === 'failed' && <p role="alert" className="text-sm text-danger">{commandError || t('Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.')}</p>}
    </div>}
  </div>;
}
