import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sbOqi } from '../../api/supabase';
import * as resourceMatch from './resource-match';
import { kompaniyaKuzatuvlari, kompaniyaMoslik, type KuzatilganNarx } from './company-prices';
vi.mock('../../api/supabase',()=>({sbOqi:vi.fn()}));
const read=vi.mocked(sbOqi);
const obs=(id:number,nom:string,birlik:string,narx:number):KuzatilganNarx=>({id,nom,birlik,narx,obyektId:7,manbaId:3,obyekt:'Obyekt A',smeta:'Smeta A.xlsx / LRV',sana:'2026-01-01'});
beforeEach(()=>read.mockReset());
afterEach(()=>vi.restoreAllMocks());
describe('company pricing by names and units, not codes',()=>{
 it('uses real schema and returns source file/object attribution',async()=>{
  read.mockResolvedValueOnce({ok:true,toliq:true,qatorlar:[{id:1,nom:'ПЕСОК',birlik:'М3',narx:100000,obyekt_id:7,manba_id:3,yangilandi:'2026-01-01'}]})
   .mockResolvedValueOnce({ok:true,qatorlar:[{id:7,nom:'Obyekt A'}]})
   .mockResolvedValueOnce({ok:true,qatorlar:[{id:3,fayl_nom:'Smeta A.xlsx',varaq:'LRV'}]});
  const r=await kompaniyaKuzatuvlari(17,['ПЕСОК']);
  expect(r[0]).toMatchObject({nom:'ПЕСОК',narx:100000,smeta:'Smeta A.xlsx / LRV',obyekt:'Obyekt A'});
  const q=read.mock.calls[0][0];
  expect(q.ustunlar).toContain('id,nom,birlik,narx,obyekt_id,manba_id,yangilandi');
  expect(q.ustunlar).toContain('source_document:t2_document_registry!source_document_id');
  expect(q.filtr).toContain('nom.ilike.*ПЕСОК*'); expect(q.filtr).not.toMatch(/(?:^|&)kod=/);
 });
 it('does not interpret a failed or truncated query as missing prices',async()=>{
  read.mockResolvedValueOnce({ok:false}); await expect(kompaniyaKuzatuvlari(17,['ПЕСОК'])).rejects.toThrow('COMPANY_PRICES_UNAVAILABLE');
  read.mockResolvedValueOnce({ok:true,toliq:false,qatorlar:[]}); await expect(kompaniyaKuzatuvlari(17,['ПЕСОК'])).rejects.toThrow('COMPANY_PRICES_INCOMPLETE');
 });
 it('successful empty search is distinct from error',async()=>{
  read.mockResolvedValueOnce({ok:true,toliq:true,qatorlar:[]}); expect(await kompaniyaKuzatuvlari(17,['ПЕСОК'])).toEqual([]);
 });
 it('matches renamed-code-independent names, rejects different physical units',()=>{
  const r=kompaniyaMoslik([obs(1,'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ','м3',100000),obs(2,'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ','т',90000)],'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ','м3');
  expect(r.confidence).toBe('EXACT'); expect(r.best?.row.id).toBe(1);
  expect(r.best?.row.manba_nom).toContain('Smeta A.xlsx');
 });
 it('same machine name uses MAX with retained source evidence; different capacity cannot win',()=>{
  const r=kompaniyaMoslik([obs(1,'АВТОПОГРУЗЧИКИ 5 Т','маш-ч',120000),obs(2,'АВТОПОГРУЗЧИКИ 5 Т','маш-ч',148613),obs(3,'АВТОПОГРУЗЧИКИ 10 Т','маш-ч',200000)],'АВТОПОГРУЗЧИКИ 5 Т','маш-ч',true);
  expect(r.best?.row.id).toBe(2); expect(r.confidence).toBe('EXACT');
 });
 it('does not auto-price unknown units or unspecified concrete/armature',()=>{
  expect(kompaniyaMoslik([obs(1,'БЕТОН (КЛАСС ПО ПРОЕКТУ)','м3',800000)],'БЕТОН (КЛАСС ПО ПРОЕКТУ)','м3').confidence).toBe('REVIEW');
  expect(kompaniyaMoslik([obs(1,'АРМАТУРА','т',8000000)],'АРМАТУРА','т').confidence).toBe('REVIEW');
  expect(kompaniyaMoslik([obs(1,'ПЕСОК','м3',100000)],'ПЕСОК',null).confidence).toBe('REVIEW');
 });
});

describe('company observation revision cache', () => {
 it('reuses a prepared matcher view across resources and returns the cached result for repeated inputs', () => {
  const spy = vi.spyOn(resourceMatch, 'matchResource');
  const rows = Object.freeze([Object.freeze(obs(1, 'ПЕСОК', 'м3', 100000)), Object.freeze(obs(2, 'ЩЕБЕНЬ 5-10 ММ', 'м3', 120000))]);
  const first = kompaniyaMoslik(rows, 'ПЕСОК', 'м3');
  for (let i = 0; i < 100; i++) expect(kompaniyaMoslik(rows, 'ПЕСОК', 'м3')).toBe(first);
  const second = kompaniyaMoslik(rows, 'ЩЕБЕНЬ 5-10 ММ', 'м3');
  expect(first.best?.row.id).toBe(1); expect(second.best?.row.id).toBe(2);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy.mock.calls[0][0]).toBe(spy.mock.calls[1][0]);
 });

 it('keeps machine MAX and latest-observation selection in independent cache modes', () => {
  const name = 'АВТОПОГРУЗЧИКИ 5 Т';
  const rows = Object.freeze([
   Object.freeze({ ...obs(1, name, 'маш-ч', 148613), smeta: 'Older MAX.xlsx', sana: '2025-01-01' }),
   Object.freeze({ ...obs(2, name, 'маш-ч', 120000), smeta: 'Latest.xlsx', sana: '2026-01-01' }),
  ]);
  const latest = kompaniyaMoslik(rows, name, 'маш-ч');
  const max = kompaniyaMoslik(rows, name, 'маш-ч', true);
  expect(latest.best?.row).toMatchObject({ id: 2, narx: 120000, manba_nom: expect.stringContaining('Latest.xlsx') });
  expect(max.best?.row).toMatchObject({ id: 1, narx: 148613, manba_nom: expect.stringContaining('Older MAX.xlsx') });
  expect(kompaniyaMoslik(rows, name, 'маш-ч', false)).toBe(latest);
  expect(kompaniyaMoslik(rows, name, 'маш-ч', true)).toBe(max);
 });

 it('a new array revision produces fresh prices and leaves the previous cached revision intact', () => {
  const oldRows = Object.freeze([Object.freeze(obs(1, 'ПЕСОК', 'м3', 100000))]);
  const old = kompaniyaMoslik(oldRows, 'ПЕСОК', 'м3');
  const newRows = Object.freeze([Object.freeze({ ...oldRows[0], narx: 200000, smeta: 'New.xlsx' })]);
  const fresh = kompaniyaMoslik(newRows, 'ПЕСОК', 'м3');
  expect(fresh).not.toBe(old);
  expect(fresh.best?.row).toMatchObject({ narx: 200000, manba_nom: expect.stringContaining('New.xlsx') });
  expect(kompaniyaMoslik(oldRows, 'ПЕСОК', 'м3')).toBe(old);
  expect(old.best?.row.narx).toBe(100000);
 });

 it('separates names, unknown units and conversion target spelling without leaking evidence', () => {
  const name = 'АРМАТУРА А500С Ø12';
  const rows = Object.freeze([Object.freeze(obs(1, name, 'кг', 8300))]);
  const tonnes = kompaniyaMoslik(rows, name, 'т');
  const tonneAlias = kompaniyaMoslik(rows, name, 'ТН');
  expect(tonnes.best?.unitConversion).toMatchObject({ targetUnit: 'т', priceFactor: 1000 });
  expect(tonneAlias.best?.unitConversion).toMatchObject({ targetUnit: 'ТН', priceFactor: 1000 });
  expect(tonneAlias).not.toBe(tonnes);
  expect(kompaniyaMoslik(rows, name, null).confidence).toBe('REVIEW');
  expect(kompaniyaMoslik(rows, 'АРМАТУРА А500С Ø16', 'т').best).toBeNull();
  expect(kompaniyaMoslik(rows, name, 'т')).toBe(tonnes);
 });
});

it('resolves canonical native document provenance separately from legacy manba',async()=>{
 read.mockResolvedValueOnce({ok:true,toliq:true,qatorlar:[{id:2,nom:'BETON B20',birlik:'м3',narx:800000,obyekt_id:7,manba_id:null,source_document_id:44,source_document:{original_filename:'Native.xlsx',kompaniya_id:17},yangilandi:null}]})
  .mockResolvedValueOnce({ok:true,qatorlar:[{id:7,nom:'Obyekt A'}]});
 const r=await kompaniyaKuzatuvlari(17,['BETON B20']);
 expect(r[0]).toMatchObject({smeta:'Native.xlsx',documentId:44});
 expect(read.mock.calls[0][0].filtr).toContain('nom.ilike.*BETON*');
 expect(read.mock.calls[0][0].filtr).toContain('source_document.kompaniya_id=eq.17');
});
