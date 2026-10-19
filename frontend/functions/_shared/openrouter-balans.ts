/**
 * OpenRouter hisobining holati superadmin AI markazi uchun (egasi 2026-10-19: "balansni panelda ko'rsat").
 * Kalit qiymati hech qachon qaytmaydi — faqat holat va dollar summalar. Bir vaqtda kalitning o'zi ham tekshiriladi:
 * bo'sh, OpenRouter rad etgan yoki kredit tugagan — har biri alohida holat.
 */
export type OrBalansHolat = 'ok' | 'kalit_yoq' | 'rad_etildi' | 'xato';
export type OrBalans = {
  holat: OrBalansHolat;
  qoldiq_usd: number | null;       // hisobdagi umumiy qoldiq (sotib olingan − sarflangan)
  sarflangan_usd: number | null;
  kalit_qoldiq_usd: number | null; // shu kalitga qo'yilgan limitdan qolgani (limit yo'q bo'lsa null)
};

const OR = 'https://openrouter.ai/api/v1';
const son = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function ol(yol: string, kalit: string): Promise<{ status: number; data: Record<string, unknown> | null }> {
  try {
    const r = await fetch(OR + yol, { headers: { Authorization: 'Bearer ' + kalit }, signal: AbortSignal.timeout(5000) });
    const j = await r.json().catch(() => null) as { data?: Record<string, unknown> } | null;
    return { status: r.status, data: r.ok ? j?.data ?? null : null };
  } catch {
    return { status: 0, data: null };
  }
}

export async function openrouterBalans(kalitXom: string | undefined): Promise<OrBalans> {
  const kalit = String(kalitXom ?? '').trim();
  const bosh: OrBalans = { holat: 'kalit_yoq', qoldiq_usd: null, sarflangan_usd: null, kalit_qoldiq_usd: null };
  if (!kalit) return bosh;
  const [kr, ky] = await Promise.all([ol('/credits', kalit), ol('/key', kalit)]);
  if (kr.status === 401 || ky.status === 401) return { ...bosh, holat: 'rad_etildi' };
  const jami = son(kr.data?.total_credits), sarf = son(kr.data?.total_usage);
  const out: OrBalans = {
    holat: kr.data || ky.data ? 'ok' : 'xato',
    qoldiq_usd: jami != null && sarf != null ? Math.round((jami - sarf) * 10000) / 10000 : null,
    sarflangan_usd: sarf ?? son(ky.data?.usage),
    kalit_qoldiq_usd: son(ky.data?.limit_remaining),
  };
  return out;
}
