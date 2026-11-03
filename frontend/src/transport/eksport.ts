import type { Kpi } from '../api/t2-transport';
import { kpiKorsatkich } from '../lib/transport/foyda';

/** Transport KPI → Excel (exceljs faqat eksportda yuklanadi). Narxlar: tannarx va foyda QQS siz, daromad QQS bilan va QQS siz alohida. */
export async function kpiXlsx(d: Kpi): Promise<{ bytes: Uint8Array; faylNomi: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Transport');
  ws.addRow([`Transport — rentabellik ${d.dan} … ${d.gacha}`]).font = { bold: true, size: 13 };
  ws.addRow(['Tannarx va foyda — QQS siz; daromad — QQS bilan va QQS siz. Bo‘sh katak = kiritilmagan.']);
  ws.addRow([]);
  const bosh = ws.addRow(['Guruh', 'Nomi', 'Reys', 'Km', 'Bo‘sh yurish %', 'Tannarx (QQS siz)', 'Daromad (QQS bilan)', 'Daromad (QQS siz)', 'Foyda (QQS siz)', 'Marja %', 't·km tannarxi', 'Yoqilg‘i og‘ishi %', 'To‘liq emas reys', 'Narxsiz reys']);
  bosh.font = { bold: true };
  for (const q of d.qatorlar) {
    const k = kpiKorsatkich(q);
    ws.addRow([q.guruh, q.nom ?? '', q.reys, q.km, k.boshYurishFoiz, q.xarajat, q.daromad_qqs_bilan, q.daromad_qqs_siz, q.foyda, k.margaFoiz, k.tonnaKmTannarx, k.yoqilgiOgishFoiz, q.toliq_emas, q.narxsiz]);
  }
  ws.columns.forEach((c) => { c.width = 18; });
  const buf = await wb.xlsx.writeBuffer();
  return { bytes: new Uint8Array(buf as ArrayBuffer), faylNomi: `transport_${d.dan}_${d.gacha}.xlsx` };
}
