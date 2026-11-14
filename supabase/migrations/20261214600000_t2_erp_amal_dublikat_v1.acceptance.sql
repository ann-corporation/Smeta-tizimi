-- Acceptance (BEGIN..ROLLBACK): t2_erp_amal yagona nusxa (jsonb) qoladi.
begin;
set local statement_timeout = '300s';

drop function if exists public.t2_erp_amal(bigint, text, text, text);

do $$
declare n integer;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 't2_erp_amal';
  if n <> 1 then raise exception 'ACCEPTANCE: t2_erp_amal nusxalari soni % (kutilgan 1)', n; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.t2_erp_amal(bigint, text, jsonb, text)'::regprocedure) then
    raise exception 'ACCEPTANCE: jsonb nusxa yo''q';
  end if;
end $$;

rollback;
