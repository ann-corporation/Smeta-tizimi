-- rollback 20270119000002_t2_hujjat_paket_royxat_filtr_v1
drop function if exists public.t2_hujjat_paket_royxat_v1(bigint, bigint, jsonb);
drop function if exists public.t2_hujjat_tayyor_ol_v1(bigint, bigint, bigint);
drop function if exists public.t2_hujjat_filtr_royxat_v1(bigint, bigint);
drop function if exists public.t2_hujjat_filtr_saqla_v1(bigint, bigint, text, jsonb);
drop function if exists public.t2_hujjat_filtr_ochir_v1(bigint, bigint, bigint);
drop table if exists public.t2_hujjat_filtr;
