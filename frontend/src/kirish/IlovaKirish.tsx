/**
 * Ilova (Tauri Android WebView) kirishi: Google WebView'da bloklanadi (disallowed_useragent), Telegram/GSI popup ochilmaydi.
 * Shuning uchun kirish TIZIM BRAUZERIDA bajariladi va ilovaga bir martalik bilet qaytadi (qurai://kirish?t=...).
 *  1) ilova: sir (tasodifiy) → localStorage; h=sha256(sir) bilan /brauzer-kirish?h= ni ochadi (Rust qobig'i uni tizim brauzeriga uzatadi);
 *  2) brauzer: oddiy kirish (hamma usul ishlaydi) → /api/ilova-kirish {bilet,h} → qurai://kirish?t=bilet;
 *  3) ilova (MainActivity) /ilova-qaytdi?t=bilet ni WebView'da ochadi → /api/ilova-kirish {almash,bilet,sir} → cookie → /admin.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SIR_KALIT = 'qurai_ilova_sir';
const XESH_RE = /^[A-Za-z0-9_-]{43}$/;
const BILET_RE = /^[A-Za-z0-9_-]{20,4000}$/;

/** Tauri Android WebView ("; wv)" belgisi) — oddiy Chrome/Safari emas. */
export function ilovaWebViewmi(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Android/.test(ua) && /; wv\)/.test(ua);
}

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function sirYarat(): Promise<{ sir: string; h: string }> {
  const sir = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const h = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sir))));
  return { sir, h };
}

/** «Brauzer orqali kirish» tugmasi bosilganda: sirni saqlab, tizim brauzerini ochadigan manzilga o'tadi. */
export async function brauzerdaKirishBoshla(): Promise<boolean> {
  try {
    const { sir, h } = await sirYarat();
    localStorage.setItem(SIR_KALIT, JSON.stringify({ sir, vaqt: Date.now() }));
    window.location.href = '/brauzer-kirish?h=' + h;
    return true;
  } catch { return false; }
}

/** Tizim brauzerida ochiladi (/brauzer-kirish?h=...): kirgan bo'lsa bilet beradi, bo'lmasa avval kirishga yuboradi. */
export function BrauzerKirish() {
  const navigate = useNavigate();
  const loc = useLocation();
  const h = new URLSearchParams(loc.search).get('h') || '';
  const [xato, setXato] = useState('');
  const [qurai, setQurai] = useState('');
  useEffect(() => {
    if (!XESH_RE.test(h)) { setXato('Havola yaroqsiz. Ilovada qaytadan boshlang.'); return; }
    let tirik = true;
    void (async () => {
      try {
        const r = await fetch('/api/ilova-kirish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'bilet', h }) });
        if (!tirik) return;
        if (r.status === 401) { navigate('/', { replace: true, state: { qaytish: '/brauzer-kirish?h=' + h } }); return; }
        const d = await r.json() as { ok?: boolean; bilet?: string };
        if (!d.ok || !d.bilet) { setXato('Kirib bo‘lmadi. Qaytadan urinib ko‘ring.'); return; }
        const url = 'qurai://kirish?t=' + d.bilet;
        setQurai(url);
        window.location.href = url;
      } catch { if (tirik) setXato('Tarmoq xatosi. Qaytadan urinib ko‘ring.'); }
    })();
    return () => { tirik = false; };
  }, [h, navigate]);
  return (
    <main style={{ maxWidth: 420, margin: '20vh auto', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      {xato ? <p role="alert">{xato}</p> : qurai
        ? <><p>Ilovaga qaytilmoqda…</p><p><a href={qurai} style={{ fontWeight: 600 }}>QURAI ilovasini ochish</a></p></>
        : <p>Tekshirilmoqda…</p>}
    </main>
  );
}

/** Ilova WebView'ida ochiladi (/ilova-qaytdi?t=...): bilet + sir → sessiya cookie → ish joyi. */
export function IlovaQaytdi() {
  const loc = useLocation();
  const [xato, setXato] = useState('');
  useEffect(() => {
    const t = new URLSearchParams(loc.search).get('t') || '';
    let sir = '';
    try { sir = (JSON.parse(localStorage.getItem(SIR_KALIT) || 'null') as { sir?: string } | null)?.sir || ''; } catch { /* xotira yopiq */ }
    if (!BILET_RE.test(t) || !sir) { setXato('Kirish yakunlanmadi. Ilovada qaytadan boshlang.'); return; }
    void (async () => {
      try {
        const r = await fetch('/api/ilova-kirish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'almash', bilet: t, sir }) });
        if (!r.ok) { setXato('Bilet eskirgan yoki yaroqsiz. Qaytadan urinib ko‘ring.'); return; }
        try { localStorage.removeItem(SIR_KALIT); } catch { /* */ }
        window.location.replace('/admin');
      } catch { setXato('Tarmoq xatosi. Qaytadan urinib ko‘ring.'); }
    })();
  }, [loc.search]);
  return (
    <main style={{ maxWidth: 420, margin: '20vh auto', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      {xato ? <><p role="alert">{xato}</p><p><a href="/">Kirish sahifasi</a></p></> : <p>Kirilmoqda…</p>}
    </main>
  );
}
