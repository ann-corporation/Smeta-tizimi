import type { MindmapGraf, MindmapTugun, TugunTur } from '../../api/t2-mindmap';
import type { BossExecutive } from './model';
import { amount } from './model';

export const entityTypes: TugunTur[] = ['kompaniya','loyiha','shartnoma','obyekt','sklad','texnika','kadr','kontragent','zayavka'];
export const entityLabels: Record<TugunTur,string> = {kompaniya:'Kompaniya',loyiha:'Loyiha',shartnoma:'Shartnoma',obyekt:'Obyekt',sklad:'Ombor',texnika:'Texnika',kadr:'Xodim',kontragent:'Hamkor',zayavka:'Ta’minot so‘rovi'};
export type GraphSnapshot = { graph:MindmapGraf; omittedEdges:number; readAt:string };
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function entityKey(value:unknown):value is string {
  if(typeof value!=='string') return false;
  const [type,id,...rest]=value.split(':');
  return !rest.length && entityTypes.includes(type as TugunTur) && /^[1-9]\d*$/.test(id??'') && Number.isSafeInteger(Number(id));
}
/** Graph is a relationship source only. Its legacy money/progress fields never enter the ledger. */
export function validateGraph(value:unknown, companyId:number):GraphSnapshot {
  if(!record(value)||!Array.isArray(value.tugunlar)||!Array.isArray(value.bogichlar)) throw Error('GRAPH_INVALID');
  const seen=new Set<string>();
  const nodes:MindmapTugun[]=value.tugunlar.map((n:unknown)=>{
    if(!record(n)||!entityKey(n.id)||n.id.split(':')[0]!==n.tur||typeof n.nom!=='string'||seen.has(n.id)) throw Error('GRAPH_IDENTITY_INVALID');
    if(n.node_key!==undefined&&n.node_key!==n.id || n.entity_id!==undefined&&n.entity_id!==Number(n.id.split(':')[1]) || n.entity_type!==undefined&&n.entity_type!==n.tur) throw Error('GRAPH_IDENTITY_INVALID');
    if(n.tur==='kompaniya'&&n.id!==`kompaniya:${companyId}`) throw Error('GRAPH_COMPANY_MISMATCH');
    if(record(n.meta)&&n.meta.kompaniya_id!==undefined&&n.meta.kompaniya_id!==companyId) throw Error('GRAPH_COMPANY_MISMATCH');
    seen.add(n.id);
    // Explicit whitelist: no salaries, arbitrary source payload or legacy monetary totals.
    const meta:Record<string,unknown>={};
    if(record(n.meta)) for(const k of ['nom','taraf','summa','lavozim','davlat_raqami','manzil','masul','holat','zayavka','narxsiz','resurs_qatori','signal_count','critical_count']) {
      const v=n.meta[k]; if(v===null||typeof v==='string'||typeof v==='number'&&Number.isFinite(v)) meta[k]=v;
    }
    return {id:n.id,tur:n.tur as TugunTur,nom:n.nom,meta,x:null,y:null};
  });
  if(!seen.has(`kompaniya:${companyId}`)) throw Error('GRAPH_COMPANY_MISMATCH');
  const edgeKeys=new Set<string>();let omittedEdges=0;
  const edges:MindmapGraf['bogichlar']=[];
  for(const b of value.bogichlar) {
    if(!record(b)||typeof b.manba!=='string'||typeof b.maqsad!=='string'||typeof b.tur!=='string'||!seen.has(b.manba)||!seen.has(b.maqsad)||b.manba===b.maqsad) {omittedEdges++;continue;}
    const k=`${b.manba}|${b.maqsad}|${b.tur}`;if(edgeKeys.has(k)) continue;edgeKeys.add(k);
    edges.push({manba:b.manba,maqsad:b.maqsad,tur:b.tur as MindmapGraf['bogichlar'][number]['tur'],uzsa_boladi:false});
  }
  return {graph:{tugunlar:nodes,bogichlar:edges},omittedEdges,readAt:new Date().toISOString()};
}
export function neighbours(graph:MindmapGraf,key:string):MindmapTugun[] {
  const ids=new Set(graph.bogichlar.flatMap(b=>b.manba===key?[b.maqsad]:b.maqsad===key?[b.manba]:[]));
  return graph.tugunlar.filter(n=>ids.has(n.id));
}
/** Only direct project ownership or explicit contract-object edges; no transitive shared-resource expansion. */
export function scopedObjects(e:BossExecutive|null,graph:MindmapGraf|undefined,key:string) {
  if(!e) return [];
  const [type,id]=key.split(':');
  if(type==='kompaniya') return e.objects;
  if(key==='unassigned') return e.objects.filter(o=>o.project_id===null);
  if(type==='loyiha') return e.objects.filter(o=>o.project_id===Number(id));
  if(type==='obyekt') return e.objects.filter(o=>o.object_id===Number(id));
  const ids=new Set(graph?neighbours(graph,key).filter(n=>n.tur==='obyekt').map(n=>Number(n.id.split(':')[1])):[]);
  return e.objects.filter(o=>ids.has(o.object_id));
}
/** Documents/history can use validated graph identities even before the optional executive money RPC is installed. */
export function scopeObjectIds(e:BossExecutive|null,graph:MindmapGraf|undefined,key:string):number[] {
  const ids=new Set(scopedObjects(e,graph,key).map(o=>o.object_id));
  if(graph) {
    const candidates=key.startsWith('kompaniya:')?graph.tugunlar:key.startsWith('obyekt:')?graph.tugunlar.filter(n=>n.id===key):key==='unassigned'?[]:neighbours(graph,key);
    // Absence of an edge is not proof of an unassigned project; that scope uses the explicit executive roster only.
    for(const n of candidates) if(n.tur==='obyekt')ids.add(Number(n.id.split(':')[1]));
  }
  return [...ids].sort((a,b)=>a-b);
}
export function knownSum(values:unknown[]) {
  const nums=values.map(amount);return {known:nums.every(n=>n===null)?null:nums.reduce<number>((s,n)=>s+(n??0),0),missing:nums.filter(n=>n===null).length};
}
export type ContractBalance={kompaniya_id:number;shartnoma_id:number;raqam:string;nom:string|null;dog_summa:number|null;bajarilgan:number|null;tolangan:number|null;debitor:number|null;avans:number|null};
export type Activity={id:number;kompaniya_id:number;obyekt_id:number|null;modul:string;amal_turi:string;satr:string;yaratilgan_vaqt:string};
export type QualityDocument={id:number;kompaniya_id:number;obyekt_id:number;raqam:string|null;ish_nomi:string|null;holat:string;boglangan_ish_soni:number|null};
export type ReadSlice<T>={rows:T[];complete:boolean;total:number|null;readAt:string};
async function read<T>(body:Record<string,unknown>,signal?:AbortSignal):Promise<T> {
  const timeout=AbortSignal.timeout(30_000);
  const response=await fetch('/api/sb',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});
  const result=await response.json();
  if(!response.ok||result?.ok!==true) throw Error('READ_UNAVAILABLE');
  return result as T;
}
export async function readGraph(companyId:number,signal?:AbortSignal) {
  if(!Number.isSafeInteger(companyId)||companyId<1) throw Error('SCOPE_INVALID');
  const r=await read<{natija:unknown}>({soro:'mindmap_grafi',kompaniya_id:companyId},signal);
  return validateGraph(r.natija,companyId);
}
type Dataset='finance'|'activity'|'quality';
type DatasetRow={finance:ContractBalance;activity:Activity;quality:QualityDocument};
export async function readSlice<K extends Dataset>(dataset:K,companyId:number,objectIds:number[]|null,signal?:AbortSignal):Promise<ReadSlice<DatasetRow[K]>> {
  if(!Number.isSafeInteger(companyId)||companyId<1) throw Error('SCOPE_INVALID');
  if(objectIds!==null&&(!objectIds.length||objectIds.some(id=>!Number.isSafeInteger(id)||id<1))) return {rows:[],complete:true,total:0,readAt:new Date().toISOString()};
  const spec={
    finance:{jadval:'t2_bux_dashboard',ustunlar:'kompaniya_id,shartnoma_id,raqam,nom,dog_summa,bajarilgan,tolangan,debitor,avans',tartib:'shartnoma_id.asc'},
    activity:{jadval:'t2_hodisa_lenta',ustunlar:'id,kompaniya_id,obyekt_id,modul,amal_turi,satr,yaratilgan_vaqt',tartib:'yaratilgan_vaqt.desc,id.desc'},
    quality:{jadval:'t2_aosr_reestr',ustunlar:'id,kompaniya_id,obyekt_id,raqam,ish_nomi,holat,boglangan_ish_soni',tartib:'id.desc'},
  }[dataset];
  const filter=`kompaniya_id=eq.${companyId}`+(dataset!=='finance'&&objectIds!==null?`&obyekt_id=in.(${objectIds.join(',')})`:'');
  const r=await read<{qatorlar:unknown[];toliq?:boolean;jamiServerda?:number|null}>({...spec,filtr:filter,limit:200},signal);
  if(!Array.isArray(r.qatorlar)) throw Error('ROWS_INVALID');
  const ids=new Set<number>();
  for(const row of r.qatorlar) {
    if(!record(row)||row.kompaniya_id!==companyId) throw Error('ROWS_SCOPE_INVALID');
    const id=dataset==='finance'?row.shartnoma_id:row.id;
    if(!Number.isSafeInteger(id)||Number(id)<1||ids.has(Number(id))) throw Error('ROWS_IDENTITY_INVALID');ids.add(Number(id));
    if(dataset!=='finance'&&objectIds!==null&&!objectIds.includes(Number(row.obyekt_id))) throw Error('ROWS_SCOPE_INVALID');
    if(dataset==='finance'&&!['dog_summa','bajarilgan','tolangan','debitor','avans'].every(k=>row[k]===null||typeof row[k]==='number'&&Number.isFinite(row[k]))) throw Error('ROWS_AMOUNT_INVALID');
    if(dataset==='activity'&&(typeof row.satr!=='string'||typeof row.modul!=='string'||typeof row.yaratilgan_vaqt!=='string'||!Number.isFinite(Date.parse(row.yaratilgan_vaqt)))) throw Error('ROWS_ACTIVITY_INVALID');
    if(dataset==='quality'&&(typeof row.holat!=='string'||typeof row.ish_nomi!=='string'&&row.ish_nomi!==null)) throw Error('ROWS_QUALITY_INVALID');
  }
  const total=typeof r.jamiServerda==='number'&&Number.isSafeInteger(r.jamiServerda)&&r.jamiServerda>=0?r.jamiServerda:null;
  // Without an explicit completeness receipt, never label a bounded slice as the full ledger.
  const complete=r.toliq===true&&total!==null&&total===r.qatorlar.length;
  return {rows:r.qatorlar as DatasetRow[K][],complete,total,readAt:new Date().toISOString()};
}
