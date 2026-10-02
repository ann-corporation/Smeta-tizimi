/**
 * Token (kredit) tizimi — sotiladigan PTO (egasi, 2026-10-02). Model: Obsidian BUSINESS_MODEL "TOKEN TIZIMI".
 * O'qish: /api/sb `token_holat_v1`. Yozish: /api/sb-yoz `token_sarfla_v1` / `token_qaytar_v1` (a'zo),
 * `token_toldir_v1` / `obuna_belgila_v1` / `demo_manba_belgila_v1` (faqat superadmin — RPC ichida tekshiriladi).
 * Daftar o'zgarmas: har harakat alohida qator, operation_id idempotent, minus balans yo'q.
 */
import { yangiOperationId, yozAmali, type AktNatija } from './supabase';

export type TokenAmal = 'smeta_import' | 'f2_import' | 'katalog_import' | 'f2_qoralama' | 'hujjat' | 'ai_kirish' | 'ai_chiqish';
export type TokenNarx = { amal: TokenAmal; nom: string; tur: 'qatiy' | 'yacheyka' | 'ai'; narx: number; birlik: number; minimum: number };
export type TokenTarif = { kod: string; nom: string; oylik_token: number; narx_som: number };
export type TokenHarakat = { id: number; miqdor: number; tur: 'oylik' | 'toldirish' | 'bonus' | 'sarf' | 'qaytarish' | 'tuzatish'; amal: string | null; birlik_soni: number | null; izoh: string | null; yaratildi: string };
export type TokenHolat = {
  balans: number;
  obuna: { tarif: string; nom: string; oylik_token: number; boshlandi: string; tugaydi: string | null } | null;
  tariflar: TokenTarif[]; narxlar: TokenNarx[]; harakatlar: TokenHarakat[];
  superadmin: boolean; demo_obyekt_id: number | null;
};

export async function tokenHolatOl(kompaniyaId: number): Promise<{ ok: true; natija: TokenHolat } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'token_holat_v1', kompaniya_id: kompaniyaId }) });
    const j = await r.json() as { ok: boolean; natija?: TokenHolat; error?: string };
    return j.ok && j.natija ? { ok: true, natija: j.natija } : { ok: false, error: j.error || 'Token holatini o‘qib bo‘lmadi' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Mijoz tomonidagi taxmin (server bilan bir xil formula — ko'rsatish uchun; yakuniy hisob serverda). */
export function tokenTaxmin(n: TokenNarx | undefined, birlikSoni = 1): number | null {
  if (!n) return null;
  if (n.tur === 'qatiy') return n.narx;
  if (n.tur === 'yacheyka') return Math.max(n.minimum, Math.ceil(Math.max(0, birlikSoni) / n.birlik) * n.narx);
  return Math.max(n.minimum, Math.ceil(Math.max(0, birlikSoni) / n.birlik * n.narx * 100) / 100);
}

export type SarfNatija = AktNatija & { code?: string; sarflandi?: number; balans?: number; kerak?: number };

export function tokenSarfla(p: { kompaniyaId: number; amal: TokenAmal; birlikSoni?: number; operationId: string; meta?: Record<string, string | number> }): Promise<SarfNatija> {
  return yozAmali({ amal: 'token_sarfla_v1', kompaniya_id: p.kompaniyaId, tur_amal: p.amal, birlik_soni: p.birlikSoni ?? 1, operation_id: p.operationId, meta: p.meta ?? {} });
}

export function tokenQaytar(p: { kompaniyaId: number; sarfOperationId: string; sabab: string }): Promise<SarfNatija> {
  return yozAmali({ amal: 'token_qaytar_v1', kompaniya_id: p.kompaniyaId, sarf_operation_id: p.sarfOperationId, operation_id: yangiOperationId(), sabab: p.sabab });
}

export function tokenToldir(p: { maqsadKompaniyaId: number; miqdor: number; tur: 'toldirish' | 'bonus' | 'tuzatish'; izoh: string }): Promise<SarfNatija> {
  return yozAmali({ amal: 'token_toldir_v1', maqsad_kompaniya_id: p.maqsadKompaniyaId, miqdor: p.miqdor, tur_harakat: p.tur, izoh: p.izoh, operation_id: yangiOperationId() });
}

export function obunaBelgila(p: { maqsadKompaniyaId: number; tarif: string; oylar: number }): Promise<SarfNatija> {
  return yozAmali({ amal: 'obuna_belgila_v1', maqsad_kompaniya_id: p.maqsadKompaniyaId, tarif: p.tarif, oylar: p.oylar, operation_id: yangiOperationId() });
}

export function demoManbaBelgila(obyektId: number | null): Promise<SarfNatija> {
  return yozAmali({ amal: 'demo_manba_belgila_v1', obyekt_id: obyektId });
}

/** Xatoni foydalanuvchi tiliga. */
export function tokenXato(r: { code?: string; error?: string; xabar?: string; kerak?: number; balans?: number } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''}`;
  if (/TOKEN_YETMAYDI/.test(m)) return `Token yetmaydi: kerak ${r?.kerak ?? '?'}, balans ${r?.balans ?? '?'}. «Tokenlar va obuna» bo‘limida to‘ldiring.`;
  if (/SUPERADMIN_KERAK/.test(m)) return 'Bu amal faqat superadmin uchun.';
  if (/IZOH_MAJBURIY/.test(m)) return 'Izoh majburiy (to‘lov raqami yoki sabab).';
  if (/BALANS_MINUS/.test(m)) return 'Tuzatish balansni minusga tushiradi.';
  return r?.error || r?.xabar || r?.code || 'Amal bajarilmadi.';
}

/**
 * Token bilan bajarish: avval sarf (server — atomik, idempotent), keyin amal; amal xato bersa — sarf qaytariladi.
 * Token yetmasa — amal umuman bajarilmaydi.
 */
export async function tokenBilan<T>(p: { kompaniyaId: number; amal: TokenAmal; birlikSoni?: number; meta?: Record<string, string | number> }, ish: () => Promise<T>):
  Promise<{ ok: true; natija: T; sarflandi: number; balans?: number } | { ok: false; xabar: string }> {
  const opId = yangiOperationId();
  const s = await tokenSarfla({ ...p, operationId: opId });
  if (!s.ok) return { ok: false, xabar: tokenXato(s) };
  try {
    const natija = await ish();
    return { ok: true, natija, sarflandi: s.sarflandi ?? 0, balans: s.balans };
  } catch (e) {
    if ((s.sarflandi ?? 0) > 0) await tokenQaytar({ kompaniyaId: p.kompaniyaId, sarfOperationId: opId, sabab: e instanceof Error ? e.message : 'amal xatosi' }).catch(() => undefined);
    return { ok: false, xabar: e instanceof Error ? e.message : 'Amal bajarilmadi — token qaytarildi.' };
  }
}
