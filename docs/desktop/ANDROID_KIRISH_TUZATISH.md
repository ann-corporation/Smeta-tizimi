# Android: kirish tuzatishi (QURAI 0.1.1)

## Topilgan sabablar
1. Google: Google OAuth/GSI ichki WebView'da bloklanadi (disallowed_useragent) va GSI popup'i WebView'da ochilmaydi.
2. Telegram: «Telegramni ochish» havolasi `target=_blank` edi; Android WebView'da yangi oyna yo'q, havola jim o'ladi.
3. Eslab qolmaslik: sessiya cookie to'g'ri doimiy (Max-Age 90 kun), lekin Android WebView cookie'ni diskka kechikib yozadi.
   Emulyatorda isbot: `document.cookie='ptest=1; Max-Age=86400; Secure'` → `am force-stop` → qayta ochilgach cookie yo'q
   (eski `g_state` cookie qolgan). Ilova yopilishidan oldin `CookieManager.flush()` chaqirilmagan edi.
4. Login+parol: ilova ichida forma ochiladi, lekin `POST /api/kirish` serverda osilib qoladi (xost kompyuterdan ham 40-60 s
   javob yo'q). Sabab: `t2_parol_tekshir_v1` yoki eski GAS yo'li (`GAS_URL`) fetch'ida timeout yo'q edi. Endi 12 s / 15 s timeout.
   Haqiqiy (egasining) hisobida GAS yo'liga tushyaptimi — Supabase `t2_parol_tekshir_v1` loglaridan tekshirilsin.

## Qilingan o'zgarishlar
- `mobile/android-overlay.mjs`: MainActivity `onPause/onStop/onDestroy` da cookie flush; `qurai://kirish?t=` deep link
  (manifest intent-filter + `singleTask`); bilet kelganda WebView'da `/ilova-qaytdi?t=` ochiladi.
- `src-tauri/src/shell.rs`: `/brauzer-kirish` tizim brauzerida ochiladi (yangi IPC yo'q, remote capability o'zgarmadi).
- Sayt: `/brauzer-kirish`, `/ilova-qaytdi`, `/api/ilova-kirish` (AES-GCM bilet, 120 s, sir xeshi bilan bog'langan, DB yo'q);
  ilovada Google o'rniga «Brauzer orqali kirish»; Telegram havolasi shu oynada ochiladi.
- `api/kirish.ts`: Supabase/GAS fetch timeout.

## Egasi/konsolda kerak
- Google Cloud Console o'zgarishi KERAK EMAS (kirish oddiy Chrome'da, mavjud origin bilan).
- Yangi APK yig'ish (`android-overlay.mjs` qayta ishlatiladi), versionCode oshirish, imzolash. Sayt (Pages) APKdan OLDIN deploy bo'lsin.
- App Links (assetlinks.json) shart emas: maxsus sxema `qurai://` ishlatilgan. Keyin xohlansa https App Link'ga o'tish mumkin
  (`/.well-known/assetlinks.json` + imzo SHA-256).
- Telegram: bot domeni sozlamasi kerak emas (kirish kontakt orqali, widget emas).
