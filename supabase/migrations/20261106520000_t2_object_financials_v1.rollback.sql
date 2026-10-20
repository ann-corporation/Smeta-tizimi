-- Removes only the new readonly RPC; no business-data changes.
begin;
drop function if exists public.t2_object_financials_v1(bigint,bigint,bigint[]);
commit;
