# MOBILE M1 — Android, iOS va macOS qobig'i

Holat: kod va CI yozildi, **CI hali birinchi marta yurmagan** (lokal mashinada Android/iOS/macOS toolchain yo'q). Birinchi yashil `Mobile` workflow — qabul mezoni.

## Nima qurildi
- `frontend/src-tauri` — Tauri 2 ilova endi Windows + Android + iOS + macOS. Shu bitta web UI (`vite.desktop.config.ts`), ichkarida o'sha `desktop_request` / shifrlangan kesh / oflayn lease mantig'i. Semantika o'zgarmagan (aktyorga bog'langan AES-256-GCM kesh, 90 kunlik TTL, oflayn faqat o'qish).
- Sirlar ombori (token + AES kalit bitta yozuv, logoutda crypto-erasure):
  - Windows: Credential Manager (`keyring` windows-native) — o'zgarmagan.
  - macOS / iOS: Keychain (`keyring` apple-native). iOS: ilova o'chirilganda Keychain qoladi, shuning uchun birinchi ishga tushirishda o'rnatish markeri yo'q bo'lsa eski yozuv o'chiriladi.
  - Android: `plugins/smeta-keystore` (o'zimizniki, ~100 qator Kotlin). AndroidKeyStore'da eksport qilib bo'lmaydigan AES-256-GCM kalit (StrongBox bo'lsa o'sha), shifrlangan blob `noBackupFilesDir`da (bulutga zaxiralanmaydi). Nega Stronghold emas: u parol/kalit-faylga tayanadi va apparat bilan bog'lanmagan; uchinchi tomon keystore pluginlari esa sirlar uchun audit qilinmagan bog'liqlik bo'lardi. Plugin JS'ga ochilmagan (invoke_handler va permission yo'q).
  - Boshqa target: yopiq (fail-closed), plaintext zaxira yo'q.
- Origin: Windows/Android `http://tauri.localhost`, macOS/iOS `tauri://localhost`. Rust `caller_tekshir` va `frontend/src/desktop/local-origin.ts` platformaga qarab tekshiradi (boshqa platforma origini rad etiladi). BFFga ketadigan `Origin` sarlavhasi hamma platformada bir xil.
- Ruxsatlar: Android — INTERNET + CAMERA (`required=false`); foto tanlash tizim photo-picker orqali (ruxsatsiz). Joylashuv, kontaktlar, xotira, mikrofon yo'q — CI buni tekshiradi (`android-overlay.mjs` va `aapt2 dump permissions`). iOS/macOS — faqat kamera va galereya matnlari (`Info.plist`, `Info.ios.plist`). `allowBackup=false`, cleartext yo'q.
- `gen/android` va `gen/apple` repoga qo'shilmagan: Tauri CLI (2.12.4, mahkamlangan) ularni CI'da `init` bilan yaratadi, so'ng `mobile/android-overlay.mjs` siyosatni qo'llaydi. Ikonkalar `mobile/app-icon.svg`dan `tauri icon` bilan hosil bo'ladi (vaqtincha belgi, brend ikonkasi bilan almashtiring). Agar kimdir `gen/`ni commit qilsa, workflow `init`ni o'tkazib yuboradi.

## CI (`.github/workflows/mobile.yml`)
Trigger: PR (src-tauri, src/desktop, workflow), qo'lda ishga tushirish, `v*` tag. Ruxsat: `contents: read`; `pull_request_target` yo'q; checkout kredensiallari saqlanmaydi.
- `android` — APK (aarch64, armv7, x86_64). Imzo sirlari bor va PR emas bo'lsa: `smeta-tizimi-<v>-release.apk`; aks holda har yurishda yaratiladigan vaqtinchalik debug kalit bilan `smeta-tizimi-<v>-debug.apk`.
- `ios` — sirlarsiz: frontend + Rust `aarch64-apple-ios-sim` kompilyatsiya isboti, so'ng simulyator build (best-effort). Sirlar bilan: imzolangan IPA + TestFlight'ga yuklash.
- `macos` — universal (arm64+x64) DMG, avval `cargo test`. Sirlarsiz: imzosiz `...-unsigned.dmg`; sirlar bilan: imzolangan va notarizatsiyalangan `...-signed.dmg`.
- `release` — yagona `contents: write` job, faqat `v*` tagda, kodni checkout qilmaydi; faqat imzolangan fayllarni (`*-release.apk`, `*-signed.dmg`, `*.ipa`) **draft** relizga qo'shadi. Debug/unsigned hech qachon qo'shilmaydi.
- Repo o'zgaruvchilari (sir emas): `SMETA_DESKTOP_LEASE_PK`, `SMETA_DESKTOP_LEASE_KID` — oflayn kesh uchun ommaviy kalit pin'i; bo'sh bo'lsa oflayn kesh rad etiladi.

## O'rnatish
- **Android APK:** Actions → Mobile → artifact `android-apk` → telefonga ko'chiring → «Noma'lum manbalardan o'rnatish»ga ruxsat bering → oching. `-debug.apk` faqat sinov uchun.
- **macOS imzosiz DMG:** DMG'ni oching, ilovani Applications'ga torting. Birinchi ochishda Gatekeeper to'sadi: System Settings → Privacy & Security → «Open Anyway» (yoki `xattr -dr com.apple.quarantine "/Applications/Smeta Tizimi.app"`). Imzolangan/notarizatsiyalangan DMG'da bu kerak emas.
- **iOS:** faqat TestFlight (Apple Developer hisobi shart) yoki simulyator.

## Egasi nima berishi kerak
| Narsa | Narx / manba | GitHub secret nomlari |
|---|---|---|
| Google Play Console (do'konda tarqatish uchun) | bir marta $25 | — |
| Android release keystore (`keytool -genkeypair`, **yo'qotmang**) | bepul | `ANDROID_KEYSTORE_BASE64` (base64 .jks), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| Apple Developer Program (iOS TestFlight, macOS imzo/notarizatsiya) | $99/yil | — |
| Apple Distribution sertifikati (.p12, base64) | Apple | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` |
| iOS provisioning profile (base64) | Apple | `APPLE_PROVISIONING_PROFILE` |
| App Store Connect API kaliti | App Store Connect | `APPLE_API_KEY` (key ID), `APPLE_API_ISSUER`, `APPLE_API_KEY_P8` (.p8 matni) |
| Team ID | Apple | `APPLE_TEAM_ID` |
| macOS imzo (Developer ID Application) | Apple | `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific parol) |

Play Store AAB (`--aab`) bu bosqichda yo'q: faqat APK. Do'kon uchun keyingi qadam. iOS eksport-compliance (shifrlash) deklaratsiyasini egasi hal qiladi — Info.plist'ga o'zimiz yozmadik.

## CI isbotlashi kerak (lokal tekshirilmagan)
Android Gradle + Kotlin plugin kompilyatsiyasi (`KeystorePlugin.kt`, Tauri Kotlin API), `mobile_entry_point`, manifest overlay; iOS `aarch64-apple-ios-sim` build va `tauri.ios.conf`/`Info.ios.plist` qo'llanishi; macOS universal DMG va `cargo test`; qurilmada: login → oflayn lease → qayta ishga tushirish, kamera/foto tanlash.