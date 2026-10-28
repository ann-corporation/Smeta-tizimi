/**
 * ai-mijoz-narx.ts — AI modelining MIJOZ narxi (egasi 2026-10-27: «kompaniyalar mayli tanlay olaversin … faqat narxi bilan
 * ogohlantirish kerak»). Kompaniyaga provayder narxi (USD), ustama va USD kursi KO'RSATILMAYDI — faqat token.
 *
 * Formula YANGI EMAS — AI sarfi hamyondan yechiladigan `t2_agent_sarf_yoz_v1` (migratsiya 20261106300000) bilan AYNAN bir xil:
 *   mijoz_usd = round(tannarx_usd × (1 + ustama% / 100), 6);  token = max(ceil(mijoz_usd × usd_kurs / token_som), 1)
 *   ustama% = kompaniyaga alohida (t2_agent_ustama) > platforma standarti (t2_token_sozlama.ai_ustama_foiz) > 40  (_t2_agent_ustama_v1)
 * «1 so'rov» tannarxi — model tanlagichdagi mavjud taxmin `javobNarxi` (≈3000 kirish + 500 chiqish token, agent-modellar.ts).
 * Sozlamani o'qib bo'lmasa token berilmaydi — faqat narx darajasi (arzon / o'rta / qimmat), raqamsiz.
 */
import { supabaseBaseUrl } from './supabase-url';
import { javobNarxi } from './agent-modellar';

export type NarxDaraja = 'arzon' | 'orta' | 'qimmat';
export type MijozNarxParam = { token_som: number; usd_kurs: number; ustama_foiz: number };

/** Daraja chegaralari (USD, bir so'rov tannarxi) — `baholash` dagi «Qimmat: har javob > $0.01» chegarasi bilan bir xil. */
export function narxDarajasi(javobUsd: number): NarxDaraja {
  return javobUsd > 0.01 ? 'qimmat' : javobUsd > 0.002 ? 'orta' : 'arzon';
}

/** `t2_agent_sarf_yoz_v1` dagi token formulasi (tannarx 0 yoki yo'q — token yechilmaydi). */
export function mijozTokeni(tannarxUsd: number, p: MijozNarxParam): number {
  if (!(tannarxUsd > 0)) return 0;
  const mijozUsd = Math.round(tannarxUsd * (1 + p.ustama_foiz / 100) * 1e6) / 1e6;
  return Math.max(Math.ceil((mijozUsd * p.usd_kurs) / p.token_som), 1);
}

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string };
const kesh = new Map<string, { vaqt: number; p: MijozNarxParam | null }>();

async function qator(env: Env, yol: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/' + yol, { headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json() as unknown;
  return Array.isArray(d) && d[0] && typeof d[0] === 'object' ? d[0] as Record<string, unknown> : null;
}

/** Narx parametrlari (server ichida; javobga CHIQMAYDI). 60 s keshlanadi. Xato bo'lsa — null. */
export async function mijozNarxParam(env: Env, kid: number | null, hozir = Date.now()): Promise<MijozNarxParam | null> {
  const kalit = String(kid ?? 0);
  const k = kesh.get(kalit);
  if (k && hozir - k.vaqt < 60_000) return k.p;
  let p: MijozNarxParam | null = null;
  try {
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      const s = await qator(env, 't2_token_sozlama?id=eq.1&select=token_som,usd_kurs,ai_ustama_foiz');
      const u = kid != null ? await qator(env, `t2_agent_ustama?kompaniya_id=eq.${kid}&select=foiz`) : null;
      const token_som = Number(s?.token_som), usd_kurs = Number(s?.usd_kurs);
      const ustama = Number(u?.foiz ?? s?.ai_ustama_foiz ?? 40);
      if (token_som > 0 && usd_kurs > 0 && Number.isFinite(ustama) && ustama >= 0) p = { token_som, usd_kurs, ustama_foiz: ustama };
    }
  } catch { p = null; }
  kesh.set(kalit, { vaqt: hozir, p });
  return p;
}
/** Testlar uchun. */
export const mijozNarxKeshTozala = () => kesh.clear();

const son = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Bitta model uchun mijoz narxi: { javob_token (yoki null), narx_daraja }. Tannarx noma'lum — ikkalasi null. */
export function modelMijozNarxi(kirishUsd: unknown, chiqishUsd: unknown, p: MijozNarxParam | null): { javob_token: number | null; narx_daraja: NarxDaraja | null } {
  const k = son(kirishUsd), c = son(chiqishUsd);
  if (k == null || c == null) return { javob_token: null, narx_daraja: null };
  const usd = javobNarxi({ kirish_usd: k, chiqish_usd: c });
  return { javob_token: p ? mijozTokeni(usd, p) : null, narx_daraja: narxDarajasi(usd) };
}

/** `modellar` javobi: katalogning har modeliga mijoz narxi qo'shiladi; superadmin bo'lmaganga USD va narx izohi (USD matni) olib tashlanadi. */
export function modellarMijozga(d: Record<string, unknown>, p: MijozNarxParam | null, superadmin: boolean): Record<string, unknown> {
  if (!Array.isArray(d.katalog)) return d;
  const katalog = d.katalog.map((x) => {
    if (!x || typeof x !== 'object') return x;
    const m = x as Record<string, unknown>;
    const narx = modelMijozNarxi(m.narx_kirish_usd, m.narx_chiqish_usd, p);
    if (superadmin) return { ...m, ...narx };
    const { narx_kirish_usd: _k, narx_chiqish_usd: _c, narx_izoh: _i, ...qolgan } = m;
    return { ...qolgan, ...narx };
  });
  return { ...d, katalog };
}

/** `openrouter_modellar` qatori: mijoz narxi qo'shiladi; superadmin bo'lmaganga USD narxlar va «$» li matnlar (sabab/ogohlantirish) olib tashlanadi. */
export function orQatorMijozga(m: Record<string, unknown>, p: MijozNarxParam | null, superadmin: boolean): Record<string, unknown> {
  const narx = modelMijozNarxi(m.kirish_usd, m.chiqish_usd, p);
  if (superadmin) return { ...m, ...narx };
  const { kirish_usd: _k, chiqish_usd: _c, javob_narxi_usd: _j, narx: _n, ...qolgan } = m;
  const qimmatMatn = narx.javob_token != null ? `Qimmat model: har so‘rov ≈ ${narx.javob_token} token.` : 'Qimmat model: har so‘rov ko‘p token sarflaydi.';
  const sabablar = Array.isArray(m.sabablar) ? m.sabablar.map((s) => (typeof s === 'string' && s.includes('$') ? qimmatMatn : s)) : m.sabablar;
  const ogohlantirish = typeof m.ogohlantirish === 'string' && m.ogohlantirish.includes('$') ? qimmatMatn : m.ogohlantirish;
  return { ...qolgan, ...narx, sabablar, ogohlantirish };
}
