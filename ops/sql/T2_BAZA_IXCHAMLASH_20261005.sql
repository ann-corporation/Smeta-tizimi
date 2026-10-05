-- T2 bazasini ixchamlash — 2026-10-05 (Claude). MA'LUMOT O'CHIRILMAYDI.
-- Sabab: t2_narx_manba_qator haqiqiy ma'lumoti ~99 MB, lekin jadval 492 MB
-- (602 713 UPDATE'dan qolgan bo'sh joy: heap 342 MB + indeks 150 MB). Oddiy VACUUM
-- joyni Postgres ichida qayta ishlatadi, lekin fayl hajmini (Supabase limiti) kamaytirmaydi.
-- VACUUM FULL jadvalni ixcham qilib qayta yozadi va indekslarni qayta quradi.
--
-- Qanday yurgiziladi: Supabase Dashboard → SQL Editor (har buyruq ALOHIDA, tranzaksiyasiz).
-- Ta'sir: bajarilish davomida (taxminan 1–3 daqiqa) shu jadvalga o'qish/yozish kutadi —
-- katalog qidiruvi va narx taklifi shu vaqt ichida sekinlashadi. Ish vaqtidan tashqari yurgizing.
-- Kutilgan natija: baza ~715 MB → ~430–470 MB (free limit 500 MB ichiga qaytadi).

-- 0) Oldin: hajmni yozib oling.
select pg_size_pretty(pg_database_size(current_database())) baza,
       pg_size_pretty(pg_total_relation_size('public.t2_narx_manba_qator')) narx_manba_qator;

-- 1) Asosiy ixchamlash (ma'lumot saqlanadi, faqat bo'sh joy qaytariladi).
vacuum (full, analyze) public.t2_narx_manba_qator;

-- 2) Kichikroq shishgan jadvallar (ixtiyoriy, har biri soniyalar).
vacuum (full, analyze) public.t2_qator;
vacuum (full, analyze) public.t2_ozgarish;

-- 3) Keyin: natijani tekshiring (qator soni o'zgarmagan bo'lishi shart).
select pg_size_pretty(pg_database_size(current_database())) baza,
       pg_size_pretty(pg_total_relation_size('public.t2_narx_manba_qator')) narx_manba_qator,
       (select count(*) from public.t2_narx_manba_qator) narx_manba_qator_soni;  -- oldin: 213 691

-- ─────────────────────────────────────────────────────────────────────────────
-- EGASI QARORI KERAK (avtomatik o'chirilmaydi — real/tarixiy ma'lumot):
--   eski TIZIM_01 jadvallari: holat (29 MB, ~51 ming qator), akt, anomaliya, audit_log,
--   obyektlar, tolovlar, oylik_f2, akt_ish, shartnoma, companies, profiles, kontragentlar,
--   qoshimcha_ishlar, viborka_nazorat, system_config — jami ~31 MB. Gateway ularni hali
--   superadmin uchun o'qiydi (functions/_shared/tenant-oqish.ts). O'chirishdan oldin
--   R2 arxivga eksport + kod havolalarini olib tashlash kerak.
--   t2_qator_zaxira_suniy_kol_84 (776 kB) — Suniy Ko'l 84 tuzatishining rollback zaxirasi.
