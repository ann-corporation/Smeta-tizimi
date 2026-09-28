-- Rollback: 20260928160000_t2_ish_resurslar_bilan_yarat_v1 — faqat yangi funksiya olib tashlanadi.
begin;
drop function if exists public.t2_ish_resurslar_bilan_yarat_v1(jsonb);
commit;
