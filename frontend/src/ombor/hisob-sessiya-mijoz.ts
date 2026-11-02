import type { HisobTahrir } from '../lib/hisob-yadro/daraxt-yigish';
import type { PaketXom } from './paket';
import type { SessiyaJavob, SessiyaSorov } from './hisob-sessiya';

type Port=Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'|'onmessageerror'>;
type OK=Extract<SessiyaJavob,{ok:true}>;
type Amal={amal:'och';paket:PaketXom}|{amal:'tahrir';tahrir:HisobTahrir}|{amal:'oqi';ids:number[]};
type Pending={id:number;epoch:number;revision:number;amal:Amal['amal'];resolve:(r:OK)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};

/** Bitta Worker = bitta foydalanuvchining active objecti. Buyruqlar FIFO, read ham revisiondan keyin.
 * Runtime egasi logout/company/object switchda yop() chaqiradi. Worker canonical writer emas.
 */
export class HisobSessiyaMijoz {
  private port:Port|null;
  private queue:Promise<unknown>=Promise.resolve();
  private pending:Pending|null=null;
  private id=0; private generation=0; private epoch=0; private revision=0;
  private timeoutMs:number;
  constructor(port?:Port,timeoutMs=15000){
    this.timeoutMs=timeoutMs;
    this.port=port??new Worker(new URL('./hisob-sessiya.worker.ts',import.meta.url),{type:'module'});
    this.port.onmessage=e=>{
      const r=e.data as SessiyaJavob,p=this.pending;if(!p||!r||r.id!==p.id)return;
      clearTimeout(p.timer);this.pending=null;
      if(r.epoch!==p.epoch||r.revision!==(p.revision+(r.ok&&p.amal==='tahrir'?1:0))||(r.ok&&r.amal!==p.amal))p.reject(new Error('HISOB_ESKI'));
      else if(!r.ok)p.reject(new Error(r.xato));
      else p.resolve(r);
    };
    this.port.onerror=this.port.onmessageerror=()=>this.yop();
  }
  private bekor(){const p=this.pending;if(p){clearTimeout(p.timer);this.pending=null;p.reject(new Error('HISOB_BEKOR'));}}
  private sorov(a:Amal,generation:number):Promise<OK>{
    if(generation!==this.generation)return Promise.reject(new Error('HISOB_ESKI'));
    if(!this.port)return Promise.reject(new Error('HISOB_YOPIQ'));
    return new Promise((resolve,reject)=>{
      const p:Pending={id:++this.id,epoch:this.epoch,revision:this.revision,amal:a.amal,resolve,reject,timer:setTimeout(()=>this.yop(),this.timeoutMs)};
      this.pending=p;
      try{this.port!.postMessage({id:p.id,epoch:p.epoch,revision:p.revision,...a} satisfies SessiyaSorov);}catch{this.yop();}
    });
  }
  private navbat(a:Amal,generation:number):Promise<OK>{
    const run=async()=>{
      const r=await this.sorov(a,generation);
      if(generation!==this.generation)throw new Error('HISOB_ESKI');
      this.revision=r.revision;return r;
    };
    const result=this.queue.then(run,run);this.queue=result.catch(()=>undefined);return result;
  }
  och(paket:PaketXom):Promise<OK>{
    this.generation++;this.epoch++;this.revision=0;this.bekor();
    return this.navbat({amal:'och',paket},this.generation);
  }
  tahrir(tahrir:HisobTahrir){return this.navbat({amal:'tahrir',tahrir},this.generation);}
  oqi(ids:number[]){return this.navbat({amal:'oqi',ids:[...ids]},this.generation);}
  yop(){this.generation++;this.bekor();this.port?.terminate();this.port=null;}
}
