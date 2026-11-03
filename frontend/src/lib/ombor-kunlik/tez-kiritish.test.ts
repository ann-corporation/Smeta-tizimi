import {expect,it} from 'vitest';
import {kunlikMatnTaklif} from './tez-kiritish';
import type {KunlikTarix} from './servis';
const rows=[{nomi:'Щебень 5-20',birligi:'м3',postavshik:'Karyer',qabul_qiluvchi:'Anvar'},{nomi:'Щебень 20-40',birligi:'т',postavshik:'Boshqa',qabul_qiluvchi:'Usta'}] as KunlikTarix[];
it('offers ambiguous real material variants then extracts quantity/unit/supplier in any phrase order',()=>{
 expect(kunlikMatnTaklif('10 kub sheben keldi Karyerdan',rows,'prixod').nomlar).toHaveLength(2);
 const r=kunlikMatnTaklif('10 kub sheben keldi Karyerdan',rows,'prixod','Щебень 5-20');
 expect(r.fields).toMatchObject({nomi:'Щебень 5-20',birligi:'м3',miqdor:'10',postavshik:'Karyer'});expect(r.fields.sana).toBeUndefined();
});
it('never treats a material code as quantity, invents a unit, or applies an opposite direction',()=>{
 expect(kunlikMatnTaklif('Щебень 5-20 keldi',rows,'prixod','Щебень 5-20').fields.miqdor).toBeUndefined();
 expect(kunlikMatnTaklif('10 qop sheben keldi',rows,'prixod','Щебень 5-20').fields.birligi).toBeUndefined();
 expect(kunlikMatnTaklif('2 kub sheben Anvarga berdim',rows,'prixod').mos).toBe(false);
 expect(kunlikMatnTaklif('2 kub sheben Anvarga berdim',rows,'rasxod','Щебень 5-20').fields.qabulQiluvchi).toBe('Anvar');
});
