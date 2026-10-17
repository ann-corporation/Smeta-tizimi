begin;
create or replace function public.t2_azo_actor_director_tekshir(p_kompaniya_id bigint,p_actor_id bigint)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r text;
begin
 r:=public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id,p_actor_id);
 if r not in ('boss','admin','superadmin') then raise exception 'MANAGE_ROLE_REQUIRED' using errcode='42501'; end if;
 return r;
end $$;

create or replace function public.t2_membership_command_v3(p_actor_id bigint,p_company_id bigint,p_member_id bigint,p_command text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare member public.t2_azolik%rowtype; prior public.t2_onboarding_command_log%rowtype; company_id bigint:=p_company_id;
 requested_role text:=p_payload->>'rol'; target_user bigint; result jsonb; request jsonb; login_name text:=nullif(btrim(p_payload->>'login'),'');
begin
 if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
 if p_command is null or p_command not in ('azolik_qosh','azolik_rol_ozgartir','azolik_ochir') then return jsonb_build_object('ok',false,'code','COMMAND_INVALID'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 if p_command<>'azolik_qosh' then
  select * into member from public.t2_azolik where id=p_member_id;
  if not found then return jsonb_build_object('ok',false,'code','MEMBERSHIP_NOT_FOUND'); end if;
  company_id:=member.kompaniya_id;
  if member.rol='superadmin' then perform pg_advisory_xact_lock(hashtextextended('t2_platform_roles',0)); end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('t2_company_roles:'||company_id::text,0));
 perform public.t2_azo_actor_director_tekshir(company_id,p_actor_id);
 request:=jsonb_build_object('company',company_id,'member',p_member_id,'payload',p_payload);
 select * into prior from public.t2_onboarding_command_log where operation_id=p_operation_id;
 if found then
  if prior.actor_id<>p_actor_id or prior.command<>p_command or prior.natija->'request' is distinct from request then return jsonb_build_object('ok',false,'code','OPERATION_CONFLICT'); end if;
  return prior.natija-'request';
 end if;
 if p_command<>'azolik_ochir' and (requested_role is null or requested_role not in ('boss','admin','rahbar','bugalter','pto','prorab','buyurtmachi','pudratchi','kuzatuvchi')) then return jsonb_build_object('ok',false,'code','ROLE_INVALID'); end if;
 if p_command='azolik_qosh' then
  if login_name is null or length(login_name)>100 then return jsonb_build_object('ok',false,'code','LOGIN_REQUIRED'); end if;
  select id into target_user from public.t2_foydalanuvchi where login=login_name;
  if not found then insert into public.t2_foydalanuvchi(login,email,ism,holat) values(login_name,nullif(p_payload->>'email',''),nullif(p_payload->>'ism',''),'faol') returning id into target_user; end if;
  select * into member from public.t2_azolik where foydalanuvchi_id=target_user and kompaniya_id=company_id order by case when holat='faol' then 0 else 1 end,id limit 1 for update;
  if found then
   if member.holat='faol' then return jsonb_build_object('ok',false,'code','ALREADY_MEMBER'); end if;
   if member.rol='superadmin' and not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok',false,'code','PROTECTED_AUTHORITY'); end if;
   update public.t2_azolik set rol=requested_role,holat='faol' where id=member.id returning * into member;
  else
   insert into public.t2_azolik(foydalanuvchi_id,kompaniya_id,rol,holat) values(target_user,company_id,requested_role,'faol') returning * into member;
  end if;
  result:=jsonb_build_object('ok',true,'azolik_id',member.id,'foydalanuvchi_id',target_user,'rol',requested_role);
 else
  select * into member from public.t2_azolik where id=p_member_id and kompaniya_id=company_id for update;
  if member.rol='superadmin' then
   if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok',false,'code','PROTECTED_AUTHORITY'); end if;
   if public.t2_platforma_superadmin(member.foydalanuvchi_id) and not exists(select 1 from public.t2_azolik where foydalanuvchi_id=member.foydalanuvchi_id and id<>member.id and rol='superadmin' and holat='faol') and
      (select count(distinct a.foydalanuvchi_id) from public.t2_azolik a join public.t2_foydalanuvchi u on u.id=a.foydalanuvchi_id where a.rol='superadmin' and a.holat='faol' and u.holat='faol')<=1 then return jsonb_build_object('ok',false,'code','LAST_SUPERADMIN'); end if;
  end if;
  if member.holat='faol' and member.rol in ('boss','admin') and (p_command='azolik_ochir' or requested_role not in ('boss','admin')) and
     (select count(*) from public.t2_azolik where kompaniya_id=company_id and holat='faol' and rol in ('boss','admin'))<=1 then return jsonb_build_object('ok',false,'code','LAST_DIRECTOR'); end if;
  if p_command='azolik_ochir' then
   update public.t2_azolik set holat='bekor' where id=member.id;
   result:=jsonb_build_object('ok',true,'azolik_id',member.id,'holat','bekor');
  else
   if member.holat<>'faol' then return jsonb_build_object('ok',false,'code','MEMBERSHIP_NOT_FOUND'); end if;
   update public.t2_azolik set rol=requested_role where id=member.id;
   result:=jsonb_build_object('ok',true,'azolik_id',member.id,'rol',requested_role);
  end if;
 end if;
 perform public.t2_audit_yoz(company_id,p_command,'onboarding',null,jsonb_build_object('azolik',member.id,'before_role',member.rol,'after_role',requested_role,'actor',p_actor_id,'operation',p_operation_id)::text,'actor:'||p_actor_id,null);
 insert into public.t2_onboarding_command_log(operation_id,actor_id,command,natija) values(p_operation_id,p_actor_id,p_command,result||jsonb_build_object('request',request));
 return result;
end $$;

create or replace function public.t2_azolik_qosh_v1(p_actor_id bigint,p_kompaniya_id bigint,p_login text,p_rol text,p_email text,p_ism text,p_operation_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select public.t2_membership_command_v3(p_actor_id,p_kompaniya_id,null,'azolik_qosh',jsonb_build_object('login',p_login,'rol',p_rol,'email',p_email,'ism',p_ism),p_operation_id);
$$;
create or replace function public.t2_azolik_rol_ozgartir_v1(p_actor_id bigint,p_azolik_id bigint,p_yangi_rol text,p_operation_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select public.t2_membership_command_v3(p_actor_id,null,p_azolik_id,'azolik_rol_ozgartir',jsonb_build_object('rol',p_yangi_rol),p_operation_id);
$$;
create or replace function public.t2_azolik_ochir_v1(p_actor_id bigint,p_azolik_id bigint,p_operation_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select public.t2_membership_command_v3(p_actor_id,null,p_azolik_id,'azolik_ochir','{}'::jsonb,p_operation_id);
$$;

-- Password belongs to the global actor, not to a tenant membership.
create or replace function public.t2_parol_belgila_v1(p_actor_id bigint,p_kompaniya_id bigint,p_foydalanuvchi_id bigint,p_yangi_parol text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.t2_onboarding_command_log%rowtype; result jsonb; target public.t2_foydalanuvchi%rowtype; request jsonb;
begin
 if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
 perform public.t2_azo_actor_director_tekshir(p_kompaniya_id,p_actor_id);
 if not exists(select 1 from public.t2_azolik where foydalanuvchi_id=p_foydalanuvchi_id and kompaniya_id=p_kompaniya_id and holat='faol') then return jsonb_build_object('ok',false,'code','AZOLIK_TOPILMADI'); end if;
 if length(coalesce(p_yangi_parol,''))<8 then return jsonb_build_object('ok',false,'code','PAROL_QISQA'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 select * into target from public.t2_foydalanuvchi where id=p_foydalanuvchi_id for update;
 if not public.t2_platforma_superadmin(p_actor_id) and (public.t2_platforma_superadmin(p_foydalanuvchi_id) or target.google_sub is not null or
   (select count(distinct kompaniya_id) from public.t2_azolik where foydalanuvchi_id=p_foydalanuvchi_id and holat='faol')<>1) then return jsonb_build_object('ok',false,'code','ACCOUNT_OWNER_REQUIRED'); end if;
 -- Only actor/target metadata is logged. The existing bcrypt hash validates a retry; no second password verifier is persisted.
 request:=jsonb_build_object('company',p_kompaniya_id,'user',p_foydalanuvchi_id);
 select * into prior from public.t2_onboarding_command_log where operation_id=p_operation_id;
 if found then
  if prior.actor_id<>p_actor_id or prior.command<>'parol_belgila' or prior.natija->'request' is distinct from request or target.parol_hash is null or extensions.crypt(p_yangi_parol,target.parol_hash) is distinct from target.parol_hash then return jsonb_build_object('ok',false,'code','OPERATION_CONFLICT'); end if;
  return prior.natija-'request';
 end if;
 update public.t2_foydalanuvchi set parol_hash=extensions.crypt(p_yangi_parol,extensions.gen_salt('bf')),parol_yangilandi=clock_timestamp() where id=target.id;
 perform public.t2_audit_yoz(p_kompaniya_id,'parol_belgila','onboarding',null,format('foydalanuvchi_id=%s',target.id),'actor:'||p_actor_id,null);
 result:=jsonb_build_object('ok',true,'foydalanuvchi_id',target.id);
 insert into public.t2_onboarding_command_log(operation_id,actor_id,command,natija) values(p_operation_id,p_actor_id,'parol_belgila',result||jsonb_build_object('request',request));
 return result;
end $$;
revoke all on function public.t2_membership_command_v3(bigint,bigint,bigint,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.t2_azo_actor_director_tekshir(bigint,bigint),public.t2_azolik_qosh_v1(bigint,bigint,text,text,text,text,uuid),public.t2_azolik_rol_ozgartir_v1(bigint,bigint,text,uuid),public.t2_azolik_ochir_v1(bigint,bigint,uuid),public.t2_parol_belgila_v1(bigint,bigint,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.t2_azo_actor_director_tekshir(bigint,bigint),public.t2_azolik_qosh_v1(bigint,bigint,text,text,text,text,uuid),public.t2_azolik_rol_ozgartir_v1(bigint,bigint,text,uuid),public.t2_azolik_ochir_v1(bigint,bigint,uuid),public.t2_parol_belgila_v1(bigint,bigint,bigint,text,uuid) to service_role;
grant execute on function public.t2_membership_command_v3(bigint,bigint,bigint,text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
