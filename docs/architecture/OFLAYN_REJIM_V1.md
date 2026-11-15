# Oflayn rejim v1 - Onlayn qobiq ilovalari (Windows, Android; iOS/macOS bir xil qobiq)

Holat: kodlandi (2026-11-15), `claude/oflayn-rejim`. Asos: `MOBILE_M1_ANDROID_IOS.md` "Onlayn qobiq" (ilova jonli saytni yuklaydi).

## Nima ishlaydi oflayn
| Narsa | Oflayn |
|---|---|
| Ilovani ochish | Ha, agar shu qurilmada kamida bir marta onlayn ochilgan bo'lsa (servis-worker ilova qobig'ini oldindan keshlagan) |
| O'qish (obyektlar, daraxt, holat, akt reestri, narx nazorati, sessiya/kompaniya) | Ha - oxirgi onlayn ko'rilgan holatda, tepada "Oflayn - ma'lumot HH:MM holatiga" |
| Hech ochilmagan obyekt | Faqat "Oflayn uchun tayyorlash" bilan oldindan yuklangan bo'lsa |
| Fakt kiritish (`fakt_yoz_v2`, `fakt_belgila_v2`) | Navbatga tushadi ("navbatda, yuborilmagan"), aloqa qaytganda tartib bilan yuboriladi |
| F-2 yaratish/tasdiqlash, imzo, to'lov, import, foto yuklash, tahrirlash, eksportning yangi hisobi | Yo'q (ataylab). Foydalanuvchi aniq xabar oladi |
| Kirish (login) oflayn | Yo'q. Sessiya cookie yaroqli bo'lsa va oxirgi server tasdig'i < 72 soat bo'lsa kesh bilan ochiladi; kesh yo'q bo'lsa "Qayta urinish" kartasi |

Pul qiymatlari keshdan AYNAN saqlangan baytlar bilan beriladi; noma'lum (`null`) noma'lum qoladi; oflayn hech narsa qayta hisoblanmaydi.

## Arxitektura
```
sayt (https://smeta-tizimi.pages.dev, WebView)         Rust (src-tauri)
 main.tsx -> oflaynBoshlash()                             oflayn.rs
  fetch qatlami (lib/oflayn/fetch.ts)  --invoke-->         oflayn_holat / _kesh_yoz|oqi|tozala / _navbat_* / _qobiq_tayyor
  Fakt navbati (navbat.ts), banner, tayyorlash             AES-256-GCM fayllar: <appdata>/oflayn-v1/<cache_id>/
 servis-worker (public/sw.js): faqat statik qobiq          kalit: Windows Credential Manager / Apple Keychain / Android Keystore
```
- **Ko'prik** (`capabilities/remote.json`): faqat `https://smeta-tizimi.pages.dev` ga, faqat `oflayn-remote` ruxsati (8 ta `oflayn_*` buyruq). `core:*`, fayl tizimi, shell, opener, eski `desktop_*` buyruqlari remote'ga BERILMAGAN. Mahalliy yuklagich faqat `oflayn_qobiq_bor` (mantiqiy qiymat) oladi.
- **Doira (scope)** sahifadan olinmaydi: Rust sessiya cookie'sini (HttpOnly) webview'dan o'qiydi, `GET /api/sessiya` bilan serverda tasdiqlaydi (foydalanuvchi_id + kompaniyalar). Buyruqlarda aktyor/kompaniya parametri yo'q.
- **Offline darvoza**: har buyruqda cookie aktyori saqlangan tasdiqlangan doira bilan teng bo'lishi va oxirgi server tasdig'i < 72 soat bo'lishi shart. Aks holda rad. Cookie yo'q / aktyor boshqa / a'zolik o'zgargan / server 401 -> fayllar o'chadi va kalit almashadi (crypto-erasure).
- **Kesh yozuvi**: kalit = `r_` + SHA-256(so'rov) (sahifa hisoblaydi, diskka yo'l tanlay olmaydi); AAD = aktyor + cache_id + nom; TTL 72 soat; bitta yozuv <= 24 MB, jami <= 512 MB (eng eski kesh yozuvlari chiqariladi; navbat hech qachon).
- **Fakt navbati**: `q_<ms>-<hex>` yozuvlari (<= 8 MB, <= 200 ta), TTL yo'q. Yuborish tartib bilan, `operation_id` bilan (idempotent). 5xx/tarmoq - qayta uriniladi; 401 - qayta kirish; boshqa rad (ziddiyat, F-2 tasdiqlangan, akt qulflangan) - yozuv "nizo" bo'lib qoladi, bannerda ko'rinadi, navbat shu yerda to'xtaydi; foydalanuvchi "Qayta yuborish" yoki "Bekor qilish" ni tanlaydi. Hech narsa jim ustidan yozilmaydi.
- **Chiqish**: yuborilmagan navbat bo'lsa avval yuborishga urinadi, qolsa bir marta ogohlantiradi (60 s ichida qayta bosilsa chiqadi va hamma narsa o'chadi).
- **Oddiy brauzer**: ko'prik yo'q -> `oflaynBoshlash()` hech narsa o'rnatmaydi; pul ma'lumoti diskka yozilmaydi.
- **Qobiq (Windows/Android)**: `sw.js` `{type:'OFLAYN_PRECACHE'}` xabarida `/sw-manifest.json` (build yasaydi, heshli fayllar ro'yxati) dagi hamma faylni keshlaydi (~15 MB), belgi qo'yadi; keyingi versiyalarda o'rnatishda avtomatik. Navigatsiya tarmoq birinchi, 8 s ichida javob bo'lmasa keshdagi `/`. `/api/*` hech qachon SW'da keshlanmaydi. Sayt `oflayn_qobiq_tayyor` bilan belgi yozadi; mahalliy yuklagich (`offline/loader.js`) internet yo'q va belgi bor bo'lsa saytni baribir ochadi (SW qobiqni beradi, ma'lumot native keshdan).

## Xavfsizlik testlari
- Rust: `cargo test` (src-tauri) - `tests/acl.rs` Tauri'ning haqiqiy ACL'i (remote faqat 8 buyruq; `desktop_*`, `plugin:fs|shell|opener|event|window`, mahalliy-only buyruq rad; o'xshash originlar `smeta-tizimi.pages.dev.evil.example`, `http://` rad); `oflayn_tests.rs` - aktyorlararo o'qish xatosi, AAD, TTL, hajm/kalit grammatikasi, chiqish/a'zolik o'zgarishida o'chirish, 72 soat darvozasi, navbat tartibi.
- Vitest (`src/lib/oflayn`): o'qish interceptori (onlayn o'tkazish, oflayn berish, server xatosida kesh BERILMASLIGI, brauzerda diskka yozmaslik), navbat (tartib, idempotentlik, ziddiyatni ko'rsatish), `sw.js` (navigatsiya zaxirasi, /api ushlanmasligi, oldindan keshlash).

## Ma'lum cheklovlar
- Foto yuklash (`/api/foto-dalil` va h.k.) navbatga kirmaydi: oflayn rasm bilan Fakt navbati keyingi bosqich.
- Kesh kaliti so'rov tanasiga bog'liq: oflayn sahifa onlayn ko'rilgan so'rovlarni qayta so'raydi; ko'rilmagan filtr/oyna keshda topilmaydi ("Oflayn uchun tayyorlash" sahifalar ishlatadigan yuklagichlarni chaqiradi).
- `AbortError` (60/90 s timeout) keshdan javob olmaydi (server javob bergan bo'lishi mumkin).
- iOS (WKWebView) servis-worker faqat app-bound domenlarda: oflayn qobiq iOS'da tekshirilmagan; kesh/navbat ko'prigi o'sha.
- Chiqish yoki aktyor almashganda yuborilmagan navbat o'chadi (xavfsizlik ustuvor); ogohlantirish bor.
- `fakt_belgila_v2` yo'qolgan javobdan keyin qayta yuborilsa server FAKT_CONFLICT'ni dedupe'dan oldin tekshirishi mumkin (OBYEKT_PAKET ADR 0): foydalanuvchiga ziddiyat sifatida ko'rinadi, jim emas.
