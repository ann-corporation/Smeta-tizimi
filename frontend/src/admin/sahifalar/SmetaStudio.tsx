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
import { emptyDoc, type EstimateDoc, type Occurrence, type PriceBasis } from '../../lib/smeta-studio/model';
import { dispatch, historyOf, redo, undo, type History, type StudioCommand } from '../../lib/smeta-studio/commands';
import { calcDoc, type DocCalc, type LineIssue, type Totals } from '../../lib/smeta-studio/calc';
import { snapshotWork, suggestedBasis } from '../../lib/smeta-studio/catalog-bridge';
import { loadLastDraft, saveDraft } from '../../lib/smeta-studio/draft-store';
import { saveToServer } from '../../lib/smeta-studio/server-save';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';

const uid = () => crypto.randomUUID();
const fmt = (v: string | null) => v == null ? '—' : v.replace(/^(\d+)/, d => d.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));

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
const MUAMMO: Record<LineIssue, string> = {
  RESOURCE_UNRESOLVED: 'Resurs aniqlanmagan', NORM_UNKNOWN: 'Sarf normasi noma’lum', PRICE_MISSING: 'Narx yo‘q',
  QUANTITY_MISSING: 'Hajm kiritilmagan', BASIS_UNCONFIRMED: 'Hisob asosi tasdiqlanmagan',
};
const NARX_TURI: Array<[PriceBasis, string]> = [
  ['CONTRACT_DRAFT', 'Shartnoma (qoralama)'], ['PROCUREMENT_ACTUAL', 'Haqiqiy xarid'],
  ['CATALOG_CANDIDATE', 'Katalog nomzodi'], ['OPERATOR_MANUAL', 'Qo‘lda (operator)'],
];

function Jami({ v }: { v: Totals }) {
  return v.amount != null
    ? <span className="font-semibold tabular-nums">{fmt(v.amount)}</span>
    : <span className="tabular-nums" title={t('Noma’lum qatorlar bor — jami tasdiqlanmagan')}><span className="text-warn">{t('Noma’lum')}</span> <span className="text-text-mute text-xs">({t('ma’lum qismi')} {fmt(v.knownAmount)}; {t('hal qilinmagan')}: {v.unresolved})</span></span>;
}

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
      {katalog && <span className="text-xs text-text-mute">{t('Normativ katalog')}: {katalog.manifest.counts.basis?.toLocaleString('ru')} {t('ish')} · rev {katalog.manifest.revision}</span>}
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
        {katalog && <KatalogPanel katalog={katalog} nishon={nishon ? doc.sections[nishon]?.name ?? null : null}
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
      <SmetaPanel doc={doc} hisob={hisob} nishon={nishon} setNishon={setNishon} amal={amal} />
    </div>
  </div>;
}

/* ─────────────── Chap panel: katalog ─────────────── */
function KatalogPanel({ katalog, nishon, onAdd }: { katalog: RemoteNormCatalog; nishon: string | null;
  onAdd: (work: NormWork, detail: NormDetail, quantity: string) => boolean }) {
  const [tugun, setTugun] = useState(-1), [tugunSahifa, setTugunSahifa] = useState(0);
  const [soz, setSoz] = useState(''), [qidiruv, setQidiruv] = useState(''), [sahifa, setSahifa] = useState(0);
  const [tanlangan, setTanlangan] = useState<NormWork | null>(null), [detail, setDetail] = useState<NormDetail | null>(null);
  const [yuklash, setYuklash] = useState(false), [resSahifa, setResSahifa] = useState(0), [hajm, setHajm] = useState('');
  const [xato, setXato] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setQidiruv(soz); setSahifa(0); }, 200); return () => clearTimeout(timer); }, [soz]);
  const bolalar = useMemo(() => katalog.childNodes(tugun, tugunSahifa), [katalog, tugun, tugunSahifa]);
  const yolak = useMemo(() => tugun >= 0 ? katalog.breadcrumb(tugun) : [], [katalog, tugun]);
  const jadvalmi = tugun >= 0 && katalog.node(tugun).isTable;
  const ishlar = useMemo(() => (qidiruv.trim() || jadvalmi) ? katalog.search(qidiruv, sahifa, tugun) : null, [katalog, qidiruv, sahifa, tugun, jadvalmi]);
  const nom = (n: RemoteTreeNode) => n.name || (n.status === 'GROUP' ? t('Nomi manbada topilmagan jadvallar (kod bo‘yicha)') : '—');
  const ochish = (i: number) => { setTugun(i); setTugunSahifa(0); setSahifa(0); };
  async function tanla(w: NormWork) {
    setTanlangan(w); setDetail(null); setResSahifa(0); setHajm(''); setXato(''); setYuklash(true);
    try { await katalog.load(w.id); setDetail(katalog.detail(w.id, 0)); }
    catch { setXato(t('Ish resurslari yuklanmadi. Qayta urinib ko‘ring.')); }
    finally { setYuklash(false); }
  }
  const unit = tanlangan ? katalog.unit(tanlangan.unitCode) : null;
  return <div className="space-y-2">
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
          <input className="block w-32 p-1 border border-border rounded bg-bg" inputMode="decimal" value={hajm} onChange={e => setHajm(e.target.value)} placeholder="4,5" /></label>
        <button className="px-3 py-1.5 rounded bg-accent text-white disabled:opacity-40" disabled={detail.workCodeAmbiguous}
          onClick={() => { if (onAdd(tanlangan, detail, hajm)) setHajm(''); }}>{t('Smetaga qo‘shish')} →</button>
        <span className="text-xs text-text-mute">{nishon ? t('Bo‘lim: {n}', { n: nishon }) : t('Avval o‘ngda bo‘lim tanlang')}</span>
      </div>
    </div>}
  </div>;
}

/* ─────────────── O'ng panel: smeta ─────────────── */
function SmetaPanel({ doc, hisob, nishon, setNishon, amal }: { doc: EstimateDoc; hisob: DocCalc; nishon: string | null;
  setNishon: (id: string | null) => void; amal: (c: StudioCommand) => boolean }) {
  const [yangiBolim, setYangiBolim] = useState('');
  const bolimlar = useMemo(() => doc.rootOrder.flatMap(id => [doc.sections[id], ...doc.sections[id].children.map(c => doc.sections[c])]), [doc]);
  function bolimQosh(parentId: string | null, name: string) {
    const id = uid();
    if (amal({ type: 'ADD_SECTION', sectionId: id, parentId, name })) { setNishon(id); return true; }
    return false;
  }
  return <section aria-label={t('Smeta qoralamasi')} className="border border-border rounded-lg p-3 space-y-3 min-w-0">
    <div className="grid sm:grid-cols-3 gap-2">
      <label className="text-sm">{t('Smeta obyekti')}<input className="block w-full p-1 border border-border rounded bg-bg" value={doc.context.objectLabel}
        onChange={e => amal({ type: 'SET_CONTEXT', context: { objectLabel: e.target.value } })} /></label>
      <label className="text-sm">{t('Smeta nomi')}<input className="block w-full p-1 border border-border rounded bg-bg" value={doc.context.title}
        onChange={e => amal({ type: 'SET_CONTEXT', context: { title: e.target.value } })} /></label>
      <label className="text-sm">{t('Valyuta')}<select className="block w-full p-1 border border-border rounded bg-bg" value={doc.currency}
        onChange={e => amal({ type: 'SET_CONTEXT', context: {}, currency: e.target.value })}>{["UZS", "USD"].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
    </div>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (bolimQosh(null, yangiBolim)) setYangiBolim(''); }}>
      <input className="flex-1 p-1 border border-border rounded bg-bg" aria-label={t('Yangi bo‘lim nomi')} placeholder={t('Yangi bo‘lim (masalan: FM-1 fundamenti)')} value={yangiBolim} onChange={e => setYangiBolim(e.target.value)} />
      <button className="px-3 border border-border rounded">{t('Bo‘lim qo‘shish')}</button>
    </form>
    {!doc.rootOrder.length && <p className="text-text-dim text-sm">{t('Bo‘lim yarating, keyin chapdan ishni tanlab hajmini yozing va smetaga qo‘shing.')}</p>}
    {doc.rootOrder.map(id => <Bolim key={id} id={id} doc={doc} hisob={hisob} nishon={nishon} setNishon={setNishon} amal={amal} bolimlar={bolimlar} bolimQosh={bolimQosh} />)}
    <div className="flex justify-between border-t border-border pt-2">
      <span className="font-semibold">{t('Jami')} ({doc.currency})</span><Jami v={hisob.total} />
    </div>
    <p className="text-xs text-text-mute">{t('Narxlar turi ajratilgan: shartnoma qoralamasi, haqiqiy xarid, katalog nomzodi. Tasdiqlangan F2 narxi bu yerda o‘zgarmaydi. Server saqlash va Excel — keyingi bosqich.')}</p>
  </section>;
}

function Bolim({ id, doc, hisob, nishon, setNishon, amal, bolimlar, bolimQosh }: { id: string; doc: EstimateDoc; hisob: DocCalc; nishon: string | null;
  setNishon: (id: string | null) => void; amal: (c: StudioCommand) => boolean; bolimlar: EstimateDoc['sections'][string][];
  bolimQosh: (parentId: string | null, name: string) => boolean }) {
  const s = doc.sections[id];
  const [nom, setNom] = useState(s.name), [pod, setPod] = useState('');
  useEffect(() => setNom(s.name), [s.name]);
  const top = s.parentId == null;
  return <div className={`rounded border ${nishon === id ? 'border-accent' : 'border-border'} ${top ? 'p-2' : 'ml-4 p-2'}`}>
    <div className="flex flex-wrap items-center gap-2">
      <input type="radio" name="nishon" aria-label={t('Ish qo‘shiladigan bo‘lim')} checked={nishon === id} onChange={() => setNishon(id)} />
      <input className={`flex-1 min-w-0 bg-transparent ${top ? 'font-semibold' : ''}`} aria-label={t('Bo‘lim nomi')} value={nom} onChange={e => setNom(e.target.value)}
        onBlur={() => { if (nom.trim() !== s.name && !amal({ type: 'RENAME_SECTION', sectionId: id, name: nom })) setNom(s.name); }} />
      <Jami v={hisob.sections[id] ?? { amount: null, knownAmount: '0.00', unresolved: 0 }} />
      <button className="text-xs text-danger" onClick={() => { if (amal({ type: 'REMOVE_SECTION', sectionId: id }) && nishon === id) setNishon(null); }}>{t('O‘chirish')}</button>
    </div>
    {s.items.map(oid => <Qator key={oid} o={doc.occurrences[oid]} doc={doc} hisob={hisob} amal={amal} bolimlar={bolimlar} />)}
    {s.children.map(c => <Bolim key={c} id={c} doc={doc} hisob={hisob} nishon={nishon} setNishon={setNishon} amal={amal} bolimlar={bolimlar} bolimQosh={bolimQosh} />)}
    {top && <form className="flex gap-2 ml-4 mt-1" onSubmit={e => { e.preventDefault(); if (bolimQosh(id, pod)) setPod(''); }}>
      <input className="flex-1 p-1 text-sm border border-border rounded bg-bg" aria-label={t('Podrazdel nomi')} placeholder={t('Podrazdel qo‘shish')} value={pod} onChange={e => setPod(e.target.value)} />
      <button className="px-2 text-sm border border-border rounded">+</button>
    </form>}
  </div>;
}

function Qator({ o, doc, hisob, amal, bolimlar }: { o: Occurrence; doc: EstimateDoc; hisob: DocCalc; amal: (c: StudioCommand) => boolean;
  bolimlar: EstimateDoc['sections'][string][] }) {
  const c = hisob.occurrences[o.id];
  const [ochiq, setOchiq] = useState(false), [hajm, setHajm] = useState(o.quantity ?? '');
  useEffect(() => setHajm(o.quantity ?? ''), [o.quantity]);
  const saqlaHajm = () => { if ((hajm.trim() || null) !== o.quantity && !amal({ type: 'SET_QUANTITY', occurrenceId: o.id, quantity: hajm.trim() || null })) setHajm(o.quantity ?? ''); };
  return <div className="border-t border-border mt-1 pt-1">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button aria-label={ochiq ? t('Resurslarni yopish') : t('Resurslarni ochish')} onClick={() => setOchiq(v => !v)}>{ochiq ? '▾' : '▸'}</button>
      <span className="font-mono text-xs text-accent">{o.source.code}</span>
      <span className="flex-1 min-w-[10rem]">{o.source.name ?? t('Nom noma’lum')}</span>
      <input className="w-24 p-0.5 border border-border rounded bg-bg text-right" aria-label={t('Ish hajmi')} inputMode="decimal" value={hajm}
        onChange={e => setHajm(e.target.value)} onBlur={saqlaHajm} onKeyDown={e => { if (e.key === 'Enter') saqlaHajm(); }} />
      <span className="text-xs w-12">{o.basis.unitLabel ?? '?'}</span>
      <Jami v={c} />
      <select className="text-xs border border-border rounded bg-bg max-w-[8rem]" aria-label={t('Boshqa bo‘limga ko‘chirish')} value={o.sectionId}
        onChange={e => amal({ type: 'MOVE_OCCURRENCE', occurrenceId: o.id, sectionId: e.target.value })}>
        {bolimlar.map(b => <option key={b.id} value={b.id}>{b.parentId ? '— ' : ''}{b.name}</option>)}
      </select>
      <button className="text-xs text-danger" onClick={() => amal({ type: 'REMOVE_OCCURRENCE', occurrenceId: o.id })}>{t('Olib tashlash')}</button>
    </div>
    {c.issues.length > 0 && <p className="text-xs text-warn ml-6">{c.issues.map(i => t(MUAMMO[i])).join(' · ')}</p>}
    {ochiq && <div className="ml-6 my-1 space-y-1">
      <Asos o={o} amal={amal} />
      <table className="w-full text-xs"><thead><tr className="text-text-mute"><th className="text-left">{t('Resurs')}</th><th className="text-right">{t('Norma')}</th>
        <th className="text-right">{t('Miqdor')}</th><th className="text-left">{t('Narx')} ({doc.currency})</th><th className="text-right">{t('Summa')}</th></tr></thead>
        <tbody>{c.lines.map(l => <ResursQator key={l.recipeId} o={o} line={l} amal={amal} />)}</tbody></table>
    </div>}
  </div>;
}

function Asos({ o, amal }: { o: Occurrence; amal: (c: StudioCommand) => boolean }) {
  const [scale, setScale] = useState(o.basis.scale ?? ''), [unit, setUnit] = useState(o.basis.unitLabel ?? ''), [dalil, setDalil] = useState(o.basis.evidence ?? '');
  return <div className="text-xs space-y-1">
    <p>{t('Norma hisob asosi')}: {o.basis.scale ? <b>{o.basis.scale} {o.basis.unitLabel}</b> : <span className="text-warn">{t('tasdiqlanmagan')}</span>}
      {o.basis.origin === 'OBSERVED' && <span className="text-text-mute"> · {t('dalil')}: {o.basis.evidence}</span>}</p>
    {o.basis.origin !== 'OBSERVED' && <form className="flex flex-wrap gap-1" onSubmit={e => { e.preventDefault();
      amal({ type: 'SET_BASIS', occurrenceId: o.id, basis: { scale: scale.trim() || null, unitLabel: unit, evidence: dalil, origin: 'OPERATOR' } }); }}>
      <input className="w-16 p-0.5 border border-border rounded bg-bg" aria-label={t('Asos soni')} placeholder="100" value={scale} onChange={e => setScale(e.target.value)} />
      <input className="w-16 p-0.5 border border-border rounded bg-bg" aria-label={t('Birlik')} placeholder="м2" value={unit} onChange={e => setUnit(e.target.value)} />
      <input className="flex-1 min-w-[8rem] p-0.5 border border-border rounded bg-bg" aria-label={t('Asos dalili')} placeholder={t('ShNQ to‘plami, band')} value={dalil} onChange={e => setDalil(e.target.value)} />
      <button className="px-2 border border-border rounded">{t('Saqlash')}</button>
    </form>}
  </div>;
}

function ResursQator({ o, line, amal }: { o: Occurrence; line: DocCalc['occurrences'][string]['lines'][number]; amal: (c: StudioCommand) => boolean }) {
  const snap = o.recipe.find(r => r.recipeId === line.recipeId)!;
  const cur = o.overrides[line.recipeId]?.price ?? null;
  const [narx, setNarx] = useState(cur?.value ?? ''), [tur, setTur] = useState<PriceBasis>(cur?.basis ?? 'CONTRACT_DRAFT'), [dalil, setDalil] = useState(cur?.evidence ?? '');
  useEffect(() => { setNarx(cur?.value ?? ''); setDalil(cur?.evidence ?? ''); if (cur) setTur(cur.basis); }, [cur]);
  const saqla = () => {
    if (!narx.trim()) { if (cur) amal({ type: 'SET_PRICE', occurrenceId: o.id, recipeId: line.recipeId, price: null }); return; }
    amal({ type: 'SET_PRICE', occurrenceId: o.id, recipeId: line.recipeId, price: { value: narx, basis: tur, evidence: dalil, sourcePriceId: null } });
  };
  const tanlovlar = snap.status === 'AMBIGUOUS' ? snap.candidates : [];
  return <tr className="border-t border-border align-top">
    <td className="py-0.5">
      {line.resource ? <span>{line.resource.name}{line.substituted && <span className="text-text-mute"> ({t('almashtirilgan')}; {t('asl')}: {line.original?.name ?? '—'})</span>}</span>
        : <span className="text-warn">{t('Aniqlanmagan resurs')} {snap.candidateCount ? `(${t('{n} nomzod', { n: snap.candidateCount })})` : ''}</span>}
      {tanlovlar.length > 0 && <select className="block text-xs border border-border rounded bg-bg mt-0.5" aria-label={t('Nomzodlardan tanlash')} value={line.substituted ? line.resource?.id : ''}
        onChange={e => { const r = tanlovlar.find(x => x.id === e.target.value);
          amal({ type: 'SUBSTITUTE_RESOURCE', occurrenceId: o.id, recipeId: line.recipeId, substitution: r ? { resource: r, reason: 'Manba nomzodlaridan operator tanladi (kod noaniq)', conversion: '1', conversionEvidence: null, normOverride: null } : null }); }}>
        <option value="">{t('— nomzod tanlang —')}</option>
        {tanlovlar.map(r => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
      </select>}
    </td>
    <td className="text-right tabular-nums">{line.norm ?? t('Noma’lum')}</td>
    <td className="text-right tabular-nums">{fmt(line.quantity)}</td>
    <td>
      <div className="flex flex-wrap gap-1">
        <input className="w-24 p-0.5 border border-border rounded bg-bg text-right" aria-label={t('Birlik narxi')} inputMode="decimal" value={narx} onChange={e => setNarx(e.target.value)} />
        <select className="border border-border rounded bg-bg" aria-label={t('Narx turi')} value={tur} onChange={e => setTur(e.target.value as PriceBasis)}>
          {NARX_TURI.map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
        <input className="w-32 p-0.5 border border-border rounded bg-bg" aria-label={t('Narx manbasi')} placeholder={t('manba, sana')} value={dalil} onChange={e => setDalil(e.target.value)} />
        <button className="px-1 border border-border rounded" onClick={saqla}>✓</button>
      </div>
      {snap.priceCount > 0 && <details><summary className="text-text-mute cursor-pointer">{t('Katalog narx nomzodlari ({n}) — avtomatik qo‘llanmaydi', { n: snap.priceCount })}</summary>
        {snap.prices.map(p => <p key={p.id}>{t('Hudud kodi')} {p.region ?? '—'}: {p.price ?? '—'} · {t('Transport')} {p.transport ?? '—'}</p>)}</details>}
    </td>
    <td className="text-right tabular-nums">{line.amount != null ? fmt(line.amount) : <span className="text-warn">{t('Noma’lum')}</span>}</td>
  </tr>;
}
