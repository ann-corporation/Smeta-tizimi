import { useEffect, useMemo, useState } from 'react';
import { sbOqi } from '../../api/supabase';
import { t } from '../../i18n/til';
import { narxKatalogi, type PriceCatalog } from '../../lib/narx-katalog/price-remote';
import { compareMarket, marketException, marketPeriods, marketRegions, marketReadPrice, periodKey, type MarketComparison, type MarketLine, type MarketStatus } from '../../lib/smeta-studio/market-comparison';

export type MarketPriceComparisonProps = { lines?: readonly MarketLine[]; objectId?: number | null; companyId?: number | null };
type Loaded = { scope: string; state: 'ready' | 'unknown' | 'incomplete'; lines: readonly MarketLine[] };
const PAGE = 50;
const EMPTY_RESULTS: MarketComparison[] = [];
const fmt = (v: number | null) => v == null ? t('Noma’lum') : v.toLocaleString('uz-UZ', { maximumFractionDigits: 4 });
function statusText(status: MarketStatus) {
  switch (status) {
    case 'review': return t('Moslik noaniq — ko‘rib chiqish kerak');
    case 'unknown-unit': return t('O‘lchov birligi noma’lum');
    case 'unsupported': return t('Mehnat va mashinalar material katalogida taqqoslanmaydi');
    case 'no-offers': return t('Tanlangan davr va hududda mos taklif yo‘q');
    case 'unknown-period': return t('Katalog davri noma’lum');
    case 'unknown-name': return t('Resurs nomi noma’lum');
    default: return t('Mos mahsulot takliflari');
  }
}

export function MarketPriceComparison({ lines, objectId, companyId }: MarketPriceComparisonProps) {
  const [cat, setCat] = useState<PriceCatalog | null>(null), [catalogError, setCatalogError] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const scope = JSON.stringify([objectId ?? null, companyId ?? null]);
  const [selection, setSelection] = useState(''), [region, setRegion] = useState(''), [all, setAll] = useState(false);
  const [pagination, setPagination] = useState({ key: '', page: 0 }), [offerPages, setOfferPages] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    narxKatalogi().then(c => { if (alive) setCat(c); }).catch(() => { if (alive) setCatalogError(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    // sbOqi has no transport AbortSignal parameter: cancellation discards stale results.
    const controller = new AbortController();
    if (lines !== undefined || !Number.isSafeInteger(objectId) || objectId! <= 0 || !Number.isSafeInteger(companyId) || companyId! <= 0) return;
    sbOqi<{ id: number; nom: string | null; birlik: string | null; narx: number | string | null }>({
      jadval: 't2_qator', ustunlar: 'id,nom,birlik,narx',
      filtr: `kompaniya_id=eq.${companyId}&obyekt_id=eq.${objectId}&tur=in.(rs,mat,ob)`, tartib: 'id.asc', limit: 20000,
    }).then(r => {
      if (controller.signal.aborted) return;
      if (r.toliq === false) { setLoaded({ scope, state: 'incomplete', lines: [] }); return; }
      if (!r.ok || !Array.isArray(r.qatorlar)) { setLoaded({ scope, state: 'unknown', lines: [] }); return; }
      setLoaded({ scope, state: 'ready', lines: r.qatorlar.map(r => ({ id: String(r.id), name: r.nom, unit: r.birlik, price: marketReadPrice(r.narx) })) });
    }).catch(() => { if (!controller.signal.aborted) setLoaded({ scope, state: 'unknown', lines: [] }); });
    return () => { controller.abort(); };
  }, [scope, objectId, companyId, lines]);
  // Identity check happens during render, before effects: old tenant/object data never flashes.
  const current = loaded?.scope === scope ? loaded : null;
  const input = lines !== undefined ? lines : current?.state === 'ready' ? current.lines : null;
  const periods = useMemo(() => cat ? marketPeriods(cat) : [], [cat]);
  const regions = useMemo(() => cat ? marketRegions(cat) : [], [cat]);
  const period = periods.find(p => periodKey(p) === selection) ?? periods[0] ?? null;
  const calculationKey = JSON.stringify([scope, period && periodKey(period), region]);
  const [calculation, setCalculation] = useState<{ key: string; input: readonly MarketLine[]; cat: PriceCatalog; results: MarketComparison[]; done: boolean } | null>(null);
  useEffect(() => {
    if (!input || !cat) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    let offset = 0;
    const accumulated: MarketComparison[] = [];
    const run = () => {
      if (cancelled) return;
      const started = performance.now();
      let batch = 0;
      // Yield after at most 20 distinct resources / 12 ms. Every row is eventually compared.
      while (offset < input.length && batch < 20 && (batch === 0 || performance.now() - started < 12)) {
        accumulated.push(...compareMarket([input[offset++]], cat, period, region || null)); batch++;
      }
      setCalculation({ key: calculationKey, input, cat, results: [...accumulated], done: offset === input.length });
      if (offset < input.length) timer = setTimeout(run, 0);
    };
    timer = setTimeout(run, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [input, cat, calculationKey, period, region]);
  const activeCalculation = calculation?.key === calculationKey && calculation.input === input && calculation.cat === cat ? calculation : null;
  const results = activeCalculation?.results ?? EMPTY_RESULTS;
  const calculating = input != null && cat != null && !activeCalculation?.done;
  const shown = useMemo(() => all ? results : results.filter(marketException), [results, all]);
  const pageKey = JSON.stringify([scope, period && periodKey(period), region, all]);
  const lastPage = Math.max(0, Math.ceil(shown.length / PAGE) - 1);
  const page = pagination.key === pageKey ? Math.min(pagination.page, lastPage) : 0;
  const unsupported = results.filter(r => r.status === 'unsupported').length;
  const catalogLoading = !cat;
  const hasRows = !!cat && !!input && input.length !== 0;
  const hasPages = shown.length > PAGE;
  return <section aria-label={t('Katalog narxlari bilan taqqoslash')} className="karta min-w-0 max-w-full space-y-3 p-3 text-sm text-text">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">{t('Katalog narxlari bilan taqqoslash')}</h3>
    <p className="text-xs leading-relaxed text-text-dim">{t('Faqat taqqoslash: asl smeta narxi o‘zgarmaydi. O‘rtacha — aynan bir mahsulot takliflarining arifmetik o‘rtachasi, NDSsiz.')}</p>
    {catalogError && <p role="status" className="rounded border border-border bg-surface-2/50 px-2 py-1.5 text-xs text-text-dim">{t('Katalog yuklanmadi — taqqoslash noma’lum.')}</p>}{!catalogError && catalogLoading && <p role="status" className="text-xs text-text-dim">{t('Katalog yuklanmoqda…')}</p>}
    {lines === undefined && current?.state === 'incomplete' ? <p role="status">{t('Qatorlar to‘liq olinmadi — taqqoslash noma’lum.')}</p> :
      lines === undefined && current?.state === 'unknown' ? <p role="status">{t('Qatorlarni olib bo‘lmadi — taqqoslash noma’lum.')}</p> :
      input == null ? <p role="status">{objectId && companyId ? t('Qatorlar yuklanmoqda…') : t('Taqqoslash uchun resurslar yoki obyekt va kompaniyani tanlang.')}</p> :
      input.length === 0 ? <p role="status">{t('Taqqoslash uchun resurslar yo‘q.')}</p> : null}
    {hasRows && cat && input && <>
      <div className="flex min-w-0 flex-wrap items-end gap-2 rounded border border-border/60 bg-surface-2/30 p-2">
      <label className="flex min-w-0 max-w-full flex-1 basis-40 flex-col gap-1 text-xs text-text-dim">{t('Katalog davri')} <select className="input h-8 w-full min-w-0 max-w-full text-xs text-text" value={period ? periodKey(period) : ''} onChange={e => setSelection(e.target.value)}>
        {!periods.length && <option value="">{t('Katalog davri noma’lum')}</option>}
        {periods.map(p => <option key={periodKey(p)} value={periodKey(p)}>{t('{yil}-yil, {chorak}-chorak', { yil: p.year, chorak: p.quarter })}</option>)}
      </select></label>
      <label className="flex min-w-0 max-w-full flex-1 basis-48 flex-col gap-1 text-xs text-text-dim">{t('Katalog hududi')} <select className="input h-8 w-full min-w-0 max-w-full text-xs text-text" value={region} onChange={e => setRegion(e.target.value)}>
        <option value="">{t('Barcha katalog hududlari')}</option>{regions.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select></label>
      <label className="flex min-w-0 items-center gap-2 py-1.5 text-xs text-text"><input className="shrink-0 accent-accent" type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />{t('Teng narxlarni ham ko‘rsatish')}</label>
      </div>
      {calculating && <p role="status" className="text-xs tabular-nums text-text-dim">{t('Taqqoslanmoqda: {tayyor} / {jami} resurs.', { tayyor: results.length, jami: input.length })}</p>}
      <p className="text-xs tabular-nums text-text-dim">{t('Jami: {jami}. Farq yoki noma’lum: {farq}. Material katalogiga kirmaydi: {son}.', { jami: input.length, farq: results.filter(marketException).length, son: unsupported })}</p>
      <p className="text-[11px] leading-relaxed text-text-dim">{t('Farq = katalog o‘rtachasi − smeta narxi. Foizning asosi — smeta narxi. Farq mezoni: 0; aynan teng narxda ogohlantirish yo‘q.')}</p>
      {!calculating && !shown.length && <p className="rounded bg-surface-2/40 px-2 py-1.5 text-xs text-text-dim">{t('Taqqoslanadigan resurslarda ogohlantirish yo‘q.')}</p>}
      <div className="max-h-[32rem] min-w-0 max-w-full overflow-auto rounded border border-border/70"><table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs"><thead><tr>
        {[t('Resurs'), t('Smeta narxi'), t('Katalog o‘rtachasi'), t('Farq'), t('Foiz (smeta asosida)'), t('Manbalar')].map((h, index) => <th key={h} scope="col" className={`sticky top-0 z-10 border-b border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-text-dim ${[1, 2, 3, 4].includes(index) ? 'text-right' : ''}`}>{h}</th>)}
      </tr></thead><tbody>{shown.slice(page * PAGE, (page + 1) * PAGE).map((r, i) => {
        const detailKey = `${pageKey}:${page * PAGE + i}:${r.line.id}`;
        const offerPage = Math.min(offerPages[detailKey] ?? 0, Math.max(0, Math.ceil(r.offers.length / PAGE) - 1));
        const hasOffers = r.offers.length !== 0;
        const hasOfferPages = r.offers.length > PAGE;
        const differenceTone = r.delta == null || r.delta === 0 ? 'text-text-dim' : r.delta > 0 ? 'text-warn' : 'text-danger';
        return <tr key={`${r.line.id}:${page * PAGE + i}`} className="align-top odd:bg-surface even:bg-surface-2/25 hover:bg-surface-2/50 [&>td]:border-b [&>td]:border-border/50 [&>td]:px-3 [&>td]:py-2.5">
          <td className="min-w-40 max-w-64 break-words leading-relaxed"><span className="font-medium">{r.line.name ?? t('Resurs nomi noma’lum')}</span><br /><span className="text-[11px] text-text-dim">{r.line.unit ?? t('O‘lchov birligi noma’lum')}</span></td>
          <td className="whitespace-nowrap text-right tabular-nums">{fmt(r.line.price)} {r.line.price != null && 'UZS'}</td><td className="whitespace-nowrap text-right font-medium tabular-nums">{fmt(r.average)} {r.average != null && `UZS/${r.line.unit}`}</td>
          <td className={`text-right tabular-nums ${differenceTone}`}>{fmt(r.delta)} {r.delta != null && 'UZS'}<br />{r.delta != null && r.delta !== 0 && <span className="text-[11px]">{r.delta > 0 ? t('Smeta katalogdan past') : t('Smeta katalogdan yuqori')}</span>}</td>
          <td className={`text-right tabular-nums ${r.percent == null ? 'text-text-dim' : differenceTone}`}>{r.line.price === 0 ? t('Smeta narxi 0 — foiz hisoblanmaydi') : r.percent == null ? t('Noma’lum') : `${fmt(r.percent)}%`}</td>
          <td className="min-w-56 max-w-96 break-words leading-relaxed"><span className="text-[11px] text-text-dim">{statusText(r.status)}</span>{hasOffers && <details className="mt-1 rounded border border-border/70 bg-surface-2/40 p-2"><summary className="cursor-pointer rounded text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t('Takliflar: {son}; min: {min}; max: {max}', { son: r.offers.length, min: fmt(r.min), max: fmt(r.max) })}</summary>
            <p className="mt-2 break-all text-[11px] text-text-dim">{t('Katalog fayli')}: {cat.manifest.source.manba.nom}</p>
            <ul className="mt-2 space-y-2">{r.offers.slice(offerPage * PAGE, (offerPage + 1) * PAGE).map(o => <li key={o.row.id} className="space-y-1 rounded border border-border/60 bg-surface p-2 text-[11px] leading-relaxed">
              <p className="break-words font-medium text-text">{o.row.nom} · {o.row.manba_nom}</p>
              <p className="text-text-dim">{t('{yil}-yil, {chorak}-chorak', { yil: o.period.year, chorak: o.period.quarter })} · {t('Qator')}: {o.row.id}</p>
              <p className="text-text-dim">{t('Ishlab chiqaruvchi')}: {o.row.ishlab_chiqaruvchi ?? t('Noma’lum')} · {t('Hudud')}: {o.row.hudud ?? t('Noma’lum')}</p>
              <p className="font-medium tabular-nums text-text">{fmt(o.row.narx)} UZS/{o.row.birlik}</p>
              {o.conversion && <p className="rounded bg-surface-2/60 p-1.5 tabular-nums text-text-dim">{t('Birlik konversiyasi')}: {fmt(o.conversion.sourcePrice)} UZS/{o.conversion.sourceUnit} × {o.conversion.priceFactor} = {fmt(o.price)} UZS/{o.conversion.targetUnit}</p>}
              {o.row.nds_izoh && <p className="text-text-dim">{o.row.nds_izoh}</p>}
            </li>)}</ul>
            {hasOfferPages && <div className="mt-2 flex flex-wrap gap-2"><button className="tugma h-7 px-2 text-[11px]" type="button" disabled={offerPage === 0} onClick={() => setOfferPages(p => ({ ...p, [detailKey]: offerPage - 1 }))}>{t('Oldingi takliflar')}</button>
              <button className="tugma h-7 px-2 text-[11px]" type="button" disabled={(offerPage + 1) * PAGE >= r.offers.length} onClick={() => setOfferPages(p => ({ ...p, [detailKey]: offerPage + 1 }))}>{t('Keyingi takliflar')}</button></div>}
          </details>}</td>
        </tr>;
      })}</tbody></table></div>
      {hasPages && <nav aria-label={t('Taqqoslash sahifalari')} className="flex flex-wrap items-center justify-end gap-2">
        <button className="tugma h-7 px-2 text-xs" type="button" disabled={page === 0} onClick={() => setPagination({ key: pageKey, page: page - 1 })}>{t('Oldingi')}</button>
        <span className="text-xs tabular-nums text-text-dim">{t('{sahifa} / {jami} sahifa', { sahifa: page + 1, jami: lastPage + 1 })}</span>
        <button className="tugma h-7 px-2 text-xs" type="button" disabled={page === lastPage} onClick={() => setPagination({ key: pageKey, page: page + 1 })}>{t('Keyingi')}</button>
      </nav>}
    </>}
  </section>;
}
export default MarketPriceComparison;
