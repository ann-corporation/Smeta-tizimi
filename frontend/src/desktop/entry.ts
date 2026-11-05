import { desktopFetch, nativeInvoke } from './fetch-shim';
import { base64urlDecode } from './offline-lease';
import { t } from '../i18n/til';

// Same application and routes. Only the installed transport supplies offline reads.
let banner: HTMLElement | undefined;
const invalidate = () => { document.documentElement.style.visibility = 'hidden'; window.location.reload(); };
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
const pages = desktopFetch(window.fetch.bind(window), nativeInvoke, window.location.origin, { publicKey, kid: import.meta.env.VITE_DESKTOP_LEASE_KID ?? '', status, invalidate });
window.fetch = async (input, init) => {
  const response = await pages(input, init);
  if (response.status === 401) window.dispatchEvent(new Event('desktop-session-ended'));
  return response;
};
window.addEventListener('desktop-session-ended', invalidate);
void import('../main');
