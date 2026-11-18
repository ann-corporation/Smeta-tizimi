/**
 * foto-hisobot.ts — «Фотоотчёт» eksporti (davr bo'yicha foto-dalil): Excel varag'i (rasmlar bilan) va chop etishga tayyor
 * HTML (brauzer «PDF sifatida saqlash» — kirill va rasmlar muammosiz). Rasmiy hujjat rus tilida (boshqa ish hujjatlari kabi).
 * Rasmlar hisobotga kichik nusxada (<=480 px) kiradi — fayl hajmi nazoratda; asl foto R2 da qoladi.
 */
import { hisobotQatorlari, type FotoElement, type HisobotQator } from './foto-dalil';
import { BELGI_CHIZIQ, BELGI_VIEWBOX, BELGI_YOLLAR } from './imzo/qr-belgi';
import { joriyHujjatDizayni } from './hujjat-yozuvchi/dizayn';

export const HISOBOT_MAX_FOTO = 300;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type HisobotOpts = { obyektNomi: string; dan: string | null; gacha: string | null; sana?: string; logo?: boolean };

/** QURAI belgisi (inline SVG: yangi oynada tashqi fayl yo'liga bog'liq emas) + sarlavha va pastki kolontitul uchun CSS. */
function logoBelgisiSvg(): string {
  const v = BELGI_VIEWBOX;
  return `<svg class="qlogo" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="22" height="22" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QURAI"><g fill="none" stroke="#000" stroke-width="${BELGI_CHIZIQ}">${BELGI_YOLLAR.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;
}
export const LOGO_CSS = '.qhead{display:flex;align-items:center;gap:6px;border-bottom:1px solid #bbb;padding-bottom:4px;margin-bottom:8px;font:700 13px Arial,sans-serif;letter-spacing:.12em}'
  + '.qfoot{position:fixed;left:0;right:0;bottom:0;font-size:8px;color:#808080;border-top:1px solid #ddd;padding-top:2px;background:#fff;text-align:center}@media screen{.qfoot{display:none}}';
export type BlobOl = (documentId: number) => Promise<Blob | null>;

/**
 * Hisobotning BARQAROR mazmun kaliti (token xeshi uchun): obyekt + davr + tanlangan foto id lari. Fayl baytlari har safar
 * boshqacha (sana, exceljs metadata), shuning uchun «qayta yuklash bepul» shu kalit xeshi bo'yicha ishlaydi.
 */
export function hisobotKalit(fotolar: readonly FotoElement[], o: { obyektId: number; dan: string | null; gacha: string | null }): Uint8Array {
  const { qatorlar } = hisobotTanla(fotolar, o.dan, o.gacha);
  const s = `foto-hisobot|${o.obyektId}|${o.dan ?? ''}|${o.gacha ?? ''}|${qatorlar.map((q) => q.fotoId).sort((a, b) => a - b).join(',')}`;
  return new TextEncoder().encode(s);
}

export const davrMatni = (dan: string | null, gacha: string | null) => (dan || gacha ? `${dan ?? '…'} — ${gacha ?? '…'}` : 'весь период');

/** Hisobotga kiradigan qatorlar (davr bo'yicha) va ortiqcha sonini qaytaradi. */
export function hisobotTanla(fotolar: readonly FotoElement[], dan: string | null, gacha: string | null): { qatorlar: HisobotQator[]; ortiqcha: number } {
  const hammasi = hisobotQatorlari(fotolar, dan, gacha);
  return { qatorlar: hammasi.slice(0, HISOBOT_MAX_FOTO), ortiqcha: Math.max(0, hammasi.length - HISOBOT_MAX_FOTO) };
}

/** Blobdan eng uzun tomoni <=maxTomon bo'lgan JPEG nusxa (bayt + dataURL). */
export async function kichikRasm(blob: Blob, maxTomon = 480): Promise<{ bytes: Uint8Array; dataUrl: string; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const k = Math.min(1, maxTomon / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)); const h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d')?.drawImage(bmp, 0, 0, w, h); bmp.close?.();
    const dataUrl = c.toDataURL('image/jpeg', 0.75);
    const bin = atob(dataUrl.split(',')[1] ?? ''); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, dataUrl, w, h };
  } catch { return null; }
}

export async function fotoHisobotXlsx(fotolar: readonly FotoElement[], o: HisobotOpts, blobOl: BlobOl): Promise<{ bytes: Uint8Array; faylNomi: string; soni: number; ortiqcha: number }> {
  const { qatorlar, ortiqcha } = hisobotTanla(fotolar, o.dan, o.gacha);
  const ExcelJS = (await import('exceljs')).default; // og'ir kutubxona — faqat eksportda yuklanadi
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Фотоотчёт');
  ws.addRow(['ФОТООТЧЁТ О ХОДЕ СТРОИТЕЛЬСТВА']).font = { bold: true, size: 13 };
  ws.addRow([`Объект: ${o.obyektNomi}`]);
  ws.addRow([`Период: ${davrMatni(o.dan, o.gacha)}`]);
  ws.addRow([`Дата формирования: ${o.sana ?? new Date().toISOString().slice(0, 10)}`]);
  ws.addRow([]);
  const bosh = ws.addRow(['№', 'Дата', 'Раздел', 'Работа / документ', 'Примечание', 'Фото']);
  bosh.font = { bold: true }; bosh.alignment = { wrapText: true, vertical: 'middle' };
  [5, 12, 30, 40, 40, 34].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let i = 0; i < qatorlar.length; i++) {
    const q = qatorlar[i];
    const r = ws.addRow([i + 1, q.sana, q.razdel, q.manba, q.izoh, '']);
    r.alignment = { wrapText: true, vertical: 'top' };
    const blob = await blobOl(q.documentId);
    const rasm = blob ? await kichikRasm(blob, 320) : null;
    if (rasm) {
      const id = wb.addImage({ buffer: rasm.bytes as unknown as ArrayBuffer, extension: 'jpeg' });
      const eni = 240; const boyi = Math.round((eni * rasm.h) / rasm.w);
      r.height = Math.max(30, boyi * 0.75 + 6);
      ws.addImage(id, { tl: { col: 5, row: r.number - 1 }, ext: { width: eni, height: boyi } });
    } else { r.getCell(6).value = '(rasm o‘qilmadi)'; }
  }
  // Chop: A4, bir sahifa eniga, sarlavha qatori har sahifada (egasi 2026-11-13: tizimdagi hamma hujjat bir xil).
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${bosh.number}:${bosh.number}` };
  if (ortiqcha) ws.addRow([`… ещё ${ortiqcha} фото не вошло (лимит ${HISOBOT_MAX_FOTO}); сузьте период.`]);
  const buf = await wb.xlsx.writeBuffer();
  const toza = o.obyektNomi.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'obyekt';
  return { bytes: new Uint8Array(buf as ArrayBuffer), faylNomi: `Fotootchet_${toza}_${(o.sana ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '')}.xlsx`, soni: qatorlar.length, ortiqcha };
}

/** Chop etishga tayyor HTML (A4, har sahifada 2 ustun). */
export async function fotoHisobotHtml(fotolar: readonly FotoElement[], o: HisobotOpts, blobOl: BlobOl): Promise<{ html: string; soni: number; ortiqcha: number }> {
  const { qatorlar, ortiqcha } = hisobotTanla(fotolar, o.dan, o.gacha);
  const kartalar: string[] = [];
  for (const q of qatorlar) {
    const blob = await blobOl(q.documentId);
    const rasm = blob ? await kichikRasm(blob, 640) : null;
    kartalar.push(`<figure>${rasm ? `<img src="${rasm.dataUrl}" alt="">` : '<div class="yoq">(rasm o‘qilmadi)</div>'}<figcaption><b>${esc(q.sana)}</b> · ${esc(q.razdel)}<br>${esc(q.manba)}${q.izoh ? `<br><i>${esc(q.izoh)}</i>` : ''}</figcaption></figure>`);
  }
  const logo = o.logo ?? joriyHujjatDizayni().logoKolontitul;
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Фотоотчёт</title><style>
${logo ? `${LOGO_CSS}.g{padding-bottom:14px}\n` : ''}@page{size:A4;margin:12mm}body{font:12px/1.35 Arial,sans-serif;color:#111}h1{font-size:16px;margin:0 0 4px}p{margin:2px 0}
.g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}figure{margin:0;break-inside:avoid;border:1px solid #bbb;padding:4px}
img{width:100%;height:auto;display:block}figcaption{font-size:11px;margin-top:3px}.yoq{padding:30px;text-align:center;color:#777}
</style></head><body>${logo ? `<div class="qhead">${logoBelgisiSvg()}<span>QURAI</span></div>` : ''}<h1>ФОТООТЧЁТ О ХОДЕ СТРОИТЕЛЬСТВА</h1><p>Объект: ${esc(o.obyektNomi)}</p><p>Период: ${esc(davrMatni(o.dan, o.gacha))}</p>
<p>Дата формирования: ${esc(o.sana ?? new Date().toISOString().slice(0, 10))} · Фото: ${qatorlar.length}${ortiqcha ? ` (ещё ${ortiqcha} не вошло, лимит ${HISOBOT_MAX_FOTO})` : ''}</p>
<div class="g">${kartalar.join('')}</div>${logo ? '<div class="qfoot">QURAI · qurai.uz orqali tayyorlandi</div>' : ''}</body></html>`;
  return { html, soni: qatorlar.length, ortiqcha };
}
