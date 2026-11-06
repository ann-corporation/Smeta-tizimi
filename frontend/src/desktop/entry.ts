import { desktopFetch, nativeInvoke } from './fetch-shim';
import { base64urlDecode } from './offline-lease';
import { t } from '../i18n/til';
import { desktopBootstrap } from './bootstrap';
import { desktopEntryFetch, desktopSessionFetch } from './session-fetch';

// Same application and routes. Only the installed transport supplies offline reads.
let banner: HTMLElement | undefined;
const invalidate = () => { try { resume.clear(); } finally { history.replaceState(null, '', '/'); document.documentElement.style.visibility = 'hidden'; window.location.reload(); } };
const status = (offline: boolean) => {
  if (!banner && document.body) {
    banner = document.createElement('div'); banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:10px 18px;background:#fff3cc;color:#503b00;border:1px solid #bd922c;border-radius:6px;pointer-events:none';
    document.body.append(banner);
  }
  if (banner) { banner.hidden = !offline; banner.textContent = t('Oflayn rejimda faqat oʻqish mumkin.'); }
};
let publicKey = new Uint8Array();
try { publicKey = base64urlDecode(import.meta.env.VITE_DESKTOP_LEASE_PK ?? ''); } catch { /* missing pin denies cache */ }
const original = window.fetch.bind(window);
const pages = desktopSessionFetch(events => desktopFetch(original, nativeInvoke, window.location.origin,
  { publicKey, kid: import.meta.env.VITE_DESKTOP_LEASE_KID ?? '', ...events }),
  { status, invalidate, ended: () => window.dispatchEvent(new Event('desktop-session-ended')) });
const resume = desktopBootstrap({ invoke: nativeInvoke, request: desktopFetch(window.fetch.bind(window), nativeInvoke),
  publicKey, kid: import.meta.env.VITE_DESKTOP_LEASE_KID ?? '', storage: {
    getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v), removeItem: k => localStorage.removeItem(k),
  } });
window.fetch = desktopEntryFetch(original, pages, window.location.origin,
  () => resume.remember(window.location.pathname));
void (async () => {
  const route = await resume.restore();
  // No arbitrary URL/query/hash is restored and no React page mounts before validation.
  history.replaceState(null, '', route ?? '/');
  window.addEventListener('desktop-session-ended', invalidate);
  await import('../main');
})();
