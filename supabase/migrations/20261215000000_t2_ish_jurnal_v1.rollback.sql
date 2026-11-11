-- ROLLBACK 20261215000000_t2_ish_jurnal_v1: kundalik ish jurnali izohlari (faqat prorab matni; hosil qilinadigan qismi saqlanmagan edi).
drop function if exists public.t2_ish_jurnal_saqla_v1(bigint, bigint, bigint, date, text, text, jsonb, boolean, integer, uuid);
drop table if exists public.t2_ish_jurnal_izoh;
