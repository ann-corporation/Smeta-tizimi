import { describe,expect,it } from 'vitest';
import type { T2Obyekt } from '../../api/supabase';
import type { Liniya } from '../../api/t2-shartnoma-liniya';
import { NAKRUTKA_KOEF_KODLAR, type t2ObyektNakrutka } from '../../api/t2-nakrutka';
import type { PodvalYozuv } from '../../api/t2-nakrutka-podval';
import { aggregateMarkup,effectiveContract,markupAmount } from './markup';
const object={id:10,jami:100,narxsiz:0} as T2Obyekt;
const result={ok:true,obyekt_id:10,shartnoma_id:100,cats:{chel:0,mash:0,mat:100,ob:0,mk:0,kab:0,bez:0},koeffitsientlar:Object.fromEntries(NAKRUTKA_KOEF_KODLAR.map(k=>[k,0])),nakrutka:{pryamye:100,vsego:125}} as Awaited<ReturnType<typeof t2ObyektNakrutka>>;
describe('source-based markups at parent levels',()=>{
 it('uses the real server cascade, including explicit zero',()=>{expect(markupAmount(object,result,[],100)).toBe(125);expect(markupAmount({...object,jami:0},{...result,nakrutka:{...result.nakrutka!,pryamye:0,vsego:0}},[],100)).toBe(0);});
 it('never substitutes a default cascade when a custom amount is unknown',()=>{
  const p={obyekt_id:10,shartnoma_id:null,nom:'custom',qatorlar:[{kod:'fixed',nom:'fixed',tur:'summa',summa:null},{kod:'total',nom:'total',tur:'jami',baza:[{kat:'МАТ'},{qator:'fixed'}]}]} as PodvalYozuv;
  expect(markupAmount(object,result,[p],100)).toBeNull();
  expect(markupAmount(object,result,[{...p,qatorlar:[{...p.qatorlar[0],summa:20},p.qatorlar[1]]}],100)).toBe(120);
 });
 it('applies object→contract→company custom precedence',()=>{
  const fixed=(amount:number,o:number|null,s:number|null)=>({obyekt_id:o,shartnoma_id:s,qatorlar:[{kod:'fixed',nom:'f',tur:'summa',summa:amount},{kod:'total',nom:'t',tur:'jami',baza:[{qator:'fixed'}]}]} as PodvalYozuv);
  expect(markupAmount(object,result,[fixed(500,null,null),fixed(200,null,100),fixed(150,10,null)],100)).toBe(150);
  expect(markupAmount(object,result,[fixed(500,null,null),fixed(200,null,100)],100)).toBe(200);
 });
 it('rejects missing source, unclassified costs, stale/wrong object and contract',()=>{
  expect(markupAmount({...object,jami:null},result,[],100)).toBeNull();
  expect(markupAmount({...object,jami:105},result,[],100)).toBeNull();
  expect(markupAmount(object,{...result,obyekt_id:11},[],100)).toBeNull();
  expect(markupAmount(object,result,[],101)).toBeNull();
 });
 it('sums already-calculated object totals once, retaining partial/unknown amounts',()=>{
  const values=new Map([[10,125],[11,0]]);
  expect(aggregateMarkup([10,10,11,12],[object,{...object,id:11,jami:0}],id=>values.get(id))).toEqual({known:125,present:2,unknown:1,total:3});
  expect(aggregateMarkup([10],[{...object,narxsiz:2}],()=>125).unknown).toBe(1);
 });
 it('never picks an arbitrary first contract for an overlapping object',()=>{
  const line={obyektlar:[{id:10,loyiha_id:1}],shartnomalar:[{id:100,loyiha_id:1,obyektlar:[10]},{id:101,loyiha_id:1,obyektlar:[10]}]} as Liniya;
  expect(effectiveContract(line,10)).toBeUndefined();
  line.obyektlar[0].asosiy_shartnoma_id=101;expect(effectiveContract(line,10)).toBe(101);
 });
});
