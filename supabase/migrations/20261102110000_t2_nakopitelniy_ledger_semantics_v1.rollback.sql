-- SOURCE ONLY rollback. Business rows are not deleted.
begin;
drop function if exists public.t2_nakopitelniy_ledger_v1(bigint,bigint,date,integer,boolean,integer);
commit;
