-- Synthetic fixtures live only inside the deliberately rolled-back subtransaction.
do $$
declare a bigint; b bigint; sa bigint; boss bigint; normal bigint; j jsonb; before_count bigint; suffix text:=left(replace(gen_random_uuid()::text,'-',''),10);
begin
  select count(*) into before_count from public.t2_azolik;
  begin
    insert into public.t2_kompaniya(nom,kod,faol) values('Role acceptance A','RA'||suffix,true) returning id into a;
    insert into public.t2_kompaniya(nom,kod,faol) values('Role acceptance B','RB'||suffix,true) returning id into b;
    insert into public.t2_foydalanuvchi(login,holat) values('role_sa_'||suffix,'faol') returning id into sa;
    insert into public.t2_foydalanuvchi(login,holat) values('role_boss_'||suffix,'faol') returning id into boss;
    insert into public.t2_foydalanuvchi(login,holat) values('role_pto_'||suffix,'faol') returning id into normal;
    insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values
      (sa,a,'superadmin','faol'),(sa,b,'pto','faol'),(boss,b,'boss','faol'),(normal,a,'pto','faol');
    if public.t2_actor_kompaniya_azo_tekshir(b,sa)<>'superadmin' then raise exception 'SA downgraded by PTO'; end if;
    if public.t2_actor_kompaniya_azo_tekshir(b,boss)<>'boss' then raise exception 'boss role'; end if;
    begin
      perform public.t2_actor_kompaniya_azo_tekshir(b,normal);
      raise exception 'cross-company access';
    exception when insufficient_privilege then null; end;
    j:=public.t2_men_v1(sa);
    if j->>'platform_role'<>'superadmin' or not exists(select 1 from jsonb_array_elements(j->'context_kompaniyalar') x where (x->>'kompaniya_id')::bigint=b and x->>'membership_role'='pto' and x->>'effective_role'='superadmin') then raise exception 'separate identity facts'; end if;
    j:=public.t2_men_v1(normal);
    if j->>'platform_role'<>'none' or exists(select 1 from jsonb_array_elements(j->'context_kompaniyalar') x where (x->>'kompaniya_id')::bigint=b) then raise exception 'normal context leakage'; end if;
    j:=public.t2_effective_authorization_v1(boss,b,null,null,'project.write',null);
    if (j->>'allowed')::boolean is not true then raise exception 'boss company scope %',j; end if;
    j:=public.t2_effective_authorization_v1(boss,null,null,null,'control.global.write',null);
    if (j->>'allowed')::boolean is not false then raise exception 'boss global elevation'; end if;
    update public.t2_foydalanuvchi set holat='bekor' where id=sa;
    if public.t2_platforma_superadmin(sa) then raise exception 'inactive superadmin'; end if;
    if (public.t2_men_v1(sa)->>'ok')::boolean then raise exception 'inactive actor exposed'; end if;
    raise exception using errcode='ZX001',message='rollback synthetic fixtures';
  exception when sqlstate 'ZX001' then null; end;
  if (select count(*) from public.t2_azolik)<>before_count then raise exception 'fixture cleanup'; end if;
  if has_function_privilege('anon','public.t2_men_v1(bigint)','EXECUTE') or has_function_privilege('authenticated','public.t2_actor_kompaniya_azo_tekshir(bigint,bigint)','EXECUTE') then raise exception 'public function exposure'; end if;
  raise notice 'ROLE_AUTHORITY_ACCEPTANCE_PASS';
end $$;
