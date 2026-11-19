# Windows = sayt, lekin tezroq: arxitektura variantlari va tavsiya

Sana: 2026-11-19. Asos: `docs/ilova/PARITET.md` (faktlar) va koddagi dalillar.

## 0. Hozirgi holat (faktlar)

- Sayt: 81 sahifa, `frontend/src` 205 908 qator. Oxirgi 14 kunda sayt `frontend/src` ga 925 commit (1656 fayl o'zgargan), `android-native` ga 80 commit. Sayt ~12 baravar tez o'zgaradi.
- Windows (Compose Desktop, `android-native/desktop`) 2 702 qator, 13 modul; 81 sahifadan 1 ✅, 21 🟡, 59 ❌. Android 4 ✅, 37 🟡, 40 ❌. 40 sahifa ikkalasida ham yo'q.
- Ilovalar 77 ta `/api/*` yo'ldan 32 tasini, 53 nomli RPC dan 8 tasini ishlatadi.
- Windows o'rnatgich: MSI 49,5 MB (JRE ichida), Android APK 46,9 MB (`desktop-release.json`, `mobile-release.json`).
- Repoda Tauri qobig'i allaqachon bor (`frontend/src-tauri`, Rust 1 800+ qator): (a) «Onlayn qobiq» (jonli `https://qurai.uz/admin` ni yuklaydi, navigatsiya qo'riqchisi `shell.rs`, oflayn kartochka `offline/`), 15-16.11 da 0.1.1 sifatida chiqqan; (b) «local-bff» rejimi: saytning o'z build'i lokal assetlardan, `/api` Rust `transport.rs` orqali (token Windows Credential Vault da, `maxfiy.rs`), AES-GCM shifrlangan kesh (`cache.rs`), Ed25519 oflayn lease, `src/desktop/*` (20 fayl), izolyatsiyalangan e2e stend (`src-tauri/e2e`). 15.11 dan keyin egasi native Kotlin yo'lini tanlagan, Tauri kodi repoda qolgan va hozir ham quriladi (quyida isbot).
- Sayt build: Vite/rolldown ~3 s, `dist` 21,7 MB / 669 fayl / 14,5 MB JS; kirish chunk 217 KB (70 KB gzip) + 16 modulepreload; og'ir sahifalar lazy chunk (F2ImportV3 243 KB, HolatNative 243 KB, SmetaStudio 240 KB).
- Sayt oflayn bazasi: `public/sw.js` faqat qobiqni keshlaydi, `/api/*` HECH QACHON (moliyaviy qoida). Ma'lumotli oflayn: `ombor-idb.ts`, `lib/usta/navbat.ts`, `_shared/navbat.ts` (fakt/ombor navbati), `jarvis/conversation-outbox.ts`.
- `index.html` Google Fonts ga tashqi havola qiladi: to'liq oflayn qobiq uchun shriftlar lokal bo'lishi kerak.

## 1. Variantlar

### Variant 1: KMP/Compose qayta yozishni davom ettirish

- Paritet kafolati: yo'q. Har sahifa va har qoida ikki marta (Android+Windows uchta bo'lib: sayt, Compose) yoziladi; sayt kuniga ~66 commit bilan ketmoqda, ilova ~6. Ilovada yo'q 40 sahifa + 37 qisman sahifa.
- Qolgan hajm (PARITET asosida): sayt kodining ~85 % i (~175 000 qator ekvivalent), chunki ilovalar jami ~15 % ini qoplagan va o'sha ham ko'pincha faqat o'qish. Eng og'ir oqimlar (LRV import 2630, F2 workbench 2070, F2 import 1963, F2 tayyorlash 1361, fakt jurnal 1263 qator) yozish oqimlari. Kotlinda 1 qator ~1 qator TS deb olinsa ham, bu mavjud Kotlin kodining ~5-6 baravari; ya'ni amalda tugamaydigan yugurish.
- Tezlik: Compose Desktop sovuq start JVM ga bog'liq (JRE 49 MB MSI da). Katta jadval: LazyColumn yaxshi, lekin har jadval qo'lda yoziladi.
- Oflayn: Android Room + Outbox bor; Windows shifrlangan keshi o'qish.
- Kod himoyasi: ProGuard `obfuscate=true` (release) bor; JVM baytkodi baribir qayta tiklanadi.
- Xavf: bir xil mantiq 3 joyda (drift: F2 holatlari, ruxsatlar, `abs(farq)>1.0` chegarasi, menyu); egasining «saytdagidek» talabi hech qachon bajarilmaydi.

### Variant 2: Windows = WebView2 qobig'i, saytning O'ZI lokal assetlar bilan

- Paritet kafolati: 100 % tuzilma bo'yicha (bir xil kod, bir xil build). Sayt ertasi kuni ilovada ham, build qayta olinadi (3 s Vite + Rust yig'ish) yoki avtoyangilanish.
- Tezlik: JS lokal diskdan (tarmoq nol), WebView2 = Chromium; sayt bilan bir xil renderer, ya'ni 1000+ qatorli jadvallar sayt darajasida (`@tanstack/react-virtual` ishlatilgan: F2V3Workbench, EstimateOutline, ish-varaq). Sayt dasturi qanchalik tez bo'lsa, ilova shunchalik tez, lekin tarmoq kechikishsiz.
- Oflayn: qobiq oflayn ochiladi (lokal assetlar). Ma'lumotli oflayn: mavjud `src/desktop` + Rust shifrlangan kesh (hozir o'qish rejimi) va sayt navbatlari (IndexedDB). Moliyaviy qoida: pul javoblari keshlanmaydi yoki faqat imzolangan lease bilan.
- Native qo'shimchalar (Tauri 2 plaginlar): fayl tizimi, bosma (WebView2 print), Excel/Word ochish (opener plagini allaqachon ulangan), bildirishnomalar, avtoyangilash (updater), tizim treyi. Qobiq 5-10 MB atrofida (MSI 49,5 MB o'rniga).
- Kod himoyasi: Tauri assetlarni exe ichiga siqib joylaydi (shifrlamaydi). Saytning JS i baribir ochiq (qurai.uz da hamma ko'radi), shuning uchun himoya mantig'i serverda bo'lishi kerak (sayt RPC lari shunday). Tijorat himoyasi: license/token (platformada `tokenlar` bor) + imzolangan lease (`offline-lease.ts` Ed25519) + ixtiyoriy: assetlarni litsenziya kaliti bilan shifrlab Rust custom protocol'da xotirada ochish (to'siqni ko'taradi, mutlaq emas).
- Xavf: sayt SPA `https://qurai.uz` origin'ini kutadi (cookie, CORS, WebAuthn, Google kirish); mavjud yechim: `/api` Rust orqali va kirish brauzerda (`/brauzer-kirish`). Sayt va qobiq versiyasi mosligi (sayt API yangilansa eski ilova build'i sinishi) ni versiya shlyuzi bilan boshqarish kerak.

### Variant 3: gibrid

- Windows: Variant 2 (hamma sahifa), faqat aniq foyda bo'lgan joyda native: fayl tizimi bilan sinxron Disk, bosma, oflayn fakt navbati. Android: qobiq (hamma sahifa) + native dala ekranlari (kamera/foto, ovoz, skaner, oflayn fakt/ombor/M-29/naryad, Qulf/biometrik), ya'ni hozirgi Android'ning eng yaxshi 5-6 ekrani.
- Paritet: qobiq sahifalari uchun 100 %, native ekranlarda server RPC yagona (ilova hech narsani qayta hisoblamaydi: `Money.kt`, `AktSumma.kt`).
- Xavf: ikki UI uslubi (sayt + Compose) bir ilovada; qoida: native ekran faqat «saytda qila olmaydigan» (kamera, fon sinxron, biometrik) uchun.

## 2. Taqqoslash

| mezon | 1 Compose davom | 2 WebView2 qobiq | 3 gibrid |
|---|---|---|---|
| Paritet | hech qachon | 100 % | 100 % (qobiq) |
| Qolgan ish | ~175k qator | ~2-4 hafta ishonchlilik (oflayn yozish, avtoyangilash, shrift, imzo) | 2 + Android dala ekranlari saqlanadi |
| Tezlik | JVM start | Chromium, lokal assetlar | 2 kabi |
| Oflayn | Android Room | qobiq + kesh; yozish navbati saytdagi IndexedDB | 2 + Android native navbat |
| Himoya | ProGuard | server + license; JS ochiq | 2 kabi |
| O'lcham | 49 MB | ~10 MB | ~10 MB / APK |
| Xavf | drift, tugamas | sayt bilan versiya mosligi | UI uslublari aralashuvi |

## 3. Tavsiya: Variant 3 (Windows uchun Variant 2)

Sabab: egasining talabi «sayt qanday ishlasa, Windows aynan shuni» faqat saytning o'z kodini ishlatish bilan bajariladi; qayta yozish 12 baravar tez harakatlanayotgan nishonga yetolmaydi. Kod allaqachon bor (Tauri qobig'i, Rust transport, kesh, lease, e2e) va PoC bilan qayta quriladi.

Android uchun: shu yondashuv mos, ammo Android'da native dala ekranlari qiymatli (kamera siqish/navbat, skaner, ovoz, biometrik Qulf, oflayn outbox: `PhotoQueue`, `Outbox`, `OmborScanner`). Tavsiya: Android = Tauri/Android WebView qobig'i (repoda `tauri.android.conf.json` + `smeta-keystore` plagini bor) yoki hozirgi Kotlin app ichida saytni tabiiy WebView sifatida ochish (`InAppBrowser.kt` bor), va tepada native dala ekranlari. TWA tavsiya etilmaydi: Chrome ga bog'liq, native ko'prik (kamera navbati, Keystore) yo'q, Digital Asset Links kerak.

## 4. Migratsiya bosqichlari

1. (1 hafta) Windows qobig'ini local-bff rejimida ishlab chiqarishga tayyorlash: lokal shriftlar, yangilanish kanali (updater + `desktop-release.json`), kirish oqimi (parol, Telegram, brauzer orqali Google), imzo kalitlari (`VITE_DESKTOP_LEASE_PK`), kod imzosi.
2. (1-2 hafta) Oflayn: lease asosida o'qish keshi yoqilgan holda; yozish navbati (fakt, ombor) saytdagi `usta/navbat` ni Rust keshi bilan birlashtirish; oflayn banner.
3. (1 hafta) Native qo'shimchalar: fayl tizimi (Disk sinxron), bosma, Excel ochish, bildirishnoma, tizim treyi.
4. Compose Windows'ni «eski» deb belgilash; yangi o'rnatuvchi bilan parallel chiqarish (2 reliz), keyin olib tashlash. Compose desktop kodi (2 702 qator) o'chiriladi; `shared` va `ui-common` faqat Android uchun qoladi.
5. Android: qobiq + native dala ekranlari; qolgan 40 sahifa qobiqdan darhol ochiladi, native ekranlar ro'yxati qisqartiriladi (fakt, foto, naryad, M-29, ombor, zayavka, Qulf).
6. Paritet testi: har sayt reliz'ida qobiq smoke e2e (mavjud `src-tauri/e2e`) CI da.

Baholar taxminiy, o'lchanmagan.

## 5. PoC (Variant 2 amalda)

Nima qilindi: mavjud `local-bff` rejimi (saytning o'z build'i lokal assetlardan, `/api` Rust transporti orqali `https://qurai.uz` ga) yangidan yig'ildi va ishga tushirildi. Yangi fayllar: `frontend/src-tauri/poc/build-poc.ps1` (yig'ish; PoC uchun tasodifiy lease kaliti), `frontend/src-tauri/poc/measure.mjs` (ishga tushirish + WebView2 CDP orqali o'lchov). Rust kodiga tegilmagan.

Ishga tushirish (frontend papkasidan, Rust MSVC va Node kerak):
1. `powershell -File src-tauri/poc/build-poc.ps1`  (npm ci agar kerak bo'lsa; `tsc -b`, Vite desktop build, Rust release)
2. `src-tauri\target\release\smeta-desktop.exe` ni oching (kirish sahifasi lokal assetlardan chiqadi), yoki o'lchash uchun: `node src-tauri/poc/measure.mjs src-tauri\target\release\smeta-desktop.exe 3`

O'lchov (Windows 11, WebView2, 3 ta ishga tushirish, sayt kirish sahifasi, parolsiz):

| ko'rsatkich | natija |
|---|---|
| to'liq yig'ish (tsc + Vite + Rust, sovuq kesh) | 475 s (Rust 5 min 05 s); Vite o'zi ~3 s |
| exe hajmi (butun sayt ichida) | 16,8 MB (hozirgi Compose MSI 49,5 MB) |
| jarayon ishga tushishidan oyna sahifasi (target) | 618-939 ms |
| jarayon ishga tushishidan FCP (kirish sahifasi chizildi) | 763 / 1107 / 1202 ms, median 1107 ms |
| sahifa navigatsiyasidan FCP / DOMContentLoaded / load | 144-604 / 83-102 / 103-128 ms |
| yuklangan resurs | 250 ta, 2,7 MB, hammasi lokal (tarmoq so'rovi yo'q) |
| Tauri ko'prigi, origin | mavjud, `http://tauri.localhost` |
| `/api` relay (sessiyasiz) | Rust `DESKTOP_SESSION_REQUIRED` bilan rad etadi, ya'ni sessiya bo'lmasa so'rov serverga chiqmaydi (loyihalangan xulq) |

Cheklovlar (halol): (1) haqiqiy login va og'ir sahifa (F2 workbench, Smeta daraxti 1000+ qator) o'lchanmadi: kirish uchun parol kiritish taqiqlangan, lokal izolyatsiyalangan stend esa PGlite o'rnatilishini talab qiladi (`src-tauri/e2e/README.md`), shuning uchun og'ir sahifa vaqtini egasi hisobi bilan yoki e2e stend bilan o'lchash kerak (keyingi qadam). (2) Compose Desktop bilan solishtirish bajarilmadi: bu mashinada JDK yo'q va ilova o'rnatilmagan; Compose uchun faqat o'lcham (49,5 MB MSI, JRE bilan) ma'lum. (3) Oflayn lease PoC da o'chiq (tasodifiy kalit): oflayn o'qish kesh tasdig'i ishlamaydi, bu ishlab chiqarish kaliti bilan yoqiladi.

