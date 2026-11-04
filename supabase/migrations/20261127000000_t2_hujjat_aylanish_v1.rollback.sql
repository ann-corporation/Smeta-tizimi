-- ROLLBACK: 20261127000000_t2_hujjat_aylanish_v1 (faqat shu migratsiya qo'shgan narsalar; boshqa jadvallarga tegmaydi).
-- Diqqat: jadvallar tushirilsa zanjir/xat ma'lumoti yo'qoladi; avval nusxa oling.
drop function if exists public.t2_hujjat_eslatma_v1(integer);
drop function if exists public.t2_hujjat_aylanish_hujjat_ol_v1(bigint, bigint);
drop function if exists public.t2_hujjat_kiruvchi_v1(bigint, bigint);
drop function if exists public.t2_xat_tafsilot_v1(bigint, bigint, bigint);
drop function if exists public.t2_xat_royxat_v1(bigint, bigint, text, text, integer);
drop function if exists public.t2_xat_qabul_v1(bigint, bigint, bigint);
drop function if exists public.t2_xat_yubor_v1(bigint, bigint, bigint, text, text, text, date, bigint, bigint, bigint, uuid);
drop function if exists public.t2_hujjat_zanjir_royxat_v1(bigint, bigint, text, text, integer);
drop function if exists public.t2_hujjat_zanjir_tafsilot_v1(bigint, bigint, bigint);
drop function if exists public.t2_hujjat_zanjir_bekor_v1(bigint, bigint, bigint, text);
drop function if exists public.t2_hujjat_zanjir_qayta_v1(bigint, bigint, bigint, text, bigint);
drop function if exists public.t2_hujjat_zanjir_qaror_v1(bigint, bigint, bigint, text, text);
drop function if exists public.t2_hujjat_zanjir_yarat_v1(bigint, bigint, text, text, bigint, bigint, text, bigint, jsonb, uuid);
drop function if exists public._t2_xat_keyingi_raqam(bigint, text);
drop function if exists public._t2_hujjat_tarix_yoz(bigint, integer, integer, bigint, bigint, text, text);
drop function if exists public._t2_hujjat_aloqa_faol(bigint, bigint);
drop function if exists public._t2_hujjat_azo(bigint, bigint, text);
drop table if exists public.t2_xat;
drop table if exists public.t2_xat_raqam;
drop table if exists public.t2_hujjat_zanjir_tarix;
drop function if exists public._t2_hujjat_tarix_ozgarmas();
drop table if exists public.t2_hujjat_zanjir_qadam;
drop table if exists public.t2_hujjat_zanjir;
delete from public.t2_tomon_murojaat_turi k where k.kalit in ('talabnoma','ogohlantirish')
  and not exists (select 1 from public.t2_tomon_murojaat m where m.turi = k.kalit);
