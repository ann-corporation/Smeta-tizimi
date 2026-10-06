import { describe, it, expect } from 'vitest';
import { hourCatalogKey, onRequestGet } from './hour-price-catalog';
import { imzola } from '../_shared/auth';
describe('hour catalogue authorization',()=>{
 it.each(['../catalog.json','CURRENT.json','sources.pdf','catalog.json/../../x'])('blocks %s',file=>expect(hourCatalogKey('16ee27da8700cc28',file)).toBeNull());
 it('rejects invalid revisions',()=>expect(hourCatalogKey('x','catalog.json')).toBeNull());
 it('keeps source namespace separate',()=>expect(hourCatalogKey('16ee27da8700cc28','catalog.json')).toBe('hour-price-catalog/16ee27da8700cc28/catalog.json'));
 it('unauthenticated request never reads R2',async()=>{
  let reads=0;
  const r=await onRequestGet({request:new Request('https://x/api/hour-price-catalog'),env:{SESSIYA_KALIT:'k'.repeat(32),R2_CANONICAL:{get:async()=>{reads++;return null;}}}} as never);
  expect(r.status).toBe(401);expect(reads).toBe(0);
 });
 it('signed request streams only allowed reference file',async()=>{
  const secret='k'.repeat(32); const cookie='sess='+await imzola({rol:'pto',foydalanuvchi_id:5,kompaniyalar:[{kompaniya_id:17,rol:'pto'}]},secret);
  const r=await onRequestGet({request:new Request('https://x/api/hour-price-catalog?rev=16ee27da8700cc28&f=catalog.json',{headers:{Cookie:cookie}}),env:{SESSIYA_KALIT:secret,R2_CANONICAL:{get:async()=>({body:'{}'})}}} as never);
  expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toContain('private');
 });
});
