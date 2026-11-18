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

The API base URL is `BuildConfig.API_BASE_URL` (`https://qurai.uz`; override with `-PapiBase=`), and `BuildConfig.API_FALLBACK_URLS` (`https://smeta-tizimi.pages.dev`, the old host) is tried in order on a network failure (`core/data/HostFallback.kt`). See `app/build.gradle.kts`.

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

1. Sign-in runs against the normal web endpoints with a **temporary in-memory cookie jar** and `Origin:` = the origin of the host actually called.
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


## P2 (photo evidence, approvals, Today)

- Money: every sum is shown QQS-inclusive first plus with and without markup, taken from the server sum packages (ahbar_panel_v1 via /api/sb, same source as the web object card); never derived on the device. Without the financial read right only the markup-free figure is known and the rest shows a dash.
- Photo evidence: CameraX or gallery, JPEG <= 2 MP / q85, metadata stripped, sha256; queued in the outbox and sent as upload (/api/mobil/yukla, multipart) -> foto-dalil bogla -> optional yangila to a row (same sequence as the Telegram bot). Optional position comes only from the picked image's own EXIF and only after an explicit toggle; the app requests no location permission. CAMERA is requested at runtime.
- Approvals: inbox, detail, approve / return / reject with confirm dialog, online only; the chain is re-read before sending so a changed step is never approved by mistake.
- Today: pending approvals, F-2 / fact drafts (executive roles), unsent records, last 5 notifications with mark-read.
- Sign-out asks first when records are unsent (send now / keep / delete). Room schema v2 (section column) has a real migration.


## P3 (self sign-up, onboarding, module hub)

- Sign-up uses the shared server endpoints (royxat-email-kod -> royxat-ozi -> kirish; Google/Telegram already create company-less accounts; invitation by /taklif link or phone + 8-digit code via kirish-taklif 'qabul'). Phone + password sign-in is the normal login field (server flag KIRISH_TELEFON_YOQILGAN).
- Company-less accounts get an onboarding screen: create a company (company ozi_och), join by code (ish-joyi qoshil), or continue without one.
- Hub (tab Ilovalar): modules gated by t2_men_v1 permissions + modul_holat_v1 (mirrors the website catalogue). Picks/order are stored server-side via /api/modullarim (migration supabase/migrations/20261224000000_t2_modul_tanlov_v1.sql, NOT applied; the app falls back to a local copy until it is). Web-only modules open in an authenticated WebView through a 30 s one-time ticket (/api/mobil/web-bilet -> /api/mobil/web-kirish, 8 h cookie, wiped on leaving the screen).
- Warehouse slot: Features.NATIVE_WAREHOUSE (core/data/Modules.kt), off until the ombor branch merges.
- Debug demo: nowork.flag simulates a company-less account.


## P4 (@username, company invites, Jarvis, hardened web ticket)

- **@username / people search** (contract `docs/architecture/USERNAME_V1.md`, server on branch claude/username, PR 527). Profile -> Username (live availability with 400 ms debounce, name-based suggestions, who-can-find-me), `Kompaniyaga taklif` (one field, kind auto-detected, coworker autocomplete, phone fallback to link + one-time code), incoming invites (accept / decline). `Features.USERNAME = true` (migration applied, server live on main); if the server is unreachable the screens degrade to "coming soon". BFF now allow-lists `/api/profil` (only the nine username/invite actions, never `parol`/ulash/birlashtir) and `/api/kirish-taklif` (only `yarat`).
- **Web ticket hardening**: single-use ticket (per-isolate nonce set always; DB nonce when `MOBIL_BILET_BIR_MARTALIK=1` and migration `20261224200000_t2_mobil_bilet_v1.sql` is applied - NOT applied), WebView cookie bound to the device and re-verified on every request through `t2_desktop_qurilma_tekshir_v2` (revoking the device ends the web session), 2 h sliding lifetime with a 12 h absolute cap. Device id and token hash travel encrypted (AES-GCM) in the ticket/cookie.
- **Jarvis**: hub module (`NativeTarget.JARVIS`) -> `/api/ai-savol` through the BFF; HTTP 402 shows a distinct "AI limit reached" card; quick prompts for field work. Charging stays server side (aiHisobli).


## P5 (owner field test: negative volumes, full tree, boss panel, visuals)

- **Negative volumes.** `parseVolume` accepts `-`, `U+2212`, `U+2013`; the volume dialog has a big sign key (Decimal keypads often lack minus), red text with a true minus, and warns (never blocks) when the row's total fact would go below zero (also counted on the draft screen).
- **Full estimate tree.** The object packet already carries RZ / BL / RS / MAT / OB. They are now stored (Room v3, table `smeta_node`, migration 2->3) in web order (children by tartib, id; depth-first `ord`). Screen: sections collapsed by default, expand/collapse all, sticky top-level headers, search that keeps the parent path, BL rows with code, UPPERCASE name, unit, smeta/fakt/F-2/left, stacked bar, markup-free amount and a direct fact-entry button, resources under their BL (norm, qty, unit, price, amount). Flattening is linear, off the main thread; LazyColumn with stable keys. Objects read through the row-status fallback (no packet right) get a one-level-less tree rebuilt from section names.
- **Boss panel** (hub module for `control.company.read` / `financial.write`, shortcut on Today for boss roles): company totals (QQS-inclusive first, with / without markup, all server packages), progress rings, cash flow and aging, monthly bars, forecast, approval queue, attention list, per-object cards.
- **F-2 list** per object (status donut, flags, detail sheet, open the web registry) and **visuals** on the object card (rings, section bars, F-2 timeline), info tips for fact / F-2 / QQS / markup, skeleton loaders, empty-state illustrations.
- Debug demo: `boss.flag` switches the demo workplace to a director with boss permissions.
- Money rule: row-level amounts in the tree are the markup-free server values and are labelled so; the QQS-inclusive and with-markup figures exist only per object (server package) and are shown above the tree. See ROADMAP.md.

## Bitta kod, ikki platforma (Android + Windows)

Qoida: biznes mantiq, API shartnomalari, parserlar va Jarvis `:shared` da yashaydi; platformaga xos kod faqat oyna/navigatsiya/maket va Windows DPAPI / Android Keystore kabi qurilma qismlari uchun.

| Qatlam | Joyi | Kim ishlatadi |
| --- | --- | --- |
| API mijozi, auth, Jarvis, pul/F-2/hujjat/tasdiq shartnomalari | `:shared` (`core/data`) | Android + Windows |
| Ombor buyruqlari, F-2/fakt/smeta daraxti/narx/qarz/hujjat parserlari (`feature/common/Wire.kt`, sinovlari `WireTest`) | `:shared` | Windows (Android `:app` ga ulash mumkin) |
| Ekranlar | `:app` (Android Compose) va `:desktop` (Compose Desktop: chap navigatsiya, jadvallar, Ctrl+K) | har platformaning o'zi |

Yangi funksiya: avval `:shared` ga (parser + so'rov + sinov), keyin har platformada yupqa ekran. Android agenti `:shared` ga ko'chirgan mantiq Windows da bevosita ishlatiladi; Windows dagi `Repo.kt` faqat shu mantiqni oflayn keshga ulaydi.
