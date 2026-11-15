# USERNAME_V1 — tizim darajasidagi @username va aniq qidiruv (API kontrakti)

Holat: migratsiya fayli tayyor, **qo'llanmagan** (egasi tasdig'i kutiladi): `supabase/migrations/20261224100000_t2_username_v1.sql`
(+ `.rollback.sql`, `.acceptance.sql`). Sayt, Android, Windows va Telegram bot **bir xil server mantig'ini** ishlatadi — mijozda qoida yozilmaydi,
faqat oldindan ko'rsatma. Yakuniy hakam — bazadagi RPC.

## 1. Tushunchalar
| Narsa | Qoida |
|---|---|
| `username` | 5–32 belgi, faqat `a-z 0-9 _`, harf bilan boshlanadi, `__` va oxirgi `_` yo'q, band so'zlar yo'q (`admin`, `qurai*`, `support`, `bot`, `root`, `api`, `www`, ...). Doim kichik harfda saqlanadi, noyoblik katta-kichik harfga befarq. |
| O'zgartirish limiti | Birinchi belgilash cheksiz; keyingi o'zgartirish/o'chirish — **sutkasiga 5 ta** (`USERNAME_LIMIT`). |
| 7 kunlik ushlash | Bo'shatilgan yoki o'zgartirilgan username **7 kun** avvalgi egasi uchun band qoladi (`t2_username_ushlash`): boshqa foydalanuvchi uni ola olmaydi (`USERNAME_USHLANGAN`, HTTP 409; `username_tekshir` da `bosh: false, ushlangan: true`), avvalgi egasi 7 kun ichida qaytarib olishi mumkin (ushlash o'chadi). 7 kundan keyin nom ochiq. |
| Qidiruv | **Faqat aniq moslik** (prefiks yo'q) — enumeration'ga qarshi. Istisno: autocomplete faqat o'z **kompaniyadoshlar** orasida. |
| Qidiruv limiti | telefon/email: **30/soat**, username: **120/soat**, har so'rovchiga (`LIMIT`, HTTP 429). Har qidiruv logga yoziladi (kim, tur, topildimi — qiymat saqlanmaydi). |
| Maxfiylik | `telefon_qidiruv`: `hammasi` (sukut) / `kompaniyadosh` / `hech` — telefon **va email** orqali topilishni boshqaradi. `@username` orqali topish doim yoqiq. Telefon/email javobda **hech qachon** qaytmaydi. |
| Minimal profil | `{ id, ism, username, avatar_rang }` |
| Taklif | `@username`/telefon/email orqali taklif **kutiladigan** (14 kun); maqsad qabul qilgach a'zo bo'ladi. Hech kim jimgina qo'shilmaydi. |

Telefon normallashtirish: E.164, 9 xonali mahalliy raqamga `+998` qo'shiladi (`telefonNorm`, `functions/_shared/kirish-emailsiz.ts` / SQL `t2_telefon_norm_v1`). Bitta maydondagi qiymat turi avtomatik: `@x` yoki `[A-Za-z][A-Za-z0-9_]{4,31}` → username; ichida `@` bo'lsa → email; aks holda telefon.

## 2. Transport (hammasi sessiya cookie bilan; actor FAQAT sessiyadan, `p_actor_id` tanadan olinmaydi)
Android/Windows: mavjud sessiya mexanizmi (cookie yoki desktop-auth) — boshqa `/api/profil` amallari bilan bir xil.

### `POST /api/profil` (tana `{ amal, ... }`, origin tekshiruvi bor)
| amal | Tana | Javob |
|---|---|---|
| `username_ol` | — | `{ ok, username, ism, telefon_qidiruv, bugun_qoldi }` |
| `username_tekshir` | `{ username, variantlar?: string[≤10] }` | `{ ok, yaroqli, sabab, bosh, band, ushlangan, variantlar }` — `variantlar` ichidan bo'shlari (≤5) |
| `username_belgila` | `{ username: string \| null, operation_id? }` (`null`/`''` = o'chirish) | `{ ok, username }` |
| `username_sozlama` | `{ telefon_qidiruv: 'hammasi'\|'kompaniyadosh'\|'hech' }` | `{ ok, telefon_qidiruv }` |
| `qidir` | `{ qiymat }` (@username / telefon / email, aniq) | `{ ok, topildi, tur, profil \| null }` |
| `kompaniyadosh_qidir` | `{ prefiks (≥2), kompaniya_id? }` | `{ ok, royxat: Profil[≤8] }` (autocomplete) |
| `username_ommaviy` | `{ idlar: number[≤200] }` | `{ ok, username: { "<id>": "<username>" } }` — faqat kompaniyadoshlar |
| `taklif_royxat` | — | `{ ok, royxat: [{ id, kompaniya_id, kompaniya_nom, rol, tugaydi, taklif_qiluvchi: Profil }] }` |
| `taklif_javob` | `{ taklif_id, qabul: boolean, operation_id? }` | `{ ok, holat: 'qabul'\|'rad', kompaniya_id?, rol? }`; qabulda `Set-Cookie` yangilanadi |

### `POST /api/company` — kompaniyaga taklif
`{ action: 'member_invite', kompaniya_id, qiymat, rol }` (`company.member.manage`; RPC direktorni qayta tekshiradi).
Rollar: `rahbar, bugalter, pto, prorab, buyurtmachi, pudratchi, kuzatuvchi`.
- Muvaffaqiyat: `{ ok: true, taklif_id, holat: 'kutmoqda', profil }`
- Hisob topilmasa: HTTP 404 `{ ok: false, code: 'TOPILMADI', tur, telefon_taklif: boolean, telefon: '+998…' | null }`.
  `telefon_taklif: true` bo'lsa mijoz mavjud havola/kod oqimini taklif qiladi: `POST /api/kirish-taklif { amal: 'yarat', kompaniya_id, ism, telefon, rol }`
  → `{ kod, havola }` (**SMS yuborilmaydi** — foydalanuvchi o'zi SMS/Telegram orqali jo'natadi; kod faqat bir marta ko'rsatiladi).
  Maxfiylik `hech` bo'lgan hisob ham shunday (topilmadi bilan bir xil javob).

### Xato kodlari
`USERNAME_QISQA|UZUN|FORMAT|BOSHLANISH|UNDERSCORE|BAND_SOZ` (400), `USERNAME_BAND` (409), `USERNAME_USHLANGAN` (409, 7 kunlik ushlash), `USERNAME_LIMIT`/`LIMIT` (429), `QIYMAT_NOTOGRI` (400),
`TOPILMADI` (404), `ALREADY_MEMBER` (409), `RUXSAT_YOQ`/`AUTHORIZATION_DENIED` (403), `ROL_NOTOGRI` (400), `SOZLAMA_NOTOGRI` (400),
`TAKLIF_TOPILMADI` (404), `TAKLIF_MUDDATI_OTGAN` (400), `TAKLIF_YAROQSIZ` (400, taklif qiluvchi huquqini yo'qotgan), `SERVER_YANGILANMAGAN` (404, migratsiya qo'llanmagan).

## 3. Android uchun tavsiya (UI)
1. **Profil → Username**: matn maydoni (`@` prefiks), 400 ms debounce bilan `username_tekshir` (mijozda avval format tekshiriladi), ismdan variantlar (`usernameTakliflari` mantig'i: `ism_familiya`, `ismfamiliya`, `i_familiya`, `ism_f`, …), «Saqlash» faqat `bosh == true` bo'lganda. «Telefon/email bo'yicha kim topadi» — 3 variantli tanlov.
2. **Odam qo'shish / taklif**: bitta maydon (@username, telefon yoki email), tur avtomatik; yozayotganda `kompaniyadosh_qidir` (autocomplete); «Yuborish» → `member_invite`. `TOPILMADI + telefon_taklif` → «Havola va kod yaratish».
3. **Kelgan takliflar**: `taklif_royxat` (ilova ochilganda va profil/kompaniyalar ekranida) → Qabul/Rad (`taklif_javob`); qabuldan keyin sessiya/vakolatni qayta yuklash.
4. **A'zo ro'yxati**: `username_ommaviy` bilan `@username` ko'rsatish; yo'q bo'lsa — mavjud `@login`.
5. Birinchi kirish/onboarding: username bo'sh bo'lsa — o'tkazib yuboriladigan taklif (majburiy emas). Telegram username'dan avtomatik olish YO'Q — faqat tasdiq bilan.

## 4. Telegram bot
- `/start`: QURAI username bo'sh va Telegram username QURAI qoidasiga mos bo'lsa — inline tasdiq (`usr:ha:<nom>` / `usr:yoq`); tasdiqsiz yozilmaydi.
- `/username` — ko'rsatadi; `/username <nom>` — o'rnatadi. `/men` — `Username: @…` qatori.
- `/taklif <@username|telefon|email> <rol> [kompaniya kodi]` — `member_invite` bilan bir xil RPC; bir nechta direktor kompaniyasi bo'lsa kod talab qilinadi.

## 5. Ochiq qarorlar (egasiga)
1. **Telegram username bilan noyoblik** (QAROR, egasi): QURAI username'lari Telegram username'lari bilan bog'lanmaydi va tasdiqlanmaydi — alohida nom maydoni; bot faqat taklif qiladi, band bo'lsa variantlar beriladi.
2. **O'zgartirish limiti va ushlash** (QAROR, egasi): 5/sutka saqlanadi; bo'shatilgan/o'zgartirilgan username 7 kun avvalgi egasi uchun band, u shu muddatda qaytarib olishi mumkin.
3. **Email qidiruvi** hozir telefon sozlamasi (`telefon_qidiruv`) bilan boshqariladi; alohida «email bo'yicha topish» sozlamasi kerakmi?
4. **Yuborilgan takliflarni** direktor ro'yxatda ko'rib bekor qilishi (hozir faqat qabul/rad/muddat) — keyingi bosqich.
5. Telefon taklifi uchun SMS jo'natish yo'q (mavjud havola/kod oqimi); SMS provayderi ulansa, shu nuqtaga ulanadi.
6. Reserved so'zlar ro'yxati (`t2_username_zahira`) egasi tomonidan kengaytiriladi.
