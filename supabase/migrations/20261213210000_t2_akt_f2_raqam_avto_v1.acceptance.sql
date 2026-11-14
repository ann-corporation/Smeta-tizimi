-- Acceptance (faqat o'qiydi): trigger va funksiya mavjud, trigger BEFORE INSERT va t2_akt ga bog'langan.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 't2_akt_f2_raqam_avto_v1') then
    raise exception 'ACCEPT: funksiya yo''q';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgname = 't2_akt_f2_raqam_avto' and t.tgrelid = 'public.t2_akt'::regclass and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4) then
    raise exception 'ACCEPT: BEFORE INSERT trigger yo''q';
  end if;
end $$;
