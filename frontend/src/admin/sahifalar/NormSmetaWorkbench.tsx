import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { previewResourceQuantity, previewResourceAmount, type NormCatalog, type NormWork } from '../../lib/catalog-extraction/norm-catalog';
import { sumDraftAmounts, type NormDraftLine, type NormSmetaDraft } from '../../lib/catalog-extraction/norm-draft';
type Detail = ReturnType<NormCatalog['detail']>;
type Search = ReturnType<NormCatalog['search']>;
export default function NormSmetaWorkbench() {
  const worker = useRef<Worker | null>(null), seq = useRef(0);
  const current = useRef<Record<string, number>>({});
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(''), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const [search, setSearch] = useState<Search>({ rows: [], total: 0 });
  const [detail, setDetail] = useState<Detail | null>(null), [resourcePage, setResourcePage] = useState(0);
  const [quantity, setQuantity] = useState(''), [basis, setBasis] = useState(''), [evidence, setEvidence] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [unitLabel, setUnitLabel] = useState(''), [currency, setCurrency] = useState(''), [priceEvidence, setPriceEvidence] = useState('');
  const [draft, setDraft] = useState<NormDraftLine[]>([]);
  const pendingDraft = useRef(false);
  function send(command: string, data: Record<string, unknown>) {
    const id = ++seq.current; current.current[command] = id;
    worker.current?.postMessage({ id, command, ...data });
  }
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!ready) return;
    // Invalidate old search immediately; late response cannot populate new query.
    current.current.search = ++seq.current; setSearch({ rows: [], total: 0 });
    const timer = setTimeout(() => send('search', { query, page }), 200);
    return () => clearTimeout(timer);
  }, [query, page, ready]);
  function load(files: File[]) {
    worker.current?.terminate(); worker.current = null; current.current = {};
    pendingDraft.current = false; setDraft([]);
    setReady(false); setBusy(true); setDetail(null); setSearch({ rows: [], total: 0 });
    setError(''); setQuery(''); setPage(0); setProgress('');
    const w = new Worker(new URL('../../lib/catalog-extraction/norm-catalog.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onerror = () => { setBusy(false); setReady(false); setError(t('Katalog o‘qilmadi. Fayllarni tekshirib qayta oching.')); };
    w.onmessage = e => {
      const { id, progress: p, result, error: problem } = e.data;
      const command = Object.keys(current.current).find(k => current.current[k] === id);
      if (!command) return;
      if (p) { setProgress(`${p.table}: ${p.count.toLocaleString('ru')}`); return; }
      if (problem) { pendingDraft.current = false; setBusy(false); if (command === 'load') setReady(false); setError(command === 'draft' ? t('Ish qo‘shilmadi. Hajm, birlik asosi, narx dalili va resurs mosligini tekshiring.') : t('Katalog o‘qilmadi. Fayllarni tekshirib qayta oching.')); return; }
      if (command === 'load') { setBusy(false); setReady(true); setProgress(Object.entries(result.counts).map(([k, v]) => `${k}: ${v}`).join(' · ')); }
      if (command === 'search') setSearch(result);
      if (command === 'detail') setDetail(result);
      if (command === 'draft') { pendingDraft.current = false; setDraft(v => [...v, result]); setError(''); }
    };
    send('load', { files });
  }
  function choose(work: NormWork) {
    setDetail(null); setResourcePage(0); setQuantity(''); setBasis(''); setEvidence(''); setPrices({}); setUnitLabel(''); setCurrency(''); setPriceEvidence('');
    send('detail', { workId: work.id, page: 0 });
  }
  function addDraft() {
    if (!detail || pendingDraft.current) return;
    if (draft.length >= 100) { setError(t('Bitta ko‘rib chiqish qoralamasida ko‘pi bilan 100 ish.')); return; }
    if (draft.some(line => line.sourceWorkId === detail.work.id)) { setError(t('Bu ish qoralamada bor. Avval eski qatorni olib tashlang.')); return; }
    pendingDraft.current = true;
    send('draft', { request: { workId: detail.work.id, quantity, basisQuantity: basis, unitEvidence: evidence, unitLabel, currency, priceEvidence, prices } });
  }
  function downloadDraft() {
    const value: NormSmetaDraft = { schema: 'norm-smeta-review-v1', status: 'REVIEW_ONLY', lines: draft };
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'smeta-qoralama-review.json'; link.click(); URL.revokeObjectURL(url);
  }
  const currencies = new Set(draft.map(line => line.currency));
  const total = currencies.size === 1 ? sumDraftAmounts(draft.map(line => line.amount)) : null;
  function preview(norm: string | null, id: string) {
    try {
      if (detail?.workCodeAmbiguous) return { qty: null, amount: null };
      const qty = previewResourceQuantity(quantity, norm, basis, evidence);
      return { qty, amount: previewResourceAmount(qty, prices[id] || null) };
    } catch { return { qty: null, amount: null }; }
  }
  return <details className="border border-border rounded-lg p-3">
    <summary className="font-semibold cursor-pointer">{t('Smeta konstruktori — normativ ishlar va resurslar')}</summary>
    <p className="text-sm my-2">{t('4 ta ochiq JSONL faylni tanlang: basis, basisres, material, bprice. Katta baza fonda o‘qiladi, barcha qatorlar ekranga birdan chiqarilmaydi.')}</p>
    <input aria-label={t('Normativ katalog fayllari')} type="file" multiple accept=".jsonl" disabled={busy} onChange={e => load(Array.from(e.target.files ?? []))} />
    <p role="status" className="text-sm">{progress}</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <p className="text-warn text-sm my-2">{t('Normativ tahrir va o‘lchov asosi tekshiriladi. Katalog narxi tasdiqlangan F2 yoki actual narx emas. Hozirgi hisob — qoralama preview, canonical smeta o‘zgarmaydi.')}</p>
    {ready && <div className="grid lg:grid-cols-2 gap-3">
      <section>
        <input className="w-full p-2" aria-label={t('Normativ ish qidirish')} placeholder={t('Ish shifri yoki nomini yozing')} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
        <div className="max-h-[600px] overflow-auto">{search.rows.map(work => <button key={work.id} type="button" className="block text-left w-full border-b border-border p-2" onClick={() => choose(work)}>
          <strong>{work.code}</strong> · {work.name ?? t('Nom noma’lum')}<span className="block text-sm text-text-mute">{t('Sbornik / bo‘lim')}: {work.collection ?? '—'} / {work.section ?? '—'}</span>
        </button>)}</div>
        <button disabled={page === 0} onClick={() => setPage(v => v - 1)}>{t('Oldingi')}</button><span className="mx-2">{page + 1} / {Math.max(1, Math.ceil(search.total / 25))} · {search.total}</span><button disabled={(page + 1) * 25 >= search.total} onClick={() => setPage(v => v + 1)}>{t('Keyingi')}</button>
      </section>
      {detail && <section>
        <h3>{detail.work.code} · {detail.work.name}</h3>
        <p>{t('Manbadagi birlik kodi')}: {detail.work.unitCode ?? '—'} · {t('Resurslar')}: {detail.recipeCount}</p>
        {detail.workCodeAmbiguous && <p className="text-danger">{t('Bir shifrga ikki ish yozuvi mos. Hisoblash bloklandi; normativ tahrirni aniqlash kerak.')}</p>}
        <label>{t('Ishning fizik hajmi')}<input className="w-full p-2" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="300" /></label>
        <label>{t('Normaning fizik hisob asosi — masalan 100 m²')}<input className="w-full p-2" value={basis} onChange={e => setBasis(e.target.value)} placeholder={t('Tasdiqlangan asos soni')} /></label>
        <label>{t('Birlik/asosni tasdiqlovchi hujjat va band')}<input className="w-full p-2" value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
        <label>{t('Tasdiqlangan fizik birlik nomi')}<input className="w-full p-2" value={unitLabel} onChange={e => setUnitLabel(e.target.value)} /></label>
        <label>{t('Qoralama valyutasi')}<input className="w-full p-2" value={currency} onChange={e => setCurrency(e.target.value)} /></label>
        <label>{t('Qoralama narxining manbasi / sanasi')}<input className="w-full p-2" value={priceEvidence} onChange={e => setPriceEvidence(e.target.value)} /></label>
        <div className="max-h-[600px] overflow-auto">{detail.recipes.map(r => {
          const result = preview(r.norm, r.id);
          return <div key={r.id} className="border border-border p-2 my-2">
            <strong>{r.resourceCode ?? r.resourceIdCode ?? t('Resurs kodi yo‘q')}</strong>
            {r.resourceStatus === 'EXACT' ? <p>{r.candidates[0]?.name ?? t('Nom noma’lum')} · {t('Birlik kodi')}: {r.candidates[0]?.unitCode ?? '—'}</p> : <p className="text-warn">{t('Resursni aniqlash kerak')}: {r.candidateCount} {t('nomzod')}. {r.candidates.slice(0, 3).map(c => c.name ?? '—').join(' / ')}</p>}
            <p>{t('Manbadagi sarf normasi')}: {r.norm ?? t('Noma’lum')} · {t('Hisoblangan talab')}: {result.qty ?? '—'}</p>
            <details><summary>{t('Katalog narxi nomzodlari — avtomatik qo‘llanmaydi')} ({r.priceCount})</summary>{r.prices.map(p => <p key={p.id}>{t('Hudud kodi')}: {p.regionCode ?? '—'} · {p.price ?? '—'} · {t('Transport')}: {p.transport ?? '—'}</p>)}</details>
            <label>{t('Qoralama uchun alohida birlik narxi')}<input value={prices[r.id] ?? ''} onChange={e => setPrices(v => ({ ...v, [r.id]: e.target.value }))} /></label>
            <p>{t('Qoralama summa')}: {r.resourceStatus === 'EXACT' ? result.amount ?? '—' : t('Resurs mosligi hal qilinmaguncha tasdiqlanmaydi')}</p>
          </div>;
        })}</div>
        <button disabled={resourcePage === 0} onClick={() => { setResourcePage(p => p - 1); send('detail', { workId: detail.work.id, page: resourcePage - 1 }); }}>{t('Oldingi resurslar')}</button>
        <button disabled={(resourcePage + 1) * 25 >= detail.recipeCount} onClick={() => { setResourcePage(p => p + 1); send('detail', { workId: detail.work.id, page: resourcePage + 1 }); }}>{t('Keyingi resurslar')}</button>
        <button className="block my-3 p-2 border border-border" disabled={detail.workCodeAmbiguous} onClick={addDraft}>{t('Smeta qoralamasiga qo‘shish')}</button>
      </section>}
    </div>}
    {draft.length > 0 && <section className="my-4 border border-border p-3">
      <h3>{t('Smeta qoralamasi — hali tasdiqlanmagan')}</h3>
      <p>{t('Ma’lum qiymatlar yig‘indisi to‘liq smeta jami emas. Bitta resurs narxi noma’lum bo‘lsa ham umumiy jami noma’lum qoladi.')}</p>
      <table className="w-full text-sm"><thead><tr><th>{t('Ish')}</th><th>{t('Hajm')}</th><th>{t('Resurslar')}</th><th>{t('Summa')}</th><th>{t('Hal qilinmagan')}</th><th /></tr></thead><tbody>{draft.map(line => <tr key={line.sourceWorkId}>
        <td>{line.code} · {line.name}</td><td>{line.quantity} {line.unitLabel}</td><td>{line.resources.length}</td><td>{line.amount ?? t('Noma’lum')} {line.currency}</td><td>{line.unresolved}</td>
        <td><button onClick={() => setDraft(v => v.filter(x => x.sourceWorkId !== line.sourceWorkId))}>{t('Olib tashlash')}</button></td>
      </tr>)}</tbody></table>
      <p>{t('Jami')}: {total ?? t('Noma’lum — moslik, narx yoki valyutani tekshiring')} {currencies.size === 1 ? [...currencies][0] : ''}</p>
      <button className="p-2 border border-border" onClick={downloadDraft}>{t('Qoralama paketini saqlash')}</button>
      <p className="text-sm text-warn">{t('Paket ko‘rib chiqish uchun. U tasdiqlangan smeta, F2 yoki rasmiy narx bazasini almashtirmaydi.')}</p>
    </section>}
  </details>;
}
