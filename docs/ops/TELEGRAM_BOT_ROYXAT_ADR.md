# ADR (qoralama): botda o'zi ro'yxatdan o'tish va kompaniya tanlash/yaratish

Holat: QORALAMA — RPC/migratsiya YOZILMAGAN; L0 egasidan so'raydi. Bog'liq: `docs/ops/TELEGRAM_BOT_QAMROV.md` (PR 2), `docs/ops/TELEGRAM_KIRISH.md`.

## Muammo
Hozir ulanmagan foydalanuvchi botda faqat «saytga kiring» ko'rsatmasini oladi. Telegram-first kirish (`t2_tg_kirish_*`) sayt boshlagan nonce talab qiladi: botning o'zida hisob ochish yo'q. Egasi talabi («Telegramday»): bot ichida ro'yxatdan o'tish, kompaniya/modul tanlash.

## Taklif oqimi
1. `/start` (ulanmagan) -> «Ro'yxatdan o'tish» tugmasi -> «Raqamimni yuborish» (`request_contact`).
2. Kontakt: `contact.user_id == from.id` (mavjud tekshiruv) + faqat +998. Telefon TASDIQLANGAN hisobda bor -> o'sha hisobga ulash (avto-ulanmaydi: tasdiq tugmasi + mavjud ulash kodi yo'li); yo'q -> yangi `t2_foydalanuvchi` (daraja 0).
3. Ism (Telegram first_name taklifi, tugma bilan tasdiq), til.
4. Kompaniya: (a) «Taklif kodim bor» -> mavjud taklif yo'li; (b) «Yangi kompaniya» -> nom (+ ixtiyoriy INN) -> egasi roli; (c) kompaniyasiz (yakka haydovchi/usta) — mavjud «kompaniyasiz foydalanuvchi» modeli.
5. Modullar: rolga mos standart to'plam taklif qilinadi, foydalanuvchi tugmalar bilan tanlaydi (mavjud modul holati).
6. Tugagach: doimiy menyu (PR #675) va ilk kurs qadami.

## Kerakli yangi server qismi (hozir YO'Q — egasi tasdig'i bilan)
- `t2_tg_royxat_v1(p_telegram_user_id, p_telefon, p_ism, p_til, p_operation_id)` — idempotent; hisob yaratadi/mavjudiga tegmaydi; audit.
- `t2_tg_kompaniya_yarat_v1(p_actor_id, p_nom, p_inn, p_operation_id)` — mavjud kompaniya yaratish mantig'ini chaqiradi (parallel qoida yo'q).
- Mavjud `t2_telegram_update_qabul_v1` limiti + qo'shimcha: soatiga yangi hisob limiti (spam).

## Xavf va qoidalar
- Telefon egaligi faqat Telegram kontakti bilan (SMS yo'q); boshqa odam kontakti rad.
- Mavjud hisobga jimgina ulanmaydi (hisobni tortib olish xavfi) — tasdiq tugmasi + sayt ogohlantirishi.
- Hisob/kompaniya yaratish — «Tasdiqlash» tugmasi, preview matni bilan; token yechilmaydi (ro'yxatdan o'tish bepul).
- Shaxsiy ma'lumot (telefon, INN) loglanmaydi; GitHub'ga real qiymat yozilmaydi.
- Ruxsat/rol — mavjud `t2_men_v1` va middleware; bot yangi ruxsat yozmaydi.

## Egasiga savollar
1. Botda yangi KOMPANIYA yaratish ruxsatmi yoki faqat taklif kodi bilan qo'shilishmi?
2. Telefon tasdiqlangan mavjud hisob topilsa: avto-ulash o'rniga tasdiq tugmasi yetarlimi?
3. Standart modul to'plami qaysi rol uchun qanday?
4. Soatiga yangi hisob limiti (taklif: IP/telegram_id bo'yicha 3).