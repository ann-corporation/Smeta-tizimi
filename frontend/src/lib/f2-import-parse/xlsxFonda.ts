/**
 * `readXlsxFonda` — Excelni Web Worker da o'qiydi; Worker bo'lmasa (test/jsdom,
 * eski brauzer) yoki Worker yiqilsa — asosiy oqimdagi `readXlsx` ga qaytadi
 * (natija bir xil, faqat tezlik farq qiladi). Barcha yuklash sahifalari shu
 * funksiyadan foydalanadi.
 */
import { readXlsx, type XlsxSheet, type XlsxWorkbook } from './xlsxReader';

let keyingiId = 1;

/** Legacy BIFF8 `.xls` fayllarida SheetJS natijasini Worker'dan
 * `postMessage` bilan qaytarish katta varaqlarda Chromium call-stack'ini
 * to'ldirishi mumkin. Bunday faylni mavjud asosiy oqim reader'i xavfsizroq
 * qayta ishlaydi; `.xlsx` esa odatdagidek Worker'da qoladi. */
function legacyXls(bytes: ArrayBuffer | Uint8Array): boolean {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
    && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;
}

function kitob(sheets: XlsxSheet[]): XlsxWorkbook {
  return { sheets, sheet: (name: string) => sheets.find((s) => s.name === name) ?? null };
}

export async function readXlsxFonda(bytes: ArrayBuffer | Uint8Array): Promise<XlsxWorkbook> {
  if (legacyXls(bytes)) return readXlsx(bytes);
  if (typeof Worker === 'undefined' || typeof URL === 'undefined') return readXlsx(bytes);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./xlsxReader.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return readXlsx(bytes);
  }
  // Nusxa uzatiladi (transfer): chaqiruvchining buferi o'zgarmay qoladi.
  const nusxa = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes.slice(0);
  const id = keyingiId++;
  try {
    return await new Promise<XlsxWorkbook>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; sheets?: XlsxSheet[]; error?: string }>) => {
        if (e.data.id !== id) return;
        if (e.data.ok && e.data.sheets) resolve(kitob(e.data.sheets));
        else reject(new Error(e.data.error || 'XLSX_WORKER_XATO'));
      };
      worker.onerror = (e) => { e.preventDefault?.(); reject(new Error('XLSX_WORKER_YIQILDI')); };
      worker.postMessage({ id, bytes: nusxa }, [nusxa as ArrayBuffer]);
    });
  } catch (workerError) {
    // Worker natijani clone qila olmasa (katta jadval/call-stack), original
    // bufer hali bizda bor: asosiy oqim reader'i bilan davom etamiz. Faqat
    // fallback ham yiqilsa uning aniq format xatosini qaytaramiz.
    try {
      return readXlsx(bytes);
    } catch (fallbackError) {
      throw fallbackError instanceof Error ? fallbackError : workerError;
    }
  } finally {
    worker.terminate();
  }
}
