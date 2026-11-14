-- Rollback: t2_fakt_yoz_v2 oxirgi return avvalgi holatga, yordamchi o'chiriladi.
begin;
do $m$
declare
  v_def text := pg_get_functiondef('public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text)'::regprocedure);
  v_yangi constant text := $a$jsonb_build_object('contract','FAKT_V2','actor_id',p_actor_id,'entry_policy','BL_MAT_OB_RS_F2_COPY')
    || public._t2_fakt_narxsiz_ogoh_v1(case when (v_result->>'akt_id') ~ '^[0-9]+$' then (v_result->>'akt_id')::bigint end);$a$;
  v_eski constant text := $a$jsonb_build_object('contract','FAKT_V2','actor_id',p_actor_id,'entry_policy','BL_MAT_OB_RS_F2_COPY');$a$;
begin
  if position('_t2_fakt_narxsiz_ogoh_v1' in v_def) > 0 then
    if position(v_yangi in v_def) = 0 then raise exception 'ROLLBACK: anchor topilmadi'; end if;
    execute replace(v_def, v_yangi, v_eski);
  end if;
end $m$;
drop function if exists public._t2_fakt_narxsiz_ogoh_v1(bigint);
commit;
