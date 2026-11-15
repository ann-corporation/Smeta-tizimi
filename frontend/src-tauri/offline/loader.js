// QURAI "Onlayn qobiq" loader. No IPC is used here. It only checks that the live site is reachable
// and then hands the window over to it; otherwise it shows the offline card with a retry button.
(function () {
  'use strict';
  var SITE = 'https://smeta-tizimi.pages.dev/';
  var lang = String((navigator.language || 'uz')).slice(0, 2).toLowerCase();
  document.documentElement.setAttribute('data-lang', lang === 'ru' || lang === 'en' ? lang : 'uz');
  document.documentElement.lang = document.documentElement.getAttribute('data-lang');

  var busy = document.getElementById('busy');
  var off = document.getElementById('off');
  var retry = document.getElementById('retry');

  function probe() {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : 0;
    return fetch(SITE + 'favicon.ico?_=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function () { clearTimeout(timer); return true; }, function () { clearTimeout(timer); return false; });
  }

  // Offline start: if the site has precached its app shell (service worker), open the site anyway; the service worker
  // serves the shell and the site's data comes from the encrypted native cache. The marker is written by the site
  // (oflayn_qobiq_tayyor) after the shell precache finished; it is a boolean here, no user data.
  function shellBor() {
    var core = window.__TAURI_INTERNALS__;
    if (!core || typeof core.invoke !== 'function') return Promise.resolve(false);
    return Promise.resolve(core.invoke('oflayn_qobiq_bor')).then(function (v) { return v === true; }, function () { return false; });
  }

  function start() {
    off.hidden = true;
    busy.hidden = false;
    probe().then(function (ok) {
      // Ilova ish quroli: kirgan foydalanuvchi to'g'ridan-to'g'ri ish joyiga; kirmagan bo'lsa /admin «Kirish» ni ko'rsatadi.
      if (ok) { location.replace(SITE + 'admin'); return; }
      shellBor().then(function (bor) {
        if (bor) { location.replace(SITE + 'admin'); return; }
        busy.hidden = true;
        off.hidden = false;
      });
    });
  }

  retry.addEventListener('click', start);
  window.addEventListener('online', start);
  start();
})();
