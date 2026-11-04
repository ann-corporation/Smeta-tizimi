/**
 * t2-hujjat-aylanish.ts — hujjat aylanishi klienti (tasdiq zanjiri, xat reestri, kiruvchi quti). Shlyuz: /api/hujjat-aylanish.
 * Hamma ruxsat serverda (a'zolik, rol, faol aloqa); bu fayl faqat so'rov yuboradi va javobni tiplaydi. Fayllar — R2 (document_id).
 */
import { yangiOperationId } from './supabase';
import type { QadamHolat, ZanjirHolat } from '../lib/hujjat-aylanish/zanjir';

export type Javob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
type Xom = { ok?: boolean; natija?: unknown; error?: string; code?: string } & Record<string, unknown>;

export type XatTuri = 'xat' | 'soprovod' | 'talabnoma' | 'ogohlantirish' | 'javob_xati' | 'boshqa';
export const XAT_TURLARI: readonly XatTuri[] = ['xat', 'soprovod', 'talabnoma', 'ogohlantirish', 'javob_xati', 'boshqa'];
export type XatHolat = 'yuborilgan' | 'olindi' | 'javob_berildi';

export type KiruvchiZanjir = { id: number; hujjat_turi: string; sarlavha: string; raund: number; yaratildi: string; muddat: string | null; rol: string; egasi_nom: string | null; kechikkan: boolean };
export type KiruvchiXat = { id: number; turi: XatTuri; mavzu: string; holat: XatHolat; sana: string; javob_muddati: string | null; raqam: string; qarshi_nom: string | null; kechikkan: boolean };
export type KiruvchiMurojaat = { id: number; turi: string; sarlavha: string; muhimlik: string; muddat: string | null; beruvchi_nom: string | null; kechikkan: boolean };
export type Kiruvchi = { zanjirlar: KiruvchiZanjir[]; xatlar: KiruvchiXat[]; murojaatlar: KiruvchiMurojaat[]; sanoq: { zanjir: number; xat: number; murojaat: number } };

export type ZanjirQisqa = { id: number; hujjat_turi: string; sarlavha: string; holat: ZanjirHolat; raund: number; yaratildi: string; meniki: boolean; egasi_nom: string | null; navbat_menda: boolean; navbat_rol: string | null };
export type ZanjirTafsilot = {
  zanjir: { id: number; hujjat_turi: string; sarlavha: string; holat: ZanjirHolat; raund: number; document_id: number | null; obyekt_id: number | null; meniki: boolean; egasi_nom: string | null; yaratildi: string; yopildi: string | null };
  qadamlar: Array<{ tartib: number; rol: string; holat: QadamHolat; muddat: string | null; izoh: string | null; qaror_vaqti: string | null; men: boolean; kompaniya_nom: string | null }>;
  tarix: Array<{ raund: number; tartib: number | null; harakat: string; izoh: string | null; vaqt: string; men: boolean; kompaniya_nom: string | null }>;
};
export type XatQisqa = {
  id: number; turi: XatTuri; mavzu: string; holat: XatHolat; sana: string; javob_muddati: string | null; chiquvchi_raqam: string; kiruvchi_raqam: string | null;
  kiruvchi: boolean; qarshi_nom: string | null; qarshi_kompaniya_id: number; hujjat_bor: boolean; ota_xat_id: number | null; kechikkan: boolean;
};
export type XatTafsilot = { xat: Omit<XatQisqa, 'qarshi_nom' | 'hujjat_bor' | 'kechikkan'> & { matn: string | null; document_id: number | null; yuboruvchi_nom: string | null; qabul_nom: string | null } };
export type Bildirishnoma = { id: number; kompaniya_id: number | null; mavzu: string; sarlavha_kalit: string; parametrlar: Record<string, unknown>; havola: string | null; oqildi: string | null; yaratildi: string };

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, init);
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

export async function aylanishOqi<T>(bolim: string, kompaniyaId: number | null, params: Record<string, string | number | null | undefined> = {}): Promise<Javob<T>> {
  const q = new URLSearchParams({ bolim });
  if (kompaniyaId != null) q.set('kompaniya_id', String(kompaniyaId));
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  const d = await chaqir('/api/hujjat-aylanish?' + q.toString(), { credentials: 'same-origin' });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: ('natija' in d ? d.natija : d) as T };
}

export async function aylanishYoz<T = Record<string, unknown>>(amal: string, kompaniyaId: number | null, yuk: Record<string, unknown> = {}): Promise<Javob<T>> {
  const d = await chaqir('/api/hujjat-aylanish', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, ...(kompaniyaId != null ? { kompaniya_id: kompaniyaId } : {}), ...yuk }) });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: d as unknown as T };
}

export const kiruvchiOl = (k: number) => aylanishOqi<Kiruvchi>('kiruvchi', k);
export const zanjirlarOl = (k: number, p: { yonalish?: 'menga' | 'mendan'; holat?: string } = {}) => aylanishOqi<ZanjirQisqa[]>('zanjirlar', k, { yonalish: p.yonalish, holat: p.holat });
export const zanjirTafsilotOl = (k: number, zanjirId: number) => aylanishOqi<ZanjirTafsilot>('zanjir', k, { zanjir_id: zanjirId });
export const xatlarOl = (k: number, p: { yonalish?: 'kiruvchi' | 'chiquvchi'; holat?: string } = {}) => aylanishOqi<XatQisqa[]>('xatlar', k, { yonalish: p.yonalish, holat: p.holat });
export const xatTafsilotOl = (k: number, xatId: number) => aylanishOqi<XatTafsilot>('xat', k, { xat_id: xatId });
export const bildirishnomalarOl = (p: { faqatOqilmagan?: boolean } = {}) =>
  aylanishOqi<{ qatorlar: Bildirishnoma[]; oqilmagan: number }>('bildirishnomalar', null, { oqilmagan: p.faqatOqilmagan ? 1 : undefined });
export const bildirishnomaOqildi = (idlar: number[]) => aylanishYoz('bildirishnoma_oqildi', null, { idlar });

export type QadamKirish = { kompaniyaId: number; rol: string; muddat?: string | null };
export const zanjirYarat = (k: number, p: { hujjatTuri: string; sarlavha: string; obyektId?: number | null; documentId?: number | null; qadamlar: QadamKirish[]; manbaJadval?: string | null; manbaId?: number | null }) =>
  aylanishYoz<{ id: number; holat: ZanjirHolat; qayta?: boolean }>('zanjir_yarat', k, {
    hujjat_turi: p.hujjatTuri, sarlavha: p.sarlavha, obyekt_id: p.obyektId ?? null, document_id: p.documentId ?? null, manba_jadval: p.manbaJadval ?? null, manba_id: p.manbaId ?? null,
    qadamlar: p.qadamlar.map((q) => ({ kompaniya_id: q.kompaniyaId, rol: q.rol, muddat: q.muddat || null })), operation_id: yangiOperationId(),
  });
export const zanjirQarori = (k: number, zanjirId: number, qaror: 'tasdiqlash' | 'rad' | 'qaytarish', izoh?: string) =>
  aylanishYoz<{ id: number; holat: ZanjirHolat }>('zanjir_qaror', k, { zanjir_id: zanjirId, qaror, izoh: izoh || null });
export const zanjirQayta = (k: number, zanjirId: number, izoh?: string, documentId?: number | null) =>
  aylanishYoz<{ id: number; holat: ZanjirHolat; raund: number }>('zanjir_qayta', k, { zanjir_id: zanjirId, izoh: izoh || null, document_id: documentId ?? null });
export const zanjirBekor = (k: number, zanjirId: number, sabab?: string) => aylanishYoz('zanjir_bekor', k, { zanjir_id: zanjirId, sabab: sabab || null });

export const xatYubor = (k: number, p: { qabulKompaniyaId: number; turi: XatTuri; mavzu: string; matn?: string; javobMuddati?: string; obyektId?: number | null; documentId?: number | null; otaXatId?: number | null }) =>
  aylanishYoz<{ id: number; raqam: string; qayta?: boolean }>('xat_yubor', k, {
    qabul_kompaniya_id: p.qabulKompaniyaId, turi: p.turi, mavzu: p.mavzu, matn: p.matn || null, javob_muddati: p.javobMuddati || null,
    obyekt_id: p.obyektId ?? null, document_id: p.documentId ?? null, ota_xat_id: p.otaXatId ?? null, operation_id: yangiOperationId(),
  });
export const xatQabul = (k: number, xatId: number) => aylanishYoz<{ id: number; kiruvchi_raqam: string }>('xat_qabul', k, { xat_id: xatId });
