/**
 * t2-hujjat-maydoni-2.ts - Hujjat maydoni 2-faza mijoz API: taqdim (tomonlararo o'zgarmas surat) va katta fayl (bo'lakli) yuklash.
 * Aktor serverda sessiyadan. Baytlar - R2: yuklash /api/hujjat-maydoni-yukla?amal=..., taqdim fayli /api/hujjat-maydoni-ol?taqdim=&el=.
 * (R2 ga yozish faqat server tomonida; shu fayl yagona saqlash qoriqchisi uchun t2-hujjat-maydoni modulini ishlatadi.)
 */
import type { HmNatija } from './t2-hujjat-maydoni';
import { vaqtliOqish } from './vaqtli-fetch';

const URL_ = '/api/hujjat-maydoni';
const YUKLA_URL = '/api/hujjat-maydoni-yukla';
const JSON_H = { 'Content-Type': 'application/json' };
const xato = (e: unknown) => ({ ok: false as const, code: 'TARMOQ', xato: e instanceof Error ? e.message : 'Aloqa xatosi' });

export type HmAloqa = { aloqa_id: number; kompaniya_id: number; nom: string; rol: string; turi: string };
export type HmTaqdim = {
  id: number; nom: string; nishon_turi: 'fayl' | 'papka'; fayl_soni: number; jami_bayt: number; izoh: string | null; holat: 'faol' | 'qaytarilgan';
  vaqt: string; kompaniya: string; kim: string | null; qaytarildi: string | null; sabab: string | null;
};
export type HmTaqdimEl = { id: number; yol: string; nom: string; raqam: number; bayt: number; mime: string; sha256: string };
export type HmTaqdimTafsilot = {
  ok: true; id: number; nom: string; izoh: string | null; holat: string; oluvchi: boolean; qaytarish_mumkin: boolean; fayl_soni: number; jami_bayt: number; fayllar: HmTaqdimEl[];
};

async function oqi<T>(amal: string, p: Record<string, string | number>): Promise<HmNatija<T>> {
  try {
    const q = new URLSearchParams({ amal, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) });
    return await (await vaqtliOqish(`${URL_}?${q}`, { credentials: 'same-origin' })).json() as HmNatija<T>;
  } catch (e) { return xato(e); }
}
async function yoz<T = { ok: true }>(body: Record<string, unknown>): Promise<HmNatija<T>> {
  try { return await (await fetch(URL_, { method: 'POST', credentials: 'same-origin', headers: JSON_H, body: JSON.stringify(body) })).json() as HmNatija<T>; }
  catch (e) { return xato(e); }
}

export const hmTaqdimNishon = (kompaniyaId: number) => oqi<{ ok: true; royxat: HmAloqa[] }>('taqdim_nishon', { kompaniya_id: kompaniyaId });
export const hmTaqdimRoyxat = (kompaniyaId: number, yonalish: 'kelgan' | 'yuborilgan') => oqi<{ ok: true; royxat: HmTaqdim[] }>('taqdim_royxat', { kompaniya_id: kompaniyaId, yonalish });
export const hmTaqdimTafsilot = (taqdimId: number) => oqi<HmTaqdimTafsilot>('taqdim_tafsilot', { taqdim_id: taqdimId });
export const hmTaqdimYarat = (p: { nishonTuri: 'fayl' | 'papka'; nishonId: number; aloqaId: number; izoh?: string }) =>
  yoz<{ ok: true; id: number; fayl_soni: number }>({ amal: 'taqdim', nishon_turi: p.nishonTuri, nishon_id: p.nishonId, aloqa_id: p.aloqaId, izoh: p.izoh, operation_id: crypto.randomUUID() });
export const hmTaqdimQaytar = (taqdimId: number, sabab: string) => yoz({ amal: 'taqdim_qaytar', taqdim_id: taqdimId, sabab });
export const hmTaqdimOlUrl = (taqdimId: number, elId: number, korish = false) => `/api/hujjat-maydoni-ol?taqdim=${taqdimId}&el=${elId}${korish ? '&korish=1' : ''}`;

/** Katta fayl (> 90 MB, <= 200 MB): R2 multipart, 8 MiB bo'laklar, har bo'lak 3 marta qayta uriniladi. */
export const HM_KATTA_CHEGARA = 90 * 1024 * 1024;
export const HM_BOLAK_MAX = 200 * 1024 * 1024;
async function shaHex(f: File): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function hmYuklaKatta(p: { file: File; kompaniyaId?: number | null; papkaId?: number | null; faylId?: number | null; onProgress?: (foiz: number) => void }):
  Promise<HmNatija<{ ok: true; fayl_id: number; raqam: number; ozgarmadi?: boolean }>> {
  if (p.file.size > HM_BOLAK_MAX) return { ok: false, code: 'FILE_TOO_LARGE', xato: 'Fayl juda katta (200 MB gacha).' };
  try {
    const b = await (await fetch(`${YUKLA_URL}?amal=boshla`, { method: 'POST', credentials: 'same-origin', headers: JSON_H, body: JSON.stringify({
      nom: p.file.name, mime: p.file.type, bayt: p.file.size, sha256: await shaHex(p.file), operation_id: crypto.randomUUID(), kompaniya_id: p.kompaniyaId, papka_id: p.papkaId, fayl_id: p.faylId }) })).json();
    if (!b.ok || b.ozgarmadi || b.takror) return b;
    const qismlar: Array<{ n: number; etag: string }> = [];
    for (let n = 1; n <= b.qismlar; n++) {
      const bo = p.file.slice((n - 1) * b.qism_bayt, Math.min(n * b.qism_bayt, p.file.size));
      let j: { ok?: boolean; etag?: string; code?: string } = {};
      for (let urinish = 0; urinish < 3 && !j.ok; urinish++) {
        j = await (await fetch(`${YUKLA_URL}?amal=qism&t=${encodeURIComponent(b.yukla_id)}&n=${n}`, { method: 'PUT', credentials: 'same-origin', body: bo })).json().catch(() => ({}));
      }
      if (!j.ok || !j.etag) {
        await fetch(`${YUKLA_URL}?amal=bekor`, { method: 'POST', credentials: 'same-origin', headers: JSON_H, body: JSON.stringify({ t: b.yukla_id }) });
        return { ok: false, code: j.code || 'TARMOQ' };
      }
      qismlar.push({ n, etag: j.etag }); p.onProgress?.(Math.round((n * 100) / b.qismlar));
    }
    return await (await fetch(`${YUKLA_URL}?amal=tugat`, { method: 'POST', credentials: 'same-origin', headers: JSON_H, body: JSON.stringify({ t: b.yukla_id, qismlar }) })).json();
  } catch (e) { return xato(e); }
}
