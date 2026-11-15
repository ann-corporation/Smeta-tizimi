# QULF va TASDIQ v1 — tizim darajasidagi ilova qulfi va pul/imzo tasdig'i

Egasi talabi: tizimda PIN; sahifa/dastur bir muddat ishlatilmasa PIN'ga tushsin; maksimal qulaylik uchun Windows Hello / biometrik (Face ID, barmoq izi); pul va imzolash amallarida ham shu.

Holat: **kod tayyor, migratsiya qo'llanmagan** (`supabase/migrations/20261225000000_t2_qulf_v1.sql` — egasi tasdig'ini kutadi). Migratsiyasiz hech narsa buzilmaydi: `/api/qulf` 501 `QULF_YOQ` qaytaradi, step-up darvozasi o'tkazib yuboradi, mijoz qulfi yoqilmaydi.

## 1. Ikki alohida qatlam (muhim)

| Qatlam | Nima qiladi | Qayerda | Himoya turi |
|---|---|---|---|
| **QULF** (idle lock) | N daqiqa harakatsiz yoki varaq/ilova yashirin turgach ekranni to'liq yashiradi, PIN yoki biometrik so'raydi | mijoz (sayt, Windows qobig'i, Android) | maxfiylik (yelka orqasidan ko'rish, qoldirilgan qurilma) |
| **TASDIQ** (step-up) | pul / imzo / hujjat tasdig'i buyrug'iga YANGI PIN yoki biometrik tasdiq talab qiladi | **server** (`STEP_UP_KERAK`, 403) | haqiqiy to'siq: mijozni aylanib o'tib bo'lmaydi |

Mijoz qulfini localStorage tozalab chetlab o'tish mumkin (bu faqat ko'rinishni yashiradi); pul/imzo esa server tasdiq tokenisiz bajarilmaydi.

## 2. Server

### 2.1 PIN
- 4–6 raqam; oson PIN (0000, 1234, 4321, 1212) rad etiladi.
- Saqlash: `pbkdf2-sha256$100000$<tuz>$<xesh>`. 100 000 — Cloudflare Workers PBKDF2 chegarasi (yuqorisi `NotSupportedError`). Parol sifatida `HMAC(SESSIYA_KALIT, "qulf-pin|uid|pin")` (server «pepper»i) beriladi: faqat baza oqsa 10⁶ ta PIN'ni oflayn terib bo'lmaydi.
- Urinish qoidasi (SQL `t2_qulf_urinish_v1`, atomik): ketma-ket **5** xato → **15 daqiqa** blok; jami **10** xato (muvaffaqiyatsiz) → `QAYTA_KIRISH_KERAK`: PIN faqat shu paytdan **keyin** chiqarilgan sessiya (to'liq qayta kirish) bilan qayta ochiladi (`iat = exp − SESSIYA_MUDDAT_MS` solishtiriladi — login endpointlariga tegilmaydi).
- Eski PIN esdan chiqsa: to'liq qayta kirishdan keyin 10 daqiqa ichida yangisini o'rnatish mumkin.
- PIN hech qachon loglanmaydi, javobda/xatoda qaytmaydi, testlar buni tekshiradi.

### 2.2 Passkey (WebAuthn) — Windows Hello / Touch ID / Face ID / Android biometrik (brauzerda)
- Tashqi kutubxonasiz: `functions/_shared/qulf-webauthn.ts` (WebCrypto, ~200 qator, test vektorlari bilan). Sabab: faqat `attestation:'none'` + ES256/RS256 kerak; `@simplewebauthn/server` x509/cbor zanjiri Workers bundle'ini og'irlashtiradi.
- Ro'yxat: `webauthn_reg_boshla` → `navigator.credentials.create` → `webauthn_reg_tugat`. `authenticatorAttachment:'platform'`, `userVerification:'required'`.
- Kirish: `webauthn_kirish_boshla` → `credentials.get` → `webauthn_kirish_tugat`.
- Tekshiriladi: type, challenge, origin (allowlist), `rpIdHash`, **UP** va **UV** bayroqlari (biometrik/qurilma PIN majburiy), imzo (ES256 DER→raw, RS256), `signCount` (klon himoyasi; ikkalasi 0 — hisoblagichsiz qurilma, ruxsat). Attestation statement e'tiborsiz (ishonch modeli `none`).
- Challenge: HMAC bilan imzolangan, 2 daqiqa, foydalanuvchi va maqsadga bog'langan, **bir martalik** (`t2_qulf_chaqiriq_ishlatilgan`, replay rad).
- **rpId** = `QULF_RP_ID` (env) yoki so'rov host'i; **origin allowlist** = so'rov origin'i + `QULF_ORIGINS` (vergul bilan). Preview host'larda kalitlar boshqa host'ga ko'chmaydi (WebAuthn tabiati). Android'da Digital Asset Links **kerak emas** (pastga qarang: Keystore protokoli); agar kelajakda Credential Manager passkey'lari kerak bo'lsa — `android:apk-key-hash:` origin'ini `QULF_ORIGINS` ga qo'shish + `/.well-known/assetlinks.json`.

### 2.3 Android qurilma kaliti (Keystore) — passkey'ga o'xshash protokol
- Ilova Keystore'da EC P-256 kalit yaratadi: `setUserAuthenticationRequired(true)`, har imzoga yangi `BIOMETRIC_STRONG`, biometrik qayta ro'yxatdan o'tganda kalit bekor (`setInvalidatedByBiometricEnrollment`). Maxfiy kalit qurilmadan chiqmaydi.
- Ro'yxat: `qurilma_reg_boshla` → `{chaqiriq, challenge}`; qurilma **yangi kalit bilan** `QULF1|reg|<challenge>|<credId>` ni imzolaydi (egalik isboti); `qurilma_reg_tugat {chaqiriq, ochiq_kalit(SPKI), imzo(DER)}`. `credId = base64url(SHA-256(SPKI))` — mijoz tanlamaydi, server hisoblaydi.
- Tasdiq: `qurilma_kirish_boshla` → `{chaqiriq, challenge, kredensiallar}`; imzo `QULF1|kirish|<challenge>|<credId>` (SHA256withECDSA, DER); `qurilma_kirish_tugat {chaqiriq, kredensial_id, imzo}`.
- Server tekshiruvi `ecImzoTekshir` (WebCrypto, DER→raw). Xabar formati ikki tomonda test bilan mahkamlangan (`QulfRepositoryTest.deviceProtocolMessagesMatchServer`, `qulf.test.ts`).
- Cheklov (ochiq): Keystore **attestation zanjiri** (kalit haqiqatan apparatda ekanini tasdiqlash) hozir tekshirilmaydi.

### 2.4 Tasdiq tokeni va siyosat
- Token: `base64url(JSON{u,j,e,m}).HMAC` (domen `qulf-tasdiq`), **5 daqiqa**, foydalanuvchiga (`u`) va kanalga (`j`) bog'langan: veb — sessiya `jti`; native BFF (Android, Windows) — `m` (BFF har so'rovda yangi jti beradi). `m` = `pin | passkey | qurilma`.
- Yetkazish: veb — HttpOnly cookie `qulf_tasdiq`; Android — BFF konvertidagi `tasdiq` maydoni → `X-Tasdiq`; Windows — `_tasdiq` so'rov parametri (yo'l BFF tanasi ichida, HTTP URL logiga tushmaydi).
- Siyosat (`t2_qulf_siyosat`, kompaniya bo'yicha): `off` · `pin` (faqat PIN qabul) · `biometric_or_pin`. Standart (qator yo'q) = `pin`. **Talab faqat foydalanuvchida qabul qilinadigan usul (PIN yoki kalit) BOR bo'lsa kuchga kiradi** — PIN o'rnatmagan foydalanuvchi bloklanmaydi. Kompaniya aniq bo'lmasa — a'zo kompaniyalarning eng qattiq rejimi. O'zgartirish: `control.company.write` yoki superadmin; sozlama o'zgartirish ham tasdiq talab qiladi.
- Qamrab olingan amallar (`write-command-policy.ts`: `STEP_UP_BUYRUQLAR`, `STEP_UP_API_AMALLAR`, `stepUpKerak`): bux kassa/bank/storno/davr/saldo, `tolov_*`, `sotuv_tolov_*`, `hr_oylik_v1`, `hr_tuzatma_qaror_v1`, `akt_tasdiqlash`, `akt_lifecycle_transition_v1` (tasdiqqa olib boruvchi maqsad), imzo (`api/imzo`: `yoz`, `kalit_yarat` — PR #483 dagi parol xatosidan keyingi qatlam), hujjat zanjiri qarori (`api/hujjat-aylanish`: `zanjir_qaror` → `t2_hujjat_zanjir_qaror_v1`). Yangi pul buyrug'i qo'shilsa — shu ro'yxatga ham (test: ro'yxat reyestrda borligini tekshiradi).
- Darvoza: `api/_middleware.ts` → `qulfDarvoza` (sb-yoz / imzo / hujjat-aylanish tanasini bir marta o'qiydi). Migratsiya yo'q → o'tkazadi; boshqa DB xatosi → **fail-closed 503**.
- Telegram bot ham shu middleware orqali o'tadi.

## 3. Sayt va Windows ilova (`frontend/src/qulf/`)
- `QulfProvider` (`main.tsx`): bo'sh turish (default **10 daqiqa**, 1–60 sozlanadi) yoki varaq N daqiqa yashirin → to'liq ekran qulf (ildiz `inert` + `visibility:hidden`, kontent ko'rinmaydi). Holat localStorage'da: yangilash/yopib-ochish qulfni ochmaydi.
- Ochish: PIN klaviaturasi yoki «Biometrik bilan ochish» (WebAuthn `get`, oyna ochilishi bilan avtomatik taklif).
- `interseptor.ts`: har bir `/api` javobi `403 STEP_UP_KERAK` bo'lsa tasdiq oynasi ochiladi va so'rov bir marta qayta yuboriladi — mavjud 50+ chaqiruv joyini o'zgartirmasdan.
- Sozlamalar: Akkaunt markazi → «PIN va biometrik» (PIN o'rnatish/almashtirish/o'chirish, qurilmalar ro'yxati va o'chirish, qulf vaqti, kompaniya siyosati). i18n: `src/i18n/lugat/qism/qulf.json` (uz/ru/en).
- **Windows (Tauri) qobig'i**: qulf va PIN ishlaydi (`/api/qulf` Rust allowlist'ga va desktop BFF'ga qo'shildi). Biometrik (Windows Hello) **hozircha o'chiq**: WebView origin'i (`tauri.localhost`) sayt rpId'siga mos kelmaydi — ochiq masala (variantlar: `QULF_RP_ID=tauri.localhost` + origin allowlist yoki native Windows Hello plagini).

## 4. Android (`android-native/`, `core/security`, `feature/lock`)
- `LockState` (sof JVM, testlangan): fonda yoki oldingi planda N daqiqa → qulf; sovuq ishga tushishda eski `lastActive` → qulf.
- Qulf ekrani: PIN-pad + `BiometricPrompt` (`BIOMETRIC_STRONG | DEVICE_CREDENTIAL`, API 30+; 26–29 da faqat `BIOMETRIC_STRONG`). Biometrik bilan ochish oflayn ishlaydi (mahalliy); PIN server tekshiruvi tarmoq talab qiladi (oflayn — biometrik).
- `FLAG_SECURE`: qulf yoqilgan bo'lsa butun ilovada (skrinshot/recents rasmi yo'q); tasdiq ekranlarida (`ApprovalDetailScreen`) har doim.
- Step-up: `ApiClient.bff` 403 `STEP_UP_KERAK` olsa `StepUpHandler` (AppLockController) tasdiq varag'ini ochadi → PIN yoki Keystore kaliti bilan assertion → `tasdiq` bilan so'rov qayta yuboriladi. Token faqat xotirada (diskka yozilmaydi), 30 s oldin tugatiladi.
- Profil → «PIN va biometrik»: PIN, qulf vaqti, «Bu telefonni biometrik bilan bog'lash».

## 5. Telegram bot
Himoyalangan tasdiq (`tqy:` «Ha, tasdiqlayman») `STEP_UP_KERAK` olsa bot **hech narsani tasdiqlamaydi** va Mini App ga yo'naltiradi (`tasdiq_step_up`). PIN'ni chatda so'rash (bir martalik, xabar o'chiriladi) ataylab qilinmadi: PIN chat tarixi/eksportida qolmasin.

## 6. Ochiq masalalar
1. Migratsiya egasi tomonidan qo'llanishi (`20261225000000_t2_qulf_v1`) + Pages env `QULF_RP_ID` / `QULF_ORIGINS` (ixtiyoriy).
2. Windows qobig'ida Windows Hello (yuqoriga qarang); Rust o'zgarishi (`transport.rs` allowlist) `cargo test` bilan tekshirilishi kerak.
3. Android Keystore attestation zanjirini tekshirish.
4. Telegram PIN-javob oqimi (hozir Mini App'ga yo'naltirish).
5. Kompaniya siyosati bilan PIN/biometrikni **majburiy o'rnatish** (hozir faqat o'rnatganlarga talab qilinadi).
6. IP bo'yicha qo'shimcha rate-limit (hozir hisob bo'yicha blok).
7. Mijoz qulfi serverda majburlanmaydi (faqat ko'rinish); majburlash step-up orqali.
