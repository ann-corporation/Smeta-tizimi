import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, FolderKanban, FileSignature, ChevronRight, Search, Settings, Upload, Edit3, Archive } from 'lucide-react';
import type { T2Obyekt } from '../../api/supabase';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { makeSummarizer, contractObjects, projectObjects, unassignedObjects, type Aggregate, type Metric } from './hierarchy';
import { useCompanyLineage } from './useLineage';
import { useMarkupTotals } from './useMarkupTotals';
import { useObjectFinancials } from './useObjectFinancials';
import { FINANCIAL_METRICS, type FinancialMetric } from './financials';

const financialLabels: Record<FinancialMetric, string> = { smeta: 'Smeta', fakt: 'Fakt', f2: 'Tasdiqlangan F2', ostatka: 'Ostatka' };
const technicalMetrics = ['razdel', 'ish', 'resurs', 'narxsiz', 'qator_soni'] as const;
const contractBasis = 'Shartnoma summalari — bog‘langan obyektlarning to‘liq ko‘rsatkichlari; aktlar shartnomalar bo‘yicha taqsimlanmagan. Umumiy obyekt har shartnoma qatorida ko‘rinadi, loyiha va kompaniya jamida bir marta hisoblanadi.';
const labels: Record<Metric, string> = { jami: 'Nakrutkasiz summa', qator_soni: 'Qatorlar', razdel: 'Bo‘limlar', ish: 'Ishlar', resurs: 'Resurslar', narxsiz: 'Narxsiz resurslar' };
function Value({ value, money = false }: { value: Aggregate; money?: boolean }) {
  return <span className="tabular-nums">{value.present === 0 && (money || value.total !== 0) ? t('Noma’lum') : money ? <FmtN val={value.known} /> : value.known.toLocaleString('ru-RU')}
    {value.unknown > 0 && <span className="mt-1 block text-[11px] font-normal text-text-mute">{t('narxsiz resurslar summaga kirmagan — Narxlar bo‘limida')}</span>}</span>;
}
export function ProjectNavigator({ companyId, objects, onOpen, onEdit, onArchive }: {
  companyId: number; objects: T2Obyekt[]; onOpen: (o: T2Obyekt, contractId?: number) => void;
  onEdit: (o: T2Obyekt) => void; onArchive: (o: T2Obyekt) => void;
}) {
  const { data: line, isPending, error, refetch } = useCompanyLineage(companyId);
  const money = useMarkupTotals(companyId,line,objects);
  const financials = useObjectFinancials(companyId, objects);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const summarize = useMemo(() => makeSummarizer(objects), [objects]);
  const projectRaw = params.get('loyiha');
  const projectId = projectRaw === 'biriktirilmagan' ? null : projectRaw ? Number(projectRaw) : undefined;
  const contractRaw = params.get('shartnoma');
  const project = line?.loyihalar.find(p => p.id === projectId);
  const contract = line?.shartnomalar.find(s => s.id === Number(contractRaw) && s.loyiha_id === projectId);
  const q = query.trim().toLocaleLowerCase('ru');
  const matches = (text: string) => !q || text.toLocaleLowerCase('ru').includes(q);
  const go = (pid?: number | null, sid?: number | 'biriktirilmagan') => {
    const next = new URLSearchParams();
    if (pid !== undefined) next.set('loyiha', pid === null ? 'biriktirilmagan' : String(pid));
    if (sid != null) next.set('shartnoma', String(sid));
    setQuery(''); setParams(next);
  };
  if (isPending) return <div role="status" className="skel h-48 rounded-2xl">{t('Loyiha zanjiri yuklanmoqda…')}</div>;
  if (error || !line) return <div role="alert" className="karta p-4 text-danger">{t('Loyiha zanjiri o‘qilmadi')}<button type="button" className="tugma ml-3" onClick={() => void refetch()}>{t('Qayta urinish')}</button></div>;
  if ((projectId !== undefined && projectId !== null && !project) || (contractRaw && contractRaw !== 'biriktirilmagan' && !contract)) {
    return <div role="alert" className="karta p-4">{t('Tanlangan loyiha yoki shartnoma bu kompaniyada topilmadi.')}<button className="tugma ml-3" onClick={() => go()}>{t('Barcha loyihalar')}</button></div>;
  }
  const projectName = project?.nom ?? t('Loyihaga biriktirilmagan');
  const projectIds = projectId !== undefined ? projectObjects(line, projectId) : line.obyektlar.map(o => o.id);
  const ids = contractRaw === 'biriktirilmagan' ? unassignedObjects(line, projectId ?? null) : contract ? contractObjects(line, contract.id) : projectIds;
  const contracts = line.shartnomalar.filter(s => s.loyiha_id === projectId);
  const idSet = new Set(ids);
  const objectList = objects.filter(o => idSet.has(o.id) && matches(o.nom));
  const amount = (objectIds: number[], metric: FinancialMetric, sid?: number) => <>
    <Value value={financials.sum(objectIds)[metric]} money />
    {metric === 'smeta' && <span className="mt-1 block text-[11px] font-normal text-text-dim">{t('Nakrutkalar bilan (QQS bilan)')}: {money.loading ? t('Hisoblanmoqda…') : <Value value={money.sum(objectIds,sid)} money />}</span>}
  </>;
  const technicalDetails = (objectIds: number[], name: string) => {
    const counts = summarize(objectIds);
    const financial = financials.sum(objectIds);
    return <details className="text-[12px] text-text-dim" aria-label={`${t('Tarkib va tekshiruv')}: ${name}`}>
      <summary className="cursor-pointer">{t('Tarkib va tekshiruv')}</summary>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><div><dt className="inline">{t('Obyektlar')}: </dt><dd className="inline">{new Set(objectIds).size}</dd></div>{technicalMetrics.map(key => <div key={key}><dt className="inline">{t(labels[key])}: </dt><dd className="inline"><Value value={counts[key]} /></dd></div>)}</dl>
      <p className="mt-2">{t('Asos: to‘g‘ri xarajatlar, nakrutka va QQSsiz. F2 — faqat tasdiqlangan aktlar.')}</p>
      <p>{t('Ostatka — smeta narxida baholangan musbat qolgan ish hajmi; qayd etilgan Fakt hisobga olinadi. Smeta − F2 emas.')}</p>
      <p className="mt-1">{t(contractBasis)}</p>
      {financial.legacy > 0 && <p className="mt-1 text-warn">{t('Eski F2 yozuvlari: manbada tasdiqlangan summa bo‘lmasa, eski summa ishlatilgan.')} {financial.legacy}</p>}
    </details>;
  };
  const row = (key: string, name: string, objectIds: number[], action: () => void, icon: ReactNode, subtitle?: string, sid?: number) => {
    return <tr key={key} className="border-b border-border/60 last:border-0 hover:bg-accent/5">
      <th scope="row" className="min-w-[220px] p-3 text-left font-normal"><button type="button" className="flex w-full items-start gap-3 text-left" onClick={action}>{icon}<span className="min-w-0"><span className="block font-semibold text-text">{name}</span>{subtitle && <span className="mt-1 block text-[12px] text-text-dim">{subtitle}</span>}</span><ChevronRight size={17} className="ml-auto shrink-0 text-text-mute" /></button></th>
      {FINANCIAL_METRICS.map(metric => <td key={metric} className="p-3 text-right" title={sid != null ? t(contractBasis) : undefined}>{amount(objectIds,metric,sid)}</td>)}
    </tr>;
  };
  return <section className="space-y-4" aria-label={t('Loyiha va obyektlar navigatori')}>
    <nav aria-label={t('Loyiha yo‘li')} className="flex flex-wrap items-center gap-2 text-[13px]">
      <button className="tugma" onClick={() => go()}>{t('Barcha loyihalar')}</button>
      {projectId !== undefined && <><ChevronRight size={14} /><button className="tugma" onClick={() => go(projectId)}>{projectName}</button></>}
      {contractRaw && <><ChevronRight size={14} /><span aria-current="page" className="font-semibold">{contract ? `№ ${contract.raqam} · ${contract.nom ?? ''}` : t('Shartnomaga biriktirilmagan')}</span></>}
    </nav>
    <p className="text-[11px] text-text-dim">{t('To‘g‘ri xarajatlar · nakrutka va QQSsiz')}</p>
    <div aria-label={t('Moliyaviy ko‘rsatkichlar')} className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {FINANCIAL_METRICS.map(metric => <div key={metric} className="karta p-3"><span className="block text-[11px] text-text-dim">{t(financialLabels[metric])}</span><b className="mt-1 block text-[16px]">{financials.loading ? t('Hisoblanmoqda…') : amount(ids,metric,contract?.id)}</b></div>)}
    </div>
    {technicalDetails(ids, projectId === undefined ? t('Barcha loyihalar') : contract?.nom ?? projectName)}
    {financials.failed && <p role="status" className="text-[12px] text-warn">{t('Moliyaviy ko‘rsatkichlar o‘qilmadi.')}<button type="button" className="tugma ml-2" onClick={financials.retry}>{t('Qayta urinish')}</button></p>}
    {money.failed && <p role="status" className="text-[12px] text-warn">{t('Nakrutka hisobi o‘qilmadi. Qayta yangilang.')}<button type="button" className="tugma ml-2" onClick={money.retry}>{t('Qayta urinish')}</button></p>}
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="text-lg font-semibold">{contractRaw ? t('Obyektlar') : projectId !== undefined ? t('Shartnomalar') : t('Loyihalar')}</h3>
      <label className="relative ml-auto w-full sm:w-80"><Search size={16} className="absolute left-3 top-2.5 text-text-mute" /><input aria-label={t('Navigator qidiruvi')} className="input w-full py-2 pl-9 pr-3" placeholder={t('Nom bo‘yicha qidirish')} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <Link className="tugma" to="/admin/shartnoma-liniya"><Settings size={14} />{t('Shartnomalarni boshqarish')}</Link>
    </div>
    {!contractRaw ? <div className="karta overflow-x-auto"><table className="w-full text-[13px]"><thead className="bg-surface-2/60 text-text-dim"><tr><th className="p-3 text-left">{projectId !== undefined ? t('Shartnoma') : t('Loyiha')}</th>{FINANCIAL_METRICS.map(metric => <th key={metric} className="p-3 text-right whitespace-nowrap">{t(financialLabels[metric])}</th>)}</tr></thead><tbody>
      {projectId === undefined ? <>
        {line.loyihalar.filter(p => matches(p.nom) || line.obyektlar.some(o => o.loyiha_id === p.id && matches(o.nom))).map(p => row(`p${p.id}`,p.nom, projectObjects(line, p.id), () => { go(p.id); }, <FolderKanban size={20} className="shrink-0 text-accent" />, `${line.shartnomalar.filter(s => s.loyiha_id === p.id).length} ${t('shartnoma')}`))}
        {projectObjects(line,null).length > 0 && row('unassigned-project',t('Loyihaga biriktirilmagan'), projectObjects(line,null), () => { go(null,'biriktirilmagan'); }, <FolderKanban size={20} />)}
      </> : <>
        {contracts.filter(s => matches(`${s.raqam} ${s.nom ?? ''}`) || line.obyektlar.some(o => s.obyektlar.includes(o.id) && matches(o.nom))).map(s => row(`s${s.id}`,`№ ${s.raqam} · ${s.nom ?? ''}`, contractObjects(line,s.id), () => { go(projectId,s.id); }, <FileSignature size={20} className="shrink-0 text-accent" />, s.tomonlar.map(p => `${p.rol}: ${p.nom}`).join(' · '),s.id))}
        {unassignedObjects(line,projectId ?? null).length > 0 && row('unassigned-contract',t('Shartnomaga biriktirilmagan'),unassignedObjects(line,projectId ?? null),() => { go(projectId,'biriktirilmagan'); },<Building2 size={20} />)}
      </>}
    </tbody></table>{projectId !== undefined && !contracts.length && <p className="p-4 text-text-dim">{t('Bu loyihada shartnoma hali yo‘q.')}</p>}</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {objectList.map(o => <article key={o.id} className="karta flex min-w-0 flex-col gap-3 p-4">
        <button className="flex items-start gap-2 text-left text-[16px] font-semibold" onClick={() => onOpen(o,contract?.id)}><Building2 size={19} className="mt-0.5 shrink-0 text-accent" /><span className="min-w-0 break-words">{o.nom}</span><ChevronRight size={17} className="ml-auto shrink-0" /></button>
        <div className="grid grid-cols-2 gap-3">{FINANCIAL_METRICS.map(metric => <div key={metric}><span className="block text-[11px] text-text-dim">{t(financialLabels[metric])}</span><b className="text-lg">{amount([o.id],metric,contract?.id)}</b></div>)}</div>
        {technicalDetails([o.id],o.nom)}
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-3"><button className="tugma tugma-asosiy" onClick={() => onOpen(o,contract?.id)}>{t('Smetani ochish')}</button><Link className="tugma" to={`/admin/holat/${o.id}?panel=smeta`}><Upload size={14} />{t('Smeta yuklash')}</Link><button className="tugma" aria-label={`${t('Obyektni tahrirlash')}: ${o.nom}`} onClick={() => onEdit(o)}><Edit3 size={14} /></button><button className="tugma" aria-label={`${t('Obyektni arxivlash')}: ${o.nom}`} onClick={() => onArchive(o)}><Archive size={14} /></button></div>
      </article>)}
      {!objectList.length && <p className="karta p-5 text-text-dim">{t('Bu tanlov bo‘yicha obyekt topilmadi.')}</p>}
    </div>}
  </section>;
}
