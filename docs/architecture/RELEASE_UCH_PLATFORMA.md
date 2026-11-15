# Reliz: Windows, macOS, Android, iOS (ochiq intro sahifa)

Intro sahifadagi «Yuklab olish» bo‘limi (`AppDownloads`) ikki manifestni o‘qiydi. Manifest yo‘q yoki yaroqsiz bo‘lsa, shu karta «Tez orada» holatida turadi (singan havola chiqmaydi).

| Platforma | Manifest | Fayl joyi (shu sayt origin’i, redirectsiz) |
|---|---|---|
| Windows | `frontend/public/desktop-release.json` (o‘zgarmagan, qarang `DESKTOP_M2_DOWNLOAD.md`) | `/windows/<versiya>/<sha256>/<fayl>.exe` + `INSTALL_RU.md` |
| Android | `frontend/public/mobile-release.json` → `android` | `/android/<versiya>/<sha256>/<fayl>.apk` |
| macOS | `mobile-release.json` → `macos` | `/macos/<versiya>/<sha256>/<fayl>.dmg` |
| iOS | `mobile-release.json` → `ios` | PWA (Safari) yoki Apple havolasi (TestFlight / App Store) |

Havola manifestdagi maydonlardan yasaladi (tashqi URL qabul qilinmaydi). iOS havolasi faqat `https://testflight.apple.com/...` yoki `https://apps.apple.com/...`.

## Nashr qilish tartibi

1. CI (`mobile.yml`) artefaktini yuklab oling: APK / DMG. SHA-256 va hajmini o‘zingiz qayta hisoblang (`Get-FileHash`).
2. Faylni yuqoridagi yo‘l bo‘yicha sayt origin’iga joylang (Windows kabi: avval R2 `<platforma>/<versiya>/<sha256>/`, so‘ng same-origin marshrut). Hosted faylning hajmi va xeshini manifestga tenglang.
3. Manifest yarating (frontend papkasidan):
   - `node scripts/generate-mobile-release.mjs android android-manifest.json`
   - `node scripts/generate-mobile-release.mjs macos macos-manifest.json`
   - `node scripts/generate-mobile-release.mjs ios pwa` yoki `ios testflight https://testflight.apple.com/join/...` yoki `ios appstore https://apps.apple.com/...`
   - Windows: `node scripts/generate-desktop-release.mjs installer-manifest.json`

   Maydonlar (android/macos): `version` (x.y.z), `generatedAtUtc`, `file`, `bytes`, `sha256`, `signed` (true/false); android: `minSdk` (21–40); macos: `notarized` (true bo‘lsa `signed` ham true). Har ishga tushirish faqat o‘z platformasini yangilaydi, boshqalarini saqlaydi. Yaroqsiz kirishda fayl yozilmaydi.
4. Tayyor `mobile-release.json` ni deploy bilan birga chiqaring. Faylni **faqat** haqiqiy fayl joylangandan keyin qo‘shing.
5. Orqaga qaytarish: manifest faylini olib tashlash (karta «Tez orada» ga qaytadi).

## Windows reliz CI da qanday yasaladi

`mobile.yml` dagi `windows` job (windows-latest) ishlab chiqarish NSIS o'rnatuvchisini `desktop-build.ps1 -ReleaseDir $RUNNER_TEMP\windows-release` bilan yig'adi (imzosiz, `NotSigned`), so'ng `desktop-release-verify.ps1 -AllowUnsigned` bilan manifest xeshini tekshiradi va `windows-installer` artefaktini (30 kun) yuklaydi: `.exe`, `INSTALL_RU.md`, `installer-manifest.json`. `desktop-windows.yml` (sintetik e2e) alohida va o'zgarmagan.

- Egasi repo o'zgaruvchilarini (Variables) o'rnatishi shart: `SMETA_DESKTOP_LEASE_PK` (raw 32 bayt Ed25519 ochiq kalit, base64url) va `SMETA_DESKTOP_LEASE_KID`. Bo'sh bo'lsa job qadamlarni o'tkazib yuboradi (notice), PR CI qizarmaydi.
- BFF origin berilmaydi: ilova standart `https://smeta-tizimi.pages.dev` ni ishlatadi.
- Imzosiz `.exe` v* tag `release` jobiga biriktirilmaydi (siyosat: faqat imzolangan). Nashr: artefaktni yuklab, xeshni `Get-FileHash` bilan qayta tekshiring, `desktop-release-r2.ps1` + `generate-desktop-release.mjs` (yuqoridagi 2-4 qadamlar).

## Imzo holatlari (sahifada ko‘rinadigan ogohlantirishlar)

- Android `signed:false` (debug APK): «sinov yig‘masi» ogohlantirishi. Release imzo uchun keystore kerak.
- macOS `notarized:false`: foydalanuvchiga «Baribir ochish» (Gatekeeper) yo‘riqnomasi ko‘rsatiladi.
- iOS: App Store/TestFlight bo‘lmaguncha PWA ko‘rsatmasi (Safari → Ulashish → Bosh ekranga qo‘shish) va «App Store — tez orada».

## Egasi taqdim etishi kerak

- Google Play / APK uchun: release keystore (CI secrets orqali; repoda yo‘q).
- Apple Developer akkaunti (yillik): macOS Developer ID imzosi + notarization, iOS TestFlight/App Store.
- Windows: kod imzo sertifikati (ixtiyoriy; hozir `NotSigned` ogohlantirishi).
- Hosting: yuqoridagi `/android`, `/macos`, `/windows` yo‘llari Pages Functions bilan beriladi (pastga qarang).

## Hosting: same-origin Pages Function

`frontend/functions/{windows,android,macos}/[[path]].ts` → umumiy `functions/_shared/reliz-fayl.ts`. Faqat `GET`/`HEAD`, auth yo‘q (`functions/api/_middleware.ts` bu yo‘llarga tegmaydi), mavjud `R2_CANONICAL` binding (yopiq bucket) orqali o‘qiydi.

- Qat’iy tekshiruv (mijoz URL builder bilan bir xil): versiya `x.y.z`, sha256 — 64 ta kichik hex, fayl nomi `.apk` / `.dmg` / `.exe` (Windows uchun yana aynan `INSTALL_RU.md`). Boshqa hamma narsa (traversal, `%2f`, ro‘yxat, noto‘g‘ri kengaytma) → 404, R2 ga murojaat qilinmaydi.
- R2 kaliti (prefiks kodda qat’iy, boshqa ma’lumotga yo‘l yo‘q):
  - Windows: `windows/<ver>/<sha256>/<fayl>` (`desktop-release-r2.ps1` bilan bir xil)
  - Android: `reliz/android/<ver>/<sha256>/<fayl>`; macOS: `reliz/macos/<ver>/<sha256>/<fayl>`
- Javob: to‘g‘ri `Content-Type`, `Content-Length`, `ETag` (= sha256), `Content-Disposition: attachment`, `Cache-Control: public, max-age=31536000, immutable`, `nosniff`; `Range` (206/416), `If-None-Match` (304); tana stream qilinadi. Obyektning `customMetadata.sha256` bor bo‘lsa va yo‘ldagi xesh bilan mos kelmasa → 404.
- Yuklash (L0 qo‘lda): `frontend/scripts/reliz-yukla.ps1 -Platform android|macos|windows -File <yo‘l>` — xeshni hisoblaydi, `wrangler r2 object put ... --remote` bilan yuklaydi (`-DryRun` — yuklamasdan) va `generate-mobile-release.mjs` uchun manifest JSON’ni chop etadi.

Repoda hech qanday maxfiy kalit, parol yoki haqiqiy manifest saqlanmaydi.
