-- ROLLBACK: 20261203000600 (ish kartasi v1). Faqat shu migratsiya yaratgan obyektlar; smeta (t2_qator) ga tegmaydi.
begin;
drop function if exists public.t2_ish_kartasi_ulush_saqla_v1(bigint, bigint, uuid, text, jsonb, integer);
drop function if exists public.t2_ish_kartasi_arxiv_v1(bigint, bigint, uuid, bigint, integer);
drop function if exists public.t2_ish_kartasi_saqla_v1(bigint, bigint, uuid, bigint, integer, jsonb, jsonb);
drop function if exists public.t2_ish_kartasi_ol_v1(bigint, bigint, text, jsonb);
drop function if exists public._t2_ish_kartasi_qator_json(bigint);
drop function if exists public._t2_ish_kartasi_saqla_op(bigint, uuid, text, jsonb);
drop function if exists public._t2_ish_kartasi_takror(bigint, uuid, text);
drop function if exists public._t2_ish_kartasi_qamrov(jsonb);
drop function if exists public._t2_ish_kartasi_param(jsonb);
drop function if exists public._t2_ish_kartasi_ulush(jsonb);
drop table if exists public.t2_ish_kartasi_bosqich_ulush;
drop table if exists public.t2_ish_kartasi_bog;
drop table if exists public.t2_ish_kartasi;
drop table if exists public.t2_ish_kartasi_operation;
commit;
