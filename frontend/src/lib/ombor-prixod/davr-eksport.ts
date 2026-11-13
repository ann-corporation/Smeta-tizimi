import { prixodSana } from './kitob';
import { exceljsJadvalUslubi } from '../hujjat-yozuvchi/exceljs-dizayn';

export type OmborHisobotQator = {
  id: string; sana: string; operatsiya: 'prixod' | 'rasxod'; nom: string; birlik: string; miqdor: number;
  tomon: string; hujjat: string; manbaQator: number | null; tasdiqlangan: boolean;
};
export type OmborDavr = {
  bosh: string; oxir: string; kompaniya: string; ombor: string;
  holat: 'qoralama' | 'jurnal'; rasxodKiritilgan: boolean; manbaNomi?: string; manbaSha256?: string;
};

/** Only approved rows in the inclusive business-date range. No timezone conversion or money inference. */
export function omborDavrQatorlar(rows: readonly OmborHisobotQator[], davr: OmborDavr): OmborHisobotQator[] {
  if (prixodSana(davr.bosh) !== davr.bosh || prixodSana(davr.oxir) !== davr.oxir || davr.bosh > davr.oxir)
    throw new Error('DAVR_XATO');
  const ids = new Set<string>();
  return rows.filter(row => row.tasdiqlangan).filter(row => {
    if (prixodSana(row.sana) !== row.sana || !row.nom.trim() || !row.birlik.trim() || !Number.isFinite(row.miqdor) || row.miqdor <= 0
      || !['prixod','rasxod'].includes(row.operatsiya) || !row.id || ids.has(row.id)) throw new Error('HISOBOT_QATOR_XATO');
    ids.add(row.id);
    return row.sana >= davr.bosh && row.sana <= davr.oxir;
  }).sort((a,b)=>a.sana.localeCompare(b.sana) || a.id.localeCompare(b.id));
}

/** RU receipt/issue register. Period movement is never presented as a verified closing balance. */
export async function omborDavrExcel(rows: readonly OmborHisobotQator[], davr: OmborDavr): Promise<Uint8Array> {
  const selected = omborDavrQatorlar(rows, davr);
  const { Workbook } = await import('exceljs');
  const wb = new Workbook(); wb.creator = 'Smeta Tizimi';
  const title = davr.holat === 'qoralama' ? 'ЧЕРНОВИК — НЕ ПРОВЕДЕНО' : 'РЕЕСТР СКЛАДСКИХ ДВИЖЕНИЙ';
  const note = davr.rasxodKiritilgan ? 'Обороты за период. Начальный и конечный остаток данным отчетом не подтверждаются.'
    : 'Расход ещё не введён. Приход не является подтверждённым остатком.';
  const ws = wb.addWorksheet('Реестр', {views:[{state:'frozen',ySplit:7}]});
  ws.addRow([title]); ws.addRow(['Организация',davr.kompaniya]); ws.addRow(['Склад',davr.ombor]);
  ws.addRow(['Период',davr.bosh,davr.oxir]); ws.addRow([note]); ws.addRow(['Цены, суммы и НДС не определены; нулевые значения не подставлены.']);
  const groupIds=new Map<string,number>();
  for(const row of selected){const key=JSON.stringify([row.nom,row.birlik]);if(!groupIds.has(key))groupIds.set(key,groupIds.size+1);}
  ws.addRow(['№','Дата','Операция','Материал','Ед. изм.','Количество','Поставщик / получатель','Документ','Строка источника','Статус','Группа (служебная)']);
  selected.forEach((row,i)=>ws.addRow([i+1,row.sana,row.operatsiya==='prixod'?'Приход':'Расход',row.nom,row.birlik,row.miqdor,
    row.tomon || 'Не указан',row.hujjat,row.manbaQator,davr.holat==='qoralama'?'Подтверждено в черновике; не проведено':'Проведено',groupIds.get(JSON.stringify([row.nom,row.birlik]))]));
  ws.autoFilter = {from:{row:7,column:1},to:{row:Math.max(7,ws.rowCount),column:10}};
  ws.columns.forEach((c,i)=>{c.width=[7,14,12,45,12,17,33,24,18,43][i];}); ws.getColumn(6).numFmt='#,##0.########';
  ws.getColumn(11).hidden=true;
  const summary=wb.addWorksheet('Свод');
  summary.addRow([title]);summary.addRow([note]);summary.addRow(['Материал','Ед. изм.','Приход за период','Расход за период','Разница оборотов (не остаток)']);
  const groups=new Map<string,{nom:string;birlik:string;kirim:number;chiqim:number}>();
  for(const row of selected){const key=JSON.stringify([row.nom,row.birlik]);const g=groups.get(key)??{nom:row.nom,birlik:row.birlik,kirim:0,chiqim:0};
    if(row.operatsiya==='prixod')g.kirim+=row.miqdor;else g.chiqim+=row.miqdor;groups.set(key,g);}
  const last=Math.max(8,ws.rowCount);
  for(const [key,g] of groups){
    const rowNo=summary.rowCount+1;const groupId=groupIds.get(key)!;
    const total=(kind:string,result:number)=>({formula:`SUMIFS('Реестр'!F8:F${last},'Реестр'!K8:K${last},${groupId},'Реестр'!C8:C${last},"${kind}")`,result});
    summary.addRow([g.nom,g.birlik,total('Приход',g.kirim),davr.rasxodKiritilgan?total('Расход',g.chiqim):null,
      davr.rasxodKiritilgan?{formula:`C${rowNo}-D${rowNo}`,result:g.kirim-g.chiqim}:null]);
  }
  summary.columns.forEach((c,i)=>{c.width=[45,13,22,22,35][i];});for(const c of [3,4,5])summary.getColumn(c).numFmt='#,##0.########';
  const meta=wb.addWorksheet('Источник');
  meta.addRow(['Параметр','Значение']);meta.addRows([
    ['Источник',davr.manbaNomi??'Складской журнал'],['SHA-256',davr.manbaSha256??'Не указан'],
    ['Статус',title],['Только подтвержденные строки',selected.length],['Начальный остаток','Не определён'],
    ['Конечный остаток','Не определён'],['Цены / суммы / НДС','Не определены'],
    ['Ограничения',note],['Сверка поставщика','Движения материалов не подтверждают взаиморасчеты или оплату'],
  ]);meta.getColumn(1).width=33;meta.getColumn(2).width=85;
  // Umumiy hujjat qoidalari (egasi 2026-11-13): matn o'raladi + balandlik hisoblanadi, son o'ralmaydi, yashirin K ustun
  // qatorni semirtirmaydi, A4 eniga sig'adi, sarlavha qatori takrorlanadi — `exceljsJadvalUslubi` (hujjat dizayni resolveri).
  exceljsJadvalUslubi(ws,{sarlavha:7,hajmUstunlari:[6],yonalish:'landscape'});
  exceljsJadvalUslubi(summary,{sarlavha:3,hajmUstunlari:[3,4,5],yonalish:'landscape'});
  exceljsJadvalUslubi(meta,{sarlavha:1,yonalish:'landscape'});
  for(const sheet of [ws,summary,meta]){
    for(const r of sheet===ws?[1,7]:sheet===summary?[1,3]:[1])sheet.getRow(r).eachCell(cell=>{
      cell.font={...cell.font,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245B55'}};
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
