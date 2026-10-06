/**
 * Smeta studiyasi — ikki panelli professional smeta muharriri.
 * Chap: platforma normativ katalogi (nomli daraxt, qidiruv, ish va resurslar).
 * O'ng: obyekt → bo'lim → podrazdel → ish occurrence → resurslar.
 * Barcha o'zgarish yagona buyruq qatlami (lib/smeta-studio/commands) orqali; chat ham shuni ishlatadi.
 * Hozircha qoralama: brauzerda tiklanadi, canonical saqlash alohida server buyrug'i bilan.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { RemoteNormCatalog, type NormDetail, type RemoteTreeNode } from '../../lib/catalog-extraction/norm-remote';
import type { NormWork } from '../../lib/catalog-extraction/norm-catalog';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { dispatch, historyOf, redo, undo, type History, type StudioCommand } from '../../lib/smeta-studio/commands';
import { calcDoc } from '../../lib/smeta-studio/calc';
import { snapshotWork, suggestedBasis } from '../../lib/smeta-studio/catalog-bridge';
import { loadLastDraft, saveDraft } from '../../lib/smeta-studio/draft-store';
import { saveToServer } from '../../lib/smeta-studio/server-save';
import { SmetaDocumentPanel } from '../../components/smeta-studio-pro/SmetaDocumentPanel';
import { studioPanelLabels } from '../../components/smeta-studio-pro/studioPanelLabels';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';

const uid = () => crypto.randomUUID();

const XATOLAR: Record<string, string> = {
  QUANTITY_INVALID: 'Hajm noto‘g‘ri: musbat son kiriting (masalan 4 yoki 4,5).',
  BASIS_INVALID: 'Normaning hisob asosi noto‘g‘ri.',
  BASIS_EVIDENCE_REQUIRED: 'Hisob asosi uchun dalil (hujjat/band) kiriting.',
  PRICE_INVALID: 'Narx noto‘g‘ri: musbat son kiriting.',
  PRICE_EVIDENCE_REQUIRED: 'Narx manbasini (hujjat, sana) kiriting.',
  SECTION_NAME_REQUIRED: 'Bo‘lim nomini kiriting.',
  SECTION_NOT_EMPTY: 'Bo‘limda ish yoki podrazdel bor — avval ularni ko‘chiring yoki o‘chiring.',
  SECTION_DEPTH_LIMIT: 'Podrazdel ichida yana podrazdel ochilmaydi.',
  WORK_AMBIGUOUS: 'Bir shifrga ikki ish yozuvi mos keladi — bu ish hisobga qo‘shilmaydi.',
  RECIPE_LIMIT_REVIEW_REQUIRED: 'Ishda 1000 dan ortiq resurs — alohida ko‘rib chiqish kerak.',
  CONVERSION_EVIDENCE_REQUIRED: 'Birlik o‘tkazish koeffitsienti uchun dalil kiriting.',
  SUBSTITUTION_REASON_REQUIRED: 'Almashtirish sababini kiriting.',
  TARGET_REQUIRED: 'O‘ng tomonda ish qo‘shiladigan bo‘limni tanlang yoki yarating.',
};
const xatoMatni = (e: unknown) => { const c = e instanceof Error ? e.message : String(e); return t(XATOLAR[c] ?? 'Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.'); };
export default function SmetaStudio() {
  const [katalog, setKatalog] = useState<RemoteNormCatalog | null>(null);
  const [katalogHolat, setKatalogHolat] = useState<'yuklanmoqda' | 'tayyor' | 'yoq' | 'xato'>('yuklanmoqda');
  const [hist, setHist] = useState<History>(() => historyOf(emptyDoc(uid())));
  const [tiklandi, setTiklandi] = useState(false);
  const [xato, setXato] = useState('');
  const [nishon, setNishon] = useState<string | null>(null);
  const restored = useRef(false);
  const { joriyId } = useKompaniya();
  const [serverVersiya, setServerVersiya] = useState(0);
  const [saqlash, setSaqlash] = useState<{ holat: 'tayyor' | 'saqlanmoqda' | 'saqlandi' | 'xato'; matn: string; edits: number | null }>({ holat: 'tayyor', matn: '', edits: null });
  const pendingOp = useRef<{ id: string; edits: number; draftId: string } | null>(null);
  const doc = hist.present;
  const hisob = useMemo(() => calcDoc(doc), [doc]);

  useEffect(() => {
    let alive = true;
    RemoteNormCatalog.open().then(c => { if (alive) { setKatalog(c); setKatalogHolat('tayyor'); } })
      .catch(e => { if (alive) setKatalogHolat(e instanceof Error && e.message === 'NORM_CATALOG_NOT_FOUND' ? 'yoq' : 'xato'); });
    loadLastDraft().then(d => {
      if (!alive || restored.current) return;
      restored.current = true;
      if (d && (d.doc.rootOrder.length || Object.keys(d.doc.occurrences).length)) {
        setHist(historyOf(d.doc)); setTiklandi(true); setServerVersiya(d.serverVersion);
        setNishon(d.doc.rootOrder.find(id => d.doc.sections[id]) ?? null);
      }
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    const timer = setTimeout(() => { void saveDraft(doc, serverVersiya); }, 600);
    return () => clearTimeout(timer);
  }, [doc, serverVersiya]);
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
    return run(cmd);
  }
  function yangiQoralama() {
    if (Object.keys(doc.occurrences).length && !window.confirm(t('Joriy qoralama yopiladi (undo tarixida qolmaydi). Davom etilsinmi?'))) return;
    setHist(historyOf(emptyDoc(uid()))); setNishon(null); setTiklandi(false); setServerVersiya(0); pendingOp.current = null;
    setSaqlash({ holat: 'tayyor', matn: '', edits: null });
  }
  async function serverga() {
    if (joriyId == null) { setSaqlash({ holat: 'xato', matn: t('Avval yuqorida kompaniyani tanlang.'), edits: null }); return; }
    // Same logical save (same draft + same edit state) keeps its operation_id across retries.
    if (!pendingOp.current || pendingOp.current.edits !== doc.edits || pendingOp.current.draftId !== doc.draftId) pendingOp.current = { id: uid(), edits: doc.edits, draftId: doc.draftId };
    setSaqlash({ holat: 'saqlanmoqda', matn: t('Saqlanmoqda...'), edits: null });
    const r = await saveToServer({ kompaniyaId: joriyId, obyektId: doc.context.objectId, doc, expectedVersion: serverVersiya, operationId: pendingOp.current.id });
    if (r.ok) { pendingOp.current = null; setServerVersiya(r.versiya); setSaqlash({ holat: 'saqlandi', matn: t('Serverga saqlandi (versiya {v}).', { v: r.versiya }), edits: doc.edits }); return; }
    if (r.code !== 'NETWORK') pendingOp.current = null;
    const matn = r.code === 'VERSION_CONFLICT' ? t('Bu qoralamani boshqa oyna yoki foydalanuvchi o‘zgartirgan (server versiyasi {v}). Ustidan yozilmadi.', { v: 'versiya' in r ? r.versiya ?? '—' : '—' })
      : r.code === 'NETWORK' ? t('Tarmoq xatosi — qayta bosing, saqlash takrorlanmaydi.')
      : r.code === 'FORBIDDEN' ? t('Bu kompaniyaga yozish huquqi yo‘q.')
      : r.code === 'AUTH_REQUIRED' ? t('Sessiya tugagan — qayta kiring.')
      : t('Server saqlash hali faollashtirilmagan yoki xato berdi. Qoralama brauzerda saqlanib turibdi.');
    setSaqlash({ holat: 'xato', matn, edits: null });
  }

  return <div className="p-4 space-y-3">
    <header className="flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold">{t('Smeta studiyasi')}</h1>
      <span className="text-xs border border-warn text-warn rounded px-2 py-0.5">{t('Qoralama — tasdiqlanmagan')}</span>
      {katalog && <span className="text-xs text-text-mute">{t('Normativ katalog')}: {katalog.manifest.counts.basis?.toLocaleString('ru')} {t('ish')}</span>}
      <span className="flex-1" />
      <button className="px-2 py-1 border border-border rounded disabled:opacity-40" disabled={!hist.past.length} onClick={() => setHist(undo)} title={"Ctrl+Z"}>{t('Bekor qilish')}</button>
      <button className="px-2 py-1 border border-border rounded disabled:opacity-40" disabled={!hist.future.length} onClick={() => setHist(redo)} title={"Ctrl+Y"}>{t('Qaytarish')}</button>
      <button className="px-2 py-1 border border-border rounded" onClick={yangiQoralama}>{t('Yangi qoralama')}</button>
      <button className="px-3 py-1 rounded bg-accent text-white disabled:opacity-40" disabled={saqlash.holat === 'saqlanmoqda' || !doc.rootOrder.length} onClick={() => void serverga()}>{t('Serverga saqlash')}</button>
    </header>
    {saqlash.matn && <p role={saqlash.holat === 'xato' ? 'alert' : 'status'} className={`text-sm ${saqlash.holat === 'xato' ? 'text-danger' : 'text-accent'}`}>{saqlash.matn}{saqlash.holat === 'saqlandi' && saqlash.edits !== doc.edits ? ' ' + t('Keyin o‘zgarishlar bor — qayta saqlang.') : ''}</p>}
    {tiklandi && <p role="status" className="text-sm text-accent">{t('Oxirgi qoralama tiklandi.')}</p>}
    {xato && <p role="alert" className="text-sm text-danger">{xato}</p>}
    <div className="grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-3 items-start">
      <section aria-label={t('Normativ katalog')} className="border border-border rounded-lg p-3 bg-surface-1 min-w-0">
        {katalogHolat === 'yuklanmoqda' && <p className="text-text-dim">{t('Normativ katalog yuklanmoqda...')}</p>}
        {katalogHolat === 'yoq' && <p className="text-warn">{t('Platforma normativ katalogi hali yuklanmagan.')}</p>}
        {katalogHolat === 'xato' && <p className="text-danger">{t('Katalog ochilmadi. Sahifani yangilab qayta urinib ko‘ring.')}</p>}
        {katalog && <KatalogPanel katalog={katalog} commandError={xato} nishon={nishon ? doc.sections[nishon]?.name ?? null : null}
          onAdd={(work, detail, quantity) => {
            if (!nishon || !doc.sections[nishon]) { setXato(t(XATOLAR.TARGET_REQUIRED)); return false; }
            try {
              const tableLabel = katalog.tableLabel(work.id);
              const snap = snapshotWork(katalog, detail.work.id, katalog.manifest.revision, tableLabel);
              return amal({ type: 'ADD_OCCURRENCE', occurrenceId: uid(), sectionId: nishon, source: snap.source, recipe: snap.recipe,
                quantity: quantity.trim() || null, basis: suggestedBasis(work.unitCode, katalog.unit(work.unitCode)) });
            } catch (e) { setXato(xatoMatni(e)); return false; }
          }} />}
      </section>
      <SmetaDocumentPanel doc={doc} total={hisob.total} calculation={hisob} targetSectionId={nishon}
        setTargetSection={setNishon} command={amal} labels={studioPanelLabels()} />
    </div>
  </div>;
}

/* ─────────────── Chap panel: katalog ─────────────── */
function KatalogPanel({ katalog, nishon, onAdd, commandError }: { katalog: RemoteNormCatalog; nishon: string | null; commandError: string;
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
  const ishlar = useMemo(() => (qidiruv.trim() || jadvalmi) ? katalog.search(qidiruv, sahifa, tugun) : null, [katalog, qidiruv, sahifa, tugun, jadvalmi]);
  const nom = (n: RemoteTreeNode) => n.name || (n.status === 'GROUP' ? t('Katalog bo‘limi aniqlanmagan yozuvlar (shifr bo‘yicha)') : '—');
  const ochish = (i: number) => { setTugun(i); setTugunSahifa(0); setSahifa(0); };
  async function tanla(w: NormWork) {
    const request = ++selectionRequest.current;
    setTanlangan(w); setDetail(null); setResSahifa(0); setHajm(''); setXato(''); setAddResult(null); setYuklash(true);
    try { await katalog.load(w.id); if (request === selectionRequest.current) setDetail(katalog.detail(w.id, 0)); }
    catch { if (request === selectionRequest.current) setXato(t('Ish resurslari yuklanmadi. Qayta urinib ko‘ring.')); }
    finally { if (request === selectionRequest.current) setYuklash(false); }
  }
  const unit = tanlangan ? katalog.unit(tanlangan.unitCode) : null;
  return <div className="space-y-2">
    {tugun >= 0 && katalog.breadcrumb(tugun).some(n => n.status === 'GROUP') && <p role="status" className="text-sm text-warn">{t('Bu yozuvlarning nomlari saqlangan. Katalog bo‘limi topilmagan yoki bir nechta bo‘lim mos kelgan; shifr va manbani tekshiring.')}</p>}
    <nav aria-label={t('Katalog ierarxiyasi')} className="flex flex-wrap gap-1 text-sm">
      <button className="underline" onClick={() => ochish(-1)}>{t('Katalog')}</button>
      {yolak.map(n => <span key={n.index}>/ <button className="underline" onClick={() => ochish(n.index)}>{nom(n)}</button></span>)}
    </nav>
    <input className="w-full p-2 border border-border rounded bg-bg" aria-label={t('Normativ ish qidirish')}
      placeholder={tugun >= 0 ? t('Shu bo‘lim ichida qidirish: shifr yoki nom') : t('Ish shifri yoki nomi (lotin/kirill)')} value={soz} onChange={e => setSoz(e.target.value)} />
    {!ishlar && <div className="border border-border rounded">
      {bolalar.nodes.map(n => <button key={n.index} className="flex w-full items-center gap-2 text-left px-2 py-1.5 border-b border-border hover:bg-surface-2" onClick={() => ochish(n.index)}>
        <span className="flex-1 min-w-0 truncate">{nom(n)}</span>
        {(n.status === 'MISSING' || n.status === 'AMBIGUOUS') && <span className="text-xs text-warn">{n.status === 'MISSING' ? t('nomi yo‘q') : t('nomi noaniq')}</span>}
        <span className="text-xs text-text-mute tabular-nums">{n.workCount.toLocaleString('ru')}</span>
      </button>)}
      {bolalar.total > 25 && <div className="flex gap-2 items-center p-1 text-sm">
        <button disabled={!tugunSahifa} onClick={() => setTugunSahifa(p => p - 1)}>{t('Oldingi')}</button>
        <span>{tugunSahifa + 1} / {Math.ceil(bolalar.total / 25)}</span>
        <button disabled={(tugunSahifa + 1) * 25 >= bolalar.total} onClick={() => setTugunSahifa(p => p + 1)}>{t('Keyingi')}</button>
      </div>}
    </div>}
    {ishlar && <div className="border border-border rounded">
      <p className="text-xs text-text-mute px-2 py-1">{t('Topildi')}: {ishlar.total.toLocaleString('ru')}</p>
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
      <p className="text-sm">{t('O‘lchov birligi')}: {unit ? <b>{unit.text}</b> : <span className="text-warn">{t('manbada aniqlanmagan — qo‘shgandan keyin asosni kiriting')}</span>}
        {unit && <span className="text-xs text-text-mute"> · {t('real smetalarda {n} marta kuzatilgan', { n: unit.observations })}</span>}</p>
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
        <label className="text-sm">{t('Hajm')}{unit?.base ? ` (${unit.base})` : ''}
          <input className="block w-32 p-1 border border-border rounded bg-bg" inputMode="decimal" value={hajm} onChange={e => { setHajm(e.target.value); setAddResult(null); }} placeholder="4,5" /></label>
        <button className="px-3 py-1.5 rounded bg-accent text-white disabled:opacity-40" disabled={detail.workCodeAmbiguous}
          onClick={() => {
            const ok = onAdd(tanlangan, detail, hajm);
            setAddResult(ok ? 'success' : 'failed');
            if (ok) { setAddedSection(nishon ?? ''); setHajm(''); }
          }}>{t('Smetaga qo‘shish')} →</button>
        <span className="text-xs text-text-mute">{nishon ? t('Bo‘lim: {n}', { n: nishon }) : t('Avval o‘ngda bo‘lim tanlang')}</span>
      </div>
      {addResult === 'success' && <p role="status" className="text-sm text-accent">{t('Ish «{nom}» «{bolim}» bo‘limiga qo‘shildi.', { nom: detail.work.name ?? detail.work.code, bolim: addedSection })}</p>}
      {addResult === 'failed' && <p role="alert" className="text-sm text-danger">{commandError || t('Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.')}</p>}
    </div>}
  </div>;
}
