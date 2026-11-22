-- acceptance 20270121000101_t2_hujjat_yangila_ol_v2: funksiya bor, faqat service_role bajara oladi.
do $$
begin
  if to_regprocedure('public.t2_hujjat_yangila_ol_v2(integer,bigint,text[])') is null then raise exception 'ol_v2 yoq'; end if;
  if has_function_privilege('anon', 'public.t2_hujjat_yangila_ol_v2(integer,bigint,text[])', 'execute') then raise exception 'anon bajara oladi'; end if;
  if has_function_privilege('authenticated', 'public.t2_hujjat_yangila_ol_v2(integer,bigint,text[])', 'execute') then raise exception 'authenticated bajara oladi'; end if;
end $$;