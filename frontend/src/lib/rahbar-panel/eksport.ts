/**
 * Rahbar paneli → Excel (issue #195 §8). Raqamlar serverdan (t2_rahbar_panel_v1), hisob YO'Q.
 * Kiritilmagan qiymat — bo'sh katak va «не введено» izohi (0 yozilmaydi). Pul — so'm, QQS bilan (asosiy).
 */
import type { RahbarPanel } from '../../api/t2-rahbar-panel';
import { resursJadvali } from './markaz';

const KESIM_RU: Record<string, string> = {
  chel: 'ЧЕЛ (труд)', mash: 'МАШ (машины)', mat: 'МАТ (материалы)', ob: 'ОБ (оборудование)', subpudrat: 'Субподряд / спецработы',
  svod: 'Свод («письмо»), без накруток', ustamasiz: 'Прочее без накруток', nomalum: 'Категория не известна',
};
const DIQQAT_RU: Record<string, string> = {
  fakt_topshirilmagan: 'Выполнено, но Ф2 не сдана', f2_faktdan_oshgan: 'Ф2 превышает факт', smetadan_oshgan: 'Объём сверх сметы',
  f3_chiqarilmagan: 'Утверждённая Ф2 — Ф3 не выпущена', shartnoma_limit: 'Близко к лимиту договора', tolov_kechikkan: 'Оплата просрочена 60+ дней',
  reestr_farq: 'Расхождение система ↔ реестр', narxsiz: 'Строки без цены', sklad_manfiy: 'Отрицательный остаток склада',
};
const NV = 'не введено';

import { exceljsJadvalUslubi } from '../hujjat-yozuvchi/exceljs-dizayn';

export async function rahbarXlsx(p: RahbarPanel, o: { qamrovNomi: string; sana?: string }): Promise<{ bytes: Uint8Array; faylNomi: string }> {
  const sana = o.sana ?? new Date().toISOString().slice(0, 10);
  const ExcelJS = (await import('exceljs')).default; // og'ir kutubxona — faqat eksportda yuklanadi
  const wb = new ExcelJS.Workbook();
  const k = p.kartalar;

  const s1 = wb.addWorksheet('Сводка');
  s1.addRow([`ПАНЕЛЬ РУКОВОДИТЕЛЯ: ${o.qamrovNomi}`]).font = { bold: true, size: 13 };
  s1.addRow([`Дата: ${sana} · период: ${p.davr.dan ?? 'всё время'} — ${p.davr.gacha ?? 'сегодня'} · сум`]);
  s1.addRow([]);
  s1.addRow(['Показатель', 'С НДС (к оплате)', 'Без НДС (с накрутками)', 'Прямые затраты', 'Примечание']).font = { bold: true };
  const paket = (nom: string, x: { qqs_bilan: number; ustamali: number; ustamasiz: number } | null, izoh = '') =>
    s1.addRow([nom, x?.qqs_bilan ?? null, x?.ustamali ?? null, x?.ustamasiz ?? null, x ? izoh : NV]);
  const yakka = (nom: string, v: number | null, izoh = '') => s1.addRow([nom, v, null, null, v == null ? NV : izoh]);
  paket('Портфель (смета)', k.portfel.smeta, k.portfel.shartnoma_qqs_bilan != null ? `Договоры с НДС: ${k.portfel.shartnoma_qqs_bilan}` : '');
  paket('Выполнено (утверждённые Ф2, период)', k.bajarildi.davr, `Актов: ${k.bajarildi.akt_soni}`);
  paket('Выполнено (утверждённые Ф2, всего)', k.bajarildi.jami, k.bajarildi.foiz_smeta != null ? `${k.bajarildi.foiz_smeta}% от сметы` : '');
  yakka('Оплачено (период)', k.tolandi.davr);
  yakka('Дебиторка', k.debitor.qiymat, k.debitor.yosh ? `0–30: ${k.debitor.yosh.k0_30}; 30–60: ${k.debitor.yosh.k30_60}; 60+: ${k.debitor.yosh.k60}` : '');
  yakka('Кредиторка', k.kreditor.qiymat);
  yakka('Рентабельность, %', k.rentabellik.foiz, k.rentabellik.daromad != null ? `Доход (Ф2 без НДС): ${k.rentabellik.daromad}` : '');
  if (k.bajarildi.reestr) s1.addRow(['Реестр Ф2 (сравнение, не источник)', k.bajarildi.reestr.qqs_bilan, null, null, `Разница: ${k.bajarildi.reestr.farq}`]);
  [42, 20, 22, 20, 50].forEach((w, i) => { s1.getColumn(i + 1).width = w; });
  [2, 3, 4].forEach((c) => { s1.getColumn(c).numFmt = '#,##0.00'; });

  const s2 = wb.addWorksheet('Объекты');
  s2.addRow(['Объект', 'Проект', 'Договор, с НДС', 'Смета, с НДС', 'Факт, %', 'Ф2, %', 'Ф3, %', 'Ф2 утв., с НДС', 'Ф2 черновик, с НДС', 'Оплачено, %', 'Долг', 'Сигналы']).font = { bold: true };
  for (const x of p.obyektlar) {
    s2.addRow([x.nom, x.loyiha_nom ?? '', x.shartnoma?.qqs_bilan ?? null, x.smeta?.qqs_bilan ?? null, x.bajarilish.fakt, x.bajarilish.f2, x.bajarilish.f3,
      x.f2?.qqs_bilan ?? null, x.f2_qoralama.soni > 0 ? x.f2_qoralama.qqs_bilan : null, x.tolangan_foiz, x.qarz, x.signal.soni]);
  }
  [40, 22, 18, 18, 9, 9, 9, 18, 18, 11, 16, 9].forEach((w, i) => { s2.getColumn(i + 1).width = w; });
  [3, 4, 8, 9, 11].forEach((c) => { s2.getColumn(c).numFmt = '#,##0.00'; });

  const s3 = wb.addWorksheet('Ресурсы');
  s3.addRow(['Категория (прямые затраты)', 'Смета', 'Факт', 'Ф2 утв.', 'Ф2 / смета, %']).font = { bold: true };
  for (const r of resursJadvali(k.portfel.smeta, p.fakt, k.bajarildi.jami)) s3.addRow([KESIM_RU[r.kalit] ?? r.kalit, r.smeta, r.fakt, r.f2, r.f2Foiz]);
  const soat = (nom: string, a?: number, b?: number, c?: number) => s3.addRow([nom, a ?? null, b ?? null, c ?? null, null]);
  soat('чел.-ч', k.portfel.smeta?.soat.chel, p.fakt?.soat.chel, k.bajarildi.jami?.soat.chel);
  soat('маш.-ч', k.portfel.smeta?.soat.mash, p.fakt?.soat.mash, k.bajarildi.jami?.soat.mash);
  [34, 20, 20, 20, 14].forEach((w, i) => { s3.getColumn(i + 1).width = w; });
  [2, 3, 4].forEach((c) => { s3.getColumn(c).numFmt = '#,##0.00'; });

  const s4 = wb.addWorksheet('Внимание');
  s4.addRow(['№', 'Проблема', 'Объект', 'Влияние, сум', 'Кол-во']).font = { bold: true };
  p.diqqat.forEach((d, i) => s4.addRow([i + 1, DIQQAT_RU[d.kod] ?? d.kod, d.nom ?? 'по компании', d.summa_tasir, d.soni]));
  [5, 42, 36, 20, 10].forEach((w, i) => { s4.getColumn(i + 1).width = w; });
  s4.getColumn(4).numFmt = '#,##0.00';

  exceljsJadvalUslubi(s1, { sarlavha: 4, pulUstunlari: [2, 3, 4] });
  exceljsJadvalUslubi(s2, { sarlavha: 1, pulUstunlari: [3, 4, 8, 9, 11] });
  exceljsJadvalUslubi(s3, { sarlavha: 1, pulUstunlari: [2, 3, 4] });
  exceljsJadvalUslubi(s4, { sarlavha: 1, pulUstunlari: [4], yonalish: 'portrait' });
  const buf = await wb.xlsx.writeBuffer();
  const toza = o.qamrovNomi.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'kompaniya';
  return { bytes: new Uint8Array(buf as ArrayBuffer), faylNomi: `Panel_rukovoditelya_${toza}_${sana.replace(/-/g, '')}.xlsx` };
}
