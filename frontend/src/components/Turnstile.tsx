import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile vidjeti — VITE_TURNSTILE_SITE_KEY o'rnatilgan bo'lsagina ko'rinadi/talab qilinadi.
 * O'rnatilmagan bo'lsa hech narsa chizmaydi va token talab qilinmaydi (hozirgi xulq). Server: functions/_shared/turnstile.ts.
 */
type TsApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void };
declare global { interface Window { turnstile?: TsApi } }

export const TURNSTILE_SITE_KEY: string = String((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_TURNSTILE_SITE_KEY ?? '').trim();
const SKRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let yuklanmoqda: Promise<void> | null = null;
function skriptYukla(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  yuklanmoqda ??= new Promise<void>((ok, xato) => {
    const s = document.createElement('script');
    s.src = SKRIPT; s.async = true; s.onload = () => ok(); s.onerror = () => { yuklanmoqda = null; xato(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return yuklanmoqda;
}

/** Hook: `token` (yoki null) va `reset()` (token ishlatilgach yangisini oladi). Yoqilmagan bo'lsa `yoqilgan=false`. */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const idRef = useRef<string | undefined>(undefined);
  const reset = useCallback(() => { setToken(null); if (idRef.current) window.turnstile?.reset(idRef.current); }, []);
  return { yoqilgan: !!TURNSTILE_SITE_KEY, token, setToken, reset, idRef };
}

export function TurnstileVidjet({ onToken, idRef }: { onToken: (t: string | null) => void; idRef: { current: string | undefined } }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !el.current) return;
    let bekor = false; const host = el.current;
    skriptYukla().then(() => {
      if (bekor || !window.turnstile) return;
      idRef.current = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITE_KEY, theme: 'auto',
        callback: (t: string) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null),
      });
    }).catch(() => onToken(null));
    return () => { bekor = true; if (idRef.current) { window.turnstile?.remove(idRef.current); idRef.current = undefined; } };
  }, [onToken, idRef]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={el} className="entry-turnstile" style={{ margin: '8px 0' }} />;
}