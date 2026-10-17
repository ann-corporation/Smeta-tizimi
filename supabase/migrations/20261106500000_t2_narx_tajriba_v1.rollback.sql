-- Rollback 20261106500000_t2_narx_tajriba_v1: tajriba yozuvlari bilan birga olib tashlanadi (biznes jadvallariga ta'sir yo'q).
drop function if exists public.t2_narx_tajriba_v1(bigint, bigint, jsonb);
drop function if exists public.t2_narx_tajriba_yoz_v1(bigint, bigint, jsonb);
drop table if exists public.t2_narx_tanlov_tajriba;
