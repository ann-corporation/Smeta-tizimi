import { it, expect } from 'vitest';
import { reviewConversationEstimate as review, type ConversationFact } from './conversation-estimate';
const text='FM-1 fundamenti uchun podbetonka 4m3 b7.5, armatura 4 tonna 12 lik, beton 15 m3 b15. Shunday fundamentdan 14 dona.';
const facts: ConversationFact[]=[
  {factId:'a',sourceQuote:'podbetonka 4m3 b7.5',description:'podbetonka',quantity:'4',unit:'m3',materialQuote:'b7.5'},
  {factId:'b',sourceQuote:'armatura 4 tonna 12 lik',description:'armatura',quantity:'4',unit:'t',materialQuote:'12 lik'},
  {factId:'c',sourceQuote:'beton 15 m3 b15',description:'beton',quantity:'15',unit:'m3',materialQuote:'b15'}
];
it('ambiguous 14 items never silently multiply',()=>{const r=review(text,facts,null); expect(r.lines.every(l=>l.totalQuantity===null && l.issues.includes('QUANTITY_SCOPE_UNRESOLVED'))).toBe(true);expect(r.canWriteCanonical).toBe(false);});
it('user-confirmed per-item: 56 m3 / 56 t / 210 m3',()=>expect(review(text,facts,{basis:'PER_ITEM',itemCount:'14',confirmationId:'user-confirmation'}).lines.map(l=>l.totalQuantity)).toEqual(['56','56','210']));
it('user-confirmed total: quantities remain 4 / 4 / 15',()=>expect(review(text,facts,{basis:'TOTAL',itemCount:'14',confirmationId:'user-confirmation'}).lines.map(l=>l.totalQuantity)).toEqual(['4','4','15']));
it('missing material grade never invented',()=>{const r=review(text,[{...facts[1],materialQuote:null}],{basis:'TOTAL',itemCount:'14',confirmationId:'user'}); expect(r.lines[0].fact.materialQuote).toBeNull(); expect(r.requiredNextSteps).toContain('CATALOG_WORK_REVIEW');});
it('hallucinated quote fails closed',()=>expect(review(text,[{...facts[0],sourceQuote:'podbetonka 100m3'}],null).lines[0].issues).toContain('SOURCE_EVIDENCE_INVALID'));
it('hallucinated quantity fails closed even with a real quote',()=>expect(review(text,[{...facts[0],quantity:'40'}],{basis:'TOTAL',itemCount:'14',confirmationId:'user'}).lines[0].totalQuantity).toBeNull());
it('unit conversion cannot be invented by model',()=>expect(review(text,[{...facts[1],unit:'kg'}],null).lines[0].issues).toContain('SOURCE_EVIDENCE_INVALID'));
it('original source facts remain immutable',()=>{const before=JSON.stringify(facts); review(text,facts,{basis:'PER_ITEM',itemCount:'14',confirmationId:'user'});expect(JSON.stringify(facts)).toBe(before);});
it('duplicate fact identity rejected',()=>expect(()=>review(text,[facts[0],facts[0]],null)).toThrow('FACT_ID_INVALID'));
it.each(['0','-1','1.5','1000000'])('invalid item count %s',n=>expect(()=>review(text,facts,{basis:'PER_ITEM',itemCount:n,confirmationId:'user'})).toThrow('SCOPE_INVALID'));
it('empty confirmation rejected',()=>expect(()=>review(text,facts,{basis:'PER_ITEM',itemCount:'14',confirmationId:''})).toThrow());
it('decimal comma exact quantity',()=>expect(review('beton 4,125 m3',[{...facts[2],sourceQuote:'beton 4,125 m3',quantity:'4,125',materialQuote:null}],{basis:'PER_ITEM',itemCount:'14',confirmationId:'user'}).lines[0].totalQuantity).toBe('57.75'));
it('zero quantity preserved, not unknown',()=>expect(review('beton 0 m3',[{...facts[2],sourceQuote:'beton 0 m3',quantity:'0',materialQuote:null}],{basis:'TOTAL',itemCount:'14',confirmationId:'user'}).lines[0].totalQuantity).toBe('0'));
it('4 cannot be read from 14',()=>expect(review('beton 14 m3',[{...facts[2],sourceQuote:'beton 14 m3',quantity:'4',materialQuote:null}],{basis:'TOTAL',itemCount:'14',confirmationId:'user'}).lines[0].totalQuantity).toBeNull());
