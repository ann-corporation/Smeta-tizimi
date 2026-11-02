import { DaraxtHisob, type HisobTahrir } from '../lib/hisob-yadro/daraxt-yigish';
import { paketDekod, paketdanQatorlar, son, type Paket, type PaketXom } from './paket';

type Belgi={id:number;epoch:number;revision:number};
export type SessiyaSorov=Belgi & (
  {amal:'och';paket:PaketXom}|{amal:'tahrir';tahrir:HisobTahrir}|{amal:'oqi';ids:number[]}|{amal:'yop'}
);
type Row=ReturnType<DaraxtHisob['ol']>[number];
export type SessiyaJavob=Belgi & (
  {ok:true;amal:SessiyaSorov['amal'];obyekt_id:number|null;kompaniya_id:number|null;soni:number;vaqtMs:number;
    xulosa?:ReturnType<DaraxtHisob['xulosa']>;qatorlar?:Array<Row & {f2_hajm:number|null;f2_summa:number|null}>;
    ozgargan?:number;invalidatsiya?:boolean}
  |{ok:false;xato:string}
);
const xatolar=new Set(['HISOB_ZIDDIYAT','HISOB_MAYDON_YOPIQ','HISOB_QATOR_TOPILMADI','HISOB_SON_XATO','HISOB_SON_CHEGARA']);

/** Faqat Worker xotirasi: company/object snapshot bitta, canonical yozish va F2 mutatsiyasi YO‘Q. */
export class HisobSessiya {
  private holat:{p:Paket;yadro:DaraxtHisob;epoch:number;revision:number}|null=null;
  private qatorlar(ids:number[]){
    const h=this.holat!;
    return h.yadro.ol(ids).map(q=>{
      const i=h.p.indeks.get(q.id)!;
      return {...q,f2_hajm:son(h.p.f2_hajm,i),f2_summa:son(h.p.f2_summa,i)};
    });
  }
  ishlov(s:SessiyaSorov):SessiyaJavob {
    const b={id:s?.id,epoch:s?.epoch,revision:s?.revision};const start=performance.now();
    try {
      if(![b.id,b.epoch,b.revision].every(v=>Number.isSafeInteger(v)&&v>=0))throw new Error('HISOB_SO‘ROV_XATO');
      if(s.amal==='yop'){if(this.holat&&this.holat.epoch!==s.epoch)throw new Error('HISOB_ESKI');this.holat=null;return {...b,ok:true,amal:s.amal,obyekt_id:null,kompaniya_id:null,soni:0,vaqtMs:performance.now()-start};}
      if(s.amal==='och'){
        if(this.holat&&s.epoch<=this.holat.epoch)throw new Error('HISOB_ESKI');
        this.holat=null; // yangi company ochilmasa eski company javobi hech qachon berilmaydi
        const p=paketDekod(s.paket);
        if(![p.obyekt_id,p.kompaniya_id].every(v=>Number.isSafeInteger(v)&&v>0))throw new Error('HISOB_SCOPE_XATO');
        const yadro=new DaraxtHisob(paketdanQatorlar(p).map(q=>({id:q.id,ota_id:q.ota_id,tur:q.tur!,hajm:q.hajm,narx:q.narx,summa:q.summa,norma:q.norma,versiya:q.versiya})));
        this.holat={p,yadro,epoch:s.epoch,revision:s.revision};
        return {...b,ok:true,amal:s.amal,obyekt_id:p.obyekt_id,kompaniya_id:p.kompaniya_id,soni:p.soni,vaqtMs:performance.now()-start,xulosa:yadro.xulosa()};
      }
      const h=this.holat;
      if(!h||h.epoch!==s.epoch||h.revision!==s.revision)throw new Error('HISOB_ESKI');
      const common={obyekt_id:h.p.obyekt_id,kompaniya_id:h.p.kompaniya_id,soni:h.p.soni};
      if(s.amal==='oqi'){
        if(!Array.isArray(s.ids)||s.ids.length>500)throw new Error('HISOB_SAHIFA_CHEGARA');
        return {...b,...common,ok:true,amal:s.amal,qatorlar:this.qatorlar(s.ids),vaqtMs:performance.now()-start};
      }
      if(s.amal!=='tahrir')throw new Error('HISOB_AMAL_YOPIQ');
      if(h.revision>=Number.MAX_SAFE_INTEGER)throw new Error('HISOB_REVISION_CHEGARA');
      const r=h.yadro.tahrir(s.tahrir);h.revision++;
      return {...b,...common,revision:h.revision,ok:true,amal:s.amal,xulosa:h.yadro.xulosa(),ozgargan:r.ids.length,
        invalidatsiya:r.ids.length>64,qatorlar:r.ids.length>64?[]:this.qatorlar(r.ids),vaqtMs:performance.now()-start};
    }catch(e){
      const code=e instanceof Error?e.message:'';
      if(!xatolar.has(code)&&!['HISOB_ESKI','HISOB_SAHIFA_CHEGARA','HISOB_AMAL_YOPIQ'].includes(code))this.holat=null;
      return {...b,ok:false,xato:xatolar.has(code)||['HISOB_ESKI','HISOB_SAHIFA_CHEGARA','HISOB_AMAL_YOPIQ'].includes(code)?code:'HISOB_PAKET_XATO'};
    }
  }
}
