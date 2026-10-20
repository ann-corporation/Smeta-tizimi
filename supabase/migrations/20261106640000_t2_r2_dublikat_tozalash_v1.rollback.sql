-- Rollback 20261106640000. Birlashtirilgan yozuvlarning blob_key qiymatlari saqlanadi (ular baribir to'g'ri o'qiladi);
-- yetimlar jadvali o'chiriladi — hali o'chirilmagan yetim obyektlar R2 da qoladi (zarar yo'q, faqat joy).
drop function if exists public.t2_r2_yetim_ochirildi_v1(bigint, bigint, boolean);
drop function if exists public.t2_r2_yetim_royxat_v1(bigint, integer);
drop function if exists public.t2_r2_dublikat_birlashtir_v1(bigint, bigint, bigint[]);
drop function if exists public.t2_r2_dublikat_royxat_v1(bigint);
drop function if exists public.t2_r2_kalit_ishlatiladimi(text);
drop table if exists public.t2_r2_yetim;
