import {cleanup,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {T2Obyekt} from '../../api/supabase';
import type {Liniya} from '../../api/t2-shartnoma-liniya';
import {NAKRUTKA_KOEF_KODLAR} from '../../api/t2-nakrutka';
import {limitedRead,useMarkupTotals} from './useMarkupTotals';
const m=vi.hoisted(()=>({read:vi.fn(),podvals:vi.fn()}));
vi.mock('../../api/t2-nakrutka',async importOriginal=>({...await importOriginal<any>(),t2ObyektNakrutka:(...args:any[])=>m.read(...args)}));
vi.mock('../../api/t2-nakrutka-podval',async importOriginal=>({...await importOriginal<any>(),sbPodvallarOl:(...args:any[])=>m.podvals(...args)}));
const objs=[{id:10,jami:100,narxsiz:0}] as T2Obyekt[];
const line={obyektlar:[{id:10,loyiha_id:1}],shartnomalar:[{id:100,loyiha_id:1,obyektlar:[10]}]} as Liniya;
const packet=(total:number)=>({ok:true,obyekt_id:10,shartnoma_id:100,cats:{chel:0,mash:0,mat:100,ob:0,mk:0,kab:0,bez:0},koeffitsientlar:Object.fromEntries(NAKRUTKA_KOEF_KODLAR.map(k=>[k,0])),nakrutka:{pryamye:100,vsego:total}});
beforeEach(()=>{m.read.mockReset();m.podvals.mockReset();m.podvals.mockResolvedValue({ok:true,qatorlar:[]});});
afterEach(cleanup);
const wrap=()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return ({children}:any)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;};
describe('markup read isolation and bounded background work',()=>{
 it('does not expose late company A calculations in company B',async()=>{
  let complete!:(v:any)=>void;m.read.mockImplementationOnce(()=>new Promise(resolve=>complete=resolve)).mockResolvedValue(packet(250));
  const {result,rerender}=renderHook(({kid})=>useMarkupTotals(kid,line,objs),{initialProps:{kid:17},wrapper:wrap()});
  await waitFor(()=>expect(m.read).toHaveBeenCalledOnce());rerender({kid:18});
  await waitFor(()=>expect(result.current.sum([10]).known).toBe(250));complete(packet(125));
  await waitFor(()=>expect(result.current.sum([10]).known).toBe(250));
 });
 it('fails closed when custom footer read is incomplete or failed',async()=>{
  m.podvals.mockResolvedValue({ok:true,toliq:false,qatorlar:[]});
  const {result}=renderHook(()=>useMarkupTotals(17,line,objs),{wrapper:wrap()});
  await waitFor(()=>expect(result.current.failed).toBe(true));expect(result.current.sum([10]).present).toBe(0);expect(m.read).not.toHaveBeenCalled();
 });
 it('limits reads to four and skips an obsolete queued request',async()=>{
  const controllers=Array.from({length:6},()=>new AbortController());
  const releases:Array<()=>void>=[];let running=0,max=0,called=0;
  const reads=controllers.map((controller,i)=>limitedRead(async()=>{called++;running++;max=Math.max(max,running);await new Promise<void>(resolve=>releases.push(resolve));running--;return i;},controller.signal).catch(()=>-1));
  await waitFor(()=>expect(called).toBe(4));controllers[4].abort();releases.splice(0).forEach(release=>release());
  await waitFor(()=>expect(called).toBe(5));releases.splice(0).forEach(release=>release());
  expect(await Promise.all(reads)).toEqual([0,1,2,3,-1,5]);expect(max).toBe(4);
 });
});
