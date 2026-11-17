begin;
update public.t2_arxiv_siyosat set saqlash_kun = 30 where jadval in ('t2_onboarding_command_log', 't2_addrepl_command', 't2_audit_log');
update public.t2_arxiv_siyosat set saqlash_kun = 14 where jadval = 't2_f2_import_draft_qator';
alter table snapshot.bolak_mazmun reset (toast.autovacuum_vacuum_scale_factor, toast.autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor);
commit;