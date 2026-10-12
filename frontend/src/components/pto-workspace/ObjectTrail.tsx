import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCompanyLineage } from './useLineage';
import { contractObjects } from './hierarchy';
import { t } from '../../i18n/til';

export function ObjectTrail({ companyId, objectId }: { companyId: number | null; objectId: number }) {
  const { data: line } = useCompanyLineage(companyId);
  const [params] = useSearchParams();
  const object = line?.obyektlar.find(o => o.id === objectId);
  const project = line?.loyihalar.find(p => p.id === object?.loyiha_id);
  const contracts = line?.shartnomalar.filter(s => contractObjects(line,s.id).includes(objectId)) ?? [];
  const requested = contracts.find(s => s.id === Number(params.get('shartnoma')));
  const contract = requested ?? contracts.find(s => s.id === object?.asosiy_shartnoma_id) ?? (contracts.length === 1 ? contracts[0] : undefined);
  const projectUrl = object?.loyiha_id != null ? `/admin/obyektlar?loyiha=${object.loyiha_id}` : '/admin/obyektlar?loyiha=biriktirilmagan';
  return <nav aria-label={t('Loyiha yo‘li')} className="flex flex-wrap items-center gap-2 text-[13px] text-text-dim">
    <Link className="hover:text-accent" to="/admin/obyektlar">{t('Barcha loyihalar')}</Link>
    {object && <><ChevronRight size={14} /><Link className="hover:text-accent" to={projectUrl}>{project?.nom ?? t('Loyihaga biriktirilmagan')}</Link>
      <ChevronRight size={14} /><Link className="hover:text-accent" to={contract ? `${projectUrl}&shartnoma=${contract.id}` : contracts.length ? projectUrl : `${projectUrl}&shartnoma=biriktirilmagan`}>{contract ? `№ ${contract.raqam} · ${contract.nom ?? ''}` : contracts.length ? t('Shartnomalar') : t('Shartnomaga biriktirilmagan')}</Link>
      <ChevronRight size={14} /><span aria-current="page" className="font-semibold text-text">{object.nom}</span></>}
  </nav>;
}
