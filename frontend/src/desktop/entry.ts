import { desktopFetch, nativeInvoke } from './fetch-shim';

// Installed desktop only: set up native transport BEFORE the web application imports.
const nativeFetch = desktopFetch(window.fetch.bind(window), nativeInvoke, window.location.origin);
window.fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  if (response.status === 401) window.dispatchEvent(new Event('desktop-session-ended'));
  return response;
};
window.addEventListener('desktop-session-ended', () => {
  // Drop all ordinary web-app memory too; native 401/clear has already closed the credential.
  document.documentElement.style.visibility = 'hidden';
  window.location.reload();
});
void import('../main');
void import('./offline-panel').then(m => m.mountDesktopOfflinePanel());
