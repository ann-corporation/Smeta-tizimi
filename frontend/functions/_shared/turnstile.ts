/**
 * Cloudflare Turnstile (bot himoyasi) — ixtiyoriy, sozlama bilan yoqiladi.
 * Server: env TURNSTILE_SECRET (sir) o'rnatilgan bo'lsa, ro'yxat/kod so'rovida `turnstile_token` majburiy va siteverify orqali tekshiriladi.
 * O'rnatilmagan bo'lsa — hozirgi xulq (tekshiruv yo'q). Klient: VITE_TURNSTILE_SITE_KEY (src/components/Turnstile.tsx).
 * Token bir martalik: faqat KOD SO'RASH nuqtalarida tekshiriladi (kod olinmasa ro'yxat tasdiqlanmaydi).
 */
export type TurnstileEnv = { TURNSTILE_SECRET?: string };
export const turnstileYoqilgan = (env: TurnstileEnv) => String(env.TURNSTILE_SECRET ?? '').trim().length > 0;

export async function turnstileTekshir(env: TurnstileEnv, token: unknown, ip?: string | null): Promise<{ ok: true } | { ok: false; code: 'TURNSTILE_KERAK' | 'TURNSTILE_RAD' | 'TURNSTILE_XIZMAT' }> {
  if (!turnstileYoqilgan(env)) return { ok: true };
  const t = typeof token === 'string' ? token.trim() : '';
  if (!t || t.length > 2048) return { ok: false, code: 'TURNSTILE_KERAK' };
  try {
    const form = new FormData();
    form.set('secret', String(env.TURNSTILE_SECRET).trim());
    form.set('response', t);
    if (ip) form.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    if (!r.ok) return { ok: false, code: 'TURNSTILE_XIZMAT' };
    const d = await r.json().catch(() => null) as { success?: boolean } | null;
    return d?.success === true ? { ok: true } : { ok: false, code: 'TURNSTILE_RAD' };
  } catch { return { ok: false, code: 'TURNSTILE_XIZMAT' }; }
}

export const turnstileXabar = (code: string) => code === 'TURNSTILE_XIZMAT'
  ? 'Bot tekshiruvi hozir mavjud emas. Keyinroq urinib ko\'ring.'
  : 'Bot tekshiruvidan o\'ting va qayta urinib ko\'ring.';