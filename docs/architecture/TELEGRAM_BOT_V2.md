# Telegram bot V2 — 1-bosqich (@qur_uz_bot)

Asos: `docs/product/TELEGRAM_BOT_REJA.md` (PR 1 poydevor). Bu hujjat 1-bosqichda **nima qo'shilgani**, **xavfsizlik qoidalari** va **egasi/L0 nima qilishi kerak**ligini qisqa beradi.

## Bosh qoida

Telegram hisobi faqat bog'langan `t2_foydalanuvchi` sifatida ishlaydi. Bot o'z ruxsat tizimini yozmaydi: har amal
`botChaqiruv` (`functions/_shared/telegram-amal.ts`) orqali **veb bilan aynan bir xil zanjirdan** o'tadi:
`_middleware` (t2_men_v1 → permissionsByCompany, modul holati, tenant) → mavjud shlyuz (`sb`, `hujjat-aylanish`, `ai-savol`,
`hujjat-yukla`, `foto-dalil`) → RPC (a'zolik/rol bazada). Ichki sessiya brauzerga chiqmaydi, roli huquq bermaydi.

## Mini App kirish (1-band)

Allaqachon bor: `/api/telegram/miniapp` — initData HMAC (`WebAppData` + bot token) va `auth_date` yangiligi (≤ 1 soat, talabdan qattiqroq)
SERVERDA tekshiriladi; faqat TelegramKarta orqali ulangan foydalanuvchi uchun oddiy sessiya beriladi, hisob jimgina yaratilmaydi
(ulanmagan → 403 `ULANMAGAN`). Alohida `webapp-kirish` yozilmadi (dublikat bo'lardi). Yangi: **chuqur havola** — `/tg?to=/admin/...`
(`src/lib/tg-yol.ts`: faqat ichki `/admin/...`, tashqi domen/`//`/`..` rad). Menyu tugmasi oddiy `/tg` ni ochadi.

## Buyruqlar (uz/ru/en; til Telegram `language_code` dan)

| Buyruq | Nima qiladi | Manba (mavjud qatlam) |
|---|---|---|
| `/start` | ulanish holati (ism) + menyu: Mini App, Bugun, Obyektlar, Yordam | `t2_men_v1` |
| `/bugun` | tasdiq kutayotgan hujjatlar, F-2 qoralamalari, tugallanmagan fakt (qoralama); rolga mos; faqat o'qish | `hujjat-aylanish?bolim=kiruvchi`, `sb` (t2_akt) |
| `/obyektlar` | faol obyektlar (#id + Mini App tugmalari) | `sb` (t2_obyekt, tenant filtri serverda) |
| `/jarvis <savol>` | Jarvis ga savol (≤1000 belgi, daqiqada 5 ta) | `ai-savol` → `aiHisobli`: limit tekshiruvi + token yechish **o'zgarmagan** |
| `/kunlik on\|off` | kunlik xulosa opt-in | `t2_telegram_sozlama_v1` (`kunlik` kaliti — migratsiya) |
| `/yordam`, `/men`, `/ilova`, `/chiqish` | avvalgidek | — |

Noma'lum `null` ≠ 0: o'qib bo'lmagan/ruxsatsiz son «—» ko'rsatiladi.

## Inline tugmalar

- Bildirishnomada **«Ko'rish»** — Mini App chuqur havola. `hujjat.tasdiq_kutmoqda` da qo'shimcha **«Tasdiqlash»**.
- «Tasdiqlash» → avval tasdiq so'raladi («Ha, tasdiqlayman / Bekor»), keyin mavjud `t2_hujjat_zanjir_qaror_v1`
  (`amal: zanjir_qaror`) a'zo kompaniyalar bo'yicha sinaladi. Navbat/rol/a'zolik BAZADA tekshiriladi (`_t2_hujjat_azo`), middleware
  `document.read` + modul holatini tekshiradi. `NAVBAT_EMAS`/ruxsatsiz → hech narsa tasdiqlanmaydi. **Rad/qaytarish tugmasi yo'q**
  (sabab matni kerak; Mini App da). Eslatma: tugma hujjat turidan qat'i nazar (F-2 ham) zanjir qarorini beradi.
- `callback_query` faqat: shaxsiy chat, `chat.id == from.id`, Telegram↔foydalanuvchi bog'lanishi (`t2_telegram_aniqla_v1`),
  `callback_data` qisqa id (`tq:`/`tqy:`/`tqn:` + son; boshqasi rad). Takror update — `update_id` bo'yicha idempotent.

## Rasm → foto-dalil

Rasm (+izoh) → eng katta o'lcham (≤10 MB) serverda yuklab olinadi (Telegram fayl URL i tokenli — yozilmaydi) →
`hujjat-yukla` (`foto_dalil`, R2 + reyestr, sha256) → `foto-dalil` `bogla` (`manba_turi=umumiy`, faktga biriktirilmagan) →
javobda Mini App `/admin/foto` havolasi. «Joriy obyekt»: izohdagi `#<obyekt id>` (foydalanuvchiga ochiq obyektlar ichidan) →
yagona obyekt → aks holda ro'yxat bilan so'raydi (taxmin qilinmaydi). **Fakt summasi/hajmi yozilmaydi.**

## Kunlik xulosa

`POST /api/telegram/kunlik` (`X-Cron-Kalit` = `BILDIRISHNOMA_CRON_KALIT`), partiya ≤4 foydalanuvchi, `keyin_id` kursori;
workflow `.github/workflows/telegram-kunlik.yml` (kuniga 1 marta, 03:00 UTC = 08:00 Toshkent; sirlar sozlanmasa jim o'tadi).
Mazmun `/bugun` bilan bir xil. Baza: migratsiya `20261223000000_t2_telegram_kunlik_v1` (whitelist + `t2_telegram_kunlik_royxat_v1`).
Migratsiya qo'llanmaguncha `/kunlik on` «hali serverda yoqilmagan» deydi (yolg'on «yoqildi» emas).

## Xavfsizlik

Webhook `secret_token` (fail closed) saqlangan; `update_id` idempotent + bazada 20/daq limit; qo'shimcha: `/jarvis` 5/daq, rasm 8/daq (isolate ichida).
Token faqat env; loglarda matn/summa/chat_id/token yo'q (testlanadi). Yozuvchi yo'llar: faqat foto-dalil (umumiy) va hujjat qarori.

## Egasi / L0 faollashtirishi

1. Migratsiya `20261223000000_t2_telegram_kunlik_v1` (avval `.acceptance.sql` ROLLBACK da, keyin prod) — kunlik xulosa uchun.
2. Cloudflare Pages: `R2_CANONICAL` binding (foto), `BILDIRISHNOMA_CRON_KALIT`, `TELEGRAM_BOT_TOKEN` (mavjud). GitHub: `BILDIRISHNOMA_CRON_KALIT` sirri + `PROD_URL`.
3. Yangi buyruqlar menyusi uchun Boshqaruv → Telegram bot → «Webhook va menyu tugmasini o'rnatish» (`admin_ornat` → setMyCommands) QAYTA bosiladi (bu ish bajarilmagan).
4. `/jarvis` pullik: kompaniya AI byudjeti/token qoidalari `aiHisobli` dagi kabi.
