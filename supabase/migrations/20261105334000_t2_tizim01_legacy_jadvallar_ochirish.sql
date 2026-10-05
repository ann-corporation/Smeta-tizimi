-- Egasi 2026-10-05: Supabase Free tarif diski to'lib qolgani sababli (552 MB -> 727 MB, VACUUM FULL uchun
-- joy yo'q) haqiqiy disk joyini bo'shatish kerak edi. Bu 6 jadval + 1 view TIZIM_01 (eski Google Sheets
-- asosidagi tizim)dan qolgan ko'zgu yozuvlari: narxlar, tarix, prixod, rashod, topilmaganlar, material_kerak,
-- sklad_ostatka (view).
--
-- Tasdiqlangan (2026-10-05):
--   - functions/api/sb.ts RUXSAT_JADVALLAR da yo'q (kod izohi: "ishlatilmaydigan eski jadvallar ...
--     ro'yxatdan olib tashlandi").
--   - Hech qanday RPC/funksiya ularga murojaat qilmaydi (information_schema.routines tekshirildi).
--   - Hech qanday trigger yoki RLS siyosati yo'q.
--   - pg_depend orqali tekshirilganda FAQAT prixod/rashod'ga sklad_ostatka view'i bog'liq edi — bu view
--     ham frontend/functions kodida ishlatilmaydi, shuning uchun birga o'chirildi.
--   - t2_signal BU RO'YXATDA EMAS: alohida tekshirildi, u hali ham ko'plab RPC orqali (t2_signal_emit,
--     t2_signal_resolve va h.k.) faol ishlatiladi — signal/xavf ogohlantirish tizimi. TEGILMAGAN.
--   - akt BU RO'YXATDA EMAS: akt_ish jadvali undan FK orqali bog'liq, alohida tekshiruv talab qiladi —
--     bu safar tegilmadi.
--
-- Zaxira (o'chirishdan oldin to'liq JSON eksport, 38 279 qator):
--   D:\Obsidian\Anvar_Brain\20_PROJECTS\Smeta-tizimi\backups\tizim01_legacy_2026-10-05\*.json

drop view if exists sklad_ostatka;
drop table if exists narxlar;
drop table if exists tarix;
drop table if exists prixod;
drop table if exists rashod;
drop table if exists topilmaganlar;
drop table if exists material_kerak;
