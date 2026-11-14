/* ABC4 (АВС) RESURS katalogini o'qib toza CSV+JSON ga chiqaradi.
 * Manba: C:\abc4uz_2021.4\Base\RESURS\resur  (CP1251, delimiter ' va *)
 * Format: ID'''Ном'Бирлик''  (yozuvlar * bilan ajratilgan)
 * Ishga tushirish: node abc_parse_resur.js
 */
const fs = require('fs');
const SRC = 'C:/abc4uz_2021.4/Base/RESURS/resur';
const OUT_CSV = 'C:/Users/PC/Documents/GAS/abc_resurs.csv';
const OUT_JSON = 'C:/Users/PC/Documents/GAS/abc_resurs.json';

const buf = fs.readFileSync(SRC);
const text = new TextDecoder('windows-1251').decode(buf);

const recs = text.split('*');
const rows = [];
let bad = 0;
for (const rec of recs) {
  if (!rec.trim()) continue;
  const f = rec.split("'");          // [id,'','',nom,birlik,...]
  const id = (f[0] || '').trim();
  const nom = (f[3] || '').trim();
  const bir = (f[4] || '').trim();
  if (!/^\d+$/.test(id) || !nom) { bad++; continue; }
  rows.push({ id, nom, birlik: bir });
}

// CSV (; ajratgich, qo'shtirnoq ichida)
function csvCell(s){ return '"' + String(s).replace(/"/g,'""') + '"'; }
const csv = ['id;nom;birlik']
  .concat(rows.map(r => [r.id, csvCell(r.nom), csvCell(r.birlik)].join(';')))
  .join('\r\n');
fs.writeFileSync(OUT_CSV, '﻿' + csv, 'utf8');     // BOM — Excel kirillni to'g'ri ochsin
fs.writeFileSync(OUT_JSON, JSON.stringify(rows), 'utf8');

// Birlik statistikasi (tekshiruv uchun)
const uStat = {};
for (const r of rows) uStat[r.birlik] = (uStat[r.birlik]||0)+1;
const topU = Object.entries(uStat).sort((a,b)=>b[1]-a[1]).slice(0,12);

console.log('Jami yozuv:', recs.length, '| Toza resurs:', rows.length, '| Tashlangan:', bad);
console.log('CSV:', OUT_CSV);
console.log('JSON:', OUT_JSON);
console.log('Eng ko\'p birliklar:', JSON.stringify(topU));
console.log('Namuna (oxirgi 5):');
rows.slice(-5).forEach(r => console.log('  ', r.id, '|', r.nom, '|', r.birlik));
