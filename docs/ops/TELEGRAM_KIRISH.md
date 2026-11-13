# Telegram orqali kirishni yoqish (qiymatlarsiz)

Yo'l kodda tayyor (PR #404) va sukut bo'yicha O'CHIQ. Yoqilmaguncha kirish sahifasida Telegram tugmasi ko'rinmaydi.

## 1. Bot (BotFather)
1. @BotFather -> `/newbot` (yoki mavjud `@qur_uz_bot`). Bot nomi/username'ni yozib oling.
2. Botda menyu/`/start` buyruqlari avtomatik: ular `POST /api/telegram {amal:'admin_ornat'}` (superadmin) orqali o'rnatiladi.

## 2. Cloudflare Pages -> Settings -> Environment variables (Production, keyin qayta deploy)
Faqat NOMLAR (qiymatlarni o'zingiz kiritasiz, hech qayerga yozmang):
- `TELEGRAM_BOT_TOKEN` — BotFather bergan token (secret).
- `TELEGRAM_WEBHOOK_SECRET` — 16+ belgili tasodifiy satr (secret); webhook shu bilan tekshiriladi.
- `TELEGRAM_BOT_USERNAME` — bot username (`@`siz) — havolalar uchun.
- `TELEGRAM_SAYT_URL` — sayt manzili (ixtiyoriy; sukut — standart sayt).
- `KIRISH_TELEGRAM_YOQILGAN` = `1` — Telegram orqali kirishni yoqadi (o'chirish: bo'sh/0).
- Qo'shimcha (ixtiyoriy): `KIRISH_TELEFON_YOQILGAN` = `1` (telefon+parol), `KIRISH_TAKLIF_YOQILGAN` = `1` (admin taklifi).

## 3. Webhook o'rnatish
Saytga superadmin sifatida kiring -> Akkaunt -> Telegram -> «Webhook va menyu tugmasini o'rnatish» (yoki `POST /api/telegram` `{ "amal": "admin_ornat" }`). Holat: `amal: "admin_holat"` (`url`, `pending_update_count` ko'rinadi). Webhook manzili: `<sayt>/api/telegram/webhook`, `secret_token` = `TELEGRAM_WEBHOOK_SECRET`.

## 4. Tekshirish
1. Kirish sahifasini yangilang: «Telegram orqali» tugmasi paydo bo'lishi kerak.
2. Tugma -> «Telegram orqali kirish» -> botda moslik raqamini solishtiring -> «Raqamimni yuborish».
3. Yangi raqam -> yangi hisob; shu raqam TASDIQLANGAN hisobda bor -> o'sha hisobga kirish; admin kiritgan (tasdiqlanmagan) raqam -> «bu raqam bilan hisob bor, unga kirib Telegramni ulang» (avto-ulanmaydi).

## 5. Muammo
- Tugma ko'rinmasa: `GET /api/kirish-telegram` `{yoqilgan:true}` qaytarishi kerak (bayroq + token sozlanganmi).
- Bot javob bermasa: `admin_holat` da `pending_update_count` va xatolar; webhook secret mos emasligi 403 beradi.
- O'chirish: `KIRISH_TELEGRAM_YOQILGAN` ni olib tashlang — tugma yo'qoladi, endpoint 503 qaytaradi.