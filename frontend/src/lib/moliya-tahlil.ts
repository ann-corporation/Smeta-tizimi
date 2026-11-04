/**
 * «Парк объектининг молиявий таҳлили» (egasi 2026-10-27): 16 ko'rsatkich. Hisob bazada (`t2_moliya_tahlil_v1`) —
 * bu yerda faqat ko'rsatish (mlrd so'm), nomlar va Excel eksport (RU, egasi jadvali tartibida). Yangi formula yo'q.
 * NULL ≠ 0: noma'lum qiymat «—» bo'lib qoladi.
 */

export type MoliyaManba = 'tizim' | 'qolda' | 'hisoblangan';
export type MoliyaQolda = { qiymat: number; sana: string; kim: string | null; izoh: string | null; yaratildi: string } | null;
export type MoliyaKorsatkich = {
  n: number; kod: string; qiymat: number | null; formula: string; manba: MoliyaManba;
  qolda?: MoliyaQolda; tahrir?: boolean; tizim_qiymat?: number | null;
  ustamasiz?: number | null; ustamali_qqssiz?: number | null; nomalum_soni?: number;
  reestr?: number | null; reestr_soni?: number; akt_qqs_bilan?: number | null; yozuv_soni?: number;
};
export type MoliyaYoyilma = { obyekt_id: number; nom: string; fakt: number | null; f2: number | null; qmi: number | null };
export type MoliyaTahlilJavob = {
  ok: true; generated_at: string; qqs: 'bilan';
  qamrov: { kompaniya_id: number; obyekt_id: number | null; obyektlar: number[] };
  korsatkichlar: MoliyaKorsatkich[]; obyekt_yoyilma: MoliyaYoyilma[] | null; zanjir_xato_soni: number;
};

/** Egasi jadvalidagi nomlar (o'zbek lotin — i18n kaliti) va rasmiy RU nomlar (Excel). */
export const MOLIYA_NOM: Record<string, { uz: string; ru: string }> = {
  fakt: { uz: 'Fakt bajarilgan ish summasi', ru: 'Сумма фактически выполненных работ' },
  f2: { uz: 'Fakt F2 o‘tgan hajm summasi', ru: 'Сумма объёмов, прошедших по Ф-2' },
  f2_kutilgan: { uz: 'Kutilayotgan F2 hajm summasi', ru: 'Ожидаемая сумма объёмов по Ф-2' },
  f2_qilinmagan: { uz: 'Ish bajarilgan, F2 qilinmagan', ru: 'Работы выполнены, Ф-2 не оформлена' },
  tushgan: { uz: 'Buyurtmachidan tushgan mablag‘', ru: 'Поступило средств от заказчика' },
  f2_tushgan_farq: { uz: 'Tushgan mablag‘ga nisbatan F2 farqi', ru: 'Разница Ф-2 к поступившим средствам' },
  fakt_tushgan_farq: { uz: 'Fakt hajmga nisbatan tushgan mablag‘', ru: 'Разница факт. объёма к поступившим средствам' },
  sarf: { uz: 'Joriy sarflangan mablag‘', ru: 'Текущие израсходованные средства' },
  qarz: { uz: 'Joriy qarzdorlik', ru: 'Текущая задолженность (материалы, зарплата и т.д.)' },
  umumiy_sarf: { uz: 'Pudrat ishlari uchun umumiy sarf', ru: 'Общие расходы по подрядным работам' },
  yakunlash_talab: { uz: 'Yakunlash uchun talab qilinadigan mablag‘', ru: 'Средства, необходимые для завершения' },
  bajarilgan_xarajat_farq: { uz: 'Bajarilgan ishga nisbatan xarajat', ru: 'Разница выполненных работ и расходов' },
  tugatish_farq: { uz: 'Tugatishga ketadigan mablag‘ (bajarilgan ishga nisbatan)', ru: 'Средства на завершение (относительно выполненных работ)' },
  yakuniy_xarajat: { uz: 'Ish yakunlangandan keyingi taxminiy xarajat', ru: 'Ориентировочные расходы после завершения работ' },
  qmi: { uz: 'Taxminiy QMI summasi', ru: 'Ориентировочная сумма СМР' },
  yakuniy_farq: { uz: 'Yakuniy taxminiy farq (loyiha korrektirovkasi)', ru: 'Итоговая ориентировочная разница (корректировка проекта)' },
};

export const MLRD = 1e9;
/** So'm → mlrd so'm, 2 xona. null → «—» (0 emas). */
import { exceljsJadvalUslubi } from './hujjat-yozuvchi/exceljs-dizayn';

export function mlrd(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(Number(x))) return '—';
  return (Number(x) / MLRD).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Inline tahrir: «12,5» / «12.5» mlrd → so'm. Bo'sh → null (bekor). Noto'g'ri → undefined. */
export function mlrdOqi(matn: string): number | null | undefined {
  const s = matn.replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Math.round(Number(s) * MLRD * 100) / 100;
}

const FORMULA_RU: Record<string, string> = {
  fakt: 'Σ факт по смете → каскад накруток, с НДС',
  f2: 'Реестр Ф-2 (с НДС); при отсутствии — утверждённые акты Ф-2 → каскад накруток',
  f2_kutilgan: 'Вручную', tushgan: 'Σ платежей (сверка 1С), возвраты вычитаются', sarf: 'Σ расходов',
  qarz: 'Вручную', yakunlash_talab: 'Вручную', qmi: 'Смета ВСЕГО (с накрутками и НДС)',
};
const MANBA_RU: Record<MoliyaManba, string> = { tizim: 'Система', qolda: 'Вручную', hisoblangan: 'Расчёт' };

export async function moliyaXlsx(j: MoliyaTahlilJavob, o: { qamrovNomi: string; sana?: string }): Promise<{ bytes: Uint8Array; faylNomi: string }> {
  const sana = o.sana ?? new Date().toISOString().slice(0, 10);
  const ExcelJS = (await import('exceljs')).default; // og'ir kutubxona — faqat eksportda yuklanadi
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Финансовый анализ');
  ws.addRow([`ФИНАНСОВЫЙ АНАЛИЗ ОБЪЕКТА: ${o.qamrovNomi}`]).font = { bold: true, size: 13 };
  ws.addRow([`Дата формирования: ${sana} · млрд сум, с НДС`]);
  ws.addRow([]);
  const bosh = ws.addRow(['№', 'Показатель', 'Сумма, млрд сум', 'Формула', 'Источник', 'Введено (дата, кто)']);
  bosh.font = { bold: true }; bosh.alignment = { wrapText: true, vertical: 'middle' };
  for (const k of [...j.korsatkichlar].sort((a, b) => a.n - b.n)) {
    const q = k.manba === 'qolda' && k.qolda ? `${k.qolda.sana}${k.qolda.kim ? ' · ' + k.qolda.kim : ''}` : '';
    ws.addRow([k.n, MOLIYA_NOM[k.kod]?.ru ?? k.kod, k.qiymat == null ? null : Math.round((k.qiymat / MLRD) * 100) / 100,
      k.manba === 'hisoblangan' ? k.formula : (k.manba === 'qolda' ? 'Вручную' : FORMULA_RU[k.kod] ?? k.formula), MANBA_RU[k.manba], q]);
  }
  [5, 60, 18, 50, 12, 28].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(3).numFmt = '#,##0.00';
  exceljsJadvalUslubi(ws, { sarlavha: bosh.number, pulUstunlari: [3] });
  const buf = await wb.xlsx.writeBuffer();
  const toza = o.qamrovNomi.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'obyekt';
  return { bytes: new Uint8Array(buf as ArrayBuffer), faylNomi: `Finansovyy_analiz_${toza}_${sana.replace(/-/g, '')}.xlsx` };
}
