// Ombor «Приход» variant guruhlari hisoboti (TAKLIF, birlashtirish tasdiq kutadi).
// Ishlatish: node --experimental-strip-types scripts/ombor-variantlar.mjs [kirish.json] [chiqish.xlsx]
// Kirish/chiqish sukut bo'yicha C:\Temp\ombor-data\ (haqiqiy ma'lumot GITga tushmaydi).
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { guruhla, birlikKaliti } from '../src/lib/ombor-moslash/moslash.ts';

const kirishYol = process.argv[2] || 'C:/Temp/ombor-data/prixod.json';
const chiqishYol = process.argv[3] || 'C:/Temp/ombor-data/variantlar.xlsx';
const qatorlar = JSON.parse(fs.readFileSync(kirishYol, 'utf8'));
const sanash = new Map();
for (const q of qatorlar) {
  const k = q.nomi + '\u0001' + q.birligi;
  const e = sanash.get(k) ?? { nomi: q.nomi, birligi: q.birligi, soni: 0 };
  e.soni++; sanash.set(k, e);
}
const guruhlar = guruhla([...sanash.values()], 0.8);
const kopVariant = guruhlar.filter((g) => g.variantlar.length > 1);

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Variant guruhlari');
ws.columns = [
  { header: '№', key: 'n', width: 6 }, { header: 'Kanonik (taklif)', key: 'k', width: 46 }, { header: 'Birlik', key: 'b', width: 9 },
  { header: 'Variantlar soni', key: 'vs', width: 10 }, { header: 'Qatorlar jami', key: 'j', width: 10 },
  { header: 'Eng past ball', key: 'ball', width: 10 }, { header: 'Variantlar (yozuv × necha marta)', key: 'v', width: 110 },
  { header: 'Tasdiq (ha/yo\'q)', key: 't', width: 14 },
];
ws.getRow(1).font = { bold: true };
kopVariant.forEach((g, i) => ws.addRow({ n: i + 1, k: g.kanonik, b: g.birligi, vs: g.variantlar.length, j: g.jami, ball: Math.round(g.minBall * 100) / 100,
  v: g.variantlar.map((v) => `${v.nomi} ×${v.soni}`).join(' | '), t: '' }));
ws.views = [{ state: 'frozen', ySplit: 1 }];
ws.autoFilter = { from: 'A1', to: 'H1' };
const ws2 = wb.addWorksheet('Xulosa');
ws2.addRows([
  ['Kirish qatorlari', qatorlar.length], ['Noyob (nom, birlik)', sanash.size], ['Guruhlar jami', guruhlar.length],
  ['Bir nechta variantli guruhlar', kopVariant.length], ['Birlashtirilsa kamayadigan nomlar', sanash.size - guruhlar.length],
  ['Eslatma', 'Bu TAKLIF. Tasdiqlangunga qadar hech narsa birlashtirilmaydi (t2_material_alias ga yozilmaydi).'],
]);
await wb.xlsx.writeFile(chiqishYol);
// alias taklifi JSON (tasdiqdan keyin import skripti ishlatadi): faqat kanonikdan farqli variantlar
const alias = [];
for (const g of kopVariant) for (const v of g.variantlar) if (v.nomi !== g.kanonik) alias.push({ alias_nom: v.nomi, kanonik_nom: g.kanonik, birlik: g.birligi, birlik_kaliti: birlikKaliti(g.birligi), ball: g.minBall });
fs.writeFileSync(chiqishYol.replace(/\.xlsx$/, '-alias-taklif.json'), JSON.stringify(alias));
console.log(JSON.stringify({ qatorlar: qatorlar.length, noyob: sanash.size, guruhlar: guruhlar.length, kopVariantli: kopVariant.length, aliasTaklif: alias.length, chiqish: chiqishYol }));
