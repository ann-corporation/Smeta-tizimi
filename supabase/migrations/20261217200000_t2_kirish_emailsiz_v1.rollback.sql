-- Rollback: 20261217200000_t2_kirish_emailsiz_v1 (additiv migratsiya — faqat yangi obyektlar olib tashlanadi).
-- DIQQAT: t2_kirish_taklif / t2_kirish_nonce / t2_kirish_limit ma'lumotlari va telefon_e164/telefon_manba ustunlari yo'qoladi.
-- Taklif orqali ochilgan hisoblar (login = telefon) QOLADI, lekin /api/kirish telefon yo'li qaytarilgach ular parol bilan oddiy login sifatida kirishda davom etadi.
drop function if exists public.t2_tg_kirish_holat_v1(text, text, text, uuid);
drop function if exists public.t2_tg_kirish_kontakt_v1(bigint, bigint, text, bigint);
drop function if exists public.t2_tg_kirish_start_v1(text, bigint, bigint, text);
drop function if exists public.t2_tg_kirish_boshla_v1(text, text, text, text, text);
drop function if exists public.t2_kirish_tel_limit_v1(text, text, boolean);
drop function if exists public.t2_kirish_taklif_ulash_v1(bigint, text, text, text, text, uuid);
drop function if exists public.t2_kirish_taklif_qabul_v1(text, text, text, text, text, uuid);
drop function if exists public._t2_kirish_taklif_top_v1(text, text, text, text);
drop function if exists public.t2_kirish_taklif_bekor_v1(bigint, bigint, bigint);
drop function if exists public.t2_kirish_taklif_royxat_v1(bigint, bigint);
drop function if exists public.t2_kirish_taklif_yarat_v1(bigint, bigint, text, text, text, text, text, integer, uuid);
drop function if exists public._t2_parol_siyosat_v1(text, text);
drop function if exists public._t2_kirish_niqob_v1(text);
drop function if exists public._t2_kirish_taklif_rol_yaroqli_v1(text, text);
drop function if exists public._t2_kirish_taklif_huquq_v1(bigint, bigint);
drop function if exists public._t2_kirish_limit_v1(text, text, interval, integer);
drop function if exists public.t2_telefon_norm_v1(text);
drop table if exists public.t2_kirish_nonce;
drop table if exists public.t2_kirish_taklif;
drop table if exists public.t2_kirish_limit;
delete from public.t2_telegram_hodisa where amal in ('telefon_tasdiqlandi', 'telefon_kirish', 'kontakt_boshqaniki');
alter table public.t2_telegram_hodisa drop constraint if exists t2_telegram_hodisa_amal_check;
alter table public.t2_telegram_hodisa add constraint t2_telegram_hodisa_amal_check
  check (amal = any (array['ulandi'::text, 'uzildi'::text, 'miniapp_kirish'::text, 'kod_yaratildi'::text]));
drop index if exists public.t2_foydalanuvchi_telefon_e164_uq;
alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_telefon_e164_chk;
alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_telefon_manba_chk;
alter table public.t2_foydalanuvchi drop column if exists telefon_manba;
alter table public.t2_foydalanuvchi drop column if exists telefon_e164;
notify pgrst, 'reload schema';
