/**
 * Token (kredit) tizimi — sotiladigan PTO (egasi, 2026-10-02). Model: Obsidian BUSINESS_MODEL "TOKEN TIZIMI".
 * O'qish: /api/sb `token_holat_v1`. Yozish: /api/sb-yoz `token_sarfla_v1` / `token_qaytar_v1` / `tolov_sorov_yarat_v1` (a'zo),
 * `token_toldir_v1` / `obuna_belgila_v1` / `demo_manba_belgila_v1` (faqat superadmin — RPC ichida tekshiriladi).
 * Daftar o'zgarmas: har harakat alohida qator, operation_id idempotent, minus balans yo'q.
 *
 * NARX v2 (egasi: "xarajatdan tannarx + superadmin qo'ygan foyda foizi; F2 ≈ 30–100 ming so'm"):
 *   yakuniy_som = clamp((asos_som + ceil(n / birlik) × birlik_som) × (1 + foyda% / 100), min_som, max_som)
 *   token       = ceil(yakuniy_som / token_som)
 * Server (t2_token_hisobla_v2) yakuniy; bu yerdagi `narxHisob` — oldindan ko'rsatish uchun AYNAN o'sha formula.
 */
import { yangiOperationId, yozAmali, type AktNatija } from './supabase';

export type TokenAmal = 'smeta_import' | 'f2_import' | 'katalog_import' | 'f2_qoralama' | 'f2_hujjat' | 'hujjat' | 'ai_kirish' | 'ai_chiqish';
export type TokenNarx = {
  amal: TokenAmal; nom: string; tur: 'qatiy' | 'yacheyka' | 'ai'; birlik: number;
  asos_som: number; birlik_som: number; min_som: number; max_som: number | null; foyda_foiz: number | null; izoh: string | null; faol: boolean;
  narx?: number; minimum?: number;
};
export type TokenSozlama = { token_som: number; foyda_foiz: number; royxat_bonus_token: number; usd_kurs: number; tolov_rekvizit: string | null };
export type TokenTarif = { kod: string; nom: string; oylik_token: number; narx_som: number };
export type TokenPaket = { kod: string; nom: string; token: number; narx_som: number };
export type NarxTafsilot = {
  amal: string; nom: string; birlik_soni: number; birlik: number; qism: number; asos_som: number; birlik_som: number;
  tannarx_som: number; foyda_foiz: number; min_som: number; max_som: number | null; yakuniy_som: number; token_som: number; token: number;
};
export type TokenHarakat = {
  id: number; miqdor: number; tur: 'oylik' | 'toldirish' | 'bonus' | 'sarf' | 'qaytarish' | 'tuzatish'; amal: string | null;
  birlik_soni: number | null; izoh: string | null; yaratildi: string; kim?: string | null; qaytarilgan?: boolean;
  meta?: { hisob?: NarxTafsilot; hujjat?: string; obyekt?: number | string; yacheyka?: number; sabab?: string; [k: string]: unknown };
};
export type TolovSorov = { id: number; vaqt: string; paket: string | null; token: number; summa_som: number; usul: 'otkazma' | 'payme' | 'click'; holat: 'kutilmoqda' | 'tasdiqlandi' | 'rad' | 'bekor'; sabab: string | null };
export type TokenHolat = {
  balans: number;
  obuna: { tarif: string; nom: string; oylik_token: number; boshlandi: string; tugaydi: string | null } | null;
  tariflar: TokenTarif[]; narxlar: TokenNarx[]; harakatlar: TokenHarakat[];
  sozlama: TokenSozlama; paketlar: TokenPaket[]; sorovlar: TolovSorov[];
  superadmin: boolean; demo_obyekt_id: number | null;
};

export async function tokenHolatOl(kompaniyaId: number): Promise<{ ok: true; natija: TokenHolat } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'token_holat_v1', kompaniya_id: kompaniyaId }) });
    const j = await r.json() as { ok: boolean; natija?: TokenHolat; error?: string };
    return j.ok && j.natija ? { ok: true, natija: j.natija } : { ok: false, error: j.error || 'Token holatini o‘qib bo‘lmadi' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

const yaxlit2 = (x: number) => Math.round(x * 100) / 100;

/** Narx hisobi — server `t2_token_hisobla_v2` bilan AYNAN bir xil formula (oldindan ko'rsatish uchun). */
export function narxHisob(n: TokenNarx | undefined, birlikSoni: number, s: Pick<TokenSozlama, 'token_som' | 'foyda_foiz'> | undefined): NarxTafsilot | null {
  if (!n || !s || !n.faol) return null;
  const son = Math.max(0, Number(birlikSoni) || 0);
  const qism = n.tur === 'ai' ? son / n.birlik : Math.ceil(son / n.birlik);
  const tannarx = yaxlit2(n.asos_som + qism * n.birlik_som);
  const foyda = n.foyda_foiz ?? s.foyda_foiz;
  let som = yaxlit2(tannarx * (1 + foyda / 100));
  if (tannarx > 0) som = Math.max(som, n.min_som);
  if (n.max_som != null) som = Math.min(som, n.max_som);
  const token = som <= 0 ? 0 : Math.ceil(som / s.token_som);
  return { amal: n.amal, nom: n.nom, birlik_soni: son, birlik: n.birlik, qism, asos_som: n.asos_som, birlik_som: n.birlik_som,
    tannarx_som: tannarx, foyda_foiz: foyda, min_som: n.min_som, max_som: n.max_som, yakuniy_som: som, token_som: s.token_som, token };
}

export type SarfNatija = AktNatija & { code?: string; sarflandi?: number; balans?: number; kerak?: number; bepul_takror?: boolean; hisob?: NarxTafsilot };

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

/** Token sotib olish so'rovi (hozir — o'tkazma + superadmin tasdig'i; Payme/Click ulanganda shu so'rov avtomatik tasdiqlanadi). */
export function tolovSorovYarat(p: { kompaniyaId: number; paketKod: string; usul: 'otkazma' | 'payme' | 'click'; tolovMalumot: string; operationId: string }): Promise<SarfNatija & { sorov_id?: number }> {
  return yozAmali({ amal: 'tolov_sorov_yarat_v1', kompaniya_id: p.kompaniyaId, paket_kod: p.paketKod, usul: p.usul, tolov_malumot: p.tolovMalumot, operation_id: p.operationId });
}

/** Hujjat mazmunining qisqa xeshi — bir xil hujjat qayta yuklanganda qayta to'lov olinmasligi uchun. */
export async function mazmunXeshi(bytes: Uint8Array): Promise<string> {
  const x = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(x)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Xatoni foydalanuvchi tiliga. */
export function tokenXato(r: { code?: string; error?: string; xabar?: string; kerak?: number; balans?: number } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''}`;
  if (/TOKEN_YETMAYDI/.test(m)) return `Token yetmaydi: kerak ${r?.kerak ?? '?'}, balans ${r?.balans ?? '?'}. «Tokenlar va obuna» bo‘limida sotib oling.`;
  if (/SUPERADMIN_KERAK/.test(m)) return 'Bu amal faqat superadmin uchun.';
  if (/IZOH_MAJBURIY/.test(m)) return 'Izoh majburiy (to‘lov raqami yoki sabab).';
  if (/BALANS_MINUS/.test(m)) return 'Tuzatish balansni minusga tushiradi.';
  return r?.xabar || r?.error || r?.code || 'Amal bajarilmadi.';
}

/**
 * Token bilan bajarish: avval sarf (server — atomik, idempotent), keyin amal; amal xato bersa — sarf qaytariladi.
 * Token yetmasa — amal umuman bajarilmaydi. `meta.xesh` berilsa — aynan shu hujjat qayta yuklanganda pul olinmaydi.
 */
export async function tokenBilan<T>(p: { kompaniyaId: number; amal: TokenAmal; birlikSoni?: number; meta?: Record<string, string | number> }, ish: () => Promise<T>):
  Promise<{ ok: true; natija: T; sarflandi: number; balans?: number; bepulTakror?: boolean; hisob?: NarxTafsilot } | { ok: false; xabar: string }> {
  const opId = yangiOperationId();
  const s = await tokenSarfla({ ...p, operationId: opId });
  if (!s.ok) return { ok: false, xabar: tokenXato(s) };
  try {
    const natija = await ish();
    return { ok: true, natija, sarflandi: s.sarflandi ?? 0, balans: s.balans, bepulTakror: !!s.bepul_takror, hisob: s.hisob };
  } catch (e) {
    if ((s.sarflandi ?? 0) > 0) await tokenQaytar({ kompaniyaId: p.kompaniyaId, sarfOperationId: opId, sabab: e instanceof Error ? e.message : 'amal xatosi' }).catch(() => undefined);
    return { ok: false, xabar: e instanceof Error ? e.message : 'Amal bajarilmadi — token qaytarildi.' };
  }
}
