# Telegram bot (@qur_uz_bot) va Mini App — reja

Egasi talabi (2026-10-28): «shu bot orqali hamma o'ziga tegishli tizimdagi maksimal hamma ishini qila olishi kerak va
mini app shaklida ham ochib bera olishi kerak».

Kanonik bosh qoida: **Telegram hisobi faqat bog'langan `t2_foydalanuvchi` sifatida ishlaydi.** Alohida rol/ruxsat
tizimi yo'q. Har bot amali server tomonda `t2_men_v1` vakolati + mavjud `permission-policy.ts` / `write-command-policy.ts`
/ nomli RPC (`t2_require_permission_v2`) orqali o'tadi. Bot faqat yangi "kirish yuzasi" (E4 klient yuzalari).

## PR 1 — poydevor (shu PR)

| Qism | Fayl |
|---|---|
| Migratsiya (yozildi, L0 qo'llaydi) | `supabase/migrations/20261114400000_t2_telegram_v1{,.rollback,.acceptance}.sql` |
| Umumiy mantiq (initData HMAC, webhook siri, kod, Bot API, `telegramYubor`) | `frontend/functions/_shared/telegram.ts` |
| Webhook (sir, idempotent update_id, limit, darhol 200) | `frontend/functions/api/telegram/webhook.ts` |
| Mini App kirish (initData → oddiy sessiya) | `frontend/functions/api/telegram/miniapp.ts` |
| Web ulash/uzish/sozlama + superadmin holat/o'rnatish | `frontend/functions/api/telegram/index.ts` |
| UI: Mini App `/tg`, Akkaunt → Bildirishnomalar kartasi, Boshqaruv → Telegram bot | `frontend/src/telegram/*` |
| Bot matnlari (uz/ru/en) | `frontend/src/i18n/lugat/qism/telegram-bot.json` |
| Testlar | `frontend/functions/api/telegram/telegram.test.ts`, `frontend/src/api/t2-telegram.test.ts` |

Buyruqlar: `/start <kod>` (ulash), `/start`, `/men`, `/ilova`, `/yordam`, `/chiqish`. Bildirishnoma: yangi topshiriq
(`t2_topshiriq_ber_v1` muvaffaqiyatidan keyin, ijrochiga, opt-in).

Egasi bajaradigan bir martalik qadamlar — PR tavsifida (Cloudflare Pages secretlar + Boshqaruv → Telegram bot →
«Webhook va menyu tugmasini o'rnatish»).

## Umumiy qoidalar (barcha keyingi PR lar)

1. **Ruxsat** — har bot amali uchun mavjud amal nomi (`sb-yoz` reyestri) va permission. Bot uchun yangi yozish yo'li
   kerak bo'lsa — avval `write-command-policy.ts` reyestri, keyin nomli RPC. Bot hech qachon to'g'ridan-to'g'ri jadvalga yozmaydi.
   Amaliy yo'l: webhook ichida `roleAuthority({foydalanuvchi_id})` → `requestPermission()` → o'sha RPC (middleware bilan
   bir xil tekshiruv; umumiy `botAmal(env, uid, amal, yuk)` yordamchisi PR 2 da `_shared/telegram-amal.ts` ga chiqariladi).
2. **Kompaniya konteksti** — bir nechta ish joyi bo'lsa `/joy` buyrug'i bilan tanlanadi (inline tugmalar), tanlov
   `t2_telegram_ulanish.joriy_kompaniya_id` da (PR 2 migratsiyasi). Tanlanmagan bo'lsa yozish amali so'raladi, taxmin qilinmaydi.
3. **Tasdiqlash** — har yozish amali oldin QORALAMA + «✅ Tasdiqlash / ✖ Bekor» inline tugma (`callback_query`).
   `callback_data` da faqat qisqa id (≤64 bayt), qoralama serverda (`t2_telegram_qoralama`, 30 daqiqa, operation_id bilan).
4. **Pul** — har summa: QQS bilan (asosiy) → QQS siz → прямые (ustamasiz), yorliqlari bilan. NULL ≠ 0: noma'lum — «—».
   Hisob-kitob yangidan yozilmaydi: `lib/ustamali-summa.ts`, `SummaJuft` mantiqi server tomonda qayta ishlatiladi.
5. **Fayl** — Telegram fayli (`getFile`) serverda yuklab olinadi → mavjud hujjat reyestri (`hujjat-yukla` / R2,
   `t2_document_registry`, dedup SHA-256) orqali. Telegram fayl havolasi (token ichida) hech qayerga yozilmaydi.
6. **AI** — faqat mavjud AI shlyuzi (`_shared/ai.ts`, `ai-hisobli.ts`): token yechish qoidalari o'zgarmaydi
   (har AI natijasi token yechadi; qayta yuborish takror yechilmaydi). Bot AI ni o'zi chaqirmaydi.
7. **Maxfiylik** — xabar matni/rasm bazaga faqat foydalanuvchi tasdiqlagan hujjat sifatida; loglarda matn/summa/INN yo'q.
8. **Limit** — mavjud `t2_telegram_update_qabul_v1` (20/daq); AI/fayl uchun alohida kunlik limit (PR 3).

## PR 2 — kontekst, inline tugmalar, PTO

- Migratsiya: `t2_telegram_ulanish.joriy_kompaniya_id`, `t2_telegram_qoralama` (RLS, service_role RPC).
- `callback_query` ishlovchisi (+ `answerCallbackQuery`), `/joy` (ish joyi tanlash).
- **PTO / prorab — fakt kiritish:** matn («B-12 beton 15 m3») → mavjud fakt parser/AI (`ai-parse`) → qoralama ro'yxati
  (obyekt, qator, hajm) → tasdiq → `fakt` yozish RPC (permission `fakt.write`). Fakt = F2 qoidasi (`lib/fakt-f2-tenglash.ts`)
  o'zgartirilmaydi — bot faqat mavjud yozish yo'lini chaqiradi.
- **F2 holati:** `/f2` → obyektlar → oxirgi F2 lar (holat, oy, summa: QQS bilan / QQS siz / прямые), «Mini App da ochish».
- Bildirishnomalar: F2 holati o'zgardi (`f2` opt-in kaliti allaqachon bor), ochiq signal (`signal`).

## PR 3 — rasm/ovoz va hujjat yuklash

- Rasm/hujjat → `getFile` → `hujjat-yukla` (R2 + reyestr, dedup) → obyektga bog'lash tugmalari.
- Rasm/ovoz → AI vision/transkripsiya (mavjud AI shlyuzi, token yechiladi) → fakt QORALAMASI → tasdiq.
- Kunlik AI/fayl limiti, fayl hajmi chegarasi (20 MB — Bot API cheklovi).

## PR 4 — ombor (sklad)

- `KELDI` (kirim), `BERDIM` (chiqim / M-29 orqali, ADR-3), `QOLDIQ` — mavjud ombor RPC lari orqali (ombor lane egasi bilan
  kelishib; `ombor*`, `Sklad.tsx` ga tegilmaydi — faqat ularning server RPC lari chaqiriladi). Nakladnoy rasmi → PR 3 yo'li.

## PR 5 — rahbar va buyurtmachi

- **Rahbar/boss:** kunlik xulosa (ertalab, opt-in): shartnomalar, F2 (tayyor/tasdiq kutmoqda), to'lovlar, qarz — barcha summa
  QQS bilan → QQS siz → прямые. Manba — mavjud boss read model (`boss-dashboard` API), yangi hisob yozilmaydi.
- **Tasdiqlash so'rovlari:** F2 tasdiq kutmoqda → inline «Tasdiqlash / Qaytarish» (`f2.approve` ruxsati, mavjud lifecycle RPC).
- **Buyurtmachi:** o'ziga ulashilgan obyektlar bo'yicha F2/F3 ko'rish (faqat o'qish), PDF — mavjud hujjat generatoridan.

## PR 6 — sayqal

- Mini App ichida Telegram mavzusi (rang), `BackButton`, Telegram Web (iframe) uchun cookie (`SameSite=None; Partitioned`)
  — CSRF tahlilidan keyin; hozir Telegram mobil/desktop (to'liq WebView) qo'llab-quvvatlanadi.
- Telegram uzilganda Mini App sessiyasini bekor qilish varianti (hozir: uzish faqat bog'lanishni o'chiradi).
- Bot orqali AI chat (mavjud AI shlyuzi, token qoidalari).

## Ochiq savollar (egasiga)

1. Rahbar kunlik xulosasi vaqti (masalan 08:30 Toshkent) va qaysi ko'rsatkichlar birinchi.
2. Fakt kiritishda ovozli xabar tili (o'zbek/rus aralash) — transkripsiya provayderi tanlovi (narx/token).
