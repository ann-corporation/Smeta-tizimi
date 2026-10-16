import type { BossDashboard, BossSignal } from '../../api/t2-boss';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';

export type PortfolioTotals = {
  object_count: number; estimate_known: number | null; estimate_missing: number;
  unpriced_rows: number; approved_known: number | null; approved_count: number;
  approved_missing: number; draft_count: number; review_count: number; pending_changes: number;
};
export type ExecutiveObject = PortfolioTotals & { object_id:number; project_id:number|null; name:string; project_name:string|null };
export type ExecutiveProject = PortfolioTotals & { project_id:number|null; name:string };
export type BossExecutive = {
  version:1; scope:'active_objects'; totals:PortfolioTotals;
  projects:ExecutiveProject[]; objects:ExecutiveObject[];
  project_count:number; project_limit:number; object_limit:number;
  contracts_missing:number; payment_count:number; expense_count:number;
};
export const finite = (value:unknown):value is number => typeof value==='number' && Number.isFinite(value);
export function amount(value:unknown):number|null {return finite(value)?value:null;}
export function count(value:unknown):number|null {return finite(value) && value>=0 && Number.isInteger(value)?value:null;}
export function objectUrl(id:number,projectId:number|null,section='holat') {
  const query=new URLSearchParams({obyekt:String(id)});
  if(projectId!=null) query.set('loyiha',String(projectId));
  return section==='holat' ? `/admin/holat/${id}?${query}` : `/admin/${section}?${query}`;
}
export const projectUrl=(id:number|null)=>`/admin/obyektlar?loyiha=${id==null?'biriktirilmagan':id}`;
export const issueScore=(o:PortfolioTotals)=>o.approved_missing*1000+o.review_count*100+o.pending_changes*10+(o.unpriced_rows>0?5:0)+o.estimate_missing;
export function filteredObjects(objects:ExecutiveObject[],project:string,query:string,issuesOnly:boolean) {
  const key=qidiruvKaliti(query);
  return objects.filter(o=>(project==='all'||String(o.project_id??'none')===project)
    && (!key || qidiruvKaliti(`${o.name} ${o.project_name??''}`).includes(key))
    && (!issuesOnly || issueScore(o)>0))
    .sort((a,b)=>issueScore(b)-issueScore(a)||a.name.localeCompare(b.name));
}
const rank:Record<string,number>={critical:0,high:1,error:1,medium:2,warning:2,low:3,info:4};
export function sortedSignals(signals:BossSignal[]) {
  return [...signals].sort((a,b)=>(rank[a.severity??'']??4)-(rank[b.severity??'']??4)||String(b.detected_at??'').localeCompare(String(a.detected_at??'')));
}
export function signalUrl(signal:BossSignal,objects:ExecutiveObject[]) {
  const id=Number(signal.entity_id);
  if(signal.entity_type==='obyekt' && Number.isSafeInteger(id) && id>0) {
    const object=objects.find(o=>o.object_id===id);
    // Only a canonical company-scoped object returned in this same snapshot is linked directly.
    if(object) return objectUrl(id,object.project_id);
  }
  return signal.entity_type==='hujjat'?'/admin/hujjat-nazorat':'/admin/obyektlar';
}
export function trustedExecutive(data:BossDashboard):BossExecutive|null {
  const e=data.executive;
  return validExecutive(e) ? e:null;
}

export function validExecutive(value:unknown):value is BossExecutive {
  if(!value || typeof value!=='object') return false;
  const e=value as BossExecutive;
  const validTotals=(v:PortfolioTotals)=>v && ['object_count','estimate_missing','unpriced_rows','approved_count','approved_missing','draft_count','review_count','pending_changes'].every(k=>count(v[k as keyof PortfolioTotals])!=null)
    && [v.estimate_known,v.approved_known].every(n=>n===null || finite(n));
  return e.version===1 && e.scope==='active_objects' && validTotals(e.totals)
    && [e.project_count,e.project_limit,e.object_limit,e.contracts_missing,e.payment_count,e.expense_count].every(n=>count(n)!=null)
    && Array.isArray(e.projects) && Array.isArray(e.objects)
    && e.projects.every(p=>validTotals(p) && (p.project_id===null || Number.isSafeInteger(p.project_id)) && typeof p.name==='string')
    && e.objects.every(o=>validTotals(o) && Number.isSafeInteger(o.object_id) && o.object_id>0 && (o.project_id===null || Number.isSafeInteger(o.project_id)) && typeof o.name==='string')
    && new Set(e.objects.map(o=>o.object_id)).size===e.objects.length;
}
export function completePortfolio(e:BossExecutive) {
  return e.objects.length===e.totals.object_count && e.projects.length===e.project_count;
}

export function rowArithmetic(quantity:unknown,price:unknown,sum:unknown) {
  if(!finite(quantity)||!finite(price)||!finite(sum)) return null;
  const product=quantity*price;
  return finite(product)?{product,difference:sum-product,matches:Math.abs(sum-product)<0.005}:null;
}
