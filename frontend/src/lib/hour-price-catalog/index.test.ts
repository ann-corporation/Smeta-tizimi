import { describe, it, expect } from 'vitest';
import { machinePrice, labourPrice, type HourCatalog } from './index';
const catalog: HourCatalog = { schema:'hour-price-catalog-v1',machineCoverage:'PARTIAL_VERIFIED_SUBSET',
 machines:[{ machineKey:'автопогрузчики 5 т',name:'Автопогрузчики 5 т',unit:'маш-ч',price:'148613',sourceKey:'source-row',sourceSha256:'a'.repeat(64),sourceDate:'2025-01-01',page:1,vat:'EXCLUDED' }],
 labour:[{id:'source-cell',name:'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ',region:'Навоийская область',aggregate:false,year:2026,quarter:2,unit:'чел-ч',price:'50792.38',socialInsurance:'EXCLUDED',sourceSha256:'b'.repeat(64),sheet:'2 квартал',baseCell:'C10'}] };
describe('hour reference offers',()=>{
 it('exact machine only; does not merge capacities',()=>{
  expect(machinePrice(catalog,'АВТОПОГРУЗЧИКИ 5 Т','маш-ч')?.price).toBe('148613');
  expect(machinePrice(catalog,'Автопогрузчики 3 т','маш-ч')).toBeNull();
  expect(machinePrice(catalog,'Автопогрузчики 5 т','т')).toBeNull();
 });
 it('requires region period and worker scope; missing quarters are not zero',()=>{
  const q={region:'Навоийская область',year:2026,quarter:2,unit:'чел-ч',scope:'CONSTRUCTION_WORKER_REFERENCE'};
  expect(labourPrice(catalog,q)?.price).toBe('50792.38');
  expect(labourPrice(catalog,{...q,quarter:3})).toBeNull();
  expect(labourPrice(catalog,{...q,region:'unknown'})).toBeNull();
  expect(labourPrice(catalog,{...q,scope:'MACHINE_OPERATOR'})).toBeNull();
 });
 it('ambiguous source fails closed and lookup never mutates evidence',()=>{
  const before=JSON.stringify(catalog);
  expect(machinePrice({...catalog,machines:[...catalog.machines,...catalog.machines]},'Автопогрузчики 5 т','маш-ч')).toBeNull();
  expect(JSON.stringify(catalog)).toBe(before);
 });
});
