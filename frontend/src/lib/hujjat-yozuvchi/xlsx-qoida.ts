/**
 * hujjat-yozuvchi/xlsx-qoida.ts — HAR QANDAY tayyor .xlsx (rasmiy yozuvchi, exceljs, xlsx-js-style — qaysi generator
 * chiqarganidan qat'i nazar) uchun UMUMIY hujjat qoidalari (egasi 2026-11-13). Testlar uchun; exceljs bilan o'qiydi.
 *
 *   1. shrinkToFit YO'Q (matn kichrayib ketmasin — o'raladi);
 *   2. yashirin ustun katagi o'ralmagan;
 *   3. son katagi o'ralmagan;
 *   4. qator balandligi: ko'rinadigan o'ralgan matn sig'ishi uchun yetarli; ko'rinadigan matn bir qatorli bo'lsa — SUKUT balandlik
 *      (yashirin ustun qatorni semirtirmaydi);
 *   5. chop: bir sahifa eniga sig'ish (fitToWidth=1), yo'nalish, qog'oz; uzun jadvalda sarlavha qatorlari takrorlanadi.
 * Dizayn tekshiruvi (`hujjatDizaynTekshir`) — faqat RasmiyVaraq uchun (uslub XML ini o'qiydi); bu esa har fayl uchun.
 */
import ExcelJS from 'exceljs';
import { qatorBalandligi, SUKUT_QATOR_PT, type BalandlikKatak } from './qator-balandlik';

type Katak = ExcelJS.Cell;

const UZUN_JADVAL = 15;
const matnOl = (v: ExcelJS.CellValue): { matn: string | null; son: boolean } => {
  if (v == null) return { matn: null, son: false };
  if (typeof v === 'number') return { matn: null, son: true };
  if (typeof v === 'string') return { matn: v, son: false };
  if (v instanceof Date) return { matn: null, son: true };
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if (typeof o.result === 'number') return { matn: null, son: true };
    if (typeof o.result === 'string') return { matn: o.result, son: false };
    if (o.richText) return { matn: o.richText.map((t) => t.text).join(''), son: false };
    if (typeof o.text === 'string') return { matn: o.text, son: false };
  }
  return { matn: null, son: false };
};

export async function xlsxQoidaTekshir(bytes: Uint8Array, o?: { qatorMaks?: number }): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const xato: string[] = [];
  const maks = o?.qatorMaks ?? 3;
  for (const ws of wb.worksheets) {
    const nom = `«${ws.name}»`;
    const ustunSoni = ws.columnCount;
    const yashirin = (c: number): boolean => ws.getColumn(c).hidden === true;
    // birlashma: boshlang'ich katak → oxirgi ustun
    const birlashma = new Map<string, number>();
    const tikBirlashma = new Set<string>(); // ko'p qatorli birlashma — balandlik bir necha qatorga bo'linadi (tekshirilmaydi)
    for (const m of ((ws.model as { merges?: string[] }).merges ?? [])) {
      const [a, b] = m.split(':');
      const col = (s: string) => [...s.replace(/\d+/g, '')].reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0);
      birlashma.set(a, col(b ?? a));
      if (b && Number(a.replace(/\D+/g, '')) !== Number(b.replace(/\D+/g, ''))) tikBirlashma.add(a);
    }
    // Sarlavha qatorlari (Print_Titles) — dizayn bo'yicha aniq balandlik: «ortiqcha baland» tekshirilmaydi.
    const [t1, t2] = (ws.pageSetup.printTitlesRow ?? '').split(':').map((x) => Number(x.replace(/\D+/g, '')));
    const sarlavhaQatori = (r: number): boolean => Number.isFinite(t1) && r >= t1 && r <= (Number.isFinite(t2) ? t2 : t1);
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const kataklar: BalandlikKatak[] = [];
      const korinadiganKataklar: BalandlikKatak[] = [];
      let korinadiganO = false;
      let yashirinKerak: number | undefined; // yashirin ustun matni o'ralganda nechta qator kerak bo'lardi
      row.eachCell({ includeEmpty: false }, (cell: Katak, c) => {
        const al = cell.alignment ?? {};
        const { matn, son } = matnOl(cell.value);
        if (al.shrinkToFit) xato.push(`${nom} ${cell.address}: shrinkToFit (matn kichrayadi — o'rash kerak)`);
        if (yashirin(c) && al.wrapText) xato.push(`${nom} ${cell.address}: yashirin ustun katagi o'ralgan`);
        if (son && al.wrapText && !yashirin(c)) xato.push(`${nom} ${cell.address}: son katagi o'ralgan`);
        if (cell.isMerged && cell.master.address !== cell.address) return;
        if (tikBirlashma.has(cell.address)) return;
        if (yashirin(c) && matn) {
          const yb = qatorBalandligi([{ matn, eni: ws.getColumn(c).width ?? 9, qalin: !!cell.font?.bold, sz: cell.font?.size ?? 10 }]);
          if (yb != null) yashirinKerak = Math.max(yashirinKerak ?? 0, yb);
        }
        if (!al.wrapText || matn == null) return;
        const oxir = birlashma.get(cell.address) ?? c;
        let eni = 0;
        for (let k = c; k <= oxir && k <= ustunSoni; k++) if (!yashirin(k)) eni += ws.getColumn(k).width ?? 9;
        const b: BalandlikKatak = { matn, eni, yashirin: yashirin(c), qalin: !!cell.font?.bold, sz: cell.font?.size ?? 10, otstup: al.indent ?? 0 };
        kataklar.push(b);
        if (!yashirin(c)) { korinadiganO = true; korinadiganKataklar.push(b); }
      });
      const kerak = qatorBalandligi(korinadiganKataklar, { maks });
      const ht = row.height; // undefined — sukut
      if (ht == null && kerak != null) xato.push(`${nom} ${r}-qator: o'ralgan matn uchun balandlik berilmagan (matn kesiladi)`);
      // Yashirin ustun matni qatorni semirtirmasin: ko'rinadigan matn bir qatorli bo'lsa — sukut balandlik.
      if (ht != null && ht > SUKUT_QATOR_PT + 2 && korinadiganO && kerak == null && yashirinKerak != null && !sarlavhaQatori(r)) {
        xato.push(`${nom} ${r}-qator: balandlik ${ht}, ko'rinadigan matn esa bir qatorli (yashirin ustun semirtirgan)`);
      }
    });
    const ps = ws.pageSetup;
    if (!ps.fitToPage || (ps.fitToWidth ?? 1) !== 1) xato.push(`${nom}: chop — bir sahifa eniga (fitToPage + fitToWidth=1) o'rnatilmagan`);
    if (ps.orientation !== 'portrait' && ps.orientation !== 'landscape') xato.push(`${nom}: chop yo'nalishi (orientation) berilmagan`);
    if (ws.rowCount > UZUN_JADVAL && !ps.printTitlesRow) xato.push(`${nom}: sarlavha qatorlari har sahifada takrorlanmaydi (printTitlesRow yo'q)`);
  }
  return xato;
}
