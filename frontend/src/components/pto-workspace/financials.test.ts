import { createElement, type ReactNode } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { T2Obyekt } from '../../api/supabase';
import { objectFinancialsOl, type ObjectFinancials } from '../../api/t2-object-financials';
import { aggregateFinancials } from './financials';
import { emitEntityChanged } from '../../api/entity-consistency';
import { useObjectFinancials } from './useObjectFinancials';
const row = (id: number, known: number | null = 100, unknown = 0): ObjectFinancials => ({ obyekt_id: id, smeta: { known, unknown }, fakt: { known: 80, unknown: 0 }, f2: { known: 35, unknown: 0 }, ostatka: { known: 25, unknown: 0 } });
const objects = (ids: number[], company = 17) => ids.map(id => ({ id, kompaniya_id: company, versiya: 1, yangilandi: '2026-10-19' })) as T2Obyekt[];
const wrapper = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children); };
const response = (kid: number, rows: ObjectFinancials[]) => new Response(JSON.stringify({ ok: true, kompaniya_id: kid, objects: rows }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('financial totals and source contract', () => {
 it('deduplicates shared objects and uses supplied approved F2 and remaining-work values', () => {
  const result = aggregateFinancials([10,10,11], [row(10),row(11)]);
  expect(result.smeta.known).toBe(200); expect(result.smeta.total).toBe(2); expect(result.f2.known).toBe(70); expect(result.ostatka.known).toBe(50);
 });
 it('distinguishes zero, null, missing data and partial known amounts', () => {
  expect(aggregateFinancials([10],[row(10,0)]).smeta).toEqual({known:0,unknown:0,present:1,total:1});
  expect(aggregateFinancials([10],[row(10,null)]).smeta).toEqual({known:0,unknown:1,present:0,total:1});
  expect(aggregateFinancials([10,11,12],[row(10,70,2),row(11,null,3)]).smeta).toEqual({known:70,unknown:6,present:1,total:3});
 });
 it('rejects omitted objects, wrong company, duplicate rows and malformed metadata', async () => {
  const f=vi.fn(); vi.stubGlobal('fetch',f);
  for(const packet of [response(17,[]),response(18,[row(10)]),response(17,[row(10),row(10)]),response(17,[row(10,0,-1)])]) {f.mockResolvedValueOnce(packet);await expect(objectFinancialsOl(17,[10])).rejects.toThrow();}
 });
 it('uses only the approved-financials DTO, not all-acts or boss rollups', async () => {
  const f=vi.fn().mockResolvedValue(response(17,[row(10)]));vi.stubGlobal('fetch',f);
  expect((await objectFinancialsOl(17,[10,10])).objects[0].f2.known).toBe(35);
  expect(f.mock.calls[0][0]).toBe('/api/object-financials?kompaniya_id=17&obyektlar=10');
 });
});
describe('bounded atomic financial reads', () => {
 it('requests 200+1 objects and exposes no partial totals before the final chunk', async () => {
  let finish!:(r:Response)=>void;
  const f=vi.fn().mockImplementation(async(url:string)=>{const ids=new URL(url,'https://local').searchParams.get('obyektlar')!.split(',').map(Number);if(ids.length===1)return new Promise<Response>(r=>{finish=r;});return response(17,ids.map(id=>row(id)));});vi.stubGlobal('fetch',f);
  const all=objects(Array.from({length:201},(_,i)=>i+1));
  const {result}=renderHook(()=>useObjectFinancials(17,[...all,all[0]]),{wrapper:wrapper()});
  await waitFor(()=>expect(f).toHaveBeenCalledTimes(2));expect(result.current.sum([1]).smeta.present).toBe(0);finish(response(17,[row(201)]));
  await waitFor(()=>expect(result.current.sum(all.map(o=>o.id)).smeta.known).toBe(20100));
 });
 it('fails closed for the whole read if a later chunk fails', async () => {
  const f=vi.fn().mockImplementation(async(url:string)=>{const ids=new URL(url,'https://local').searchParams.get('obyektlar')!.split(',').map(Number);if(ids.length===1)throw Error('offline');return response(17,ids.map(id=>row(id)));});vi.stubGlobal('fetch',f);
  const all=objects(Array.from({length:201},(_,i)=>i+1));const {result}=renderHook(()=>useObjectFinancials(17,all),{wrapper:wrapper()});
  await waitFor(()=>expect(result.current.failed).toBe(true));expect(result.current.sum([1]).smeta.present).toBe(0);
 });
 it('clears old-company data immediately on switching, even before the new request finishes', async () => {
  let finish!:(r:Response)=>void;const f=vi.fn().mockResolvedValueOnce(response(17,[row(10,123)])).mockImplementationOnce(()=>new Promise<Response>(r=>{finish=r;}));vi.stubGlobal('fetch',f);
  const {result,rerender}=renderHook(({kid})=>useObjectFinancials(kid,objects([10],kid)),{initialProps:{kid:17},wrapper:wrapper()});
  await waitFor(()=>expect(result.current.sum([10]).smeta.known).toBe(123));rerender({kid:18});expect(result.current.sum([10]).smeta.present).toBe(0);
  await waitFor(()=>expect(f).toHaveBeenCalledTimes(2));finish(response(18,[row(10,456)]));await waitFor(()=>expect(result.current.sum([10]).smeta.known).toBe(456));
 });
 it('refreshes financials for same-company mutations without reacting to another tenant', async () => {
  const f=vi.fn().mockResolvedValueOnce(response(17,[row(10,100)])).mockResolvedValueOnce(response(17,[row(10,125)]));vi.stubGlobal('fetch',f);
  const {result}=renderHook(()=>useObjectFinancials(17,objects([10])),{wrapper:wrapper()});
  await waitFor(()=>expect(result.current.sum([10]).smeta.known).toBe(100));
  emitEntityChanged('obyekt',10,18);expect(f).toHaveBeenCalledTimes(1);
  emitEntityChanged('obyekt',10,17);await waitFor(()=>expect(result.current.sum([10]).smeta.known).toBe(125));
 });
 it('keys sorted IDs and versions, excludes objects from other companies', async () => {
  const f=vi.fn().mockImplementation(async(url:string)=>response(17,new URL(url,'https://local').searchParams.get('obyektlar')!.split(',').map(id=>row(Number(id)))));vi.stubGlobal('fetch',f);
  const {result,rerender}=renderHook(({list})=>useObjectFinancials(17,list),{initialProps:{list:[...objects([11,10]),...objects([99],18)]},wrapper:wrapper()});
  await waitFor(()=>expect(result.current.sum([10]).smeta.present).toBe(1));expect(f.mock.calls[0][0]).toContain('obyektlar=10%2C11');
  rerender({list:objects([10,11])});expect(f).toHaveBeenCalledTimes(1);rerender({list:objects([10,11]).map(o=>({...o,versiya:2}))});await waitFor(()=>expect(f).toHaveBeenCalledTimes(2));
 });
});

describe('malformed response and cancellation boundaries', () => {
 it('rejects malformed JSON, nonfinite/mistyped values, missing fields, unexpected IDs and HTTP errors', async () => {
  const invalids=[new Response('{'),new Response(JSON.stringify({ok:true,kompaniya_id:17,objects:[{...row(10),f2:{known:'35',unknown:0}}]})),response(17,[{...row(10),ostatka:undefined} as unknown as ObjectFinancials]),response(17,[row(99)]),new Response(JSON.stringify({ok:true,kompaniya_id:17,objects:[row(10)]}),{status:503})];
  const f=vi.fn();vi.stubGlobal('fetch',f);for(const packet of invalids){f.mockResolvedValueOnce(packet);await expect(objectFinancialsOl(17,[10])).rejects.toThrow();}
 });
 it('does not fetch with a pre-aborted signal and rejects a late response after abort', async () => {
  const controller=new AbortController();controller.abort();const f=vi.fn();vi.stubGlobal('fetch',f);
  await expect(objectFinancialsOl(17,[10],controller.signal)).rejects.toThrow();expect(f).not.toHaveBeenCalled();
  const live=new AbortController();let finish!:(r:Response)=>void;f.mockImplementation(()=>new Promise<Response>(r=>{finish=r;}));
  const read=objectFinancialsOl(17,[10],live.signal);const rejected=expect(read).rejects.toThrow();live.abort();finish(response(17,[row(10)]));await rejected;
  expect(f.mock.calls[0][1].signal).toBe(live.signal);
 });
 it('aborts company A and never adopts its late response in company B', async () => {
  let finish!:(r:Response)=>void;let oldSignal!:AbortSignal;
  const f=vi.fn().mockImplementationOnce((_url:string,options:{signal:AbortSignal})=>{oldSignal=options.signal;return new Promise<Response>(r=>{finish=r;});}).mockResolvedValueOnce(response(18,[row(10,456)]));vi.stubGlobal('fetch',f);
  const {result,rerender}=renderHook(({kid})=>useObjectFinancials(kid,objects([10],kid)),{initialProps:{kid:17},wrapper:wrapper()});
  await waitFor(()=>expect(f).toHaveBeenCalledTimes(1));rerender({kid:18});expect(oldSignal.aborted).toBe(true);
  await waitFor(()=>expect(result.current.sum([10]).smeta.known).toBe(456));finish(response(17,[row(10,123)]));
  await waitFor(()=>expect(result.current.sum([10]).smeta.known).toBe(456));expect(result.current.failed).toBe(false);
 });
});
