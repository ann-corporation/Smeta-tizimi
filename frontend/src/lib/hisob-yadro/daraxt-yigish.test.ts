import { describe, expect, it } from 'vitest';
import { DaraxtHisob, type HisobQator } from './daraxt-yigish';
const q=(id:number,ota_id:number|null,tur:string,hajm:number|null,narx:number|null,summa:number|null,norma:number|null=null):HisobQator=>({id,ota_id,tur,hajm,narx,summa,norma,versiya:1});
const base=()=>[q(1,null,'rz',null,null,90),q(2,1,'bl',10,null,90),q(3,2,'rs',3,30,90,0.3),q(4,2,'rs',2,null,null,null)];
describe('retained daraxt — amaldagi SQL rollup/norma',()=>{
  it('INIT manba summa va norma nomuvofiqligini o‘zi tuzatmaydi',()=>{
    const h=new DaraxtHisob(base());expect(h.ol([3])[0].hajm).toBe('3');expect(h.xulosa().jami).toBe('90');
  });
  it('BL hajmi faqat normasi bor bolani o‘zgartiradi; server version oshmaydi',()=>{
    const h=new DaraxtHisob(base());const r=h.tahrir({qator_id:2,maydon:'hajm',qiymat:'1.35',kutilgan_versiya:1});
    expect(h.ol([3])[0]).toMatchObject({hajm:'0.405',summa:'12.15',versiya:1});
    expect(h.ol([4])[0]).toMatchObject({hajm:'2',summa:null});
    expect(r.jami).toBe('12.15');expect(r.taxminiy).toBe(true);
  });
  it('qator summasi ROUND2 qilinmaydi — SQLnumeric kabi',()=>{
    const h=new DaraxtHisob([q(1,null,'mat',0.1,0.2,0.02)]);
    h.tahrir({qator_id:1,maydon:'hajm',qiymat:'0.123456789',kutilgan_versiya:1});
    expect(h.ol([1])[0].summa).toBe('0.0246913578');
  });
  it('NULL hajmda bolalar kaskadi yo‘q; null price zero bo‘lmaydi',()=>{
    const h=new DaraxtHisob(base());h.tahrir({qator_id:2,maydon:'hajm',qiymat:null,kutilgan_versiya:1});
    expect(h.ol([3])[0].hajm).toBe('3');expect(h.ol([2])[0].summa).toBe('90');
    h.tahrir({qator_id:3,maydon:'narx',qiymat:null,kutilgan_versiya:1});
    expect(h.xulosa()).toMatchObject({jami:null,narxsiz_qator:2});
  });
  it('nested RZ canonical jami va ko‘rinish jamisi alohida',()=>{
    const h=new DaraxtHisob([q(1,null,'rz',null,null,10),q(2,1,'rz',null,null,20),q(3,1,'mat',1,10,10),q(4,2,'ob',1,20,20)]);
    h.tahrir({qator_id:4,maydon:'narx',qiymat:'30',kutilgan_versiya:1});
    expect(h.ol([1,2]).map(r=>r.summa)).toEqual(['10','30']);
    expect(h.xulosa().jami).toBe('40');
    expect(h.razdelKorinish()).toEqual([{id:2,summa:'30'},{id:1,summa:'40'}]);
  });
  it('BL jamisiga rs bilan birga mat/ob ham kiradi (t2_rollup 20261203000300); RZ ota yangilanadi',()=>{
    const h=new DaraxtHisob([q(1,null,'rz',null,null,23),q(2,1,'bl',2,null,23),q(3,2,'rs',2,4,8,1),q(4,2,'mat',3,5,15)]);
    h.tahrir({qator_id:4,maydon:'narx',qiymat:'6',kutilgan_versiya:1});
    expect(h.ol([2,1]).map(r=>r.summa)).toEqual(['26','26']);
    expect(h.xulosa().jami).toBe('26');
  });
  it('ziddiyat/unknown maydon/qator xatoda snapshot o‘zgarmaydi',()=>{
    const h=new DaraxtHisob(base()), before=h.ol([1,2,3,4]);
    for(const t of [{qator_id:3,maydon:'narx',qiymat:'5',kutilgan_versiya:0},{qator_id:3,maydon:'f2_summa',qiymat:'5',kutilgan_versiya:1},{qator_id:3,maydon:'narx',qiymat:'NaN',kutilgan_versiya:1}])
      expect(()=>h.tahrir(t as never)).toThrow();
    expect(h.ol([1,2,3,4])).toEqual(before);
  });
  it('30k chuqur RZ rekursiyasiz; sikl/yetishmagan ota rad',()=>{
    const h=new DaraxtHisob(Array.from({length:30_000},(_,i)=>q(i+1,i===0?null:i,'rz',null,null,0)));
    expect(h.postorder).toHaveLength(30_000);expect(h.razdelKorinish()).toHaveLength(30_000);
    expect(()=>new DaraxtHisob([q(1,2,'rz',null,null,0),q(2,1,'rz',null,null,0)])).toThrow('SIKL');
    expect(()=>new DaraxtHisob([q(1,99,'mat',1,1,1)])).toThrow('OTA_TOPILMADI');
  });
  it('input satrining yuqori aniqligi va manfiy hajm saqlanadi',()=>{
    const h=new DaraxtHisob([q(1,null,'mat',1,7,7)]);
    h.tahrir({qator_id:1,maydon:'hajm',qiymat:'-0.123456789123456789',kutilgan_versiya:1});
    expect(h.ol([1])[0].summa).toBe('-0.864197523864197523');
  });
});
