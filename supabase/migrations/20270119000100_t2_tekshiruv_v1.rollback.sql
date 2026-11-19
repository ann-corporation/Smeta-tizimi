-- Orqaga qaytarish: texnadzor tekshiruvi. Jadvallar va RPC lar olib tashlanadi (F-2/smeta jadvallariga tegilmaydi; takliflar yo'qoladi).
drop function if exists public.t2_f2_tekshiruv_kod_ol_v1(bigint, text, text);
drop function if exists public.t2_f2_tekshiruv_kod_ber_v1(bigint, text, text, text, integer);
drop function if exists public.t2_f2_tekshiruv_qidir_v1(bigint, text, text);
drop function if exists public.t2_f2_tekshiruv_holat_v1(bigint, text, text, text);
drop function if exists public.t2_f2_tekshiruv_saqla_v1(bigint, text, bigint, text, text, numeric, text, text, boolean);
drop function if exists public.t2_f2_tekshiruv_ochish_v1(bigint, text);
drop function if exists public.t2_f2_tekshiruv_bog_v1(bigint, text, bigint);
drop function if exists public._t2_f2_tekshiruv_bog_token_v1(text);
drop function if exists public._t2_f2_tekshiruv_rol_v1(bigint, bigint);
drop table if exists public.t2_f2_tekshiruv_taklif;
drop table if exists public.t2_f2_tekshiruv;
drop table if exists public.t2_f2_tekshiruv_ruxsat;
drop table if exists public.t2_f2_tekshiruv_bog;
