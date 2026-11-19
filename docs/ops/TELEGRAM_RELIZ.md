# Telegram: dastur relizlari (yuklab olish + kanal/guruh e'loni)

Mavjud `@qur_uz_bot` kengaytirilgan (ikkinchi bot yo'q). Kod: `frontend/functions/_shared/telegram-reliz.ts`,
`frontend/functions/api/telegram/reliz.ts`, webhook (`/yuklash`, `rl:y` tugmasi, `/reliz_elon`), `.github/workflows/reliz-elon.yml`.

## Foydalanuvchi uchun
- Botda «📥 Ilovani yuklab olish» tugmasi (/start menyusida) yoki `/yuklash` — hisob ulangan bo'lishi shart emas.
- Android + Windows oxirgi versiyasi: sarlavha, hajm, **SHA-256**, «Nima yangi» (manifestdagi `notes`, bo'lmasa `/yangiliklar.json` dagi eng yangi 3 sarlavha).
- Fayl ≤ 50 MB (Telegram Bot API yuklash chegarasi): hujjat sifatida yuboriladi. Birinchi yuklashdan keyin Telegram `file_id` R2 da
  keshlanadi (`tg-reliz/fayl-id/<platforma>-<versiya>-<sha12>.json`) — keyingi yuborishlar qayta yuklamaydi.
- Fayl > 50 MB yoki yuklash xato: xabar + «⬇️ Yuklab olish» tugmasi (saytning ochiq manzili `/<platforma>/<versiya>/<sha256>/<fayl>`).

## E'lon (kanal + guruh)
- Chatlar: `TG_KANAL` va `TG_GURUH` (`frontend/wrangler.toml [vars]`, sir emas — allaqachon sozlangan). Yangi chat id kerak emas.
- Idempotent: bir versiya bir chatga bir marta; yozuv `tg-reliz/elon/<chat>-<platforma>-<versiya>-<sha12>.json` (R2_CANONICAL).
- Avtomatik: `main` ga `mobile-release.json` / `desktop-release.json` o'zgarishi kirsa `reliz-elon.yml` sayt deploy bo'lishini kutadi va
  `POST /api/telegram/reliz {"amal":"elon"}` ni chaqiradi.
- Qo'lda (faqat superadmin): botda `/reliz_elon [android|windows] [versiya]` (majburiy qayta e'lon; eski versiya R2 dan topiladi),
  yoki superadmin sessiyasi bilan `POST /api/telegram/reliz {amal:'elon', platforma?, versiya?, majbur:true}`, `{amal:'holat'}`.

## Sozlash (egasi bajaradi)
1. Botni **kanal** (`@qurai_uz`) va **guruh** ga **administrator** qiling: kanalda «Post messages» huquqi, guruhda xabar yuborish huquqi.
   Tekshirish: superadmin sessiyasi bilan `POST /api/telegram/kanal {amal:'holat'}`.
2. Cloudflare Pages secret: `TELEGRAM_BOT_TOKEN` (allaqachon), `BILDIRISHNOMA_CRON_KALIT` (allaqachon; kamida 24 belgi).
3. GitHub: secret `BILDIRISHNOMA_CRON_KALIT` va repo o'zgaruvchisi `PROD_URL` (telegram-kunlik bilan bir xil). Sozlanmasa workflow jim o'tkazib yuboradi.
4. Reliz manifestiga ixtiyoriy `"notes": ["...", "..."]` (o'zbekcha qisqa «Nima yangi») qo'shish mumkin.

## Cheklovlar
- Bir vaqtda ikki ishga tushirish kamdan-kam hollarda ikki marta e'lon qilishi mumkin (R2 yozuvi atomik emas); workflow `concurrency` bilan himoyalangan.
- macOS (DMG) hali e'lon qilinmaydi (ilova faqat Android/Windows).
