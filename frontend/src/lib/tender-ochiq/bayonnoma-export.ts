/**
 * Tender bayonnomasi (ochilish va g'olib) — Excel hujjat. Jami kataklar FORMULA bilan (hisob yadro qoidasi + token sanog'i: tizim hisoblagan kataklar);
 * narxsiz qator bo'lsa jami «—» (0 emas). Faylda vaqt belgisi YO'Q: bir xil mazmun bir xil xesh beradi — qayta yuklash token yechmaydi (lib/token-hujjat).
 * Hujjat turi: hujjat-dvigatel `tender_bayonnoma`, token kaliti TENDER_BAYONNOMA.
 */
import type { Bayonnoma } from '../../api/t2-tender-ochiq';

const ustun = (n: number): string => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };

export async function bayonnomaXlsx(b: Bayonnoma): Promise<{ bytes: Uint8Array; faylNomi: string }> {
  const ExcelJS = (await import('exceljs')).default; // og'ir kutubxona — faqat eksportda yuklanadi
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(0); wb.modified = new Date(0);
  const ws = wb.addWorksheet('Bayonnoma');
  const yaroqli = b.takliflar.filter((t) => ['berildi', 'faol', 'golib', 'yutqazdi'].includes(t.holat));
  const t = b.tender;
  ws.addRow([`Tender bayonnomasi № ${t.raqam ?? t.id}`]); ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([t.nom]);
  ws.addRow(['Taklif muddati', t.muddat ?? '—', 'Ochilgan', t.ochilgan_vaqt ?? '—', 'Holat', t.holat]);
  ws.addRow(['Narxlar QQS siz (birlik narxi); jami = hajm × narx. Narxsiz qator bo‘lsa jami «—».']);
  ws.addRow([]);
  const bosh = ['№', 'Pozitsiya', 'Birlik', 'Hajm', ...yaroqli.map((x) => x.kompaniya)];
  const hr = ws.addRow(bosh); hr.font = { bold: true };
  const birinchi = hr.number + 1;
  b.qatorlar.forEach((q, i) => {
    const narxlar = yaroqli.map((x) => (x.qatorlar ?? []).find((z) => z.qator_no === q.qator_no)?.narx ?? null);
    ws.addRow([i + 1, q.nom, q.birlik, q.miqdor, ...narxlar.map((n) => (n == null ? '—' : n))]);
  });
  const oxirgi = birinchi + b.qatorlar.length - 1;
  const jami = ws.addRow(['', 'JAMI (QQS siz)', '', '', ...yaroqli.map((_, i) => {
    const c = ustun(5 + i);
    if (b.qatorlar.length === 0) return '—';
    return { formula: `IF(COUNT(${c}${birinchi}:${c}${oxirgi})<ROWS(${c}${birinchi}:${c}${oxirgi}),"—",SUMPRODUCT($D${birinchi}:$D${oxirgi},${c}${birinchi}:${c}${oxirgi}))` };
  })]);
  jami.font = { bold: true };
  ws.addRow([]);
  ws.addRow(['Muddat (kun, eng uzun)', '', '', '', ...yaroqli.map((x) => Math.max(0, ...((x.qatorlar ?? []).map((q) => q.muddat_kun ?? 0))) || '—')]);
  ws.addRow(['Kafolat (oy)', '', '', '', ...yaroqli.map((x) => x.kafolat_oy ?? '—')]);
  ws.addRow([]);
  if (b.ogohlantirishlar.length) {
    ws.addRow(['Kelishuv signallari (hukm emas, tekshirish uchun):']).font = { bold: true };
    for (const o of b.ogohlantirishlar) ws.addRow([o.tur, `takliflar: ${o.taklif_idlar.join(', ')}`]);
    ws.addRow([]);
  }
  ws.addRow(['G‘olib asosi', t.golib_asos ?? '—']);
  ws.addRow([]);
  ws.addRow(['Hodisalar jurnali (o‘zgarmas)']).font = { bold: true };
  ws.addRow(['№', 'Hodisa', 'Vaqt', 'Foydalanuvchi']);
  for (const j of b.jurnal) ws.addRow([j.id, j.hodisa, j.vaqt, j.actor_id ?? '—']);
  ws.addRow([]);
  ws.addRow(['Mazmun xeshi', b.xesh]);
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 40 : 18; });
  const buf = await wb.xlsx.writeBuffer();
  return { bytes: new Uint8Array(buf as ArrayBuffer), faylNomi: `tender-bayonnoma-${t.raqam ?? t.id}.xlsx`.replace(/[^\w.-]+/g, '_') };
}
