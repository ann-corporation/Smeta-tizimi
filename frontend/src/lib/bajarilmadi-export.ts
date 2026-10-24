/**
 * «Bajarilmagan hajmlar ro'yxati» (egasi 2026-10-24): bajarilmadi deb belgilangan ishlar — sabab, sana, kim, dalil hujjat bilan.
 * Rasmiy hujjat rus tilida (boshqa ostatka hujjatlari kabi). Smeta qatorlari o'zgarmaydi: bu qoplama yozuvlar ro'yxati.
 */
import ExcelJS from 'exceljs';
import type { BajarilmadiQator } from '../api/t2-bajarilmadi';

const SABAB_RU: Record<string, string> = {
  buyurtmachi_chiqardi: 'Заказчик исключил из проекта',
  loyiha_ozgardi: 'Изменение проекта',
  boshqa_pudratchi: 'Передано другому подрядчику',
  texnik_sabab: 'Техническая причина',
  zamena: 'Замена',
  material_yoq: 'Материал/оборудование не поставлено',
  boshqa: 'Другое',
};
export const bajarilmadiSababRu = (kod: string) => SABAB_RU[kod] ?? kod;

const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

/** Faqat faol yozuvlar; tartib: kod/nom bo'yicha. */
export function bajarilmadiQatorlari(royxat: readonly BajarilmadiQator[]): BajarilmadiQator[] {
  return royxat.filter((x) => x.holat === 'faol').slice().sort((a, b) => String(a.kod ?? '').localeCompare(String(b.kod ?? ''), 'ru') || String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'ru'));
}

export async function bajarilmadiXlsx(royxat: readonly BajarilmadiQator[], o: { obyektNomi: string; sana?: string }): Promise<{ bytes: Uint8Array; faylNomi: string; soni: number }> {
  const qatorlar = bajarilmadiQatorlari(royxat);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Не выполнено');
  ws.addRow(['ВЕДОМОСТЬ НЕВЫПОЛНЕННЫХ ОБЪЁМОВ']).font = { bold: true, size: 13 };
  ws.addRow([`Объект: ${o.obyektNomi}`]);
  ws.addRow([`Дата формирования: ${o.sana ?? new Date().toISOString().slice(0, 10)}`]);
  ws.addRow([]);
  const bosh = ws.addRow(['№', 'Шифр', 'Наименование', 'Ед. изм.', 'Объём по смете', 'Выполнено (факт)', 'Не выполнено', 'Причина', 'Примечание', 'Документ-основание', 'Дата', 'Кто отметил']);
  bosh.font = { bold: true }; bosh.alignment = { wrapText: true, vertical: 'middle' };
  qatorlar.forEach((x, i) => {
    ws.addRow([i + 1, x.kod ?? '', x.nom ?? '', x.birlik ?? '', x.smeta_hajm == null ? null : yaxlit(Number(x.smeta_hajm)), x.fakt_hajm == null ? null : yaxlit(Number(x.fakt_hajm)),
      yaxlit(Number(x.bajarilmagan_hajm)), bajarilmadiSababRu(x.sabab_kod), x.sabab_izoh ?? '', x.hujjat_nom ?? (x.hujjat_id ? `№ ${x.hujjat_id}` : ''), x.sana, x.kim ?? '']);
  });
  [6, 14, 60, 9, 15, 15, 15, 32, 40, 28, 12, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const c of [5, 6, 7]) ws.getColumn(c).numFmt = '#,##0.000';
  const buf = await wb.xlsx.writeBuffer();
  const sana = (o.sana ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const toza = o.obyektNomi.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'obyekt';
  return { bytes: new Uint8Array(buf as ArrayBuffer), faylNomi: `Nevypolneno_${toza}_${sana}.xlsx`, soni: qatorlar.length };
}
