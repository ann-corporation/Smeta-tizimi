/**
 * PDF varaqlarini BRAUZERDA rasmga aylantirish (pdf.js). Server (Cloudflare Workers) da canvas yo'q va
 * CPU/xotira chegarasi bor — shuning uchun rendering klientda, serverga faqat sahifa rasmi ketadi.
 * Matn qatlami ham shu yerda olinadi; buzilgan bo'lsa (kirill CID shrift) prompt uni tashlab yuboradi.
 *
 * Faqat feature flag yoqilganda (`VITE_AI_LOYIHA=1`) va faqat dinamik import orqali yuklanadi —
 * asosiy bundle'ga pdf.js qo'shilmaydi.
 */
import { AI_LOYIHA_VERSIYA, type SahifaNatija, type VaraqTuri } from './sxema';

export const AI_LOYIHA_YOQILGAN = import.meta.env.VITE_AI_LOYIHA === '1';

export type ChizilganSahifa = {
  sahifa: number;
  jami: number;
  mimeType: 'image/jpeg' | 'image/png';
  /** data URL prefiksisiz base64. */
  base64: string;
  /** Rasm baytlarining sha256 — serverdagi kesh kaliti qismi. */
  sha256: string;
  eni: number;
  boyi: number;
  matn: string;
};

export type ChizishSozlama = { maxTomonPx?: number; sifat?: number; format?: 'image/jpeg' | 'image/png' };

/** Chizma uchun 2048 px uzun tomon: vision modellar shundan kattasini baribir kichraytiradi, raqamlar o'qiladi. */
const STANDART: Required<ChizishSozlama> = { maxTomonPx: 2048, sifat: 0.88, format: 'image/jpeg' };

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const h = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** PDF ni sahifama-sahifa rasmga aylantiradi (xotirani tejash uchun generator). */
export async function* pdfSahifalari(fayl: ArrayBuffer, sozlama: ChizishSozlama = {}): AsyncGenerator<ChizilganSahifa> {
  const s = { ...STANDART, ...sozlama };
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fayl.slice(0)) }).promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const scale = s.maxTomonPx / Math.max(v1.width, v1.height);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('CANVAS_YOQ');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      const blob = await new Promise<Blob>((ok, rad) => canvas.toBlob((b) => (b ? ok(b) : rad(new Error('RASM_YOQ'))), s.format, s.sifat));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const tc = await page.getTextContent();
      const matn = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim();
      yield { sahifa: i, jami: doc.numPages, mimeType: s.format, base64: base64(bytes), sha256: await sha256Hex(bytes), eni: canvas.width, boyi: canvas.height, matn };
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
}

export type SahifaJavob =
  | { ok: true; natija: SahifaNatija; kesh: boolean; model: string | null; ogohlantirishlar: string[] }
  | { ok: false; xabar: string; code?: string };

/** Bitta sahifani `/api/ai-loyiha` ga yuboradi. Server keshda bo'lsa token yechilmaydi. */
export async function sahifaniOqi(p: { kompaniyaId: number; faylSha256: string; sahifa: ChizilganSahifa; varaqTuri?: VaraqTuri | null }): Promise<SahifaJavob> {
  const r = await fetch('/api/ai-loyiha', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      versiya: AI_LOYIHA_VERSIYA,
      kompaniya_id: p.kompaniyaId,
      fayl_sha256: p.faylSha256,
      varaq_turi: p.varaqTuri ?? null,
      sahifa: { raqam: p.sahifa.sahifa, jami: p.sahifa.jami, mimeType: p.sahifa.mimeType, base64: p.sahifa.base64, sha256: p.sahifa.sha256, matn: p.sahifa.matn },
    }),
  });
  return (await r.json().catch(() => ({ ok: false, xabar: String(r.status) }))) as SahifaJavob;
}
