# QURAI Android (native)

Native Android client (Kotlin + Jetpack Compose) for the QURAI / Smeta tizimi platform.
Phase **P0**: sign-in (password, Google, Telegram), device enrolment, workplace/role switch, shell with bottom navigation.
Objects, fact entry, approvals and "today" arrive in P1/P2 and show a "coming soon" placeholder.

## Requirements

- Android Studio (Ladybug or newer) or JDK 17+ and the Android SDK (platform 35, build-tools 35.x).
- `local.properties` with `sdk.dir=...` (Android Studio creates it; it is git-ignored).
- The Gradle wrapper is checked in (`gradlew`, `gradlew.bat`, Gradle 8.11.1).

## Build, test, run

```powershell
cd android-native
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'   # any JDK 17+
.\gradlew.bat testDebugUnitTest assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n uz.anncorp.smeta/.MainActivity
```

The API base URL is `BuildConfig.API_BASE_URL` (`https://smeta-tizimi.pages.dev`, see `app/build.gradle.kts`).

## Architecture

Single `:app` module, package `uz.anncorp.smeta`:

| Package | Role |
| --- | --- |
| `core/data` | `TokenStore` (AES-256-GCM, Android Keystore key, file in `noBackupFilesDir`), `ApiClient` (OkHttp + kotlinx.serialization), `AuthRepository` (sign-in flows), `TelegramPoller`, `SessionRepository`, `Prefs`, Hilt `DataModule` |
| `core/ui` | Material 3 theme (dark-first, light scheme, tokens from `frontend/src/index.css`), shared components |
| `feature/splash` | Start routing: no/expired token -> Login; token -> `GET /api/sessiya`: valid -> Home, 401 -> Login, offline -> Home |
| `feature/login` | Password, Google (Credential Manager), Telegram (deep link + polling) |
| `feature/home`, `feature/company`, `feature/profile` | Shell, workplace/role switch, profile (language, theme, sign out) |

### Auth model (same trust model as the Windows app)

1. Sign-in runs against the normal web endpoints with a **temporary in-memory cookie jar** and `Origin: https://smeta-tizimi.pages.dev`.
2. `POST /api/desktop/qurilma` (with that cookie and a fresh `operation_id`) issues a long-lived **device token**; the cookie is dropped immediately.
3. Afterwards every call is `Authorization: Bearer <device token>` + `Origin: app://qurai-android` + `X-Smeta-Desktop-Version: <versionName>`, sent to **`POST /api/mobil/bff`** with `{path, method, body}`. The server allow-lists the paths (`sessiya`, `ish-joyi`, `company`, `sb`, `sb-yoz`, `obyekt-paket`, `hujjat-aylanish`, `foto-dalil`, `ai-savol`) and derives roles/permissions from the database. Roles are never read from the token.
4. A `401` anywhere clears the token and returns to Login. Sign out calls `DELETE /api/desktop/qurilma` (revokes the device) and forgets the token.

The Telegram `sir` (browser secret) is kept in memory only. `allowBackup=false`, `usesCleartextTraffic=false`, only the `INTERNET` permission (CAMERA is added with the photo-evidence screen).

Server side: `frontend/functions/_shared/desktop-device.ts` (`ANDROID_ORIGIN`, accepted only together with a verified Bearer device token) and `frontend/functions/api/mobil/bff.ts` (tests: `frontend/functions/api/mobil-bff.test.ts`).

## Owner-side setup (one time)

1. **Google sign-in.** In Google Cloud Console (same project as the web client) create an **OAuth client of type Android** with package name `uz.anncorp.smeta` and the SHA-1 of the signing key (debug SHA-1 for dev builds, release/Play-signing SHA-1 for production). The app requests the ID token for the **web** client id served by `GET /api/kirish-google`, which is what the server validates (`aud`). No secret is stored in the app.
2. **Telegram sign-in.** Cloudflare Pages env `KIRISH_TELEGRAM_YOQILGAN=1` (plus the existing bot token / webhook secret). Without it the app shows "Telegram sign-in is not enabled yet".
3. **Device policy.** Android devices appear in the same "desktop control" admin list (device name = phone model, OS = `Android <release>`). The kill switch / minimum version / per-user device cap apply to them too. The app reports `versionName` `0.1.1` (must match `d.d.d`).
4. **Signing.** `applicationId` is `uz.anncorp.smeta` (same identifier as the Tauri app). There is no earlier Android build, so there is no key continuity to preserve; keep the release keystore safe from day one (Play App Signing recommended).

## Languages and themes

Strings: `values/` = Uzbek (default), `values-ru/`, `values-en/`. Per-app locale via `AppCompatDelegate.setApplicationLocales` (Profile -> Language; Android 13+ also lists the app in system settings). Theme default is dark; Profile -> Theme switches Dark / Light / System.

## P1 (objects, fact entry, offline)

Room + SQLCipher cache (key wrapped by Keystore), FTS4 row search, draft batch, WorkManager outbox (FIFO, idempotent by operation_id). Debug-only demo mode: `adb shell run-as uz.anncorp.smeta.debug touch files/demo.flag` (`offline.flag` forces the offline banner); the release build contains only an inert stub.

