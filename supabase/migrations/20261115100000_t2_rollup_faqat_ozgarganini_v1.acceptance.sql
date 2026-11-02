do $$ begin
  if pg_get_functiondef('public.t2_rollup(bigint)'::regprocedure) !~ 'summa is distinct from c.jami' then
    raise exception 'ACCEPT_FAIL: t2_rollup faqat-o''zgarganini yangilamaydi';
  end if;
  raise notice 't2_rollup tejash OK';
end $$;
