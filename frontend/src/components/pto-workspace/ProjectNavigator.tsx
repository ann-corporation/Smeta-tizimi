import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, FolderKanban, FileSignature, ChevronRight, Search, Settings, Upload, Edit3, Archive, Share2 } from 'lucide-react';
import type { T2Obyekt } from '../../api/supabase';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { makeSummarizer, contractObjects, projectObjects, unassignedObjects, type Aggregate, type Metric } from './hierarchy';
import { useCompanyLineage } from './useLineage';
import { useObjectFinancials } from './useObjectFinancials';
import { FINANCIAL_METRICS, type FinancialMetric, type FinancialTotals } from './financials';
import { PortfelSummaJuft } from '../../umumiy/ui/PortfelSummaJuft';
import { QiymatUchlik, SummaYorliq } from '../../umumiy/ui/QiymatUchlik';
import { useRahbarPanel } from '../../api/t2-rahbar-panel';
import { paketUchligi, type SummaPaket } from '../../lib/summa-paket';
import { paketlarJami } from '../../lib/summa-tafsilot';
import { KatTaqsimot, LoyihaStack, ProgressQadam, type StackQator } from './ObyektGrafik';

const financialLabels: Record<FinancialMetric, string> = { smeta: 'Smeta', fakt: 'Fakt', f2: 'Tasdiqlangan F2', ostatka: 'Ostatka' };
const technicalMetrics = ['razdel', 'ish', 'resurs', 'narxsiz', 'qator_soni'] as const;
const contractBasis = 'Shartnoma summalari — bog‘langan obyektlarning to‘liq ko‘rsatkichlari; aktlar shartnomalar bo‘yicha taqsimlanmagan. Umumiy obyekt har shartnoma qatorida ko‘rinadi, loyiha va kompaniya jamida bir marta hisoblanadi.';
const labels: Record<Metric, string> = { jami: 'Nakrutkasiz summa', qator_soni: 'Qatorlar', razdel: 'Bo‘limlar', ish: 'Ishlar', resurs: 'Resurslar', narxsiz: 'Narxsiz resurslar' };
/** Metrika rangi (meter va KPI belgilarida bir xil): fakt — lojuvard, F2 — firuza, ostatka — kulrang. */
const metricRang: Record<FinancialMetric, string> = { smeta: 'var(--text-dim)', fakt: 'var(--info)', f2: 'var(--accent)', ostatka: 'var(--surface-3)' };

/**
 * Bajarilish chizig'i: F2 (firuza) + fakt ortig'i (lojuvard) / smeta = 100%. Noma'lum (null) — «—», hech qachon 0%.
 * Ba'zi qiymatlar noma'lum bo'lsa (`unknown > 0`) foiz taxminiy: «≈» va tushuntirish.
 */
function Bajarilish({ f, katta = false }: { f: FinancialTotals; katta?: boolean }) {
  const { smeta, fakt, f2 } = f;
  if (smeta.present === 0 || !(smeta.known > 0) || fakt.present === 0) return <span className="text-[11.5px] text-text-mute" title={t('Bajarilish foizi smeta va fakt ma’lum bo‘lganda hisoblanadi')}>{t('Bajarilish')}: —</span>;
  const taxminiy = smeta.unknown > 0 || fakt.unknown > 0;
  const fk = Math.max(fakt.known, 0), f2k = f2.present > 0 ? Math.max(f2.known, 0) : 0;
  const f2u = Math.min(1, f2k / smeta.known), fu = Math.min(1, Math.max(fk, f2k) / smeta.known), pct = Math.round((Math.max(fk, f2k) / smeta.known) * 100);
  return <span className={`fz-meter ${katta ? 'fz-meter--lg' : ''} ${pct > 100 ? 'fz-meter--over' : ''}`} style={{ minWidth: 0 }} title={taxminiy ? t('Ba’zi qiymatlar noma’lum — foiz taxminiy') : t('F2 olingan (firuza) va bajarilgan fakt (lojuvard) — smeta = 100%')}>
    <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${f2u * 100}%` }} /><i className="fz-meter__fakt" style={{ width: `${Math.max(0, fu - f2u) * 100}%` }} /></span>
    <span className="fz-meter__f">{taxminiy ? '≈' : ''}{pct}%</span>
  </span>;
}
/** Obyekt holati so'zi (muhr): faqat ma'lum qiymatdan; noma'lum — ogohlantirish, 0 emas. */
function holatMuhri(f: FinancialTotals): { soz: string; ton: string } {
  const { smeta, fakt } = f;
  if (smeta.present === 0 || !(smeta.known > 0)) return { soz: 'Smeta noma’lum', ton: 'warn' };
  if (fakt.present === 0) return { soz: 'Fakt noma’lum', ton: 'warn' };
  const ulush = fakt.known / smeta.known;
  if (ulush > 1) return { soz: 'Smetadan oshgan', ton: 'danger' };
  if (ulush >= 0.995) return { soz: 'Yakunlangan', ton: 'ok' };
  if (fakt.known === 0) return { soz: 'Boshlanmagan', ton: '' };
  return { soz: 'Jarayonda', ton: 'info' };
}
function Value({ value, money = false }: { value: Aggregate; money?: boolean }) {
  return <span className="tabular-nums">{value.present === 0 && (money || value.total !== 0) ? t('Noma’lum') : money ? <FmtN val={value.known} kasr={0} /> : value.known.toLocaleString('ru-RU')}
    {value.unknown > 0 && <span className="mt-1 block text-[11px] font-normal text-text-mute">{t('narxsiz resurslar summaga kirmagan — Narxlar bo‘limida')}</span>}</span>;
}
export function ProjectNavigator({ companyId, objects, onOpen, onEdit, onArchive, onShare }: {
  companyId: number; objects: T2Obyekt[]; onOpen: (o: T2Obyekt, contractId?: number) => void;
  onEdit: (o: T2Obyekt) => void; onArchive: (o: T2Obyekt) => void; onShare?: (o: T2Obyekt) => void;
}) {
  const { data: line, isPending, error, refetch } = useCompanyLineage(companyId);
  const financials = useObjectFinancials(companyId, objects);
  /** Fakt va F2 uchligi — server paketi (rahbar paneli); panel o‘qilmasa ustamasiz yorlig‘i bilan eski ko‘rinish. */
  const rp = useRahbarPanel(companyId);
  const paketlar = useMemo(() => new Map((rp.data?.obyektlar ?? []).map(o => [o.obyekt_id, { fakt: o.fakt, f2: o.f2 }] as const)), [rp.data]);
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
  if (isPending) return <div role="status" className="skel h-48 rounded-xl">{t('Loyiha zanjiri yuklanmoqda…')}</div>;
  if (error || !line) return <div role="alert" className="fz-note fz-note--danger items-center">{t('Loyiha zanjiri o‘qilmadi')}<button type="button" className="fz-btn fz-btn--sm ml-3" onClick={() => void refetch()}>{t('Qayta urinish')}</button></div>;
  if ((projectId !== undefined && projectId !== null && !project) || (contractRaw && contractRaw !== 'biriktirilmagan' && !contract)) {
    return <div role="alert" className="fz-note fz-note--warn items-center">{t('Tanlangan loyiha yoki shartnoma bu kompaniyada topilmadi.')}<button className="fz-btn fz-btn--sm ml-3" onClick={() => go()}>{t('Barcha loyihalar')}</button></div>;
  }
  const projectName = project?.nom ?? t('Loyihaga biriktirilmagan');
  const projectIds = projectId !== undefined ? projectObjects(line, projectId) : line.obyektlar.map(o => o.id);
  const ids = contractRaw === 'biriktirilmagan' ? unassignedObjects(line, projectId ?? null) : contract ? contractObjects(line, contract.id) : projectIds;
  const contracts = line.shartnomalar.filter(s => s.loyiha_id === projectId);
  const idSet = new Set(ids);
  const objectList = objects.filter(o => idSet.has(o.id) && matches(o.nom));
  const amount = (objectIds: number[], metric: FinancialMetric, sid?: number) => {
    const agg = financials.sum(objectIds)[metric];
    if (metric === 'smeta') return <>
      {/* Egasi 2026-10-27: QQS bilan (katta) + ustamali va ustamasiz (kichik) — yagona QiymatUchlik (PortfelSummaJuft). */}
      <PortfelSummaJuft obyektlar={objectIds.map(obyektId => ({ obyektId, shartnomaId: sid ?? null }))} ustamasiz={agg.present === 0 ? null : agg.known} />
      {agg.unknown > 0 && <span className="mt-1 block text-[11px] font-normal text-text-mute">{t('narxsiz resurslar summaga kirmagan — Narxlar bo‘limida')}</span>}
    </>;
    if ((metric === 'fakt' || metric === 'f2') && paketlar.size > 0) {
      const pk: (SummaPaket | null)[] = objectIds.map(id => paketlar.get(id)?.[metric] ?? null);
      const j = paketlarJami(pk);
      if (j.q.qqsBilan != null) return <QiymatUchlik q={j.q} kichik className="items-end text-right" yorliq={metric === 'fakt' ? t('Fakt, QQS bilan') : t('F2, QQS bilan')} nomalumSoni={j.nomalumSoni}
        qismlar={objectIds.map(id => ({ kalit: String(id), nom: objects.find(o => o.id === id)?.nom ?? ('#' + id), q: paketUchligi(paketlar.get(id)?.[metric] ?? null) }))} />;
    }
    return <><Value value={agg} money /><SummaYorliq tur="ustamasiz" /></>;
  };
  const stackQatorlar: StackQator[] = projectId === undefined && !contractRaw
    ? line.loyihalar.map(p => ({ kalit: `p${p.id}`, nom: p.nom, fin: financials.sum(projectObjects(line, p.id)) }))
    : projectId !== undefined && !contractRaw ? contracts.map(s => ({ kalit: `s${s.id}`, nom: `№ ${s.raqam} · ${s.nom ?? ''}`, fin: financials.sum(contractObjects(line, s.id)) })) : [];
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
    return <tr key={key}>
      <th scope="row" className="min-w-[240px] p-3 text-left font-normal" style={{ position: 'static', background: 'transparent', textTransform: 'none', letterSpacing: 0, height: 'auto', borderBottom: '1px solid var(--border)' }}><button type="button" className="flex w-full items-start gap-3 text-left" onClick={action}>{icon}<span className="min-w-0 flex-1"><span className="block font-semibold text-text">{name}</span>{subtitle && <span className="mt-0.5 block text-[12px] text-text-dim">{subtitle}</span>}{!financials.loading && <span className="mt-1.5 block max-w-[240px]"><Bajarilish f={financials.sum(objectIds)} /></span>}</span><ChevronRight size={17} className="ml-auto shrink-0 text-text-mute" /></button></th>
      {FINANCIAL_METRICS.map(metric => <td key={metric} className="p-3 text-right" title={sid != null ? t(contractBasis) : undefined}>{amount(objectIds,metric,sid)}</td>)}
    </tr>;
  };
  const scopeFin = financials.sum(ids);
  return <section className="space-y-4" aria-label={t('Loyiha va obyektlar navigatori')}>
    <nav aria-label={t('Loyiha yo‘li')} className="flex flex-wrap items-center gap-2 text-[13px]">
      <button className="fz-btn fz-btn--sm" onClick={() => go()}>{t('Barcha loyihalar')}</button>
      {projectId !== undefined && <><ChevronRight size={14} className="text-text-mute" /><button className="fz-btn fz-btn--sm" onClick={() => go(projectId)}>{projectName}</button></>}
      {contractRaw && <><ChevronRight size={14} className="text-text-mute" /><span aria-current="page" className="font-semibold">{contract ? `№ ${contract.raqam} · ${contract.nom ?? ''}` : t('Shartnomaga biriktirilmagan')}</span></>}
    </nav>
    <div aria-label={t('Moliyaviy ko‘rsatkichlar')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {FINANCIAL_METRICS.map(metric => <div key={metric} className="fz-card" style={{ padding: 14 }}><div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: metricRang[metric], boxShadow: metric === 'ostatka' ? 'inset 0 0 0 1px var(--border-strong)' : undefined }} />{t(financialLabels[metric])}</span><b className="fz-kpi__value">{financials.loading ? t('Hisoblanmoqda…') : amount(ids,metric,contract?.id)}</b></div></div>)}
    </div>
    {!financials.loading && !financials.failed && ids.length > 0 && <div className="fz-panel">
      <div className="fz-panel__h"><span>{t('Umumiy bajarilish')}</span><span>{t('smeta = 100%')}</span></div>
      <Bajarilish f={scopeFin} katta />
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-text-mute">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />{t('F2 olingan')}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--info)' }} />{t('fakt (F2 siz)')}</span>
      </div>
    </div>}
    {!financials.loading && !financials.failed && stackQatorlar.length > 0 && <LoyihaStack qatorlar={stackQatorlar} />}
    <p className="text-[11px] text-text-dim">{t('Smeta, Fakt va F2: katta raqam — QQS bilan; ostida ustamali (QQS siz) va to‘g‘ri xarajat (▸ kesim va hisob — tarkibi). Ostatka — faqat to‘g‘ri xarajat (ustamasiz): kategoriya kesimi yo‘q. Fakt/F2 server paketi o‘qilmasa ham ustamasiz yorlig‘i bilan ko‘rsatiladi.')}</p>
    {technicalDetails(ids, projectId === undefined ? t('Barcha loyihalar') : contract?.nom ?? projectName)}
    {financials.failed && <p role="status" className="fz-note fz-note--warn">{t('Moliyaviy ko‘rsatkichlar o‘qilmadi.')}<button type="button" className="fz-btn fz-btn--sm ml-2" onClick={financials.retry}>{t('Qayta urinish')}</button></p>}
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{contractRaw ? t('Obyektlar') : projectId !== undefined ? t('Shartnomalar') : t('Loyihalar')}</h3>
      <label className="relative ml-auto w-full sm:w-80"><Search size={15} className="absolute left-2.5 top-[9px] text-text-mute" aria-hidden="true" /><input aria-label={t('Navigator qidiruvi')} className="h-8 w-full rounded-md border border-[var(--border-strong)] bg-bg pl-8 pr-3 text-[13px]" placeholder={t('Nom bo‘yicha qidirish')} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <Link className="fz-btn fz-btn--sm" to="/admin/shartnoma-liniya"><Settings aria-hidden="true" />{t('Shartnomalarni boshqarish')}</Link>
    </div>
    {!contractRaw ? <div className="fz-table-wrap"><table className="fz-table"><thead><tr><th>{projectId !== undefined ? t('Shartnoma') : t('Loyiha')}</th>{FINANCIAL_METRICS.map(metric => <th key={metric} className="fz-c-num">{t(financialLabels[metric])}</th>)}</tr></thead><tbody>
      {projectId === undefined ? <>
        {line.loyihalar.filter(p => matches(p.nom) || line.obyektlar.some(o => o.loyiha_id === p.id && matches(o.nom))).map(p => row(`p${p.id}`,p.nom, projectObjects(line, p.id), () => { go(p.id); }, <FolderKanban size={20} className="shrink-0 text-accent" />, `${line.shartnomalar.filter(s => s.loyiha_id === p.id).length} ${t('shartnoma')}`))}
        {projectObjects(line,null).length > 0 && row('unassigned-project',t('Loyihaga biriktirilmagan'), projectObjects(line,null), () => { go(null,'biriktirilmagan'); }, <FolderKanban size={20} className="shrink-0 text-text-mute" />)}
      </> : <>
        {contracts.filter(s => matches(`${s.raqam} ${s.nom ?? ''}`) || line.obyektlar.some(o => s.obyektlar.includes(o.id) && matches(o.nom))).map(s => row(`s${s.id}`,`№ ${s.raqam} · ${s.nom ?? ''}`, contractObjects(line,s.id), () => { go(projectId,s.id); }, <FileSignature size={20} className="shrink-0 text-accent" />, s.tomonlar.map(p => `${p.rol}: ${p.nom}`).join(' · '),s.id))}
        {unassignedObjects(line,projectId ?? null).length > 0 && row('unassigned-contract',t('Shartnomaga biriktirilmagan'),unassignedObjects(line,projectId ?? null),() => { go(projectId,'biriktirilmagan'); },<Building2 size={20} className="shrink-0 text-text-mute" />)}
      </>}
    </tbody></table>{projectId !== undefined && !contracts.length && <p className="p-4 text-text-dim">{t('Bu loyihada shartnoma hali yo‘q.')}</p>}</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {objectList.map(o => { const fin = financials.sum([o.id]); const muhr = holatMuhri(fin); return <article key={o.id} className="fz-card flex min-w-0 flex-col gap-3 p-4" style={{ overflow: 'visible' }}>
        <div className="flex items-start gap-2">
          <Building2 size={19} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <button className="min-w-0 flex-1 break-words text-left text-[15px] font-semibold hover:underline" style={{ fontFamily: 'var(--font-display)' }} onClick={() => onOpen(o,contract?.id)}>{o.nom}</button>
          {!financials.loading && !financials.failed && <span className={`fz-stamp ${muhr.ton ? `fz-stamp--${muhr.ton}` : ''}`}>{t(muhr.soz)}</span>}
        </div>
        {!financials.loading && !financials.failed && <ProgressQadam fin={fin} />}
        <KatTaqsimot obyekt={o} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">{FINANCIAL_METRICS.map(metric => <div key={metric} className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: metricRang[metric], boxShadow: metric === 'ostatka' ? 'inset 0 0 0 1px var(--border-strong)' : undefined }} />{t(financialLabels[metric])}</span><b className="text-[15px] font-semibold">{amount([o.id],metric,contract?.id)}</b></div>)}</div>
        {technicalDetails([o.id],o.nom)}
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3"><button className="fz-btn fz-btn--primary flex-1" onClick={() => onOpen(o,contract?.id)}>{t('Smetani ochish')}</button><Link className="fz-btn" to={`/admin/holat/${o.id}?panel=smeta`}><Upload aria-hidden="true" />{t('Smeta yuklash')}</Link><button className="fz-btn fz-btn--icon" aria-label={`${t('Obyektni tahrirlash')}: ${o.nom}`} title={t('Obyektni tahrirlash')} onClick={() => onEdit(o)}><Edit3 aria-hidden="true" /></button>{onShare && <button className="fz-btn fz-btn--icon" aria-label={`${t('Ulashish')}: ${o.nom}`} title={t('Ulashish')} onClick={() => onShare(o)}><Share2 aria-hidden="true" /></button>}<button className="fz-btn fz-btn--icon" aria-label={`${t('Obyektni arxivlash')}: ${o.nom}`} title={t('Obyektni arxivlash')} onClick={() => onArchive(o)}><Archive aria-hidden="true" /></button></div>
      </article>; })}
      {!objectList.length && <p className="fz-note fz-note--info md:col-span-2 xl:col-span-3">{t('Bu tanlov bo‘yicha obyekt topilmadi.')}</p>}
    </div>}
  </section>;
}
