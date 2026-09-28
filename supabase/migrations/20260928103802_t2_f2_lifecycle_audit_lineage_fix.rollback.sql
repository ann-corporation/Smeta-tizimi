-- Ledger 20260928103802 rollback: restores previous RPC bodies. No business rows
-- or lifecycle history are removed. The additive read column remains.
begin;
do $rollback$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)',
    'public.t2_akt_correction_create_v1(bigint,bigint,bigint,uuid,integer,bigint,text,text)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    definition := replace(definition, '''akt_lifecycle_retry'', ''f2'', v_akt.obyekt_id,', '''akt_lifecycle_retry'', ''f2'', p_akt_id,');
    definition := replace(definition, '''akt_lifecycle_transition'', ''f2'', v_akt.obyekt_id,', '''akt_lifecycle_transition'', ''f2'', p_akt_id,');
    definition := replace(definition, 'format(''akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s'', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id)', 'format(''from=%s; to=%s; actor_id=%s; operation_id=%s'', v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id)');
    definition := replace(definition, '''akt_correction_created'', ''f2'', v_source.obyekt_id,', '''akt_correction_created'', ''f2'', v_source.id,');
    definition := replace(definition, 'format(''original_akt_id=%s; replacement_akt_id=%s; actor_id=%s; operation_id=%s'', v_source.id, v_replacement.id, p_actor_id, p_operation_id)', 'format(''replacement_akt_id=%s; actor_id=%s; operation_id=%s'', v_replacement.id, p_actor_id, p_operation_id)');
    definition := replace(definition, 'coalesce(nullif(btrim(p_raqam), ''''), coalesce(nullif(btrim(v_source.raqam), ''''), ''F2'') || '' — корректировка '' || (select count(*) + 1 from public.t2_akt_correction_link where original_akt_id=v_source.id)::text), v_source.oy,', 'nullif(btrim(p_raqam), ''''), v_source.oy,');
    execute definition;
  end loop;
end $rollback$;
commit; -- Emergency only: restores the known pre-fix behavior.
