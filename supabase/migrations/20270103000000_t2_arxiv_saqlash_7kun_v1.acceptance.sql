do $$
begin
  if (select count(*) from public.t2_arxiv_siyosat where jadval in ('t2_onboarding_command_log','t2_addrepl_command','t2_audit_log','t2_f2_import_draft_qator') and saqlash_kun = 7) <> 4 then raise exception 'ACC1: 4 jadval 7 kun bo''lishi kerak'; end if;
  if (select saqlash_kun from public.t2_arxiv_siyosat where jadval = 't2_ozgarish') <> 30 then raise exception 'ACC2: t2_ozgarish 30 kun qolishi kerak'; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'snapshot' and c.relname = 'bolak_mazmun' and c.reloptions::text like '%autovacuum_vacuum_scale_factor%') then raise exception 'ACC3: autovacuum sozlamasi yo''q'; end if;
end $$;