import { expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { omborDavrExcel, omborDavrQatorlar, type OmborDavr, type OmborHisobotQator } from './davr-eksport';

const davr:OmborDavr={bosh:'2026-10-01',oxir:'2026-10-31',kompaniya:'Sinov',ombor:'Sinov ombor',holat:'qoralama',rasxodKiritilgan:false};
const row=(p:Partial<OmborHisobotQator>={}):OmborHisobotQator=>({id:'1',sana:'2026-10-01',operatsiya:'prixod',nom:'Щебень',birlik:'м3',miqdor:4,tomon:'Sinov yetkazuvchi',hujjat:'A-1',manbaQator:8,tasdiqlangan:true,...p});
it('includes both date boundaries, excludes unapproved and out-of-period rows without changing source',()=>{
  const rows=[row(),row({id:'2',sana:'2026-10-31'}),row({id:'3',sana:'2026-11-01'}),row({id:'4',tasdiqlangan:false})];
  const before=structuredClone(rows);expect(omborDavrQatorlar(rows,davr).map(x=>x.id)).toEqual(['1','2']);expect(rows).toEqual(before);
  expect(()=>omborDavrQatorlar(rows,{...davr,bosh:'2026-02-30'})).toThrow('DAVR_XATO');
  expect(()=>omborDavrQatorlar(rows,{...davr,bosh:davr.oxir,oxir:davr.bosh})).toThrow('DAVR_XATO');
  expect(()=>omborDavrQatorlar([row({miqdor:NaN})],davr)).toThrow('HISOBOT_QATOR_XATO');
});
it('produces an editable RU draft workbook with separated units and unknown issue/stock/money explicitly preserved',async()=>{
  const bytes=await omborDavrExcel([row(),row({id:'2',birlik:'т',miqdor:10}),row({id:'3',nom:'=SUM(A1:A9)',tasdiqlangan:false})],davr);
  const wb=new Workbook();await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  const ws=wb.getWorksheet('Реестр')!;expect(ws.getCell('A1').text).toContain('НЕ ПРОВЕДЕНО');expect(ws.rowCount).toBe(9);
  expect(ws.getCell('F8').value).toBe(4);expect(ws.getCell('I8').value).toBe(8);expect(ws.getCell('J8').text).toContain('не проведено');
  const summary=wb.getWorksheet('Свод')!;expect(summary.rowCount).toBe(5);expect(summary.getCell('D4').value).toBeNull();expect(summary.getCell('E4').value).toBeNull();
  expect(wb.getWorksheet('Источник')!.getCell('B6').text).toBe('Не определён');
});
it('exports both directions without adding different unit quantities or evaluating user text as Excel formula',async()=>{
  const bytes=await omborDavrExcel([row({nom:'=1+1'}),row({id:'2',nom:'=1+1',operatsiya:'rasxod',miqdor:1}),row({id:'3',birlik:'т'})],{...davr,rasxodKiritilgan:true,holat:'jurnal'});
  const wb=new Workbook();await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  expect(wb.getWorksheet('Реестр')!.getCell('D8').value).toBe('=1+1');
  expect(wb.getWorksheet('Свод')!.getCell('E4').value).toEqual({formula:'C4-D4',result:3});expect(wb.getWorksheet('Свод')!.rowCount).toBe(5);
  expect(wb.getWorksheet('Свод')!.getCell('C4').formula).toContain('SUMIFS');
  expect(wb.getWorksheet('Реестр')!.getColumn(11).hidden).toBe(true);
});
