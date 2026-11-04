/**
 * Qarzdorlik Excel eksporti - egasining «ОБОСНОВАНИЕ ЗАДОЛЖЕННОСТИ» shabloni bilan bir xil joylashuv:
 * A № | B Наименование / содержание | C Контрагент / документ-основание | D Дата | E Ед. изм. | F Кол-во | G Цена |
 * H Сумма договора | I Поставлено / выполнено | J Оплачено | K Задолженность (+ мы должны, − нам должны) | L Примечание | M тип (П/О)
 * + qo'shimcha: N «По справке», O «Разница (ФАРК)» (faqat pozitsiya qatorida).
 * Ko'k qator = pozitsiya (shartnoma), ostida asos qatorlari. Eksport shu parser (parse.ts) bilan qayta o'qiladi (aylanma).
 */
import { qarzHisobla, qatorSumma, type AsosQator } from './hisob';

export type EksportShartnoma = {
  kontragent: string;
  nom: string | null;
  predmet?: string | null;
  raqam?: string | null;
  summa: number | null;
  spravkaQarz: number | null;
  tolovT2?: number | null;
  qatorlar: ReadonlyArray<AsosQator>;
};

const SANA_FMT = 'dd.mm.yyyy';
const PUL_FMT = '#,##0.00;[Red]-#,##0.00;"–"';
const SON_FMT = '#,##0.###;[Red]-#,##0.###;"–"';

const TUR_NOM: Record<AsosQator['tur'], string> = {
  yetkazib_berish: 'Поставка', bajarilgan_ish: 'Выполненные работы', tolov: 'Оплата', boshlangich_qoldiq: 'Начальный остаток',
};

function sanaDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
}

import { exceljsJadvalUslubi, joriyHujjatDizayni } from '../hujjat-yozuvchi';

export async function qarzdorlikXlsxYarat(shartnomalar: ReadonlyArray<EksportShartnoma>): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Обоснование задолженности', { views: [{ state: 'frozen', ySplit: 4, xSplit: 0 }] });
  const keng = [6, 38, 30, 11, 8, 11, 14, 17, 17, 17, 19, 24, 4, 17, 17];
  keng.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const shrift = { name: 'Arial', size: 10 };

  ws.mergeCells(1, 1, 1, 12);
  ws.getCell(1, 1).value = 'ОБОСНОВАНИЕ ЗАДОЛЖЕННОСТИ ПЕРЕД ПОСТАВЩИКАМИ И СУБПОДРЯДЧИКАМИ';
  ws.getCell(1, 1).font = { ...shrift, bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, 12);
  ws.getCell(2, 1).value = 'Синяя строка — позиция (контрагент и сумма договора). Под ней — основания: поставка или выполнение (кол-во × цена) либо оплата. Итоги позиции считаются автоматически. Все суммы с НДС.';
  ws.getCell(2, 1).font = { ...shrift, italic: true };
  ws.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(2).height = 30;

  const bosh = ['№', 'Наименование / содержание', 'Контрагент / документ-основание', 'Дата', 'Ед. изм.', 'Кол-во', 'Цена', 'Сумма договора', 'Поставлено / выполнено', 'Оплачено',
    'Задолженность (+ мы должны, − нам должны)', 'Примечание', 'тип', 'По справке', 'Разница (ФАРК)'];
  const hr = ws.getRow(4);
  bosh.forEach((v, i) => {
    const c = hr.getCell(i + 1);
    c.value = v;
    c.font = { ...shrift, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });
  hr.height = 32;

  let r = 5; const pozQatorlar: number[] = [];
  shartnomalar.forEach((sh, si) => {
    const hisob = qarzHisobla({ qatorlar: sh.qatorlar, tolovT2: sh.tolovT2 ?? null, shartnomaSumma: sh.summa, spravkaQarz: sh.spravkaQarz });
    const pr = r; pozQatorlar.push(pr); r++;
    const fr = r; const lr = r + sh.qatorlar.length - 1;
    sh.qatorlar.forEach((q, qi) => {
      const row = ws.getRow(r);
      const summa = qatorSumma(q);
      row.getCell(1).value = `${si + 1}.${qi + 1}`;
      row.getCell(2).value = q.nomi ?? TUR_NOM[q.tur];
      row.getCell(3).value = q.hujjat_raqam ?? '';
      const d = sanaDate(q.sana); if (d) { row.getCell(4).value = d; row.getCell(4).numFmt = SANA_FMT; }
      if (q.birlik) row.getCell(5).value = q.birlik;
      if (q.hajm != null) { row.getCell(6).value = q.hajm; row.getCell(6).numFmt = SON_FMT; }
      if (q.narx != null) { row.getCell(7).value = q.narx; row.getCell(7).numFmt = PUL_FMT; }
      if (q.tur === 'tolov') {
        if (summa != null) row.getCell(10).value = summa;
      } else if (summa != null) {
        row.getCell(9).value = q.hajm != null && q.narx != null && q.summa == null ? { formula: `F${r}*G${r}`, result: summa } : summa;
      }
      if (q.izoh) row.getCell(12).value = q.izoh;
      row.getCell(13).value = 'О';
      for (let c = 1; c <= 13; c++) { row.getCell(c).font = shrift; }
      for (const c of [9, 10]) row.getCell(c).numFmt = PUL_FMT;
      r++;
    });

    const row = ws.getRow(pr);
    row.getCell(1).value = si + 1;
    row.getCell(2).value = sh.predmet ?? sh.nom ?? '';
    row.getCell(3).value = sh.kontragent;
    if (sh.summa != null) row.getCell(8).value = sh.summa;
    const yet = (hisob.boshlangich ?? 0) + (hisob.qabul ?? 0);
    const sumI = sh.qatorlar.length ? { formula: `SUM(I${fr}:I${lr})`, result: yet } : (hisob.boshlangich == null && hisob.qabul == null ? null : yet);
    const sumJ = sh.qatorlar.length ? { formula: `SUM(J${fr}:J${lr})`, result: hisob.tolangan ?? 0 } : (hisob.tolangan ?? null);
    if (sumI != null) row.getCell(9).value = sumI;
    if (sumJ != null) row.getCell(10).value = sumJ;
    // t2_tolov dagi to'lov asos qatorida bo'lmasligi mumkin - formulasiz, qiymat bilan (hisob bilan bir xil bo'lishi uchun)
    if ((sh.tolovT2 ?? null) != null) row.getCell(10).value = hisob.tolangan ?? 0;
    if (hisob.qarz != null) row.getCell(11).value = { formula: `I${pr}-J${pr}`, result: hisob.qarz };
    if (sh.spravkaQarz != null) {
      row.getCell(14).value = sh.spravkaQarz;
      if (hisob.farq != null) row.getCell(15).value = { formula: `K${pr}-N${pr}`, result: hisob.farq };
    }
    row.getCell(13).value = 'П';
    for (let c = 1; c <= 15; c++) {
      const cell = row.getCell(c);
      cell.font = { ...shrift, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    }
    for (const c of [8, 9, 10, 11, 14, 15]) row.getCell(c).numFmt = PUL_FMT;
  });

  // Jami
  const jr = ws.getRow(r + 1);
  const jamiH = shartnomalar.reduce((a, s) => a + (s.summa ?? 0), 0);
  const hisoblar = shartnomalar.map((s) => qarzHisobla({ qatorlar: s.qatorlar, tolovT2: s.tolovT2 ?? null, shartnomaSumma: s.summa, spravkaQarz: s.spravkaQarz }));
  const jamiI = hisoblar.reduce((a, h) => a + (h.boshlangich ?? 0) + (h.qabul ?? 0), 0);
  const jamiJ = hisoblar.reduce((a, h) => a + (h.tolangan ?? 0), 0);
  const jamiK = hisoblar.reduce((a, h) => a + (h.qarz ?? 0), 0);
  const sumFormula = (col: string, res: number) => ({ formula: pozQatorlar.length ? pozQatorlar.map((p) => `${col}${p}`).join('+') : '0', result: res });
  jr.getCell(1).value = 'ИТОГО ПО ВСЕМ ПОЗИЦИЯМ';
  jr.getCell(8).value = sumFormula('H', jamiH); jr.getCell(9).value = sumFormula('I', jamiI);
  jr.getCell(10).value = sumFormula('J', jamiJ); jr.getCell(11).value = sumFormula('K', jamiK);
  for (let c = 1; c <= 15; c++) {
    const cell = jr.getCell(c);
    cell.font = { ...shrift, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
    if (c >= 8) cell.numFmt = PUL_FMT;
  }
  const darajalar = new Map<number, 'bl' | 'vsego'>(pozQatorlar.map((q) => [q, 'bl'] as const));
  darajalar.set(r + 1, 'vsego');
  exceljsJadvalUslubi(ws, { sarlavha: 4, oxir: r + 1, darajalar, yonalish: 'landscape' });
  // Qator turi belgisi (13-ustun) texnik: dizaynda ko'rsatish o'chiq bo'lsa yashirin (asl qiymat o'qishga qoladi).
  if (!joriyHujjatDizayni().tipKorsat) ws.getColumn(13).hidden = true;
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
