import type { BossDashboard } from '../../api/t2-boss';
import { sbT2DaraxtOl, sbT2QatorHolatOl, type T2Qator, type T2QatorHolat } from '../../api/supabase';
import { T2_DARAXT_USTUNLARI, T2_HOLAT_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { completePortfolio, finite, trustedExecutive } from './model';
export type ReportScope={kind:'company'}|{kind:'project';id:number|null}|{kind:'object';id:number}|{kind:'section';id:number;sectionId:number};
export type StateRow=T2QatorHolat & {f2_summa_nomalum?:number};
export type ObjectEvidence={companyId:number;objectId:number;startedAt:string;readAt:string;rows:T2Qator[];states:StateRow[]};
export async function readObjectEvidence(companyId:number,objectId:number):Promise<ObjectEvidence> {
  const startedAt=new Date().toISOString();
  const [rows,states]=await Promise.all([
    sbT2DaraxtOl(objectId,T2_DARAXT_USTUNLARI+',kompaniya_id'),
    sbT2QatorHolatOl(objectId,T2_HOLAT_DARAXT_USTUNLARI+',obyekt_id,f2_summa_nomalum'),
  ]);
  if(!rows.ok || !states.ok || rows.toliq===false || states.toliq===false || !rows.qatorlar || !states.qatorlar) throw new Error('REPORT_READ_INCOMPLETE');
  if(rows.qatorlar.some(r=>r.kompaniya_id!==companyId || r.obyekt_id!==objectId)
    ||states.qatorlar.some(r=>r.obyekt_id!==objectId)) throw new Error('REPORT_SCOPE_MISMATCH');
  return {companyId,objectId,rows:rows.qatorlar,states:states.qatorlar,startedAt,readAt:new Date().toISOString()};
}
export function scopeRows(e:ObjectEvidence,sectionId?:number) {
  const byId=new Map(e.rows.map(r=>[r.id,r]));
  if(byId.size!==e.rows.length) throw new Error('REPORT_DUPLICATE_ID');
  const children=new Map<number,T2Qator[]>();
  for(const r of e.rows) {
    if(r.ota_id!=null && !byId.has(r.ota_id)) throw new Error('REPORT_ORPHAN');
    if(r.ota_id!=null) {const group=children.get(r.ota_id)??[];group.push(r);children.set(r.ota_id,group);}
  }
  // Linear parent-chain audit: fail closed on disconnected cycles as well.
  const done=new Set<number>();
  for(const row of e.rows) {
    let r:T2Qator|undefined=row; const chain=new Set<number>();
    while(r && !done.has(r.id)) {
      if(chain.has(r.id)) throw new Error('REPORT_CYCLE');
      chain.add(r.id); r=r.ota_id==null?undefined:byId.get(r.ota_id);
    }
    chain.forEach(id=>done.add(id));
  }
  if(sectionId==null) return e.rows;
  const root=byId.get(sectionId);
  if(!root || root.tur!=='rz') throw new Error('REPORT_SECTION_NOT_FOUND');
  const selected=new Set<number>();const queue=[root];
  for(let i=0;i<queue.length;i++) {const r=queue[i];selected.add(r.id);queue.push(...children.get(r.id)??[]);}
  return e.rows.filter(r=>selected.has(r.id));
}
export function leafSummary(rows:T2Qator[],states:StateRow[]) {
  const parents=new Set(rows.map(r=>r.ota_id));const map=new Map(states.map(s=>[s.qator_id,s]));
  const leaves=rows.filter(r=>r.tur!=='rz' && !parents.has(r.id));
  let estimate:number|null=null,f2:number|null=null,missing=0,f2Missing=0;
  for(const r of leaves) {
    const state=map.get(r.id);const sum=state?.smeta_summa??r.summa;
    if(finite(sum)) estimate=(estimate??0)+sum;else missing++;
    if(state && finite(state.f2_summa) && !(state.f2_summa_nomalum && state.f2_summa_nomalum>0)) f2=(f2??0)+state.f2_summa;
    else f2Missing++;
  }
  return {estimate,f2,missing,f2Missing,leaves:leaves.length};
}
export async function managementWorkbook(data:BossDashboard,scope:ReportScope,evidence?:ObjectEvidence) {
  const executive=trustedExecutive(data);
  if(!executive || !completePortfolio(executive)) throw new Error('REPORT_PORTFOLIO_INCOMPLETE');
  const company=data.kompaniya.kompaniya_id;
  const objects=scope.kind==='company'?executive.objects:scope.kind==='project'?executive.objects.filter(o=>o.project_id===scope.id):executive.objects.filter(o=>o.object_id===scope.id);
  if(scope.kind==='project' && !executive.projects.some(p=>p.project_id===scope.id)) throw new Error('REPORT_SCOPE_MISMATCH');
  if((scope.kind==='object'||scope.kind==='section') && (objects.length!==1 || !evidence || evidence.companyId!==company || evidence.objectId!==scope.id)) throw new Error('REPORT_SCOPE_MISMATCH');
  const {RasmiyVaraq,rasmiyKitob}=await import('../../lib/hujjat-yozuvchi');
  const name=scope.kind==='company'?data.kompaniya.nom:scope.kind==='project'?executive.projects.find(p=>p.project_id===scope.id)!.name:objects[0].name;
  const sectionRows=scope.kind==='section'?scopeRows(evidence!,scope.sectionId):null;
  const sectionTotals=sectionRows?leafSummary(sectionRows,evidence!.states):null;
  const sectionName=sectionRows?.find(r=>r.id===(scope.kind==='section'?scope.sectionId:0))?.nom;
  const title='УПРАВЛЕНЧЕСКИЙ ОТЧЁТ';
  const notice=['Не заменяет утверждённые Ф2, накопительную ведомость и Ф3.','Смета: прямые затраты. Ф2: суммы утверждённых документов, другая база. Процент выполнения не рассчитывается.','Пустая сумма — неизвестно; ноль — явный ноль. При пропусках показан только известный подытог.'];
  const v=new RasmiyVaraq({nom:'Обзор',sarlavha:title,kattaHarf:false,ostSarlavha:notice,titul:[['Компания',data.kompaniya.nom],['Охват',sectionName?`${name} / ${sectionName}`:name],['Снимок портфеля',data.generated_at]],yonalish:'landscape',ustunlar:[
    {sarlavha:'Объект',kenglik:42,tur:'matn'},{sarlavha:'Смета, известный подытог',kenglik:23,tur:'pul'},
    {sarlavha:'Без цены, строк',kenglik:15,tur:'tartib'},{sarlavha:sectionRows?'Накопленная прямая Ф2 по листьям':'Утверждённые Ф2, известная сумма документов',kenglik:24,tur:'pul'},
    {sarlavha:'Ф2 без суммы',kenglik:14,tur:'tartib'},{sarlavha:'Черновики Ф2',kenglik:13,tur:'tartib'},
    {sarlavha:'На проверке Ф2',kenglik:13,tur:'tartib'},{sarlavha:'Изменения: черновик',kenglik:16,tur:'tartib'},
  ]});
  if(sectionTotals) v.qator('oddiy',[sectionName,sectionTotals.estimate,sectionTotals.missing,sectionTotals.f2,sectionTotals.f2Missing,null,null,null]);
  else objects.forEach(o=>v.qator('oddiy',[o.name,o.estimate_known,o.unpriced_rows,o.approved_known,o.approved_missing,o.draft_count,o.review_count,o.pending_changes]));
  const sums=(key:'estimate_known'|'approved_known')=>objects.reduce<number|null>((s,o)=>finite(o[key])?(s??0)+o[key]!:s,null);
  if(!sectionTotals) v.qator('jami',['Итого в выбранном охвате',sums('estimate_known'),objects.reduce((s,o)=>s+o.unpriced_rows,0),sums('approved_known'),objects.reduce((s,o)=>s+o.approved_missing,0)]);
  const a=new RasmiyVaraq({nom:'Основания',sarlavha:'ИСТОЧНИКИ И ОГРАНИЧЕНИЯ',kattaHarf:false,ustunlar:[{sarlavha:'Основание',kenglik:38,tur:'matn'},{sarlavha:'Значение',kenglik:100,tur:'matn'}]});
  a.qator('oddiy',['Компания ID',String(company)]);a.qator('oddiy',['Время портфеля',data.generated_at]);a.qator('oddiy',['Охват',scope.kind]);
  a.qator('oddiy',['Источник сметы','t2_obyekt_jami.jami, только активные объекты; без накруток']);
  a.qator('oddiy',['Источник Ф2',"t2_akt: tur=f2; holat=tasdiqlangan/yakunlangan; lifecycle=approved (или legacy NULL)"]);
  a.qator('oddiy',['Объекты без сметы',String(objects.filter(o=>o.estimate_missing>0).length)]);
  objects.forEach(o=>a.qator('oddiy',['Объект / проект ID',`${o.object_id} / ${o.project_id??'NULL'} — ${o.name}`]));
  const sheets=[v,a];
  if(evidence && (scope.kind==='object'||scope.kind==='section')) {
    const rows=scopeRows(evidence,scope.kind==='section'?scope.sectionId:undefined);const map=new Map(evidence.states.map(s=>[s.qator_id,s]));
    const summary=leafSummary(rows,evidence.states);
    a.qator('oddiy',['Чтение строк, начало / конец',`${evidence.startedAt} / ${evidence.readAt}`]);
    a.qator('oddiy',['Согласованность','Два полных чтения, не транзакционный снимок; оригиналы не изменены.']);
    a.qator('oddiy',['Ф2 в строках','t2_qator_holat.f2_summa — накопленная прямая сумма; не итог утверждённых документов с накрутками.']);
    a.qator('oddiy',['Раздел ID',scope.kind==='section'?String(scope.sectionId):'Весь объект']);
    a.qator('oddiy',['Известный подытог выбранных листьев',String(summary.estimate??'Неизвестно')]);
    a.qator('oddiy',['Листья без суммы / Ф2',`${summary.missing} / ${summary.f2Missing}`]);
    const d=new RasmiyVaraq({nom:'Строки',sarlavha:scope.kind==='section'?'СТРОКИ ВЫБРАННОГО РАЗДЕЛА':'СТРОКИ ОБЪЕКТА',kattaHarf:false,ostSarlavha:['Строки родителей не складываются с дочерними. Объёмы разных единиц не суммируются.'],yonalish:'landscape',ustunlar:[
      {sarlavha:'ID / родитель',kenglik:19,tur:'matn'},{sarlavha:'Тип',kenglik:8,tur:'matn'},{sarlavha:'Наименование',kenglik:70,tur:'matn'},
      {sarlavha:'Ед.',kenglik:9,tur:'birlik'},{sarlavha:'Объём',kenglik:14,tur:'hajm'},{sarlavha:'Цена',kenglik:18,tur:'narx'},
      {sarlavha:'Прямая сумма строки',kenglik:22,tur:'pul'},{sarlavha:'Ф2 прямая сумма',kenglik:22,tur:'pul'},{sarlavha:'Основание',kenglik:30,tur:'matn'}]});
    rows.forEach(r=>{const s=map.get(r.id);d.qator(r.tur==='rz'?'bolim':'oddiy',[`${r.id} / ${r.ota_id??'NULL'}`,r.tur,r.nom,r.birlik,r.hajm,r.narx,s?.smeta_summa??r.summa,s?.f2_summa_nomalum?null:s?.f2_summa,`t2_qator #${r.id}; v${r.versiya}`]);});
    d.qator('jami',['Листья без двойного счёта',null,null,null,null,null,summary.estimate,summary.f2]);sheets.splice(1,0,d);
  }
  return rasmiyKitob(sheets,{formulasiz:true}).bytes;
}
