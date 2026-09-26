-- SOURCE ONLY rollback. Business rows are not deleted.
begin;
drop trigger if exists t2_forma3_lineage_guard_trg on public.t2_forma3;
drop function if exists public.t2_forma3_lineage_guard_v1();
commit;

