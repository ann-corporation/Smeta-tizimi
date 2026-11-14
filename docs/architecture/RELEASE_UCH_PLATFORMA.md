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

## Imzo holatlari (sahifada ko‘rinadigan ogohlantirishlar)

- Android `signed:false` (debug APK): «sinov yig‘masi» ogohlantirishi. Release imzo uchun keystore kerak.
- macOS `notarized:false`: foydalanuvchiga «Baribir ochish» (Gatekeeper) yo‘riqnomasi ko‘rsatiladi.
- iOS: App Store/TestFlight bo‘lmaguncha PWA ko‘rsatmasi (Safari → Ulashish → Bosh ekranga qo‘shish) va «App Store — tez orada».

## Egasi taqdim etishi kerak

- Google Play / APK uchun: release keystore (CI secrets orqali; repoda yo‘q).
- Apple Developer akkaunti (yillik): macOS Developer ID imzosi + notarization, iOS TestFlight/App Store.
- Windows: kod imzo sertifikati (ixtiyoriy; hozir `NotSigned` ogohlantirishi).
- Hosting: yuqoridagi `/android`, `/macos`, `/windows` yo‘llarini sayt origin’idan berish.

Repoda hech qanday maxfiy kalit, parol yoki haqiqiy manifest saqlanmaydi.
