import { useEffect, useMemo, useRef, useState } from 'react';
import { contractScopeRead, contractScopeSet, type ScopeData } from '../../api/t2-contract-scope';
import { scopeBreakdown, SCOPE_KINDS, SCOPE_NAMES, type ScopeBasis, type ScopeLine } from '../../lib/contract-scope/model';
import { t } from '../../i18n/til';

const empty: ScopeData = { bases: [], contracts: [] };
const display = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Точная классификация раздела/строки, без изменения её исходной сметной стоимости. */
export function ContractScopePanel({ objectId, lines }: { objectId: number; lines: readonly ScopeLine[] }) {
  const [data, setData] = useState<ScopeData>(empty);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(60);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<ScopeBasis['kind']>('construction');
  const [contract, setContract] = useState('');
  const [reference, setReference] = useState('');
  const [valuation, setValuation] = useState<ScopeBasis['valuation']>('unit');
  const [vat, setVat] = useState('');
  const [markup, setMarkup] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef<string | null>(null);
  const active = useRef(0);
  useEffect(() => {
    const seq = ++active.current, controller = new AbortController();
    setData(empty); setLoaded(false); setError('');
    void contractScopeRead(objectId, controller.signal).then(r => { if (active.current === seq && !controller.signal.aborted) { setData(r); setLoaded(true); } })
      .catch(() => { if (active.current === seq && !controller.signal.aborted) setError(t('Shartnoma doirasini yuklab bo‘lmadi. Qayta urining.')); });
    return () => controller.abort();
  }, [objectId, reload]);
  const breakdown = useMemo(() => scopeBreakdown(lines, data.bases), [lines, data]);
  const matches = useMemo(() => lines.filter(q => `${q.id} ${q.nom}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [lines, query]);
  const filtered = useMemo(() => matches.slice(0, visibleCount), [matches, visibleCount]);
  const hasMore = matches.length > filtered.length;
  const row = lines.find(q => q.id === Number(selected));
  function choose(id: string) {
    setSelected(id); setNotice(''); operation.current = null;
    const b = data.bases.find(b => b.qator_id === Number(id));
    setKind(b?.kind ?? 'construction'); setContract(b ? String(b.contract_id) : ''); setReference(b?.reference ?? '');
    setValuation(b?.valuation ?? 'unit'); setVat(b?.vat ?? ''); setMarkup(b?.markup ?? '');
  }
  async function save() {
    if (!row?.versiya || !contract || !reference.trim() || busy) return;
    const seq = active.current;
    setBusy(true); setPending(true); setError(''); setNotice('');
    operation.current ??= crypto.randomUUID();
    const basis: ScopeBasis = { qator_id: row.id, kind, contract_id: Number(contract), reference: reference.trim(), valuation, vat: (vat || null) as ScopeBasis['vat'], markup: (markup || null) as ScopeBasis['markup'] };
    try {
      await contractScopeSet(objectId, row.versiya, data.bases.find(b => b.qator_id === row.id)?.revision ?? 0, basis, operation.current);
      if (active.current !== seq) return;
      // При подтверждённой записи нельзя повторно писать из-за ошибки последующего чтения.
      setPending(false); operation.current = null; setNotice(t('Tasnif saqlandi. Asl smeta va tasdiqlangan aktlar o‘zgarmadi.'));
      setReload(n => n + 1);
    } catch (e) {
      if (active.current !== seq) return;
      const code = e instanceof Error ? e.message : '';
      if (/STALE|CONFLICT|INVALID|FORBIDDEN/.test(code)) { setPending(false); operation.current = null; }
      setError(code.includes('STALE') ? t('Ma’lumot o‘zgargan. Yangilab qayta tekshiring.') : t('Saqlash tasdiqlanmadi. Qayta urinish shu amalni takrorlamaydi.'));
    } finally { if (active.current === seq) setBusy(false); }
  }
  const input = 'rounded-lg border border-border bg-bg px-3 py-2 text-sm';
  return <section className="karta space-y-4 p-4" aria-label={t('Shartnoma doirasi')}>
    <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{t('Shartnoma doirasi')}</h2>
      <p className="mt-1 text-sm text-text-dim">{t('Qurilish, uskuna, shef-montaj va badiiy ishlarni manba asosida ajrating. Bo‘lim tasnifi ichki qatorlarga o‘tadi.')}</p></div>
      <button className="tugma" disabled={busy || pending} onClick={() => setReload(n => n + 1)}>{t('Yangilash')}</button></div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {notice && <p role="status" className="text-ok">{notice}</p>}
    {!loaded ? <p>{t('Yuklanmoqda…')}</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{breakdown.groups.map(g => <div key={g.kind} className="rounded-xl border border-border bg-surface-2 p-3">
        <div className="text-sm text-text-dim">{t(g.kind === 'unclassified' ? 'Tasniflanmagan' : SCOPE_NAMES[g.kind])}</div>
        <strong className="mt-2 block text-lg tabular-nums">{display(g.known)} UZS</strong>
        <span className="text-xs text-text-dim">{g.rows} {t('qator')}{g.unknown > 0 ? ` · ${g.unknown} ${t('qiymat noma’lum')}` : ''}</span>
      </div>)}</div>
      <p className="text-sm">{t('Asl smeta bo‘yicha ma’lum summa')}: <b>{display(breakdown.known)} UZS</b>. {t('Bu shartnoma jami yoki nakrutkalar bilan to‘lov summasi emas.')}</p>
      {breakdown.issues.length > 0 && <p role="alert" className="text-warn">{t('Tuzilma yoki qiymat bo‘yicha tekshiruv kerak')}: {breakdown.issues.length}. {t('Yakuniy jami tasdiqlanmaydi.')}</p>}
      <fieldset disabled={busy || pending} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">{t('Qator yoki bo‘lim qidirish')}<input className={input} value={query} onChange={e => { setQuery(e.target.value); setVisibleCount(60); }} /></label>
        <label className="grid gap-1 text-sm">{t('Qator yoki bo‘lim')}<select className={input} value={selected} onChange={e => choose(e.target.value)}>
          <option value="">{t('Tanlang')}</option>{row && !filtered.some(q => q.id === row.id) && <option value={row.id}>{row.nom}</option>}
          {filtered.map(q => <option key={q.id} value={q.id}>{q.id} · {q.nom}</option>)}</select></label>
        {hasMore && <button type="button" className="tugma sm:col-span-2" onClick={() => setVisibleCount(n => n + 60)}>{t('Yana qatorlarni ko‘rsatish')} ({filtered.length}/{matches.length})</button>}
        <label className="grid gap-1 text-sm">{t('Shartnoma')}<select className={input} value={contract} onChange={e => setContract(e.target.value)}><option value="">{t('Tanlang')}</option>{data.contracts.map(c => <option key={c.id} value={c.id}>{c.raqam} · {c.nom}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{t('Ishlar doirasi')}<select className={input} value={kind} onChange={e => setKind(e.target.value as ScopeBasis['kind'])}>{SCOPE_KINDS.map(k => <option key={k} value={k}>{t(SCOPE_NAMES[k])}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{t('Hisob asosi')}<select className={input} value={valuation} onChange={e => setValuation(e.target.value as ScopeBasis['valuation'])}><option value="unit">{t('Hajm va birlik narxi')}</option><option value="milestone">{t('Shartnoma bosqichi')}</option><option value="amount">{t('Hujjatdagi kelishilgan summa')}</option></select></label>
        <label className="grid gap-1 text-sm">{t('Narxga QQS kirganmi?')}<select className={input} value={vat} onChange={e => setVat(e.target.value)}><option value="">{t('Noma’lum')}</option><option value="included">{t('Kiritilgan')}</option><option value="excluded">{t('Kiritilmagan')}</option><option value="exempt">{t('QQSdan ozod')}</option></select></label>
        <label className="grid gap-1 text-sm">{t('Narxga nakrutkalar kirganmi?')}<select className={input} value={markup} onChange={e => setMarkup(e.target.value)}><option value="">{t('Noma’lum')}</option><option value="included">{t('Kiritilgan')}</option><option value="excluded">{t('Kiritilmagan')}</option></select></label>
        <label className="grid gap-1 text-sm">{t('Asos: hujjat, ilova va band')}<input className={input} value={reference} maxLength={1000} onChange={e => setReference(e.target.value)} /></label>
      </fieldset>
      <p className="text-xs text-text-dim">{t('Tasnif narx, norma yoki F2 hajmini o‘zgartirmaydi. Yangi shartnoma pozitsiyasi va uning to‘lov qoidasi alohida tasdiqlanadi.')}</p>
      <button className="tugma tugma-asosiy" disabled={busy || !row?.versiya || !contract || !reference.trim()} onClick={() => void save()}>{busy ? t('Saqlanmoqda…') : pending ? t('Qayta urinish') : t('Tasnifni saqlash')}</button>
    </>}
  </section>;
}
