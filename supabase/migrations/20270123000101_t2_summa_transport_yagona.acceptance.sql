-- Acceptance (o'qish): F2/aktlar o'lchovida transport usuli qo'llanadi.
do $$ begin
  if pg_get_functiondef('public._t2_summa_agg_v1(bigint[],text,bigint[],date,date,text,text)'::regprocedure) ~ $r$p_olchov in \('f2', 'aktlar'\) then null else q\.transport_usul$r$ then
    raise exception 'transport usuli hali o''chirilgan'; end if;
end $$;
select 'acceptance OK' natija;
