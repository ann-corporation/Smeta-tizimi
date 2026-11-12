/**
 * t2-foto-dalil.ts — FOTO-DALIL klienti (ekotizim V3, P2).
 * Yuklash: brauzerda <=1600 px ga kichraytirish -> mavjud kanonik yo'l (hujjatYukla: reserve -> R2 put -> finalize,
 * turi='foto_dalil') -> /api/foto-dalil bogla. Bazada faqat kalit/sha/meta; baytlar R2 da.
 */
import { hujjatYukla } from './t2-hujjat-canonical';
import { yangiOperationId } from './supabase';
import { FOTO_DOCUMENT_TURI, FOTO_MAX_TOMON, faylSanasi, olchamHisobla, type FotoElement, type FotoTaklif } from '../lib/foto-dalil';

export type FotoRoyxat = {
  ok: true; jami: number; fotolar: FotoElement[];
  sanalar: Array<{ sana: string; soni: number }>; razdellar: Array<{ razdel_id: number | null; nom: string | null; soni: number }>;
};
export type FotoSuzgich = { razdelId?: number | null; manbaTuri?: string | null; manbaId?: number | null; dan?: string | null; gacha?: string | null; limit?: number; keyinId?: number | null };
export type FotoManba = { turi: string; id: number | null };
type Xato = { ok: false; code?: string; error?: string };

async function json<T>(r: Response): Promise<T | Xato> {
  const j = await r.json().catch(() => null);
  if (j && typeof j === 'object') return j as T | Xato;
  return { ok: false, code: 'HTTP_' + r.status, error: 'Server javobi noto‘g‘ri' };
}

export async function fotoRoyxatOl(kompaniyaId: number, obyektId: number, s: FotoSuzgich = {}): Promise<FotoRoyxat> {
  const q = new URLSearchParams({ kompaniya_id: String(kompaniyaId), obyekt_id: String(obyektId) });
  if (s.razdelId) q.set('razdel_id', String(s.razdelId));
  if (s.manbaTuri) q.set('manba_turi', s.manbaTuri);
  if (s.manbaId) q.set('manba_id', String(s.manbaId));
  if (s.dan) q.set('dan', s.dan);
  if (s.gacha) q.set('gacha', s.gacha);
  if (s.limit) q.set('limit', String(s.limit));
  if (s.keyinId) q.set('keyin_id', String(s.keyinId));
  const j = await json<FotoRoyxat>(await fetch('/api/foto-dalil?' + q.toString()));
  if (!j.ok) throw new Error((j as Xato).error || (j as Xato).code || 'Foto ro‘yxati o‘qilmadi');
  return j as FotoRoyxat;
}

async function yoz(yuk: Record<string, unknown>): Promise<{ ok: boolean; id?: number; error?: string; code?: string }> {
  const r = await fetch('/api/foto-dalil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk) });
  return json(r) as Promise<{ ok: boolean; id?: number; error?: string; code?: string }>;
}

export const fotoYangila = (kompaniyaId: number, id: number, p: { izoh?: string | null; aiIzoh?: string | null; aiTaklif?: FotoTaklif | null; manba?: FotoManba }) =>
  yoz({ amal: 'yangila', kompaniya_id: kompaniyaId, id, izoh: p.izoh, ai_izoh: p.aiIzoh, ai_taklif: p.aiTaklif ?? undefined,
    ...(p.manba ? { manba_ozgar: true, manba_turi: p.manba.turi, manba_id: p.manba.id } : {}) });
export const fotoOchir = (kompaniyaId: number, id: number) => yoz({ amal: 'ochir', kompaniya_id: kompaniyaId, id });

/** Rasmni eng uzun tomoni <=1600 px, JPEG ~0.82 ga keltiradi (EXIF yo'nalishi hisobga olinadi). Rasm bo'lmasa xato tashlaydi. */
export async function rasmKichraytir(file: File, maxTomon = FOTO_MAX_TOMON): Promise<File> {
  if (!/^image\//.test(file.type)) throw new Error('Faqat rasm fayli');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const o = olchamHisobla(bmp.width, bmp.height, maxTomon);
    if (!o.ozgardi && file.type === 'image/jpeg' && file.size <= 900 * 1024) return file;
    const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('Rasm qayta ishlanmadi');
    ctx.drawImage(bmp, 0, 0, o.w, o.h);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Rasm qayta ishlanmadi');
    const nom = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nom, { type: 'image/jpeg', lastModified: file.lastModified });
  } finally { bmp.close?.(); }
}

export type FotoYuklaNatija = { ok: true; fotoId: number; documentId: number; file: File } | { ok: false; code: string; xato?: string };

export async function fotoYukla(p: {
  file: File; kompaniyaId: number; loyihaId?: number | null; obyektId: number; manba?: FotoManba; izoh?: string | null;
  lat?: number | null; lng?: number | null; operationId?: string;
}): Promise<FotoYuklaNatija> {
  let kichik: File;
  try { kichik = await rasmKichraytir(p.file); } catch (e) { return { ok: false, code: 'RASM', xato: (e as Error).message }; }
  const u = await hujjatYukla({ file: kichik, kompaniyaId: p.kompaniyaId, loyihaId: p.loyihaId ?? null, obyektId: p.obyektId, documentType: FOTO_DOCUMENT_TURI, operationId: p.operationId });
  if (!u.ok) return { ok: false, code: u.code, xato: u.xato };
  const b = await yoz({ amal: 'bogla', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, document_id: u.data.document_id, manba_turi: p.manba?.turi ?? 'umumiy', manba_id: p.manba?.id ?? null,
    sana: faylSanasi(p.file.lastModified), lat: p.lat ?? null, lng: p.lng ?? null, izoh: p.izoh ?? null, operation_id: yangiOperationId() });
  if (!b.ok || b.id == null) return { ok: false, code: b.code || 'BOGLASH', xato: b.error || 'Foto biriktirilmadi' };
  return { ok: true, fotoId: b.id, documentId: u.data.document_id, file: kichik };
}

export type FotoAiNatija = { ok: true; izoh: string; taklif: FotoTaklif | null } | { ok: false; xabar: string; code?: string };
/** AI: qisqa izoh + qaysi ishni ko'rsatayotgani TAKLIFI (aiHisobli — token yechiladi). Foydalanuvchi tasdiqlamaguncha hech narsa o'zgarmaydi. */
export async function fotoAiTavsif(kompaniyaId: number, file: File, nomzodlar: Array<{ tur: string; id: number; nom: string }>): Promise<FotoAiNatija> {
  const base64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
  const r = await fetch('/api/foto-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kompaniya_id: kompaniyaId, base64, mimeType: file.type || 'image/jpeg', nomzodlar }) });
  const j = await r.json().catch(() => null) as { ok?: boolean; izoh?: string; taklif?: FotoTaklif | null; xabar?: string; code?: string } | null;
  if (j?.ok) return { ok: true, izoh: j.izoh ?? '', taklif: j.taklif ?? null };
  return { ok: false, xabar: j?.xabar || 'AI hozir mavjud emas', code: j?.code };
}

/** Eksport uchun: rasm baytlarini o'qish (kanonik URL, sessiya cookie). */
export async function fotoBlobOl(documentId: number): Promise<Blob | null> {
  const r = await fetch('/api/hujjat-ol?id=' + Number(documentId)).catch(() => null);
  return r && r.ok ? r.blob() : null;
}
