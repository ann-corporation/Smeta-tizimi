import type { BossDashboard } from '../../api/t2-boss';
import type { ObjectEvidence } from './report';
export function dashboardFixture():BossDashboard {
  const totals={object_count:1,estimate_known:100,estimate_missing:0,unpriced_rows:1,approved_known:60,approved_count:1,approved_missing:0,draft_count:2,review_count:1,pending_changes:3};
  return {ok:true,generated_at:'2026-10-15T10:00:00Z',kompaniya:{kompaniya_id:17,nom:'DEMO — synthetic',rol:'rahbar',obyekt_soni:1,loyiha_soni:1},loyihalar:[],moliya:{ulangan:true,jami_tolangan:0,jami_debitor:0,jami_xarajat:0,sof_natija:987654},f2:{jami:999999,soni:50,tasdiqlangan:1,qoralama:2,oxirgi_oy:null},shartnoma:{soni:1,jami_summa:0,faol:1},signal:{ochiq_soni:0,kritik_soni:0,royxat:[]},storage:{ulangan:true},ulanmagan_modullar:['INTERNAL_DEBUG'],executive:{version:1,scope:'active_objects',totals,objects:[{...totals,object_id:127,project_id:7,name:'Amfiteatr DEMO',project_name:'Park DEMO'}],projects:[{...totals,project_id:7,name:'Park DEMO'}],project_count:1,object_limit:2500,project_limit:500,contracts_missing:0,payment_count:0,expense_count:0}};
}
export function evidenceFixture():ObjectEvidence {
  return {companyId:17,objectId:127,startedAt:'2026-10-15T10:01:00Z',readAt:'2026-10-15T10:02:00Z',rows:[
    {id:1,ota_id:null,tur:'rz',nom:'Раздел А',summa:100},
    {id:2,ota_id:1,tur:'bl',nom:'Работа',summa:100},
    {id:3,ota_id:2,tur:'rs',nom:'Материал',summa:100},
    {id:4,ota_id:2,tur:'rs',nom:'Явный ноль',summa:0},
    {id:5,ota_id:1,tur:'bl',nom:'Неизвестно',summa:null},
    {id:6,ota_id:null,tur:'rz',nom:'Раздел Б',summa:90},
    {id:7,ota_id:6,tur:'bl',nom:'Другая работа',summa:90},
  ].map(r=>({...r,obyekt_id:127,kompaniya_id:17,hajm:1,narx:r.summa,birlik:'m3',versiya:1})) as ObjectEvidence['rows'],
  states:[{qator_id:3,smeta_summa:100,f2_summa:60},{qator_id:4,smeta_summa:0,f2_summa:0},{qator_id:5,smeta_summa:null,f2_summa:0,f2_summa_nomalum:1},{qator_id:7,smeta_summa:90,f2_summa:10}] as ObjectEvidence['states']};
}
