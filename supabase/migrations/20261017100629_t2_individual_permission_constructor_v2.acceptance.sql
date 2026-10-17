-- Every business fixture is rolled back inside the subtransaction, including audit and operation log.
do $$
declare ca bigint; cb bigint; boss bigint; staff bigint; outsider bigint; ba bigint; ma bigint; oa bigint;
 suffix text:=left(replace(gen_random_uuid()::text,'-',''),10); flags jsonb; j jsonb; replay jsonb; op uuid:=gen_random_uuid(); count_before bigint; ver bigint;
begin
 select count(*) into count_before from public.t2_azolik;
 begin
  insert into public.t2_kompaniya(nom,kod,faol) values('Permission acceptance A','PA'||suffix,true) returning id into ca;
  insert into public.t2_kompaniya(nom,kod,faol) values('Permission acceptance B','PB'||suffix,true) returning id into cb;
  insert into public.t2_foydalanuvchi(login,holat) values('permission_boss_'||suffix,'faol') returning id into boss;
  insert into public.t2_foydalanuvchi(login,holat) values('permission_pto_'||suffix,'faol') returning id into staff;
  insert into public.t2_foydalanuvchi(login,holat) values('permission_other_'||suffix,'faol') returning id into outsider;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values(boss,ca,'boss','faol') returning id into ba;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values(staff,ca,'pto','faol') returning id into ma;
  insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values(outsider,cb,'boss','faol') returning id into oa;
  select jsonb_object_agg(c,c=any(public.t2_role_permissions_v2('pto'))) into flags from unnest(public.t2_permission_catalog_v2()) c;
  flags:=jsonb_set(flags,'{f2.approve}','false');
  j:=public.t2_azolik_ruxsat_set_v2(boss,ca,ma,flags,0,op);
  if not (j->>'ok')::boolean or (j->>'versiya')::bigint<>1 then raise exception 'set failed %',j; end if;
  if public.t2_permission_allowed_v2(ca,staff,'f2.approve') then raise exception 'inherited approve was not denied'; end if;
  if not public.t2_permission_allowed_v2(ca,staff,'f2.prepare') then raise exception 'independent prepare lost'; end if;
  if public.t2_permission_allowed_v2(cb,staff,'f2.prepare') then raise exception 'cross tenant elevation'; end if;
  if (select rol from public.t2_azolik where id=ma)<>'pto' then raise exception 'role changed'; end if;
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,ma,flags,0,op);
  if replay<>j or (select ruxsat_versiya from public.t2_azolik where id=ma)<>1 then raise exception 'retry duplicated change'; end if;
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,ma,jsonb_set(flags,'{f2.approve}','true'),0,op);
  if replay->>'code'<>'OPERATION_CONFLICT' then raise exception 'operation reused with different payload'; end if;
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,ma,flags,0,gen_random_uuid());
  if replay->>'code'<>'STALE_VERSION' then raise exception 'silent last write wins'; end if;
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,ba,flags,0,gen_random_uuid());
  if replay->>'code'<>'PROTECTED_AUTHORITY' then raise exception 'boss lockout'; end if;
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,oa,flags,0,gen_random_uuid());
  if replay->>'code'<>'AZOLIK_TOPILMADI' then raise exception 'foreign member writable'; end if;
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,ma,flags||'{"control.global.write":true}'::jsonb,1,gen_random_uuid());
  if replay->>'code'<>'RUXSAT_NOTOGRI' then raise exception 'global permission injected'; end if;
  replay:=public.t2_azolik_ruxsat_set_v2(staff,ca,ma,flags,1,gen_random_uuid());
  if replay->>'code'<>'MANAGE_ROLE_REQUIRED' then raise exception 'staff self elevation'; end if;
  begin
   perform public.t2_akt_lifecycle_transition_v1(ca,999999999,'approved',staff,1,gen_random_uuid(),null);
   raise exception 'native lifecycle bypassed individual deny';
  exception when insufficient_privilege then null; end;
  j:=public.t2_effective_authorization_v1(staff,ca,null,null,'f2.approve',null);
  if (j->>'allowed')::boolean or j->>'membership_role'<>'pto' then raise exception 'effective authorization parity'; end if;
  j:=public.t2_men_v1(staff);
  if not exists(select 1 from jsonb_array_elements(j->'context_kompaniyalar') x where (x->>'kompaniya_id')::bigint=ca and ((x->'explicit_denials')?'f2.approve') and not ((x->'permissions')?'f2.approve')) then raise exception 'read-model decision missing'; end if;
  replay:=public.t2_azolik_ruxsat_qoshimcha_ber_v1(boss,ca,ma,'f2.approve',gen_random_uuid());
  if replay->>'code'<>'USE_PERMISSION_CONSTRUCTOR' or public.t2_permission_allowed_v2(ca,staff,'f2.approve') then raise exception 'old API bypass'; end if;
  update public.t2_azolik set rol='rahbar' where id=ma;
  select ruxsat_versiya into ver from public.t2_azolik where id=ma;
  if ver<>2 then raise exception 'role change did not invalidate permission version'; end if;
  select jsonb_object_agg(c,c=any(public.t2_role_permissions_v2('rahbar'))) into flags from unnest(public.t2_permission_catalog_v2()) c;
  flags:=jsonb_set(flags,'{smeta.write}','true');
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,ma,flags,ver,gen_random_uuid());
  if not (replay->>'ok')::boolean then raise exception 'individual grant failed %',replay; end if;
  perform public.t2_smeta_import_ruxsat(ca,staff); -- Old hardcoded role ceiling must not discard this explicit grant.
  flags:=jsonb_set(flags,'{smeta.write}','false');
  replay:=public.t2_azolik_ruxsat_set_v2(boss,ca,ma,flags,ver+1,gen_random_uuid());
  begin perform public.t2_smeta_import_ruxsat(ca,staff); raise exception 'native import deny bypass'; exception when insufficient_privilege then null; end;
  if (select count(*) from public.t2_onboarding_command_log where actor_id=boss and command='azolik_ruxsat_set_v2')<>3 then raise exception 'duplicate command side effects'; end if;
  raise exception using errcode='ZX002',message='rollback fixtures';
 exception when sqlstate 'ZX002' then null; end;
 if (select count(*) from public.t2_azolik)<>count_before then raise exception 'fixtures persisted'; end if;
 if has_function_privilege('anon','public.t2_azolik_ruxsat_set_v2(bigint,bigint,bigint,jsonb,bigint,uuid)','execute') or has_function_privilege('authenticated','public.t2_require_permission_v2(bigint,bigint,text)','execute') then raise exception 'public execute exposed'; end if;
 raise notice 'INDIVIDUAL_PERMISSION_CONSTRUCTOR_ACCEPTANCE_PASS';
end $$;
