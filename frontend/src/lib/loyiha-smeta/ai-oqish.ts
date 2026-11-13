/**
 * ai-oqish.ts — «AI bilan o'qish»: qoida profillari o'qiy olmagan sahifa (yoki jadval hududi) brauzerda rasmga chiziladi va hisobli AI yo'liga
 * (`/api/loyiha-ai-oqish` -> aiHisobli) yuboriladi. Narx ishga tushirishdan OLDIN ko'rsatiladi; shu fayl+sahifa+hudud qayta o'qilsa — bepul (server R2 keshi).
 * Natija «taklif» (ishonch past, `ai` belgisi) va manba hududi bilan; hech qachon avtomatik tasdiqlanmaydi.
 */
import { narxHisob, type TokenNarx, type TokenSozlama } from '../../api/t2-token';
import type { MatnBo } from './jadval';
import type { Element, Tur } from './profil';

export const AI_VERSIYA = 'lm-ai-1';
/** Narxni oldindan taxmin qilish uchun (vision modeli: sahifa rasmi + jadval JSON javobi). Haqiqiy sarf server tomonda aiHisobli bilan yechiladi. */
export const AI_KIRISH_TAXMIN = 2500;
export const AI_CHIQISH_TAXMIN = 1500;

export type Quti = { x0: number; y0: number; x1: number; y1: number };
export type AiJavobElement = { nom: string; belgi: string | null; birlik: string; miqdor: number | null; tur: Tur };

/** Sahifadagi jadval sarlavhasidan (spetsifikatsiya/ведомость/экспликация) boshlanuvchi hudud; topilmasa null (butun sahifa). */
export function aiHududi(items: MatnBo[], eni = 1300, boyi = 900): Quti | null {
  const h = items.find((i) => /спецификаци|ведомост|экспликаци/i.test(i.s));
  return h ? { x0: Math.max(0, h.x - 40), y0: Math.max(0, h.y - 20), x1: h.x + eni, y1: h.y + boyi } : null;
}

export const hududKaliti = (q: Quti | null): string => (q ? `r${Math.round(q.x0)}x${Math.round(q.y0)}` : 'toliq');
export const keshKaliti = (faylSha: string, sahifa: number, q: Quti | null): string => `${faylSha}:${sahifa}:${hududKaliti(q)}`;

const KESH_LS = 'loyiha-ai-kesh-v1';
function lsOqi(): string[] { try { return JSON.parse(localStorage.getItem(KESH_LS) ?? '[]') as string[]; } catch { return []; } }
export const keshdaBor = (kalit: string): boolean => lsOqi().includes(kalit);
export function keshgaYoz(kalit: string): void { try { const a = lsOqi(); if (!a.includes(kalit)) localStorage.setItem(KESH_LS, JSON.stringify([...a, kalit].slice(-2000))); } catch { /* kesh ixtiyoriy */ } }

/** Narx (token): kirish + chiqish taxmini; keshdagi sahifalar bepul. Narx noma'lum bo'lsa token = null (ishga tushirish bloklanadi). */
export function aiNarxi(sahifalarKalitlari: string[], narxlar: readonly TokenNarx[] | undefined, sozlama: Pick<TokenSozlama, 'token_som' | 'foyda_foiz'> | undefined, keshda: (k: string) => boolean = keshdaBor): { sahifa: number; bepul: number; token: number | null } {
  const pullik = sahifalarKalitlari.filter((k) => !keshda(k)).length;
  const kir = narxlar?.find((n) => n.amal === 'ai_kirish'); const chiq = narxlar?.find((n) => n.amal === 'ai_chiqish');
  const a = narxHisob(kir, AI_KIRISH_TAXMIN, sozlama); const b = narxHisob(chiq, AI_CHIQISH_TAXMIN, sozlama);
  const bittasi = a && b ? a.token + b.token : null;
  return { sahifa: sahifalarKalitlari.length, bepul: sahifalarKalitlari.length - pullik, token: bittasi == null ? null : bittasi * pullik };
}

/** AI javobini Element ga o'giradi: ishonch past, `ai` belgisi, manba = yuborilgan hudud. */
export function aiElementlar(javob: AiJavobElement[], sahifa: number, quti: Quti | null, sahifaQutisi: Quti): Element[] {
  const q = quti ?? sahifaQutisi;
  return javob.map((e, i) => ({
    profil: 'ai', tur: e.tur, nom: e.nom, belgi: e.belgi, birlik: e.birlik, miqdor: e.miqdor, sahifa, qutisi: q, manbaRef: `ai:${sahifa}:${hududKaliti(quti)}:${i}`,
    ishonch: e.miqdor == null ? 0.3 : 0.6, odamKerak: e.tur === 'uskuna', ogohlantirish: ['ai', ...(e.miqdor == null ? ['miqdor_yoq'] : [])],
  }));
}

export type HududRasmi = { mimeType: 'image/jpeg'; base64: string; sha256: string };

/** Sahifa hududini (yoki butun sahifani) JPEG ga chizadi (pdf.js, brauzerda). */
export async function hududniRasmga(fayl: ArrayBuffer, sahifa: number, quti: Quti | null, maxTomonPx = 2000): Promise<HududRasmi> {
  const lib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await lib.getDocument({ data: new Uint8Array(fayl.slice(0)) }).promise;
  try {
    const page = await doc.getPage(sahifa);
    const v1 = page.getViewport({ scale: 1 });
    const hudud = quti ?? { x0: 0, y0: 0, x1: v1.width, y1: v1.height };
    const eni = Math.min(hudud.x1, v1.width) - hudud.x0; const boyi = Math.min(hudud.y1, v1.height) - hudud.y0;
    const scale = maxTomonPx / Math.max(eni, boyi);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas'); canvas.width = Math.round(eni * scale); canvas.height = Math.round(boyi * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('CANVAS_YOQ');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -hudud.x0 * scale, -hudud.y0 * scale], canvas }).promise;
    const blob = await new Promise<Blob>((ok, rad) => canvas.toBlob((b) => (b ? ok(b) : rad(new Error('RASM_YOQ'))), 'image/jpeg', 0.88));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return { mimeType: 'image/jpeg', base64: btoa(bin), sha256: [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('') };
  } finally { await doc.destroy(); }
}

export type AiJavob = { ok: true; kesh: boolean; items: AiJavobElement[] } | { ok: false; xabar: string; code?: string };

export async function aiOqi(p: { kompaniyaId: number; faylSha: string; sahifa: number; varaq: string | null; hudud: string; rasm: HududRasmi }): Promise<AiJavob> {
  try {
    const r = await fetch('/api/loyiha-ai-oqish', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versiya: AI_VERSIYA, kompaniya_id: p.kompaniyaId, fayl_sha256: p.faylSha, varaq: p.varaq, sahifa: { raqam: p.sahifa, hudud: p.hudud, mimeType: p.rasm.mimeType, base64: p.rasm.base64, sha256: p.rasm.sha256 } }),
    });
    const j = await r.json() as { ok?: boolean; kesh?: boolean; items?: AiJavobElement[]; xabar?: string; code?: string };
    return j.ok && j.items ? { ok: true, kesh: j.kesh === true, items: j.items } : { ok: false, xabar: j.xabar ?? 'AI javob bermadi', code: j.code };
  } catch (e) { return { ok: false, xabar: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}
