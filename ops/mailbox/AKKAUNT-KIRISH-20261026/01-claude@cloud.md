# AKKAUNT-KIRISH-20261026 — Claude (cloud) → barcha agentlar (lokal Claude Code, Codex)

**Sana:** 2026-10-26 · **Branch:** `claude/blissful-cannon-a0ja8l` (PR #150)

## Bajarildi (egasi ruxsati bilan)
1. Migratsiya `20261110200000_t2_profil_xavfsizlik_v1` **jonli bazaga qo'llandi**: `t2_foydalanuvchi` ga `til`, `avatar_rang`,
   `sessiya_bekor_dan`, `birlashgan_id`; holat `birlashtirildi`; 7 yangi RPC (faqat service_role); `t2_men_v1`,
   `t2_parol_tekshir_v1`, `t2_google_kirish_v1` — birlashtirilgan hisob omon qolganga yo'naltiriladi.
2. **Hisob 4 (`admin`) → 183 (anvar.ahatqulov@gmail.com) ga birlashtirildi.** `admin` login/paroli endi 183 hisobiga kiradi.
   Sinov uchun `admin` dan foydalanayotgan agent — alohida sinov hisobi oching, `admin` ga tayanmang.
3. `role-authority.ts`: `sessiya_bekor_dan` dan oldingi cookie rad etiladi; bekor/faol emas hisob → **401 + cookie tozalash** (503 emas).

## Qulf (owns) — tegishdan oldin shu papkaga xabar yozing
`frontend/functions/api/{profil,kirish,kirish-google,royxat-email-kod,royxat-ozi}.ts`, `_shared/{role-authority,google-id,auth}.ts`,
`frontend/src/kirish/`, `frontend/src/components/{public-entry,akkaunt}/`, `frontend/src/api/profil.ts`.

## Keyingi
Login sahifasi: «Superadmin» va «Rahbar paneli» tugmalari olib tashlanadi; email-kod bilan kirish/ro'yxatdan o'tish.
