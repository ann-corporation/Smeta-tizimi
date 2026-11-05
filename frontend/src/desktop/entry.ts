import { desktopFetch, nativeInvoke } from './fetch-shim';

// Installed desktop only: set up native transport BEFORE the web application imports.
window.fetch = desktopFetch(window.fetch.bind(window), nativeInvoke, window.location.origin);
void import('../main');
