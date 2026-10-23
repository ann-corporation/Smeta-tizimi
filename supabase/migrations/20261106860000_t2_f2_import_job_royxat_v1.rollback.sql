-- Rollback: 20261106860000 — faqat o'qish RPC si olib tashlanadi (ma'lumot o'zgarmaydi).
begin;
drop function if exists public.t2_f2_import_job_royxat_v1(bigint, bigint, bigint);
commit;
