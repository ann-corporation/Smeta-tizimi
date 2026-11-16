# Domen ko'chishi: qurai.uz (L0 / egasi uchun ketma-ket ro'yxat)

Holat: kod tayyor (PR `claude/domen-qurai-uz`). DNS, Cloudflare va maxfiy o'zgaruvchilarga kod tegmaydi — quyidagi qadamlarni
L0 / egasi tartib bilan bajaradi. **Eski host `smeta-tizimi.pages.dev` o'chirilmaydi**: eski Android/Windows ilovalar shu yerga
qo'ng'iroq qiladi. U yerda faqat brauzer HTML sahifalari `301` bilan qurai.uz ga yo'naltiriladi; API, webhook, `/mobile-release.json`,
`/desktop-release.json`, `/t/*` (QR), `/android|windows|macos/*` (R2 yuklab olish), statik fayllar va ilova oqimlari
(`/ilova-qaytdi`, `/brauzer-kirish`, `/tg`) yo'naltirilmaydi.

## Manba (bitta joy)

| Muhit | O'zgaruvchi | Sukut |
|---|---|---|
| Pages Functions (server) | `PUBLIC_ORIGIN` (`https://qurai.uz`, yo'lsiz) | `https://qurai.uz` (`frontend/src/lib/sayt-manzil.ts`) |
| Veb build (Vite) | `VITE_PUBLIC_ORIGIN` | `https://qurai.uz` |
| Android | `-PapiBase=...` / `-PapiFallbacks=a,b` (Gradle) | `https://qurai.uz` + `https://smeta-tizimi.pages.dev` (`BuildConfig.API_BASE_URL`, `API_FALLBACK_URLS`) |
| Windows (Tauri) | `SITE_HOST` / `LEGACY_SITE_HOST` (`src-tauri/src/shell.rs`), `BFF` (`transport.rs`), `offline/loader.js`, CSP `connect-src` | `qurai.uz`, eski host ham qabul |
| Eski hostni o'chirgich | `ESKI_HOST_YONLANTIRISH=0` (301 ni o'chiradi) | yoqilgan |

Inventar (o'zgargan): Tauri SITE/CSP/BFF/loader, Android API bazasi + fallback + WebView own-host, Telegram `saytUrl`/Mini App/webhook
qurilishi, Google originlar ro'yxati, kirish xati (logo) va taklif havolasi, QR/tekshirish bazasi (`BREND_URL` → `PUBLIC_ORIGIN` → eski hostdan
kelsa kanonik), MCP-remote standart sayt, GitHub workflow izohlari. O'zgarmagan: `mobile-release.json`/`manifest.webmanifest` (nisbiy yo'llar),
sessiya cookie (host-only, `Domain` atributi yo'q), CORS (kodda `Access-Control-Allow-Origin` yo'q — same-origin tekshiruvi), robots/sitemap (yo'q).

## Cookie va qayta kirish

Sessiya cookie **host-only** (`sess=...; HttpOnly; Secure; SameSite=Lax; Path=/`, `Domain` yo'q — testda qulflangan). Shuning uchun
`smeta-tizimi.pages.dev` dagi seans qurai.uz da ko'rinmaydi: **har bir foydalanuvchi qurai.uz da bir marta qayta kiradi** — bu qabul qilingan.
Android ilova qurilma tokeni (Bearer) bilan ishlaydi — qayta kirish kerak emas. Passkey/biometrik (WebAuthn) kalitlari `rpId` ga bog'langan:
`QULF_RP_ID=qurai.uz` qo'yilgach eski hostda ro'yxatdan o'tgan veb-kalitlar ishlamaydi — foydalanuvchi qayta qo'shadi (PIN ishlayveradi).

## Qadamlar (tartib bilan)

### a) Zona va nameserver (egasi)
1. Cloudflare akkauntiga zona qo'shish: Websites → Add a site → `qurai.uz` (Free reja yetadi). Cloudflare bergan 2 ta nameserverni yozib oling.
2. Registrator `webname.uz` kabinetida `qurai.uz` ning nameserverlarini shu ikkitaga almashtirish. Tarqalishini kuting (`nslookup -type=NS qurai.uz`).
3. Pochta ishlatilsa (Resend/`EMAIL_FROM`): domen uchun SPF/DKIM yozuvlarini Resend ko'rsatganidek DNS ga qo'shish, keyin `EMAIL_FROM` ni `...@qurai.uz` ga o'tkazish (ixtiyoriy; hozirgi yuboruvchi ishlayveradi).

### b) Pages → Custom domains (L0)
1. Cloudflare → Workers & Pages → `smeta-tizimi` → Custom domains → Set up: `qurai.uz` va `www.qurai.uz`. DNS/SSL avtomatik (zona shu akkauntda bo'lgani uchun).
2. `www.qurai.uz` → apexga 301: Rules → Redirect Rules → "www → apex": `(http.host eq "www.qurai.uz")` → Dynamic: `concat("https://qurai.uz", http.request.uri.path)`, status 301, query string saqlansin. (Yoki Bulk Redirects.)
3. SSL/TLS rejimi Full (strict). Always Use HTTPS yoqilsin. Eski `smeta-tizimi.pages.dev` hostini Custom domains dan olib tashlamang (u `.pages.dev` — o'zi turadi).

### c) Pages muhit o'zgaruvchilari (L0, qiymatlarni o'zi kiritadi) va redeploy
Production muhitiga:
- `PUBLIC_ORIGIN` = `https://qurai.uz`
- `BREND_URL` = `https://qurai.uz` (QR/tekshirish havolalari)
- `QULF_RP_ID` = `qurai.uz`
- `QULF_ORIGINS` = `https://qurai.uz,https://www.qurai.uz,https://smeta-tizimi.pages.dev` (eski host o'tish davrida ro'yxatda qoladi)
- `TELEGRAM_SAYT_URL` — agar o'rnatilgan bo'lsa **o'chiring** yoki `https://qurai.uz` ga o'zgartiring (u `PUBLIC_ORIGIN` dan ustun; eski qiymat qolsa webhook/Mini App eski hostga yoziladi).
- `GOOGLE_ORIGINS` — agar o'rnatilgan bo'lsa `https://qurai.uz,https://smeta-tizimi.pages.dev` qiling (o'rnatilmagan bo'lsa sukut shu ikkisi).
- Veb build o'zgaruvchisi `VITE_PUBLIC_ORIGIN=https://qurai.uz` (sukut ham shu; faqat boshqacha bo'lsa kerak).
Keyin: Deployments → oxirgi production deployni Retry/Redeploy (yoki `main` ga yangi push). Maxfiy kalitlar (`SESSIYA_KALIT`, tokenlar) O'ZGARMAYDI.
GitHub repo o'zgaruvchisi `PROD_URL` ni (cron workflowlar: ai-ishchilar, bildirishnoma-yetkaz, bilim-kuzatuv) `https://qurai.uz` ga o'zgartiring.

### d) Google Cloud OAuth
Google Cloud Console → APIs & Services → Credentials → mavjud Web client (`GOOGLE_CLIENT_ID` dagi):
- Authorized JavaScript origins: `https://qurai.uz` qo'shing (eski `https://smeta-tizimi.pages.dev` qolsin);
- Authorized redirect URIs: `https://qurai.uz` va `https://qurai.uz/brauzer-kirish` qo'shing (hozirgi kirish ID-token/GIS oqimi origin bilan ishlaydi; redirect URI ehtiyot uchun).
- OAuth consent screen → Authorized domains: `qurai.uz`.

### e) Telegram
1. @BotFather → `/setdomain` → botni tanlang → `qurai.uz` (login widget domeni).
2. BotFather → `/mybots` → bot → Bot Settings → Menu Button / Mini App URL → `https://qurai.uz/tg` (kod menyu tugmasini ham o'zi qo'yadi, 3-qadam).
3. Webhook va menyuni yangi hostga o'rnatish — superadmin sifatida **qurai.uz** dan kirib: `POST https://qurai.uz/api/telegram` tanasi `{"amal":"admin_ornat"}` (mavjud admin endpoint: `setWebhook` secret_token bilan + `setChatMenuButton` + `setMyCommands`; manzil `PUBLIC_ORIGIN` dan olinadi). Tekshirish: `{"amal":"admin_holat"}` → webhook url `https://qurai.uz/api/telegram/webhook`.
4. Eski hostdagi `/tg` va `/api/telegram/webhook` ishlayveradi (redirect yo'q) — eski xabarlardagi tugmalar buzilmaydi.

### f) R2 yuklab olish domeni (agar bo'lsa)
Repoda ommaviy R2 domeni yo'q: `smeta-tizimi-canonical` bucket yopiq, fayllar Pages Function orqali (`/android|windows|macos/<versiya>/<sha>/<fayl>`) beriladi — qo'shimcha ish kerak emas. Agar Cloudflare R2 da qo'lda custom domain ulangan bo'lsa (masalan `dl.…`), uni `dl.qurai.uz` ga ko'chirib, eskisini o'tish davri tugaguncha saqlang.

### g) Yangi Android/Windows relizlar
- Android: `./gradlew assembleRelease` (sukut `API_BASE_URL=https://qurai.uz`, zaxira `https://smeta-tizimi.pages.dev`; qurai.uz ga yetib bo'lmasa so'rov ketma-ket eski hostga o'tadi, POST faqat ulanish bo'lmagan xatolarda takrorlanadi). Versiya raqamini kutilayotgan relizga qarab L0 belgilaydi (bu PR uni o'zgartirmaydi).
- Windows: yangi NSIS reliz (SITE=`qurai.uz`, eski host ham ichki navigatsiyada qabul). Eski o'rnatilgan ilovalar eski hostda ishlayveradi (sahifalarni redirect qilmaslik uchun `Sec-Fetch-User` yo'q navigatsiya o'tkazib yuboriladi).
- Eski ilovalarni majburiy yangilash `mobile-release.json` / `desktop-release.json` orqali odatdagidek.

### h) Tekshirish (curl) va rollback
```
# 1) yangi host: sahifa va API
curl -sI https://qurai.uz/ | head -n1                                   # 200
curl -s https://qurai.uz/mobile-release.json | head -c 120              # JSON
curl -sI https://www.qurai.uz/admin?x=1 | grep -i '^location'           # https://qurai.uz/admin?x=1 (301)
# 2) eski host: brauzer sahifasi 301, API/relizlar yo'q
curl -sI -H 'Accept: text/html' -H 'Sec-Fetch-Mode: navigate' -H 'Sec-Fetch-User: ?1' "https://smeta-tizimi.pages.dev/admin/obyektlar?tab=fakt"   # 301 -> https://qurai.uz/admin/obyektlar?tab=fakt
curl -sI https://smeta-tizimi.pages.dev/mobile-release.json | head -n1  # 200 (redirectsiz)
curl -s -o /dev/null -w '%{http_code}\n' https://smeta-tizimi.pages.dev/api/telegram/webhook   # 405/401, 301 EMAS
curl -sI https://smeta-tizimi.pages.dev/t/AAAAAAAAAAAAAAAAAAAAAA | head -n1                  # 301 emas
# 3) cookie host-only
curl -sI https://qurai.uz/api/me | grep -i set-cookie   # Domain= bo'lmasligi kerak
# 4) Telegram
#   {"amal":"admin_holat"} -> webhook url https://qurai.uz/api/telegram/webhook
```
Qo'lda: qurai.uz da Google bilan kirish, Telegram Mini App ochish, QR (`/t/...`) skaner qilish, hujjat yaratib QR havola `https://qurai.uz/t/...` ekanini ko'rish, Android ilovada kirish.

**Rollback** (kodni qaytarmasdan, tartib bilan):
1. Pages env `ESKI_HOST_YONLANTIRISH=0` + redeploy — eski hostdagi 301 to'xtaydi (brauzerlar 301 ni 5 daqiqa keshlaydi, `Cache-Control: max-age=300`).
2. Pages env `PUBLIC_ORIGIN`, `BREND_URL`, `QULF_RP_ID`, `QULF_ORIGINS`, `TELEGRAM_SAYT_URL` ni oldingi qiymatga qaytarish (`https://smeta-tizimi.pages.dev`; `QULF_RP_ID` ni o'chirish) + redeploy; `admin_ornat` ni eski hostdan qayta bajarish; BotFather `/setdomain` ni eskisiga.
3. Custom domains dan `qurai.uz` ni vaqtincha olib tashlash mumkin — eski host to'liq ishlaydi (API/ilovalar hech qachon unga bog'liq bo'lmagan).