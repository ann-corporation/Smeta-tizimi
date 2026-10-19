-- Синтетические строки; запускать вместе с migration в BEGIN, финальное исключение откатывает всё.
DO $acc$
declare
 c bigint; a bigint; o bigint := 2000000000000000 + floor(random()*1000000000)::bigint;
 rz bigint; w bigint; r bigint; created bigint; second_id bigint; act bigint;
 v jsonb; replay jsonb; ver integer; edit_op uuid; delete_op uuid; before_source jsonb; op uuid := gen_random_uuid(); blocked boolean := false;
 items jsonb := '[{"ish":{"nom":"СИНТЕТИЧЕСКАЯ РАБОТА","birlik":"М3","hajm":2},"resurslar":[{"kat":"МАТ","nom":"ТЕСТОВЫЙ РЕСУРС","birlik":"М3","hajm":2,"narx":0}]}]'::jsonb;
begin
 select kompaniya_id,foydalanuvchi_id into c,a from public.t2_azolik
 where holat='faol' and public.t2_permission_allowed_v2(kompaniya_id,foydalanuvchi_id,'smeta.write') order by id limit 1;
 if a is null then raise exception 'ACCEPTANCE_ACTOR_REQUIRED'; end if;
 rz:=o+1; w:=o+2; r:=o+3;
 insert into public.t2_obyekt(id,nom,kompaniya_id) overriding system value values(o,'СИНТЕТИЧЕСКАЯ ПРОВЕРКА F2',c);
 insert into public.t2_qator(id,obyekt_id,kompaniya_id,tur,nom,tartib) overriding system value values(rz,o,c,'rz','ТЕСТ РАЗДЕЛ',1);
 insert into public.t2_qator(id,obyekt_id,kompaniya_id,tur,nom,ota_id,daraja,tartib,hajm,birlik) overriding system value values(w,o,c,'bl','ТЕСТ ИСХОДНАЯ РАБОТА',rz,1,2,2,'М3');
 insert into public.t2_qator(id,obyekt_id,kompaniya_id,tur,nom,ota_id,daraja,tartib,hajm,birlik,narx,summa) overriding system value values(r,o,c,'rs','ТЕСТ ИСХОДНЫЙ РЕСУРС',w,2,3,2,'М3',0,0);
 select jsonb_agg(jsonb_build_array(id,tur,ota_id,tartib,kod,nom,birlik,hajm,narx,summa) order by id) into before_source from public.t2_qator where id in (rz,w,r);
 v:=public.t2_resurs_ish_zamena_v1(a,c,o,r,items,'ТЕСТ',op);
 if not coalesce((v->>'ok')::boolean,false) then raise exception 'CREATE_FAILED %',v; end if;
 created:=(v->>'qator_id')::bigint;
 if not exists(select 1 from public.t2_qator where ota_id=created and narx=0 and summa=0) then raise exception 'ZERO_LOST'; end if;
 replay:=public.t2_resurs_ish_zamena_v1(a,c,o,r,items,'ТЕСТ',op);
 if replay->>'takror' is distinct from 'true' or replay->>'qator_id' is distinct from v->>'qator_id' then raise exception 'REPLAY_DUPLICATED'; end if;
 replay:=public.t2_resurs_ish_zamena_v1(a,c,o,r,items,'ДРУГОЙ ЗАПРОС',op);
 if replay->>'code' is distinct from 'OPERATION_SCOPE_MISMATCH' then raise exception 'REPLAY_SCOPE_UNCHECKED'; end if;
 begin
  perform public.t2_resurs_ish_zamena_v1(0,c,o,r,items,'ТЕСТ',op);
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'UNAUTHORIZED_REPLAY'; end if;
 v:=public.t2_ish_abc_ochir_v1(a,c,o,r,'ТЕСТ',gen_random_uuid());
 if v->>'code' is distinct from 'SMETA_QATORI_OZGARMAS' then raise exception 'ORIGINAL_CHANGED %',v; end if;
 -- Editing a resource-to-work replacement is versioned and idempotent.
 select versiya into ver from public.t2_qator where id=created;
 edit_op:=gen_random_uuid();
 v:=public.t2_resurs_ish_zamena_v1(a,c,o,r,items,'ТЕСТ RESOURCE EDIT',edit_op,created,ver+1);
 if v->>'code' is distinct from 'STALE_VERSION' then raise exception 'RESOURCE_EDIT_STALE_UNPROTECTED %',v; end if;
 second_id:=created;
 v:=public.t2_resurs_ish_zamena_v1(a,c,o,r,items,'ТЕСТ RESOURCE EDIT',edit_op,second_id,ver);
 if not coalesce((v->>'ok')::boolean,false) then raise exception 'RESOURCE_EDIT_FAILED %',v; end if;
 created:=(v->>'qator_id')::bigint;
 replay:=public.t2_resurs_ish_zamena_v1(a,c,o,r,items,'ТЕСТ RESOURCE EDIT',edit_op,second_id,ver);
 if replay->>'takror' is distinct from 'true' or replay->>'qator_id' is distinct from v->>'qator_id' then raise exception 'RESOURCE_EDIT_REPLAY_FAILED'; end if;
 -- A Fakt reference must block deletion instead of being silently archived away.
 insert into public.t2_akt(obyekt_id,kompaniya_id,tur,oy) values(o,c,'fakt',date '2026-01-01') returning id into act;
 insert into public.t2_akt_qator(akt_id,qator_id,obyekt_id,kompaniya_id,hajm) values(act,created,o,c,1);
 v:=public.t2_ish_abc_ochir_v1(a,c,o,created,'ТЕСТ',gen_random_uuid());
 if v->>'code' is distinct from 'QATOR_TARIXDA' then raise exception 'FAKT_HISTORY_UNPROTECTED %',v; end if;
 if not exists(select 1 from public.t2_akt_qator where akt_id=act) then raise exception 'FAKT_DELETED'; end if;
 -- Create an independent added row, cancel it, then replay the same cancellation.
 v:=public.t2_resurs_ish_zamena_v1(a,c,o,r,items,'ТЕСТ ВТОРОЙ',gen_random_uuid());
 second_id:=(v->>'qator_id')::bigint; op:=gen_random_uuid();
 v:=public.t2_ish_abc_ochir_v1(a,c,o,second_id,'ТЕСТ',op);
 if not coalesce((v->>'ok')::boolean,false) then raise exception 'CANCEL_FAILED %',v; end if;
 if exists(select 1 from public.t2_qator where id=second_id) or not exists(select 1 from public.t2_qator_ochirilgan where ildiz_qator_id=second_id) then raise exception 'ARCHIVE_MISSING'; end if;
 replay:=public.t2_ish_abc_ochir_v1(a,c,o,second_id,'ТЕСТ',op);
 if replay->>'takror' is distinct from 'true' then raise exception 'CANCEL_REPLAY_FAILED %',replay; end if;
 if not exists(select 1 from public.t2_qator where id=r and hajm=2 and narx=0 and summa=0) then raise exception 'ORIGINAL_SOURCE_MUTATED'; end if;
 -- Versioned correction: stale request cannot overwrite a newer row.
 v:=public.t2_ish_abc_saqla_v1(a,c,o,'additional',rz,null,
   items->0->'ish',items->0->'resurslar',null,null,'ТЕСТ EDIT',gen_random_uuid(),(select versiya from public.t2_qator where id=rz));
 if not coalesce((v->>'ok')::boolean,false) then raise exception 'ADDITIONAL_FAILED %',v; end if;
 second_id:=(v->>'qator_id')::bigint;
 select versiya into ver from public.t2_qator where id=second_id;
 edit_op:=gen_random_uuid();
 blocked:=false;
 begin
  perform public.t2_ish_abc_tahrir_v2(a,c,o,second_id,ver,
   jsonb_build_object('nom','','birlik','М3','hajm',3),items->0->'resurslar',null,null,'ТЕСТ BAD EDIT',gen_random_uuid());
 exception when others then blocked:=true;
 end;
 if not blocked or not exists(select 1 from public.t2_qator where id=second_id) or exists(select 1 from public.t2_qator_ochirilgan where ildiz_qator_id=second_id) then raise exception 'FAILED_EDIT_NOT_ATOMIC'; end if;

 v:=public.t2_ish_abc_tahrir_v2(a,c,o,second_id,ver+1,
   jsonb_build_object('nom','ИСПРАВЛЕННАЯ РАБОТА','birlik','М3','hajm',3),items->0->'resurslar',null,null,'ТЕСТ EDIT',edit_op);
 if v->>'code' is distinct from 'STALE_VERSION' or not exists(select 1 from public.t2_qator where id=second_id) then raise exception 'EDIT_STALE_UNPROTECTED %',v; end if;
 v:=public.t2_ish_abc_tahrir_v2(a,c,o,second_id,ver,
   jsonb_build_object('nom','ИСПРАВЛЕННАЯ РАБОТА','birlik','М3','hajm',3),items->0->'resurslar',null,null,'ТЕСТ EDIT',edit_op);
 if not coalesce((v->>'ok')::boolean,false) then raise exception 'EDIT_V2_FAILED %',v; end if;
 created:=(v->>'qator_id')::bigint;
 if exists(select 1 from public.t2_qator where id=second_id) or not exists(select 1 from public.t2_qator where id=created and hajm=3) then raise exception 'EDIT_REPLACEMENT_MISSING'; end if;
 replay:=public.t2_ish_abc_tahrir_v2(a,c,o,second_id,ver,
   jsonb_build_object('nom','ИСПРАВЛЕННАЯ РАБОТА','birlik','М3','hajm',3),items->0->'resurslar',null,null,'ТЕСТ EDIT',edit_op);
 if replay->>'takror' is distinct from 'true' or replay->>'qator_id' is distinct from v->>'qator_id' then raise exception 'EDIT_REPLAY_FAILED %',replay; end if;
 replay:=public.t2_ish_abc_tahrir_v2(a,c,o,second_id,ver+1,
   jsonb_build_object('nom','ИСПРАВЛЕННАЯ РАБОТА','birlik','М3','hajm',3),items->0->'resurslar',null,null,'ТЕСТ EDIT',edit_op);
 if replay->>'code' is distinct from 'OPERATION_SCOPE_MISMATCH' then raise exception 'EDIT_REPLAY_VERSION_UNCHECKED'; end if;
 select versiya into ver from public.t2_qator where id=created;
 delete_op:=gen_random_uuid();
 v:=public.t2_ish_abc_ochir_v2(a,c,o,created,ver+1,'ТЕСТ DELETE',delete_op);
 if v->>'code' is distinct from 'STALE_VERSION' then raise exception 'DELETE_STALE_UNPROTECTED %',v; end if;
 v:=public.t2_ish_abc_ochir_v2(a,c,o,created,ver,'ТЕСТ DELETE',delete_op);
 if not coalesce((v->>'ok')::boolean,false) then raise exception 'DELETE_V2_FAILED %',v; end if;
 replay:=public.t2_ish_abc_ochir_v2(a,c,o,created,ver,'ТЕСТ DELETE',delete_op);
 if replay->>'takror' is distinct from 'true' then raise exception 'DELETE_REPLAY_FAILED'; end if;
 if before_source is distinct from (select jsonb_agg(jsonb_build_array(id,tur,ota_id,tartib,kod,nom,birlik,hajm,narx,summa) order by id) from public.t2_qator where id in (rz,w,r)) then raise exception 'SOURCE_TREE_MUTATED'; end if;
 raise exception 'F2_RECOVERY_ACCEPTANCE_PASS';
end $acc$;
