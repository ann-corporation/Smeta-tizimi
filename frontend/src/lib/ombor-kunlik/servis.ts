import { sbOqi,sbSkladQoldiqOl,sbSkladgaYozish,type T2SkladHarakat } from '../../api/supabase';
export type KunlikTarix = T2SkladHarakat & {id:number;kompaniya_id:number;holat?:string|null;yaratildi?:string|null;kim?:string|null};
export type KunlikServis = {
  qoldiqOl: typeof sbSkladQoldiqOl;
  tarixOl: (company:number,object:number)=>ReturnType<typeof sbOqi<KunlikTarix>>;
  yozish: typeof sbSkladgaYozish;
};
export const KUNLIK_SERVIS:KunlikServis={qoldiqOl:sbSkladQoldiqOl,yozish:sbSkladgaYozish,
  tarixOl:(company,object)=>sbOqi<KunlikTarix>({jadval:'t2_sklad_harakat',filtr:`kompaniya_id=eq.${company}&obyekt_id=eq.${object}`,
    ustunlar:'id,kompaniya_id,obyekt_id,operatsiya,turi,sana,nomi,birligi,obyomi,postavshik,qabul_qiluvchi,qabul_turi,izoh,operation_id,holat,yaratildi,kim',tartib:'sana.desc,id.desc',limit:1000})};
