/**
 * AI telemetriyasi: har model chaqiruvi uchun ixcham o'lchov qatori (yuza, model, kechikish, ok/xato kodi, niyat, vosita nomlari, token).
 * Foydalanuvchi matni, savol/javob, kalit yoki fayl HECH QACHON yozilmaydi - faqat sonlar va qisqa kodlar (public repo + maxfiylik).
 * Yozuv "best effort": xato yoki sekin baza AI javobiga ta'sir qilmaydi (hech qachon throw qilmaydi, 2 soniyada to'xtaydi).
 * DB: t2_ai_telemetriya (20270104000000), 30 kunlik saqlash - arxiv-siyosat.ts. Migratsiya qo'llanmagan bo'lsa RPC 404 beradi - jim o'tkaziladi.
 */
import { supabaseBaseUrl } from './supabase-url';

export type TelEnv = { SUPABASE_URL?: string; SUPABASE_KEY?: string };
export type TelManba = 'tool' | 'model' | 'local';
export type TelYozuv = {
  actor?: number | null; kompaniyaId?: number | null;
  yuza: string; model?: string | null; kechikishMs?: number | null;
  ok: boolean; xatoKod?: string | null; niyat?: string | null;
  vositalar?: readonly string[]; vositaXato?: number;
  kirish?: number | null; chiqish?: number | null; manba?: TelManba | null;
};

const KOD = /^[A-Za-z0-9_.:-]{1,40}$/;
const JAMI_YUZA = /^[a-z_]{2,30}$/;
const kodTozala = (v: unknown): string | null => (typeof v === 'string' && KOD.test(v) ? v : null);

/** amal/profil nomidan "yuza" (surface) - o'lchov hisobotida guruhlash uchun. */
export function yuzaAniqla(amal: string | null | undefined, profil?: string | null, yol?: 'workers'): string {
  if (yol === 'workers') return 'workers_ai';
  const a = String(amal ?? ''); const p = String(profil ?? '');
  if (a === 'ai_ishchi') return 'ai_ishchi';
  if (a === 'ombor_buyruq') return 'ombor';
  if (a.startsWith('jarvis') || ['kasb_savol', 'savol', 'fikr', 'qadam_taklif', 'veb_tahlil', 'rivojlanish', 'bilim_yigish'].includes(a)) return 'jarvis';
  if (a.startsWith('smeta') || p === 'smeta_ai' || a === 'narx_moslash') return 'smeta_ai';
  return 'boshqa';
}

/** Istisnodan qisqa xato kodi: byudjet xatosi `kod`, AI gateway xatosi `code`; bo'lmasa AI_XATO. */
export function xatoKodi(e: unknown): string {
  const o = (e ?? {}) as { kod?: unknown; code?: unknown };
  return kodTozala(o.kod) ?? kodTozala(o.code) ?? 'AI_XATO';
}

/** Hech qachon throw qilmaydi. Natija: yozildimi. */
export async function telemetriyaYoz(env: TelEnv, y: TelYozuv): Promise<boolean> {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return false;
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_ai_telemetriya_yoz_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
      body: JSON.stringify({
        p_actor_id: y.actor ?? null, p_kompaniya_id: y.kompaniyaId ?? null, p_yuza: JAMI_YUZA.test(y.yuza) ? y.yuza : 'boshqa',
        p_model: y.model ? String(y.model).slice(0, 120) : null,
        p_kechikish_ms: y.kechikishMs == null || !Number.isFinite(y.kechikishMs) ? null : Math.max(0, Math.round(y.kechikishMs)),
        p_ok: y.ok, p_xato_kod: y.ok ? null : kodTozala(y.xatoKod) ?? 'AI_XATO', p_niyat: kodTozala(y.niyat),
        p_vositalar: (y.vositalar ?? []).map(kodTozala).filter((x): x is string => !!x).slice(0, 12),
        p_vosita_xato: Math.max(0, Math.round(y.vositaXato ?? 0)),
        p_kirish: Math.max(0, Math.round(y.kirish ?? 0)), p_chiqish: Math.max(0, Math.round(y.chiqish ?? 0)), p_manba: y.manba ?? null,
      }),
    });
    await r.body?.cancel().catch(() => undefined);
    return r.ok;
  } catch { return false; }
}
