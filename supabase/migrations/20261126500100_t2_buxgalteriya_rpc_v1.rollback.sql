-- ROLLBACK: 20261126500100_t2_buxgalteriya_rpc_v1 (faqat funksiyalar; jadvallar 20261126500000 rollback ida). Jurnal ma'lumoti tegilmaydi.
begin;

drop function if exists public.t2_bux_tashqi_sync_v1(bigint, bigint, text, jsonb, uuid);
drop function if exists public.t2_bux_bank_import_v1(bigint, bigint, jsonb, uuid);
drop function if exists public.t2_bux_davr_v1(bigint, bigint, date, text, boolean, text, uuid);
drop function if exists public.t2_bux_storno_v1(bigint, bigint, bigint, text, uuid);
drop function if exists public.t2_bux_qolda_provodka_v1(bigint, bigint, date, text, text, numeric, bigint, bigint, bigint, text, uuid);
drop function if exists public.t2_bux_avto_provodka_v1(bigint, bigint, boolean, uuid);
drop function if exists public.t2_bux_moslik_saqla_v1(bigint, bigint, text, text, text, numeric, uuid);
drop function if exists public.t2_bux_hisob_saqla_v1(bigint, bigint, text, text, text, text, boolean, boolean, uuid);
drop function if exists public.t2_bux_boshlash_v1(bigint, bigint, uuid);
drop function if exists public.t2_bux_tolov_v1(bigint, bigint, date, date, bigint, bigint, text, integer);
drop function if exists public.t2_bux_nds_v1(bigint, bigint, date, date, bigint, bigint, text, integer);
drop function if exists public.t2_bux_kontragent_v1(bigint, bigint, date, date, bigint, bigint, text, integer);
drop function if exists public.t2_bux_osv_v1(bigint, bigint, date, date, bigint, bigint, text, integer);
drop function if exists public.t2_bux_jurnal_v1(bigint, bigint, date, date, bigint, bigint, text, integer);
drop function if exists public.t2_bux_holat_v1(bigint, bigint, date, date, bigint, bigint, text, integer);
drop function if exists public._t2_bux_kerak_avto(bigint);
drop function if exists public._t2_bux_sync(bigint, bigint, text[], jsonb, boolean);
drop function if exists public._t2_bux_hujjat_nomi(bigint, text, bigint);
drop function if exists public._t2_bux_sh_obyekt(bigint);
drop function if exists public._t2_bux_sh_kontragent(bigint);
drop function if exists public._t2_bux_ruxsat(bigint, bigint, text);

commit;
