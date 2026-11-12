/**
 * pdf-oqish.ts — BRAUZERDA pdf.js bilan matn qatlamini koordinatalari bilan o'qish va manba sahifasini (qizil ramka bilan) chizish.
 * Server PDF kutubxonasi YO'Q. pdf.js faqat dinamik import (asosiy bundlega kirmaydi). Qoida o'qiy olmagan sahifalar `tahlil.ts` da «AI bilan o'qish»ga taklif qilinadi.
 */
import type { MatnBo } from './jadval';

export type PdfMatn = { items: MatnBo[]; sahifalar: number; balandliklar: Record<number, number>; sha256: string };

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array(data) as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}

/** Barcha sahifalarning matn elementlari: y yuqoridan pastga o'sadi (tahlil.ts shunga mo'ljallangan). */
export async function pdfdanMatn(fayl: ArrayBuffer, progress?: (sahifa: number, jami: number) => void): Promise<PdfMatn> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(fayl.slice(0)) }).promise;
  const items: MatnBo[] = []; const balandliklar: Record<number, number> = {};
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const [x0, y0, x1, y1] = page.view;
      const H = y1 - y0; balandliklar[i] = H;
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const f = it.transform as number[];
        items.push({ s: it.str, x: f[4] - x0, y: H - (f[5] - y0) - (it.height || 0), w: it.width, h: it.height || Math.abs(f[3]), sahifa: i });
      }
      progress?.(i, doc.numPages);
      page.cleanup();
      void x1;
    }
  } finally { await doc.destroy(); }
  return { items, sahifalar: Object.keys(balandliklar).length, balandliklar, sha256: await sha256Hex(fayl) };
}

/** Manba ko'rinishi: sahifani chizadi va qatorning qutisini qizil ramka bilan belgilaydi. Qaytadi: data URL (JPEG). */
export async function manbaKorinishi(fayl: ArrayBuffer, sahifa: number, quti: { x0: number; y0: number; x1: number; y1: number }, kenglikPx = 900): Promise<string> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(fayl.slice(0)) }).promise;
  try {
    const page = await doc.getPage(sahifa);
    const v1 = page.getViewport({ scale: 1 });
    const scale = kenglikPx / v1.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_YOQ');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 3;
    const pad = 3;
    ctx.strokeRect(quti.x0 * scale - pad, quti.y0 * scale - pad, (quti.x1 - quti.x0) * scale + pad * 2, (quti.y1 - quti.y0) * scale + pad * 2);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { await doc.destroy(); }
}
