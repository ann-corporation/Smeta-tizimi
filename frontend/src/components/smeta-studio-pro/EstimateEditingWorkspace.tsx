import { useEffect, useMemo, useState } from 'react';
import type { EstimateDoc, PriceBasis, CatalogResource, Substitution } from '../../lib/smeta-studio/model';
import type { KatalogQatori } from '../../lib/narx-katalog/price-remote';
import type { PriceOffer } from '../../lib/smeta-studio/price-lookup';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { calcOccurrence, type DocCalc } from '../../lib/smeta-studio/calc';
import { EstimateOutline, type OutlineLabels } from './EstimateOutline';
import type { OutlineRow } from './hierarchy';
import { reviewSubstitution } from './substitution-review';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { catalogEvidence, findOffers, type PriceSource } from '../../lib/smeta-studio/price-lookup';

/** No new business state: all mutations are delegated to the existing command owner. */
export type EditingLabels = OutlineLabels & {
  inspector: string; choose: string; quantity: string; amount: string; unknown: string;
  save: string; failed: string; name: string; price: string; evidence: string; basis: string;
  priceBases: Record<PriceBasis, string>; candidates: string; noCandidates: string;
  source: string; replacement: string; reason: string; conversion: string;
  conversionEvidence: string; blocked: string; restore: string; move: string;
  basisScale?: string; basisUnit?: string; basisEvidence?: string;
  catalogSearch?: string; catalogFind?: string; catalogExact?: string; catalogNone?: string; catalogLoading?: string; catalogUse?: string;
};
/** Platform price catalogue lookup (optional): offers fill the price form; saving stays explicit. */
export type PricingProps = { source: PriceSource | null; unitText: (code: string | null) => string | null; region?: string | null };
export function EstimateEditingWorkspace({ doc, labels, command, onTargetSection, calculation, pricing }: {
  doc: EstimateDoc; labels: EditingLabels; command: (command: StudioCommand) => boolean;
  onTargetSection?: (sectionId: string) => void;
  calculation?: DocCalc;
  pricing?: PricingProps;
}) {
  const [selected, select] = useState<OutlineRow | null>(null);
  // Draft/context switch must unmount the old inspector, not inherit another estimate's edits.
  useEffect(() => { select(null); }, [doc.draftId, doc.context.companyId, doc.context.projectId, doc.context.objectId]);
  const work = selected?.occurrenceId ? doc.occurrences[selected.occurrenceId] : null;
  const section = selected ? doc.sections[selected.sectionId] : null;
  // Index the parent's existing result once; visible rows never scan entire recipes to find amounts.
  const resourceLines = useMemo(() => {
    const result = new Map<string, Map<string, { quantity: string | null; amount: string | null }>>();
    if (calculation) for (const [id, work] of Object.entries(calculation.occurrences)) {
      result.set(id, new Map(work.lines.map(line => [line.recipeId, line])));
    }
    return result;
  }, [calculation]);
  return <div className="grid gap-3 2xl:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]">
    <EstimateOutline doc={doc} labels={{ ...labels, title: labels.works }} onSelect={row => { select(row); onTargetSection?.(row.sectionId); }}
      renderSummary={calculation ? row => {
        if (row.kind === 'section') return calculation.sections[row.sectionId]?.amount ?? labels.unknown;
        const id = row.occurrenceId!;
        const line = row.recipeId ? resourceLines.get(id)?.get(row.recipeId) : null;
        const quantity = row.recipeId ? line?.quantity : doc.occurrences[id]?.quantity;
        const amount = row.recipeId ? line?.amount : calculation.occurrences[id]?.amount;
        return `${quantity ?? labels.unknown} · ${amount ?? labels.unknown}`;
      } : undefined} />
    <aside aria-label={labels.inspector} className="karta min-w-0 space-y-2 p-3 text-sm 2xl:sticky 2xl:top-2 2xl:max-h-[calc(100vh-120px)] 2xl:overflow-auto">
      {!selected || !section || (selected.occurrenceId && !work) ? <p className="text-text-dim">{labels.choose}</p> :
        <Inspector key={JSON.stringify([doc.draftId, doc.context.companyId, selected.key])}
          doc={doc} row={selected} labels={labels} command={command} pricing={pricing} />}
    </aside>
  </div>;
}
function Inspector({ doc, row, labels: l, command, pricing }: {
  doc: EstimateDoc; row: OutlineRow; labels: EditingLabels; command: (command: StudioCommand) => boolean; pricing?: PricingProps;
}) {
  const work = row.occurrenceId ? doc.occurrences[row.occurrenceId] : null;
  const recipe = work?.recipe.find(r => r.recipeId === row.recipeId);
  const override = recipe && work ? work.overrides[recipe.recipeId] : null;
  const calc = useMemo(() => work ? calcOccurrence(work) : null, [work]);
  const line = calc?.lines.find(r => r.recipeId === row.recipeId);
  const [failed, setFailed] = useState(false);
  const [quantity, setQuantity] = useState(work?.quantity ?? '');
  const [name, setName] = useState(doc.sections[row.sectionId].name);
  const [scale, setScale] = useState(work?.basis.scale ?? '');
  const [basisUnit, setBasisUnit] = useState(work?.basis.unitLabel ?? '');
  const [basisEvidence, setBasisEvidence] = useState(work?.basis.evidence ?? '');
  const [price, setPrice] = useState(override?.price?.value ?? '');
  const [basis, setBasis] = useState<PriceBasis>(override?.price?.basis ?? 'OPERATOR_MANUAL');
  const [evidence, setEvidence] = useState(override?.price?.evidence ?? '');
  const [priceSource, setPriceSource] = useState<string | null>(override?.price?.sourcePriceId ?? null);
  const [replacement, setReplacement] = useState<CatalogResource | null>(null);
  const [reason, setReason] = useState('');
  const [conversion, setConversion] = useState('1');
  const [conversionEvidence, setConversionEvidence] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');
  const targetSections = useMemo(() => {
    const query = qidiruvKaliti(sectionSearch);
    const result = [];
    for (const section of Object.values(doc.sections)) {
      if (section.id !== work?.sectionId && qidiruvKaliti(section.name).includes(query)) result.push(section);
      if (result.length === 50) break;
    }
    return result;
  }, [doc.sections, sectionSearch, work?.sectionId]);
  // Undo/redo or another caller's edits refresh the selected editor from the shared document.
  useEffect(() => { setQuantity(work?.quantity ?? ''); }, [work?.quantity]);
  useEffect(() => { setScale(work?.basis.scale ?? ''); setBasisUnit(work?.basis.unitLabel ?? '');
    setBasisEvidence(work?.basis.evidence ?? ''); }, [work?.basis]);
  useEffect(() => { setName(doc.sections[row.sectionId].name); }, [doc.sections, row.sectionId]);
  useEffect(() => {
    setPrice(override?.price?.value ?? ''); setEvidence(override?.price?.evidence ?? '');
    setBasis(override?.price?.basis ?? 'OPERATOR_MANUAL'); setPriceSource(override?.price?.sourcePriceId ?? null);
  }, [override?.price]);
  function run(c: StudioCommand) {
    try { setFailed(!command(c)); } catch { setFailed(true); }
  }
  const requested: Substitution | null = replacement ? { resource: replacement, reason, conversion,
    conversionEvidence: conversionEvidence.trim() || null, normOverride: null } : null;
  const permitted = requested && recipe ? reviewSubstitution(recipe.resource, requested).readyForOperatorReview : false;
  const inputClass = 'input mt-0.5 h-8 w-full text-[12.5px]';
  return <div className="space-y-4">
    <h3 className="font-semibold break-words text-text">{line?.resource?.name ?? work?.source.name ?? doc.sections[row.sectionId].name}</h3>
    {failed && <p role="alert" className="text-danger">{l.failed}</p>}
    {!work ? <form className="space-y-1 rounded border border-border/60 p-2" onSubmit={e => { e.preventDefault(); run({ type: 'RENAME_SECTION', sectionId: row.sectionId, name }); }}>
      <label className="block text-[11.5px] text-text-dim">{l.name}<input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></label>
      <button type="submit" className="tugma tugma-asosiy mt-1 h-7 px-2 text-[11.5px]">{l.save}</button>
    </form> : <>
      <p className="text-[12px] text-text-dim">{work.source.code} · {work.basis.unitLabel ?? l.unknown}</p>
      <p className="text-[12px] text-text-dim">{l.amount}: {calc?.amount ?? l.unknown}</p>
      <form className="space-y-1 rounded border border-border/60 p-2" onSubmit={e => { e.preventDefault(); run({ type: 'SET_QUANTITY', occurrenceId: work.id, quantity: quantity.trim() || null }); }}>
        <label className="block text-[11.5px] text-text-dim">{l.quantity}<input className={inputClass} inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <button type="submit" className="tugma tugma-asosiy mt-1 h-7 px-2 text-[11.5px]">{l.save}</button>
      </form>
      {l.basisScale && l.basisUnit && l.basisEvidence && <form className="space-y-1 rounded border border-border/60 p-2" onSubmit={e => {
        e.preventDefault(); run({ type: 'SET_BASIS', occurrenceId: work.id, basis: {
          scale: scale.trim() || null, unitLabel: basisUnit.trim() || null,
          evidence: basisEvidence.trim() || null, origin: scale.trim() ? 'OPERATOR' : null,
        } });
      }}>
        <label className="block text-[11.5px] text-text-dim">{l.basisScale}<input className={inputClass} inputMode="decimal" value={scale} onChange={e => setScale(e.target.value)} /></label>
        <label className="block text-[11.5px] text-text-dim">{l.basisUnit}<input className={inputClass} value={basisUnit} onChange={e => setBasisUnit(e.target.value)} /></label>
        <label className="block text-[11.5px] text-text-dim">{l.basisEvidence}<input className={inputClass} value={basisEvidence} onChange={e => setBasisEvidence(e.target.value)} /></label>
        <button type="submit" className="tugma tugma-asosiy mt-1 h-7 px-2 text-[11.5px]" disabled={!!scale.trim() && !basisEvidence.trim()}>{l.save}</button>
      </form>}
      <label className="block text-[11.5px] text-text-dim">{l.search}<input className={inputClass} value={sectionSearch} onChange={e => setSectionSearch(e.target.value)} /></label>
      <label className="block text-[11.5px] text-text-dim">{l.move}<select className={inputClass} value={work.sectionId} onChange={e => run({ type: 'MOVE_OCCURRENCE', occurrenceId: work.id, sectionId: e.target.value })}>
        <option value={work.sectionId}>{doc.sections[work.sectionId].name}</option>
        {targetSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      {recipe && <>
        <p className="text-[12px] text-text-dim">{l.quantity}: {line?.quantity ?? l.unknown} · {l.amount}: {line?.amount ?? l.unknown}</p>
        <form className="space-y-1 rounded border border-border/60 p-2" onSubmit={e => { e.preventDefault(); run({ type: 'SET_PRICE', occurrenceId: work.id, recipeId: recipe.recipeId,
          price: price.trim() ? { value: price, basis, evidence, sourcePriceId: priceSource } : null }); }}>
          <label className="block text-[11.5px] text-text-dim">{l.price}<input className={inputClass} inputMode="decimal" value={price} onChange={e => {
            setPrice(e.target.value); setPriceSource(null); setBasis('OPERATOR_MANUAL'); setEvidence('');
          }} /></label>
          <label className="block text-[11.5px] text-text-dim">{l.basis}<select className={inputClass} value={basis} onChange={e => { setBasis(e.target.value as PriceBasis); setPriceSource(null); }}>
            {Object.entries(l.priceBases).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="block text-[11.5px] text-text-dim">{l.evidence}<input className={inputClass} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
          <button type="submit" className="tugma tugma-asosiy mt-1 h-7 px-2 text-[11.5px]" disabled={!!price.trim() && !evidence.trim()}>{l.save}</button>
        </form>
        <label className="block text-[11.5px] text-text-dim">{l.candidates}<select className={inputClass} value={priceSource ?? ''} disabled={!!override?.substitution}
          onChange={e => {
            const candidate = recipe.prices.find(p => p.id === e.target.value);
            if (!candidate?.price) return;
            setPrice(candidate.price); setPriceSource(candidate.id); setBasis('CATALOG_CANDIDATE'); setEvidence('');
          }}>
          <option value="">{l.choose}</option>
          {recipe.prices.filter(p => p.price != null).map(p => <option key={p.id} value={p.id}>{p.region ?? l.unknown} · {p.price}</option>)}
        </select></label>
        {!recipe.prices.length && <p className="text-xs text-text-mute">{l.noCandidates}</p>}
        {pricing && l.catalogSearch && <CatalogPriceSearch key={recipe.recipeId} pricing={pricing} labels={l}
          name={(override?.substitution?.resource ?? recipe.resource)?.name ?? null}
          unit={pricing.unitText((override?.substitution?.resource ?? recipe.resource)?.unitCode ?? null)}
          onPick={k => { if (k.narx == null) return; setPrice(String(k.narx)); setBasis('CATALOG_CANDIDATE'); setPriceSource(`narx-katalog:${k.id}`); setEvidence(catalogEvidence(k)); }} />}
        <p className="text-[12px] text-text-dim">{l.source}: {recipe.resource?.name ?? l.unknown}</p>
        <label className="block text-[11.5px] text-text-dim">{l.replacement}<select className={inputClass} value={replacement?.id ?? ''} onChange={e => {
          setReplacement(recipe.candidates.find(r => r.id === e.target.value) ?? null); setReason('');
        }}><option value="">{l.choose}</option>{recipe.candidates.map(r => <option key={r.id} value={r.id}>{r.code} · {r.name} · {r.unitCode}</option>)}</select></label>
        {replacement && <>
          <label className="block text-[11.5px] text-text-dim">{l.reason}<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <label className="block text-[11.5px] text-text-dim">{l.conversion}<input className={inputClass} inputMode="decimal" value={conversion} onChange={e => setConversion(e.target.value)} /></label>
          <label className="block text-[11.5px] text-text-dim">{l.conversionEvidence}<input className={inputClass} value={conversionEvidence} onChange={e => setConversionEvidence(e.target.value)} /></label>
          {!permitted && <p role="status">{l.blocked}</p>}
          <button type="button" className="tugma tugma-asosiy mt-1 h-7 px-2 text-[11.5px]" disabled={!permitted} onClick={() => requested && run({ type: 'SUBSTITUTE_RESOURCE', occurrenceId: work.id, recipeId: recipe.recipeId, substitution: requested })}>{l.save}</button>
        </>}
        {override?.substitution && <button type="button" className="tugma h-7 px-2 text-[11.5px]" onClick={() => run({ type: 'SUBSTITUTE_RESOURCE', occurrenceId: work.id, recipeId: recipe.recipeId, substitution: null })}>{l.restore}</button>}
      </>}
    </>}
  </div>;
}

/** Search the platform price catalogue for the selected resource; exact name+unit matches first. */
function CatalogPriceSearch({ pricing, labels: l, name, unit, onPick }: {
  pricing: PricingProps; labels: EditingLabels; name: string | null; unit: string | null; onPick: (k: KatalogQatori) => void;
}) {
  const [query, setQuery] = useState(name ?? '');
  const [offers, setOffers] = useState<PriceOffer[] | null>(null);
  const find = (q: string) => { if (pricing.source) setOffers(findOffers(pricing.source, q, unit, pricing.region)); };
  return <div className="rounded border border-border/70 bg-surface-2/40 p-2" role="group" aria-label={l.catalogSearch}>
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{l.catalogSearch}</p>
    {!pricing.source ? <p className="text-xs text-text-mute">{l.catalogLoading}</p> : <>
      <form className="flex gap-1" onSubmit={e => { e.preventDefault(); find(query); }}>
        <input aria-label={l.catalogSearch} className="input h-7 flex-1 text-[12px]" value={query} onChange={e => setQuery(e.target.value)} />
        <button type="submit" className="tugma h-7 px-2 text-[11px]">{l.catalogFind}</button>
      </form>
      {offers && !offers.length && <p className="mt-1 text-xs text-text-mute">{l.catalogNone}</p>}
      {offers && offers.length > 0 && <ul className="mt-1 max-h-56 space-y-0.5 overflow-auto text-[11.5px]">
        {offers.map(({ row: k, exact }) => <li key={k.id} className="flex items-start gap-1.5 rounded px-1 py-0.5 hover:bg-surface-2">
          <span className="min-w-0 flex-1">
            {exact && <span className="mr-1 rounded bg-ok/15 px-1 text-[10px] text-ok">{l.catalogExact}</span>}
            <span className="text-text">{k.nom}</span>{k.birlik ? <span className="text-text-mute">, {k.birlik}</span> : null}
            <span className="block text-[10.5px] text-text-mute">{[k.hudud, k.ishlab_chiqaruvchi, k.yil ? k.yil + (k.kvartal ? '/' + k.kvartal : '') : null, k.nds_holati].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="shrink-0 tabular-nums font-medium">{k.narx?.toLocaleString('ru-RU')}</span>
          <button type="button" className="tugma h-6 shrink-0 px-1.5 text-[10.5px]" onClick={() => onPick(k)}>{l.catalogUse}</button>
        </li>)}
      </ul>}
    </>}
  </div>;
}
