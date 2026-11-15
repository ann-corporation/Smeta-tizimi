// Smeta Tizimi "Onlayn qobiq" loader. No IPC is used here. It only checks that the live site is reachable
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

  function start() {
    off.hidden = true;
    busy.hidden = false;
    probe().then(function (ok) {
      if (ok) { location.replace(SITE); return; }
      busy.hidden = true;
      off.hidden = false;
    });
  }

  retry.addEventListener('click', start);
  window.addEventListener('online', start);
  start();
})();
