import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCompanyLineage } from './useLineage';
import { contractObjects } from './hierarchy';
import { t } from '../../i18n/til';
import { raqamTozala } from '../../lib/raqam-belgi';

/**
 * Loyiha yo'li (breadcrumb). Desktop: to'liq zanjir (qator sig'masa o'raladi). Telefon (<768px): BITTA qator —
 * o'rta bo'laklar yig'iladi («… › obyekt»), oxirgi bo'lak uzun bo'lsa ellipsis (to'liq matn title da).
 */
export function ObjectTrail({ companyId, objectId }: { companyId: number | null; objectId: number }) {
  const { data: line } = useCompanyLineage(companyId);
  const [params] = useSearchParams();
  const object = line?.obyektlar.find(o => o.id === objectId);
  const project = line?.loyihalar.find(p => p.id === object?.loyiha_id);
  const contracts = line?.shartnomalar.filter(s => contractObjects(line,s.id).includes(objectId)) ?? [];
  const requested = contracts.find(s => s.id === Number(params.get('shartnoma')));
  const contract = requested ?? contracts.find(s => s.id === object?.asosiy_shartnoma_id) ?? (contracts.length === 1 ? contracts[0] : undefined);
  const projectUrl = object?.loyiha_id != null ? `/admin/obyektlar?loyiha=${object.loyiha_id}` : '/admin/obyektlar?loyiha=biriktirilmagan';
  const loyihaNom = project?.nom ?? t('Loyihaga biriktirilmagan');
  const shartnomaNom = contract ? `№ ${raqamTozala(contract.raqam)} · ${contract.nom ?? ''}` : contracts.length ? t('Shartnomalar') : t('Shartnomaga biriktirilmagan');
  const havola = 'hover:underline hover:text-[var(--accent-text)] max-md:hidden';
  const chevron = <ChevronRight size={13} className="shrink-0 text-text-mute max-md:hidden" aria-hidden="true" />;
  return <nav aria-label={t('Loyiha yo‘li')} data-testid="obyekt-yol" className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-text-dim md:flex-wrap max-md:flex-nowrap max-md:overflow-hidden">
    <Link className={havola} to="/admin/obyektlar">{t('Barcha loyihalar')}</Link>
    {object && <>
      {chevron}<Link className={havola} to={projectUrl} title={loyihaNom}>{loyihaNom}</Link>
      {chevron}<Link className={havola} to={contract ? `${projectUrl}&shartnoma=${contract.id}` : contracts.length ? projectUrl : `${projectUrl}&shartnoma=biriktirilmagan`} title={shartnomaNom}>{shartnomaNom}</Link>
      {/* Telefon: yig'ilgan o'rta bo'laklar o'rniga bitta «…» (loyihaga havola). */}
      <Link to={projectUrl} aria-label={`${t('Barcha loyihalar')} › ${loyihaNom}`} data-testid="yol-yig" className="shrink-0 px-1 text-text-mute md:hidden">…</Link>
      <ChevronRight size={13} className="shrink-0 text-text-mute" aria-hidden="true" />
      <span aria-current="page" title={object.nom} className="min-w-0 font-semibold text-text max-md:truncate max-md:whitespace-nowrap">{object.nom}</span></>}
  </nav>;
}
