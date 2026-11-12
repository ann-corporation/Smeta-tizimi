-- ROLLBACK: 20261214800000 (naryad + lug'at). Faqat shu migratsiya yaratgan obyektlar. t2_xarajat ga yozilgan qatorlarga TEGILMAYDI (ular dalil sifatida qoladi).
drop function if exists public.t2_naryad_yoz_v1(bigint, bigint, uuid, text, bigint, integer, jsonb);
drop function if exists public.t2_naryad_ol_v1(bigint, bigint, text, jsonb);
drop function if exists public._t2_naryad_json(bigint);
drop function if exists public._t2_naryad_son(jsonb);
drop function if exists public._t2_naryad_saqla_op(bigint, uuid, text, jsonb);
drop function if exists public._t2_naryad_takror(bigint, uuid, text);
drop table if exists public.t2_naryad_qator;
drop table if exists public.t2_naryad;
drop table if exists public.t2_lugat_kompaniya;
drop table if exists public.t2_naryad_operation;
