-- Applied ledger version: 20260928103802. Preserve RPC authorization and grants.
-- The audit object FK must receive an object ID, never an akt ID.
begin;
do $repair$
declare
  signature text;
  definition text;
  repaired text;
begin
  foreach signature in array array[
    'public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)',
    'public.t2_akt_correction_create_v1(bigint,bigint,bigint,uuid,integer,bigint,text,text)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    repaired := replace(definition, '''akt_lifecycle_retry'', ''f2'', p_akt_id,', '''akt_lifecycle_retry'', ''f2'', v_akt.obyekt_id,');
    repaired := replace(repaired, '''akt_lifecycle_transition'', ''f2'', p_akt_id,', '''akt_lifecycle_transition'', ''f2'', v_akt.obyekt_id,');
    repaired := replace(repaired, 'format(''from=%s; to=%s; actor_id=%s; operation_id=%s'', v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id)', 'format(''akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s'', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id)');
    repaired := replace(repaired, '''akt_correction_created'', ''f2'', v_source.id,', '''akt_correction_created'', ''f2'', v_source.obyekt_id,');
    repaired := replace(repaired, 'format(''replacement_akt_id=%s; actor_id=%s; operation_id=%s'', v_replacement.id, p_actor_id, p_operation_id)', 'format(''original_akt_id=%s; replacement_akt_id=%s; actor_id=%s; operation_id=%s'', v_source.id, v_replacement.id, p_actor_id, p_operation_id)');
    -- Original header is locked by the existing RPC. Generate a readable
    -- correction reference under that lock instead of colliding with blank raqam.
    repaired := replace(repaired, 'nullif(btrim(p_raqam), ''''), v_source.oy,', 'coalesce(nullif(btrim(p_raqam), ''''), coalesce(nullif(btrim(v_source.raqam), ''''), ''F2'') || '' — корректировка '' || (select count(*) + 1 from public.t2_akt_correction_link where original_akt_id=v_source.id)::text), v_source.oy,');
    if position('''akt_lifecycle_retry'', ''f2'', p_akt_id,' in repaired) > 0
      or position('''akt_lifecycle_transition'', ''f2'', p_akt_id,' in repaired) > 0
      or position('''akt_correction_created'', ''f2'', v_source.id,' in repaired) > 0
      or (signature like '%transition%' and (position('''akt_lifecycle_transition'', ''f2'', v_akt.obyekt_id,' in repaired)=0 or position('''akt_lifecycle_retry'', ''f2'', v_akt.obyekt_id,' in repaired)=0))
      or (signature like '%correction%' and position('''akt_correction_created'', ''f2'', v_source.obyekt_id,' in repaired)=0) then
      raise exception 'LIFECYCLE_AUDIT_PATCH_CONTRACT_CHANGED: %', signature;
    end if;
    if repaired <> definition then execute repaired; end if;
  end loop;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='t2_akt_reestr' and column_name='lifecycle_status') then
    definition := pg_get_viewdef('public.t2_akt_reestr'::regclass, true);
    execute 'create or replace view public.t2_akt_reestr as select r.*, a.lifecycle_status from (' || rtrim(definition, E';\n ') || ') r join public.t2_akt a on a.id=r.id';
  end if;
end $repair$;
commit;
