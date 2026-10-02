/**
 * «Google bilan kirish» tugmasi (egasi, 2026-10-02). Google Identity Services skripti faqat shu tugma kerak
 * bo'lganda yuklanadi; Client ID serverdan (`GET /api/kirish-google`) — sozlanmagan bo'lsa tugma umuman chiqmaydi.
 * Google bergan ID token serverda tekshiriladi (`POST /api/kirish-google`), sessiya cookie o'sha yerda beriladi.
 */
import { useEffect, useRef, useState } from 'react';
import { t, tilOl } from '../i18n/til';

type GoogleId = {
  accounts: { id: {
    initialize: (o: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: string; auto_select?: boolean }) => void;
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  } };
};
declare global { interface Window { google?: GoogleId } }

let skript: Promise<void> | null = null;
function gsiYukla(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  skript ??= new Promise((ok, xato) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { skript = null; xato(new Error('GSI')); };
    document.head.appendChild(s);
  });
  return skript;
}

export type GoogleNatija = { ok: true; rol: string; yangi: boolean; demo: boolean } | { ok: false; xato: string };

export default function GoogleKirish({ matn, onNatija, onBoshlandi }: {
  matn: 'signin_with' | 'signup_with';
  onNatija: (n: GoogleNatija) => void;
  onBoshlandi?: () => void;
}) {
  const joy = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const natijaRef = useRef(onNatija); natijaRef.current = onNatija;
  const boshRef = useRef(onBoshlandi); boshRef.current = onBoshlandi;

  useEffect(() => {
    let tirik = true;
    fetch('/api/kirish-google').then((r) => r.json()).then((d: { clientId?: string | null }) => { if (tirik && d.clientId) setClientId(d.clientId); }).catch(() => undefined);
    return () => { tirik = false; };
  }, []);

  useEffect(() => {
    if (!clientId || !joy.current) return;
    let tirik = true;
    gsiYukla().then(() => {
      const g = window.google?.accounts.id;
      if (!tirik || !g || !joy.current) return;
      g.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          if (!credential) { natijaRef.current({ ok: false, xato: 'Google javob bermadi' }); return; }
          boshRef.current?.();
          try {
            const r = await fetch('/api/kirish-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
            const d = await r.json();
            natijaRef.current(d.ok ? { ok: true, rol: d.rol, yangi: !!d.yangi, demo: !!d.demo } : { ok: false, xato: d.xato || 'Google bilan kirib bo‘lmadi' });
          } catch { natijaRef.current({ ok: false, xato: 'Tarmoq xatosi' }); }
        },
      });
      g.renderButton(joy.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: matn, width: joy.current.offsetWidth || 320, logo_alignment: 'center', locale: tilOl() === 'uz-Cyrl' ? 'uz' : tilOl() });
    }).catch(() => undefined);
    return () => { tirik = false; };
  }, [clientId, matn]);

  if (!clientId) return null;
  return (
    <div className="flex flex-col gap-3">
      {/* colorScheme: 'normal' — qorong'i sahifada Google iframe'i atrofidagi oq fon chiqmasligi uchun. */}
      <div ref={joy} className="w-full flex justify-center min-h-[44px]" style={{ colorScheme: 'normal' }} data-testid="google-kirish" />
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-500">
        <span className="h-px flex-1 bg-white/10" />{t('yoki')}<span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}
