/**
 * hujjat-tolov.ts — pullik hujjat baytlari uchun SERVER tomonidagi to'lov dalili (P0, ekotizim dizayni §F.3).
 *
 * Muammo: rasmiy hujjat (F2/F3/paket ZIP) brauzerda yasaladi va token mijozdan yechiladi
 * (`hujjatTokenBilan` → `t2_token_sarfla_v1`). Server baytni faqat arxivga SAQLASH (`/api/hujjat-yukla`) va
 * qayta BERISH (`/api/hujjat-ol`) paytida ko'radi. Shu ikki yo'lda server endi to'langan token amalini TEKSHIRADI:
 *   - saqlash: paket ZIP va F3 uchun — shu kompaniyada shu mazmun xeshi (meta.xesh = sha256 ning birinchi 16 bayti = 32 hex) bilan
 *     (F2 uchun — shu obyektda to'langan 2_hujjat sarfi: F2 xeshi mantiqiy kalit) 
 *     qaytarilmagan `sarf` harakati bo'lishi shart; yo'q bo'lsa 402 `TOKEN_TOLOV_YOQ` (R2 ga hech narsa yozilmaydi);
 *   - berish: P0 dan keyin saqlangan pullik hujjat uchun xuddi shu dalil shart; P0 dan oldingi (legacy) hujjatlar
 *     avvalgidek beriladi (hech narsa yopilmaydi).
 * Bir xil mazmun (xesh) qayta — bepul: dalil bir marta to'langan bo'lsa yetarli (`t2_token_sarfla_v1` dagi
 * `bepul_takror` qoidasi bilan bir xil).
 * Dalil o'qishi — service_role bilan `t2_token_harakat` (o'zgarmas daftar) dan; yozuv YO'Q.
 */
import { supabaseBaseUrl } from './supabase-url';

/** Faqat tizim YASAGAN (token yechiladigan) arxiv hujjat turlari. Foydalanuvchining o'z fayllari (smeta, murojaat…) bepul. */
export const PULLIK_HUJJAT_TURLAR: ReadonlySet<string> = new Set(['shartnoma_oylik_paket', 'f2_hujjat', 'f3']);

/** Token amallari, ular bilan pullik hujjat to'lanadi (client: `hujjatTokenBilan` → 'hujjat' | 'f2_hujjat'). */
export const PULLIK_TOKEN_AMALLAR = ['hujjat', 'f2_hujjat'] as const;

/** P0 yoqilgan sana: shundan oldin saqlangan hujjatlar dalilsiz ham beriladi (legacy). Env bilan o'zgartiriladi. */
export const TOLOV_MAJBURIY_SANA = '2026-11-05T00:00:00Z';

export type TolovEnv = { SUPABASE_URL?: string; SUPABASE_KEY?: string; HUJJAT_TOLOV_MAJBURIY_SANA?: string };
export type TolovHolat = 'bor' | 'yoq' | 'xato';

export const pullikTurmi = (turi: string | null | undefined): boolean => !!turi && PULLIK_HUJJAT_TURLAR.has(turi);

/** Mijoz `mazmunXeshi` bilan bir xil: sha256 ning birinchi 16 bayti (32 hex). */
export const tolovXeshi = (sha256: string): string => String(sha256 || '').trim().toLowerCase().slice(0, 32);

async function rest<T>(env: TolovEnv, yol: string): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/' + yol, {
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, Accept: 'application/json' },
  }).catch(() => null);
  if (!r || !r.ok) return null;
  return (await r.json().catch(() => null)) as T | null;
}

/** Kompaniyada shu xesh bilan to'langan (va qaytarilmagan) sarf bormi. 'xato' — dalilni o'qib bo'lmadi (yopiq). */
export async function tolovDalili(env: TolovEnv, kompaniyaId: number, d: { turi: string; sha256: string; obyektId?: number | null }): Promise<TolovHolat> {
  if (!Number.isSafeInteger(kompaniyaId) || kompaniyaId <= 0) return 'yoq';
  let filtr: string;
  if (d.turi === 'f2_hujjat') {
    /* F2 da meta.xesh — mantiqiy kalit (obyekt+oy+raqam, F2TarixNative), bayt xeshi emas: dalil — shu obyekt uchun to'langan F2 sarfi. */
    if (!Number.isSafeInteger(d.obyektId) || (d.obyektId as number) <= 0) return 'yoq';
    filtr = `amal=eq.f2_hujjat&meta-%3E%3Eobyekt=eq.${d.obyektId}`;
  } else {
    const xesh = tolovXeshi(d.sha256);
    if (!/^[0-9a-f]{32}$/.test(xesh)) return 'yoq';
    filtr = `amal=in.(${PULLIK_TOKEN_AMALLAR.join(',')})&meta-%3E%3Exesh=eq.${xesh}`;
  }
  const sarflar = await rest<Array<{ operation_id: string }>>(env,
    `t2_token_harakat?kompaniya_id=eq.${kompaniyaId}&tur=eq.sarf&${filtr}&select=operation_id&limit=50`);
  if (!sarflar) return 'xato';
  if (!sarflar.length) return 'yoq';
  const ids = sarflar.map((s) => s.operation_id).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) return 'yoq';
  const qaytgan = await rest<Array<{ bogliq_operation_id: string }>>(env,
    `t2_token_harakat?kompaniya_id=eq.${kompaniyaId}&tur=eq.qaytarish&bogliq_operation_id=in.(${ids.join(',')})&select=bogliq_operation_id&limit=50`);
  if (!qaytgan) return 'xato';
  const qaytdi = new Set(qaytgan.map((q) => q.bogliq_operation_id));
  return ids.some((id) => !qaytdi.has(id)) ? 'bor' : 'yoq';
}

/** Pullik turdagi hujjat uchun to'lov javobi (null — ruxsat). */
export function tolovRad(holat: TolovHolat): Response | null {
  if (holat === 'bor') return null;
  if (holat === 'xato') {
    return Response.json({ ok: false, code: 'TOKEN_TEKSHIRIB_BOLMADI', xato: 'To\'lov holatini tekshirib bo\'lmadi. Birozdan so\'ng qayta urinib ko\'ring.' }, { status: 503 });
  }
  return Response.json({ ok: false, code: 'TOKEN_TOLOV_YOQ',
    xato: 'Bu hujjat uchun token to\'lovi topilmadi. Hujjatni tizimdagi «yuklab olish» orqali chiqaring (token yechiladi), so\'ng arxivlanadi.' }, { status: 402 });
}

export const legacyHujjatmi = (env: TolovEnv, yaratilgan: string | null | undefined): boolean => {
  const chegara = Date.parse(env.HUJJAT_TOLOV_MAJBURIY_SANA || TOLOV_MAJBURIY_SANA);
  const t = Date.parse(String(yaratilgan ?? ''));
  return Number.isFinite(t) && Number.isFinite(chegara) && t < chegara;
};

/** hujjat-ol uchun: hujjatning turi, yaratilgan sanasi (registrdan). null — o'qib bo'lmadi. */
export async function hujjatTuri(env: TolovEnv, id: number): Promise<{ document_type: string | null; created_at: string | null; sha256: string | null; kompaniya_id: number; obyekt_id: number | null } | null> {
  const q = await rest<Array<{ document_type: string | null; created_at: string | null; sha256: string | null; kompaniya_id: number; obyekt_id: number | null }>>(env,
    `t2_document_registry?id=eq.${Number(id)}&select=document_type,created_at,sha256,kompaniya_id,obyekt_id&limit=1`);
  return Array.isArray(q) && q[0] ? q[0] : null;
}
