-- Rollback: 20261106830000 — faqat v3 olib tashlanadi; v2 va t2_qator ma'lumotlari o'zgarmaydi.
begin;
drop function if exists public.t2_smeta_narxla_res_v3(bigint, bigint, bigint, uuid, jsonb, boolean);
commit;
