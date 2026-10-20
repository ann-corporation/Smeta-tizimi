import type { T2Qator } from '../../api/supabase';
import type { StateRow } from './report';
import { finite } from './model';
export type CostGroup={key:string;known:number|null;rows:number;missing:number;unpriced:number;negativeRows:number};
export type CostComposition={groups:CostGroup[];known:number|null;rows:number;missing:number;unpriced:number;negativeRows:number;sharesAvailable:boolean};
export const categoryKey=(row:Pick<T2Qator,'kat'>)=>row.kat?.trim().toUpperCase()||'UNCLASSIFIED';
/** Only canonical leaf monetary amounts. Category is recorded metadata, never inferred from the name. */
export function costComposition(rows:readonly T2Qator[],states:readonly StateRow[]):CostComposition {
 const parents=new Set(rows.map(r=>r.ota_id));const byId=new Map(states.map(s=>[s.qator_id,s]));const groups=new Map<string,CostGroup>();
 let known:number|null=null,missing=0,unpriced=0,negativeRows=0,count=0;
 for(const row of rows){
  if(row.tur==='rz'||parents.has(row.id))continue;
  const key=categoryKey(row);const group=groups.get(key)??{key,known:null,rows:0,missing:0,unpriced:0,negativeRows:0};
  group.rows++;count++;
  const amount=byId.get(row.id)?.smeta_summa??row.summa;
  if(finite(amount)){group.known=(group.known??0)+amount;known=(known??0)+amount;if(amount<0){group.negativeRows++;negativeRows++;}}
  else{group.missing++;missing++;}
  if(!finite(row.narx)){group.unpriced++;unpriced++;}
  groups.set(key,group);
 }
 return {groups:[...groups.values()].sort((a,b)=>Math.abs(b.known??0)-Math.abs(a.known??0)||a.key.localeCompare(b.key)),known,rows:count,missing,unpriced,negativeRows,sharesAvailable:finite(known)&&known>0&&negativeRows===0};
}
export function knownShare(composition:CostComposition,group:CostGroup):number|null {
 if(!composition.sharesAvailable||!finite(composition.known)||!finite(group.known))return null;
 return group.known/composition.known*100;
}
export function russianCategory(key:string){const labels:Record<string,string>={ 'МАТ':'Материалы','ЧЕЛ':'Труд рабочих','МАШ':'Машины и механизмы','ОБ':'Оборудование','КАБ':'Кабели','М-К':'Металлоконструкции','UNCLASSIFIED':'Категория не указана' };return Object.prototype.hasOwnProperty.call(labels,key)?labels[key]:key;}
