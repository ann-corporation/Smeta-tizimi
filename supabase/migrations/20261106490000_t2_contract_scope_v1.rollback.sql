-- Только до первого использования. Историю договорных оснований удалять запрещено.
begin;
do $$ begin
 if exists(select 1 from public.t2_contract_scope_event) then raise exception 'CONTRACT_SCOPE_HISTORY_EXISTS'; end if;
end $$;
drop function public.t2_contract_scope_set_v1(bigint,bigint,bigint,integer,integer,jsonb,uuid);
drop function public.t2_contract_scope_read_v1(bigint,bigint);
drop table public.t2_contract_scope_event;
commit;
