import { describe, expect, it } from 'vitest';
import { HisobSessiya } from './hisob-sessiya';
import { HisobSessiyaMijoz } from './hisob-sessiya-mijoz';
import type { PaketXom } from './paket';
function paket():PaketXom {
  return {format:'t2-paket/1',obyekt_id:1,kompaniya_id:1,obyekt_nom:'SINOV',soni:3,
    lugat:{nom:['SINOV'],kod:[],birlik:[],tur:['rz','bl','rs'],kat:['МАТ']},
    q:{id:[1,2,3],ota_id:[null,1,2],daraja:[0,1,2],tartib:[0,1,2],tur:[0,1,2],kat:[null,null,0],kod:[null,null,null],nom:[0,0,0],birlik:[null,null,null],hajm:[null,10,2],narx:[null,null,0.3],summa:[0.6,0.6,0.6],norma:[null,null,0.2],narx_usul:[null,null,null],versiya:[1,1,1],qoshimcha:[0,0,0],zamena:[0,0,0],xom_qator:{}},
    h:{fakt_hajm:[0,5,1],fakt_summa:[0,0,0.3],f2_hajm:[0,0,1],f2_summa:[0,0,0.31],f2_summa_nomalum:[0,0,0],direct_fakt_hajm:[0,5,0],fakt_manbasi:[0,0,1],almashtirilgan_hajm:{},almashtirilgan_summa:{}},f2:[],meta:{}};
}
const och=(s:HisobSessiya)=>s.ishlov({id:1,epoch:1,revision:0,amal:'och',paket:paket()});
describe('Worker retained sessiya',()=>{
  it('bir marta INIT, keyin kichik IDli tahrir; exact F2 o‘zgarmaydi',()=>{
    const s=new HisobSessiya();expect(och(s)).toMatchObject({ok:true,soni:3});
    const r=s.ishlov({id:2,epoch:1,revision:0,amal:'tahrir',tahrir:{qator_id:2,maydon:'hajm',qiymat:'2',kutilgan_versiya:1}});
    expect(r).toMatchObject({ok:true,revision:1,xulosa:{jami:'0.12',taxminiy:true}});
    if(r.ok)expect(r.qatorlar!.find(q=>q.id===3)).toMatchObject({hajm:'0.4',summa:'0.12',f2_summa:0.31,f2_hajm:1});
    expect(JSON.stringify(r).length).toBeLessThan(2000);
  });
  it('eski revision/epoch qo‘llanmaydi; revision CAS saqlanadi',()=>{
    const s=new HisobSessiya();och(s);
    expect(s.ishlov({id:2,epoch:2,revision:0,amal:'tahrir',tahrir:{qator_id:3,maydon:'narx',qiymat:'5',kutilgan_versiya:1}})).toMatchObject({ok:false,xato:'HISOB_ESKI'});
    expect(s.ishlov({id:3,epoch:1,revision:0,amal:'oqi',ids:[3]})).toMatchObject({ok:true,qatorlar:[{summa:'0.6'}]});
  });
  it('buzilgan yangi company paketi eskisini ham yopadi',()=>{
    const s=new HisobSessiya();och(s);const p=paket();p.kompaniya_id=2;p.q.hajm.pop();
    expect(s.ishlov({id:2,epoch:2,revision:0,amal:'och',paket:p})).toMatchObject({ok:false});
    expect(s.ishlov({id:3,epoch:1,revision:0,amal:'oqi',ids:[3]})).toMatchObject({ok:false,xato:'HISOB_ESKI'});
  });
  it('page limit/logout va noma’lum maydon fail-closed',()=>{
    const s=new HisobSessiya();och(s);
    expect(s.ishlov({id:2,epoch:1,revision:0,amal:'oqi',ids:Array(501).fill(1)})).toMatchObject({ok:false,xato:'HISOB_SAHIFA_CHEGARA'});
    expect(s.ishlov({id:3,epoch:1,revision:0,amal:'tahrir',tahrir:{qator_id:3,maydon:'f2_summa',qiymat:'5',kutilgan_versiya:1}} as never)).toMatchObject({ok:false,xato:'HISOB_MAYDON_YOPIQ'});
    s.ishlov({id:4,epoch:1,revision:0,amal:'yop'});
    expect(s.ishlov({id:5,epoch:1,revision:0,amal:'oqi',ids:[3]})).toMatchObject({ok:false});
  });
  it('takror INIT va eski close joriy snapshotni yo‘qotmaydi',()=>{
    const s=new HisobSessiya();och(s);
    s.ishlov({id:2,epoch:1,revision:0,amal:'tahrir',tahrir:{qator_id:3,maydon:'narx',qiymat:'2',kutilgan_versiya:1}});
    expect(och(s)).toMatchObject({ok:false,xato:'HISOB_ESKI'});
    expect(s.ishlov({id:3,epoch:0,revision:0,amal:'yop'})).toMatchObject({ok:false,xato:'HISOB_ESKI'});
    expect(s.ishlov({id:4,epoch:1,revision:1,amal:'oqi',ids:[3]})).toMatchObject({ok:true,qatorlar:[{summa:'4'}]});
  });
});

class Port {
  onmessage:Worker['onmessage']=null;onerror:Worker['onerror']=null;onmessageerror:Worker['onmessageerror']=null;
  posts:unknown[]=[];closed=false;auto=true; private s=new HisobSessiya();
  postMessage(x:unknown){this.posts.push(structuredClone(x));if(this.auto)queueMicrotask(()=>this.reply(x));}
  reply(x:unknown){this.onmessage?.call(null as unknown as Worker,{data:this.s.ishlov(x as never)} as MessageEvent);}
  terminate(){this.closed=true;}
}
describe('retained client FIFO va lifecycle',()=>{
  it('ketma-ket tahrirlar revisionni yo‘qotmaydi; paket faqat bir marta yuboriladi',async()=>{
    const p=new Port(),c=new HisobSessiyaMijoz(p);
    const initial=c.och(paket()),a=c.tahrir({qator_id:3,maydon:'narx',qiymat:'2',kutilgan_versiya:1}),b=c.tahrir({qator_id:2,maydon:'hajm',qiymat:'2',kutilgan_versiya:1}),read=c.oqi([3]);
    await initial;await a;await b;
    expect(await read).toMatchObject({revision:2,qatorlar:[{summa:'0.8',f2_summa:0.31}]});
    expect(p.posts.map(x=>(x as {revision:number}).revision)).toEqual([0,0,1,2]);
    expect(p.posts.filter(x=>'paket' in (x as object))).toHaveLength(1);c.yop();
  });
  it('ochilish bekor qilinsa A javobi B snapshotiga qo‘llanmaydi',async()=>{
    const p=new Port();p.auto=false;const c=new HisobSessiyaMijoz(p);
    const a=c.och(paket()),check=expect(a).rejects.toThrow();await Promise.resolve();await Promise.resolve();
    const next=paket();next.kompaniya_id=2;next.obyekt_id=2;
    const b=c.och(next);await check;
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    p.reply(p.posts[0]); // kech A
    await Promise.resolve();await Promise.resolve();
    expect(p.posts).toHaveLength(2);p.reply(p.posts[1]);
    expect(await b).toMatchObject({kompaniya_id:2,obyekt_id:2});c.yop();
  });
  it('logout navbatdagi so‘rovlarni ham rad qiladi',async()=>{
    const p=new Port(),c=new HisobSessiyaMijoz(p);await c.och(paket());p.auto=false;
    const a=c.oqi([3]),b=c.oqi([2]);const result=Promise.allSettled([a,b]);c.yop();
    expect((await result).every(r=>r.status==='rejected')).toBe(true);expect(p.closed).toBe(true);
  });
  it('navbatga qo‘yilgan hajm va paket keyingi caller mutatsiyasidan himoyalangan',async()=>{
    const p=new Port(),c=new HisobSessiyaMijoz(p),initial=paket();
    const opened=c.och(initial);initial.q.narx[2]=999;
    const edit={qator_id:3,maydon:'narx' as const,qiymat:'2',kutilgan_versiya:1};
    const edited=c.tahrir(edit);edit.qiymat='999';
    expect(await opened).toMatchObject({ok:true});await edited;
    expect(await c.oqi([3])).toMatchObject({qatorlar:[{narx:'2',summa:'4',f2_summa:0.31}]});c.yop();
  });
  it('revisioni buzilgan javobda qolgan navbat va Worker yopiladi',async()=>{
    const p=new Port(),c=new HisobSessiyaMijoz(p);await c.och(paket());p.auto=false;
    const edit=c.tahrir({qator_id:3,maydon:'narx',qiymat:'2',kutilgan_versiya:1});
    const read=c.oqi([3]);const settled=Promise.allSettled([edit,read]);
    await Promise.resolve();await Promise.resolve();
    const req=p.posts.at(-1) as {id:number;epoch:number;revision:number};
    p.onmessage?.call(null as unknown as Worker,{data:{...req,ok:true,amal:'tahrir',revision:99}} as MessageEvent);
    expect((await settled).every(r=>r.status==='rejected')).toBe(true);expect(p.closed).toBe(true);
  });
});
