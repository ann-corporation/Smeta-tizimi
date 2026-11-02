import Decimal from 'decimal.js';

// Alohida konfiguratsiya: boshqa modulning Decimal.set amali hisobni o‘zgartirmaydi.
const D = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_UP });
type N = Decimal | null;
export type HisobQator = {
  id: number; ota_id: number | null; tur: string;
  hajm: number | string | null; narx: number | string | null; summa: number | string | null;
  norma: number | string | null; versiya: number;
};
export type HisobTahrir = { qator_id: number; maydon: 'hajm' | 'narx'; qiymat: string | null; kutilgan_versiya: number };
type Q = Omit<HisobQator, 'hajm' | 'narx' | 'summa' | 'norma'> & {hajm:N; narx:N; summa:N; norma:N};
type Sum = { v:Decimal; n:number; count:number };
const bos = ():Sum => ({v:new D(0),n:0,count:0});
const str = (x:N) => x?.toFixed() ?? null;
const eq = (a:N,b:N) => a == null ? b == null : b != null && a.eq(b);
function n(x:number|string|null):N {
  if (x == null) return null;
  const text=String(x);
  if (text.length>80 || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new Error('HISOB_SON_XATO');
  const v=new D(text);
  if (!v.isFinite() || Math.abs(v.e)>40 || v.sd()>30) throw new Error('HISOB_SON_CHEGARA');
  return v;
}
function hissa(s:Sum, old:N, value:N) {
  if (old != null) {s.v=s.v.minus(old);s.n--;}
  if (value != null) {s.v=s.v.plus(value);s.n++;}
}
const rsSum = (s:Sum):N => s.n ? s.v : null;
const barg = new Set(['rs','mat','ob']);
const rzBola = new Set(['rs','mat','ob','bl']);

/**
 * t2_qator_tahrir + t2_rollupning amaldagi qoidasi (2026-10-31 read-only source audit).
 * Smeta manbasi INITda o‘zgarmaydi. Faqat aniq tahrirdan keyin norma kaskadi va SQL rollup bajariladi.
 * Pul/norma arifmetikasi shu YAGONA yadroda; Worker faqat chaqiradi.
 * Bu optimistik model: server versiyasi oshirilmaydi, canonical yozish/approved F2 yo‘q.
 */
export class DaraxtHisob {
  private pendingHissa:Map<Sum,{terms:Map<Decimal,number>;n:number}>|null=new Map();
  private q = new Map<number,Q>();
  private bolalar = new Map<number,number[]>();
  private blSum = new Map<number,Sum>();
  private rzSum = new Map<number,Sum>();
  private blDirty = new Set<number>();
  private rzDirty = new Set<number>();
  private jami = bos();
  private narxsiz = 0;
  private yetim = 0;
  readonly postorder:number[]=[];
  constructor(rows:readonly HisobQator[]) {
    // Decimal obyektlari immutable. Bir xil manba sonini qayta parse qilish va
    // norma kaskadidagi takror ko‘paytirishlardan qutulamiz (global cache yo‘q).
    const numbers=new Map<string,N>();
    const decimal=(x:number|string|null):N=>{if(x==null)return null;const key=String(x);if(!numbers.has(key))numbers.set(key,n(x));return numbers.get(key)!;};
    for(const r of rows) {
      if(!Number.isSafeInteger(r.id)||r.id<=0||this.q.has(r.id)||!['rz','bl','rs','mat','ob'].includes(r.tur)||!Number.isSafeInteger(r.versiya)||r.versiya<0) throw new Error('HISOB_QATOR_XATO');
      this.q.set(r.id,{...r,hajm:decimal(r.hajm),narx:decimal(r.narx),summa:decimal(r.summa),norma:decimal(r.norma)});
    }
    for(const r of this.q.values()) {
      if(r.ota_id!=null&&!this.q.has(r.ota_id)) throw new Error('HISOB_OTA_TOPILMADI');
      if(r.ota_id!=null) {const b=this.bolalar.get(r.ota_id)??[];b.push(r.id);this.bolalar.set(r.ota_id,b);}
      if(r.tur==='rz') {this.hissa(this.jami,null,r.summa);this.rzDirty.add(r.id);}
      if(r.tur==='bl') this.blDirty.add(r.id);
      if(barg.has(r.tur)&&r.narx==null)this.narxsiz++;
      if(r.tur!=='rz'&&r.ota_id==null)this.yetim++;
      this.guruhHissa(r,null,r.summa,true);
    }
    this.flushHissa();
    // Kahn postorder: 30k chuqur ierarxiya ham JS stackni to‘ldirmaydi.
    const qolgan=new Map<number,number>();const navbat:number[]=[];
    for(const r of this.q.values()){const c=this.bolalar.get(r.id)?.length??0;qolgan.set(r.id,c);if(!c)navbat.push(r.id);}
    for(let i=0;i<navbat.length;i++) {
      const id=navbat[i];this.postorder.push(id);const ota=this.q.get(id)!.ota_id;
      if(ota!=null){const c=qolgan.get(ota)!-1;qolgan.set(ota,c);if(!c)navbat.push(ota);}
    }
    if(this.postorder.length!==this.q.size)throw new Error('HISOB_DARAXT_SIKL');
  }
  private hissa(s:Sum,old:N,value:N){
    if(!this.pendingHissa){hissa(s,old,value);return;}
    let batch=this.pendingHissa.get(s);if(!batch){batch={terms:new Map(),n:0};this.pendingHissa.set(s,batch);}
    if(old!=null){batch.terms.set(old,(batch.terms.get(old)??0)-1);batch.n--;}
    if(value!=null){batch.terms.set(value,(batch.terms.get(value)??0)+1);batch.n++;}
  }
  private flushHissa(){
    for(const [sum,batch] of this.pendingHissa??[]){
      for(const [value,count] of batch.terms)if(count)sum.v=sum.v.plus(count===1?value:value.times(count));
      sum.n+=batch.n;
    }
    this.pendingHissa=null;
  }
  private guruhHissa(r:Q,old:N,value:N,init=false){
    if(r.ota_id==null)return;
    if(r.tur==='rs'&&this.q.get(r.ota_id)?.tur==='bl'){
      const s=this.blSum.get(r.ota_id)??bos();this.hissa(s,old,value);if(init)s.count++;this.blSum.set(r.ota_id,s);this.blDirty.add(r.ota_id);
    }
    if(rzBola.has(r.tur)&&this.q.get(r.ota_id)?.tur==='rz'){
      const s=this.rzSum.get(r.ota_id)??bos();this.hissa(s,old,value);if(init)s.count++;this.rzSum.set(r.ota_id,s);this.rzDirty.add(r.ota_id);
    }
  }
  private summa(r:Q,value:N,changed:Set<number>){
    if(eq(r.summa,value))return;
    const old=r.summa;this.guruhHissa(r,old,value);r.summa=value;changed.add(r.id);
    if(r.tur==='rz')this.hissa(this.jami,old,value);
  }
  private natija(r:Q){return {...r,hajm:str(r.hajm),narx:str(r.narx),summa:str(r.summa),norma:str(r.norma)};}
  ol(ids:readonly number[]){return ids.map(id=>{const r=this.q.get(id);if(!r)throw new Error('HISOB_QATOR_TOPILMADI');return this.natija(r);});}
  xulosa(){return {jami:str(rsSum(this.jami)),narxsiz_qator:this.narxsiz,yetim_qator:this.yetim,taxminiy:true as const};}
  tahrir(t:HisobTahrir){
    const r=this.q.get(t.qator_id);
    if(!r)throw new Error('HISOB_QATOR_TOPILMADI');
    if(r.versiya!==t.kutilgan_versiya)throw new Error('HISOB_ZIDDIYAT');
    if(t.maydon!=='hajm'&&t.maydon!=='narx')throw new Error('HISOB_MAYDON_YOPIQ');
    const value=n(t.qiymat); // barchasi validatsiyadan keyin; xatoda yarim tahrir yo‘q
    const products=new Map<Decimal,Map<Decimal,Decimal>>();
    const mul=(a:Decimal,b:Decimal)=>{let byB=products.get(a);if(!byB){byB=new Map();products.set(a,byB);}let result=byB.get(b);if(!result){result=a.times(b);byB.set(b,result);}return result;};
    const changed=new Set<number>([r.id]);
    if(r.tur==='bl')this.blDirty.add(r.id);
    if(r.tur==='rz')this.rzDirty.add(r.id);
    if(t.maydon==='narx'&&barg.has(r.tur))this.narxsiz+=(value==null?1:0)-(r.narx==null?1:0);
    r[t.maydon]=value;
    this.summa(r,r.hajm==null||r.narx==null?null:r.hajm.times(r.narx),changed);
    if(t.maydon==='hajm'&&value!=null){
      this.pendingHissa=new Map();
      for(const id of this.bolalar.get(r.id)??[]) {
        const c=this.q.get(id)!;if(c.norma==null)continue;
        if(c.tur==='bl')this.blDirty.add(c.id);
        if(c.tur==='rz')this.rzDirty.add(c.id);
        c.hajm=mul(c.norma,value);changed.add(c.id);
        this.summa(c,c.narx==null?null:mul(c.hajm,c.narx),changed);
      }
      this.flushHissa();
    }
    // SQL birinchi BL, so‘ng RZ. Ichma-ich RZ source jami yig‘ilmaydi — aks holda double-count.
    for(const id of this.blDirty){const b=this.q.get(id);if(b?.tur!=='bl')continue;const s=this.blSum.get(id);
      if(s?.count)this.summa(b,rsSum(s),changed);
      else if(!this.bolalar.get(id)?.length)this.summa(b,null,changed);
    }
    this.blDirty.clear();
    for(const id of this.rzDirty){const b=this.q.get(id),s=this.rzSum.get(id);if(b?.tur==='rz'&&s?.count)this.summa(b,rsSum(s),changed);}
    this.rzDirty.clear();
    return {ids:[...changed],...this.xulosa()};
  }
  /** Faqat ko‘rinish uchun ichma-ich RZ jami; canonical q.summa ustiga yozilmaydi. */
  razdelKorinish(){
    const values=new Map<number,N>();
    for(const id of this.postorder){const r=this.q.get(id)!;if(r.tur!=='rz')continue;
      let total=r.summa;
      for(const child of this.bolalar.get(id)??[])if(this.q.get(child)!.tur==='rz'){
        const v=values.get(child)??null;if(v!=null)total=total==null?v:total.plus(v);
      }
      values.set(id,total);
    }
    return [...values].map(([id,v])=>({id,summa:str(v)}));
  }
}
